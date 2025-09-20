import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import type { Request, Response, NextFunction } from 'express';
import { signJwt } from './auth/jwt';
import crypto from 'crypto';
import { storage } from './storage'; // Import our storage layer
export async function generateUniqueUsername(rawBase: string) {
  const baseRaw = (rawBase || '').toLowerCase().replace(/[^a-z0-9._-]/g, '');
  const base = (baseRaw || `user${Date.now()}`).slice(0, 20);
  let candidate = base;
  let suffix = 1;
  while (await storage.getUserByUsername(candidate)) {
    candidate = `${base}${suffix}`;
    suffix++;
    if (suffix > 100) {
      candidate = `${base}-${Date.now()}`;
      break;
    }
  }
  return candidate;
}


// This function replaces the placeholder and uses our actual database logic
async function findOrCreateUserFromGoogle(profile: any) {
  const email = profile.emails?.[0]?.value;
  if (!email) {
    throw new Error('No email found in Google profile');
  }

  const existing = await storage.getUserByEmail(email);
  if (existing) {
    const updateData: any = {
      googleAvatar: profile.photos?.[0]?.value,
      lastLoginAt: new Date()
    };
    if (existing.trialPlan && existing.needsTrialSelection) {
      updateData.needsTrialSelection = false;
    }
    const updated = await storage.updateUser(existing.id, updateData);
    return updated;
  }

  const base = (profile.displayName || email.split('@')[0] || '').toLowerCase().replace(/[^a-z0-9._-]/g, '');
  const pending = {
    email,
    firstName: profile.name?.givenName || null,
    lastName: profile.name?.familyName || null,
    fullName: profile.displayName || null,
    googleAvatar: profile.photos?.[0]?.value || null,
    baseUsername: base || `user${Date.now()}`
  };
  return { pendingOAuth: pending };
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
    (passport.authenticate as any)('google', {
      session: false,
      scope: ['openid', 'email', 'profile'],
      state,
      callbackURL,
    })(req, res, next);
  });

  // Callback → mint JWT → cookie → redirect
  app.get('/api/auth/google/callback', (req: Request, res: Response, next: NextFunction) => {
    const { state } = req.query;
    const savedState = req.cookies.oauth_state;
    res.clearCookie('oauth_state');
    if (!state || state !== savedState) {
      return res.redirect('/auth?error=state_mismatch');
    }

    const callbackURL = getCallbackUrl(req);
    (passport.authenticate as any)('google', { session: false, callbackURL, failureRedirect: '/auth?error=google' },
      async (err: Error, result: any) => {
        if (err) return next(err);

        if (result?.pendingOAuth) {
          const pending = JSON.stringify(result.pendingOAuth);
          res.cookie('pending_oauth', pending, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            path: '/',
            maxAge: 10 * 60 * 1000,
          });
          res.clearCookie('oauth_return_to');
          return res.redirect('/trial-selection');
        }

        if (!result?.id) return res.redirect('/auth?error=no_user');

        const token = signJwt({
          sub: String(result.id),
          email: result.email,
          name: result.fullName,
          picture: result.googleAvatar,
          roles: [result.role],
        });

        res.cookie('mam_jwt', token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          path: '/',
          maxAge: 7 * 24 * 60 * 60 * 1000,
        });

        let redirectUrl = '/';
        if (result.role === 'admin' || result.isAdmin) {
          redirectUrl = '/';
        } else if (result.needsTrialSelection) {
          redirectUrl = '/trial-selection';
        } else if (!result.emailVerified) {
          redirectUrl = `/verify-email?email=${encodeURIComponent(result.email)}`;
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
