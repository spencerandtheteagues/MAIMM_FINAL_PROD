import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import type { Request, Response, NextFunction } from 'express';
import { signJwt } from './auth/jwt';
import crypto from 'crypto';
import { storage } from './storage'; // Import our storage layer

// This function replaces the placeholder and uses our actual database logic
async function findOrCreateUserFromGoogle(profile: any) {
  const email = profile.emails?.[0]?.value;
  if (!email) {
    throw new Error('No email found in Google profile');
  }

  let user = await storage.getUserByEmail(email);

  if (!user) {
    // User doesn't exist, create a new one
    const newUser = {
      email: email,
      username: profile.displayName || email.split('@')[0],
      fullName: profile.displayName,
      firstName: profile.name?.givenName,
      lastName: profile.name?.familyName,
      googleAvatar: profile.photos?.[0]?.value,
      // Default values for a new user
      role: 'user',
      tier: 'free',
      credits: 50, // Welcome credits
      accountStatus: 'active',
      subscriptionStatus: 'trial',
      trialStartDate: new Date(),
      trialEndDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7-day trial
    };
    user = await storage.createUser(newUser);
  } else {
    // User exists, update their avatar and last login time
    user = await storage.updateUser(user.id, { 
      googleAvatar: profile.photos?.[0]?.value,
      lastLoginAt: new Date()
    });
  }

  return user;
}

function getCallbackUrl(req: Request) {
  // Render and other proxies use x-forwarded-host and x-forwarded-proto
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol;
  return `${proto}://${host}/api/auth/google/callback`;
}

// Strategy just to get the Google profile; we do NOT use passport sessions
passport.use(new GoogleStrategy(
  {
    clientID: process.env.GOOGLE_CLIENT_ID!,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    callbackURL: '/api/auth/google/callback', // This will be overridden by the dynamic one
    passReqToCallback: true,
  },
  async (_req, _accessToken, _refreshToken, profile, done) => {
    try {
      const user = await findOrCreateUserFromGoogle(profile);
      done(null, user);
    } catch (e) {
      done(e as Error);
    }
  }
));

export function registerGoogleAuth(app: any) {
  // Start OAuth
  app.get('/api/auth/google', (req: Request, res: Response, next: NextFunction) => {
    const state = crypto.randomBytes(16).toString('hex');
    // We don't have sessions, so we'll pass state through a temporary cookie
    res.cookie('oauth_state', state, { maxAge: 300000, httpOnly: true, secure: process.env.NODE_ENV === 'production' });
    const callbackURL = getCallbackUrl(req);
    passport.authenticate('google', {
      session: false,
      scope: ['openid', 'email', 'profile'],
      state,
      callbackURL,
    })(req, res, next);
  });

  // Callback → mint JWT → cookie → redirect
  app.get('/api/auth/google/callback', (req: Request, res: Response, next: NextFunction) => {
    // State check
    const { state } = req.query;
    const savedState = req.cookies.oauth_state;
    res.clearCookie('oauth_state');
    if (!state || state !== savedState) {
      return res.redirect('/auth?error=state_mismatch');
    }

    const callbackURL = getCallbackUrl(req);
    passport.authenticate('google', { session: false, callbackURL, failureRedirect: '/auth?error=google' },
      async (err: Error, user: any) => {
        if (err) return next(err);
        if (!user?.id) return res.redirect('/auth?error=no_user');

        const token = signJwt({
          sub: String(user.id),
          email: user.email,
          name: user.fullName,
          picture: user.googleAvatar,
          roles: [user.role],
        });

        res.cookie('mam_jwt', token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          path: '/',
          maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        });

        const returnTo = (req.query.returnTo as string) || '/';
        return res.redirect(returnTo);
      }
    )(req, res, next);
  });

  // Logout
  app.post('/api/auth/logout', (_req: Request, res: Response) => {
    res.clearCookie('mam_jwt', { path: '/' });
    res.json({ ok: true });
  });
}