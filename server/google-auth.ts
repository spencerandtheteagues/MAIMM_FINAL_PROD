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
      credits: 0, // No credits until trial selected
      accountStatus: 'active',
      subscriptionStatus: 'trial', // Set to 'trial' as they need to select one
      needsTrialSelection: true, // NEW USERS MUST SELECT A TRIAL
      emailVerified: true, // Google OAuth users are pre-verified
      trialStartDate: null, // No trial until they select one
      trialEndDate: null, // No trial until they select one
    };
    user = await storage.createUser(newUser);
  } else {
    // User exists, update their avatar and last login time
    const updateData: any = {
      googleAvatar: profile.photos?.[0]?.value,
      lastLoginAt: new Date()
    };

    // If user already has a trial plan selected, clear needsTrialSelection flag
    if (user.trialPlan && user.needsTrialSelection) {
      updateData.needsTrialSelection = false;
    }

    user = await storage.updateUser(user.id, updateData);
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

    const returnParam = (req.query.return as string) || (req.query.returnTo as string) || '';
    const safeReturn = typeof returnParam === 'string' && returnParam.startsWith('/') ? returnParam : '';
    if (safeReturn) {
      res.cookie('oauth_return_to', safeReturn, { maxAge: 300000, httpOnly: true, secure: process.env.NODE_ENV === 'production' });
    }

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
          maxAge: 7 * 24 * 60 * 60 * 1000,
        });

        // Smart redirect logic based on user role and status
        let redirectUrl = '/';
        if (user.role === 'admin' || user.isAdmin) {
          redirectUrl = '/';
        } else if (user.needsTrialSelection) {
          redirectUrl = '/trial-selection';
        } else if (!user.emailVerified) {
          redirectUrl = `/verify-email?email=${encodeURIComponent(user.email)}`;
        } else {
          redirectUrl = '/';
        }

        const qpReturn = (req.query.return as string) || (req.query.returnTo as string) || '';
        const cookieReturn = req.cookies.oauth_return_to as string | undefined;
        const candidate = qpReturn || cookieReturn || redirectUrl;
        const finalReturn = typeof candidate === 'string' && candidate.startsWith('/') ? candidate : redirectUrl;

        res.clearCookie('oauth_return_to');

        return res.redirect(finalReturn);
      }
    )(req, res, next);
  });

  // Logout
  app.post('/api/auth/logout', (_req: Request, res: Response) => {
    res.clearCookie('mam_jwt', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
    });
    res.json({ ok: true });
  });
}
