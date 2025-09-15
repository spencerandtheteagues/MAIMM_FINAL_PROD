import { Router, Request, Response } from "express";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { storage } from "./storage";
import type { User } from "@shared/schema";
import { randomBytes } from "crypto";

// Enable OAuth debug logging - always enabled in production for now
const isDebugEnabled = true; // process.env.DEBUG_OAUTH === 'true';

// Helper function to mask email for logging
function maskEmail(email: string): string {
  if (!email || !email.includes('@')) return email;
  const [localPart, domain] = email.split('@');
  if (localPart.length <= 1) return email;
  return `${localPart[0]}***@${domain}`;
}

// Helper to safely log debug info with PII protection
function safeDebugLog(message: string, data: any = {}) {
  if (!isDebugEnabled) return;
  
  // Remove sensitive data and mask PII
  const safeData = { ...data };
  delete safeData.sessionId;
  delete safeData.profile;
  delete safeData.accessToken;
  delete safeData.refreshToken;
  
  if (safeData.email) {
    safeData.email = maskEmail(safeData.email);
  }
  if (safeData.profileEmails) {
    safeData.profileEmails = safeData.profileEmails.map(maskEmail);
  }
  if (safeData.sessionUserEmail) {
    safeData.sessionUserEmail = maskEmail(safeData.sessionUserEmail);
  }
  
  console.log(message, safeData);
}

// Helper to log mobile-specific diagnostics
function logMobileDiagnostics(req: Request, stage: string) {
  if (!isDebugEnabled) return;
  
  const cookieHeader = req.headers.cookie;
  const cookieSize = cookieHeader ? cookieHeader.length : 0;
  
  const diagnostics = {
    stage,
    timestamp: new Date().toISOString(),
    isMobile: /Mobile|Android|iPhone|iPad|BlackBerry|Opera Mini|IEMobile/.test(req.get('User-Agent') || ''),
    cookies: {
      present: !!cookieHeader,
      size: cookieSize,
      count: cookieHeader ? cookieHeader.split(';').length : 0,
    },
    session: {
      exists: !!req.session,
      cookieSettings: req.session?.cookie ? {
        maxAge: req.session.cookie.maxAge,
        expires: req.session.cookie.expires,
        httpOnly: req.session.cookie.httpOnly,
        secure: req.session.cookie.secure,
        sameSite: req.session.cookie.sameSite,
        domain: req.session.cookie.domain,
        path: req.session.cookie.path,
      } : null,
    },
    forwarded: {
      proto: req.get('X-Forwarded-Proto'),
      host: req.get('X-Forwarded-Host'),
      for: req.get('X-Forwarded-For'),
    },
    userAgent: req.get('User-Agent'),
    host: req.get('Host'),
    origin: req.get('Origin'),
    referer: req.get('Referer'),
  };
  
  console.log('[OAuth Mobile Diagnostics]', diagnostics);
}

// Helper function to generate unique referral code
function generateReferralCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

async function generateUniqueReferralCode(): Promise<string> {
  let code = '';
  let isUnique = false;
  
  while (!isUnique) {
    code = generateReferralCode();
    const existing = await storage.getUserByReferralCode(code);
    if (!existing) {
      isUnique = true;
    }
  }
  
  return code;
}

const router = Router();

// Test OAuth simulation endpoint
router.get('/test-oauth-simulation', async (req: Request, res: Response) => {
  try {
    // Simulate finding an existing admin user (like Spencer)
    const user = await storage.getUserByEmail('spencertheteague@gmail.com');
    if (!user) {
      return res.status(404).json({ error: 'Test user not found' });
    }

    console.log('[OAuth Test] Simulating OAuth for user:', user.email);

    // Create session exactly like OAuth does
    createUserSession(req, user);

    // Save session
    await new Promise<void>((resolve, reject) => {
      req.session.save((err) => {
        if (err) {
          console.error('[OAuth Test] Session save failed:', err);
          reject(err);
        } else {
          console.log('[OAuth Test] Session saved successfully');
          resolve();
        }
      });
    });

    // Check session data
    console.log('[OAuth Test] Session data:', {
      sessionId: req.sessionID,
      userId: req.session.userId,
      userEmail: req.session.user?.email
    });

    // Return success with session info
    res.json({
      success: true,
      message: 'OAuth simulation completed',
      sessionId: req.sessionID,
      userId: req.session.userId,
      userEmail: req.session.user?.email,
      redirectUrl: '/dashboard'
    });

  } catch (error) {
    console.error('[OAuth Test] Error:', error);
    res.status(500).json({ error: 'OAuth simulation failed', details: error instanceof Error ? error.message : error });
  }
});

// Store recent OAuth events for debugging
const recentOAuthEvents: any[] = [];
function logOAuthEvent(event: string, data: any) {
  const eventLog = {
    timestamp: new Date().toISOString(),
    event,
    data: { ...data }
  };
  recentOAuthEvents.push(eventLog);
  // Keep only last 20 events
  if (recentOAuthEvents.length > 20) {
    recentOAuthEvents.shift();
  }
  console.log(`[OAuth Event] ${event}:`, JSON.stringify(data, null, 2));
}

// Debug endpoint to check OAuth configuration
router.get("/debug", (req: Request, res: Response) => {
  const debugInfo = {
    oauth: {
      configured: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
      clientIdLength: process.env.GOOGLE_CLIENT_ID?.length || 0,
      clientSecretLength: process.env.GOOGLE_CLIENT_SECRET?.length || 0,
    },
    session: {
      exists: !!req.session,
      sessionId: req.sessionID,
      userId: req.session?.userId,
      userEmail: req.session?.user?.email ? maskEmail(req.session.user.email) : null,
      cookie: req.session?.cookie ? {
        maxAge: req.session.cookie.maxAge,
        expires: req.session.cookie.expires,
        httpOnly: req.session.cookie.httpOnly,
        secure: req.session.cookie.secure,
        sameSite: req.session.cookie.sameSite,
        domain: req.session.cookie.domain,
        path: req.session.cookie.path,
      } : null,
    },
    environment: {
      nodeEnv: process.env.NODE_ENV,
      isProduction: process.env.NODE_ENV === 'production',
      host: req.get('Host'),
      origin: req.get('Origin'),
      protocol: req.protocol,
      secure: req.secure,
      appUrl: process.env.APP_URL,
      callbackUrl: getCallbackUrl(req),
    },
    headers: {
      cookie: !!req.headers.cookie,
      userAgent: req.get('User-Agent'),
      xForwardedProto: req.get('X-Forwarded-Proto'),
      xForwardedHost: req.get('X-Forwarded-Host'),
    },
    recentOAuthEvents: recentOAuthEvents.slice(-10), // Last 10 events
  };

  console.log('[OAuth Debug Endpoint] Request:', debugInfo);
  res.json(debugInfo);
});

// Validate Google OAuth is configured
if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
  console.warn("Google OAuth not configured - GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET required");
}

// Helper to create user session with secure logging
function createUserSession(req: Request, user: User) {
  // Ensure user has email before creating session
  if (!user.email) {
    throw new Error('Cannot create session: user email is required');
  }

  safeDebugLog('[OAuth Debug] Creating user session for:', {
    userId: user.id,
    email: user.email,
    userAgent: req.get('User-Agent'),
    origin: req.get('Origin'),
    referer: req.get('Referer'),
  });
  
  const sessionUser = {
    id: user.id,
    email: user.email, // Now guaranteed to be non-null
    username: user.username,
    businessName: user.businessName,
    role: user.role,
    tier: user.tier,
    isAdmin: user.isAdmin,
  };
  
  req.session.userId = user.id;
  req.session.user = sessionUser;
  // Type assertion for req.user to match passport's expected type
  req.user = sessionUser as any;
  
  safeDebugLog('[OAuth Debug] Session data set:', {
    sessionUserId: req.session.userId,
    sessionUserEmail: req.session.user?.email,
  });
}

// Get the base URL for callbacks
function getCallbackUrl(req: Request): string {
  // Use explicit environment variable if set
  if (process.env.OAUTH_CALLBACK_URL) {
    return process.env.OAUTH_CALLBACK_URL;
  }

  // Prefer APP_URL in production when set
  if (process.env.APP_URL && process.env.NODE_ENV === 'production') {
    return `${process.env.APP_URL}/api/auth/google/callback`;
  }

  // In production, detect the actual domain being used
  if (process.env.NODE_ENV === 'production') {
    const host = req.get('host') || req.get('x-forwarded-host');

    // Render deployment
    if (host && host.includes('.onrender.com')) {
      return `https://${host}/api/auth/google/callback`;
    }

    // Custom domain fallback
    return 'https://myaimediamgr.com/api/auth/google/callback';
  }

  // Local development
  return 'http://localhost:5000/api/auth/google/callback';
}

// Configure Google OAuth Strategy with state parameter for CSRF protection
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: '/api/auth/google/callback', // Keep relative; we'll override per-request
    scope: ['openid', 'email', 'profile'],
    state: true, // Enable state parameter for CSRF protection
    passReqToCallback: true,
    proxy: true, // Trust proxy for production environment
  },
  async (req: Request, accessToken: string, refreshToken: string, profile: any, done: Function) => {
    const debugInfo = {
      userAgent: req.get('User-Agent'),
      origin: req.get('Origin'),
      referer: req.get('Referer'),
      profileId: profile?.id,
      profileEmails: profile?.emails?.map((e: any) => e.value),
      timestamp: new Date().toISOString(),
      state: req.query?.state, // Log CSRF state parameter
    };
    
    safeDebugLog('[OAuth Debug] Google strategy callback initiated:', debugInfo);
    logMobileDiagnostics(req, 'strategy-callback');
    
    try {
      const email = profile.emails?.[0]?.value;
      if (!email) {
        const error = new Error('No email found in Google profile');
        safeDebugLog('[OAuth Error] No email in profile:', {
          ...debugInfo,
          profileDisplayName: profile?.displayName,
          profileId: profile?.id,
          profileProvider: profile?.provider,
        });
        return done(error);
      }

      safeDebugLog('[OAuth Debug] Processing user with email:', { email });

      // Check if user exists
      let user = await storage.getUserByEmail(email);
      
      if (!user) {
        safeDebugLog('[OAuth Debug] Creating new user for:', { email });
        // Create new user from Google profile
        const username = email.split('@')[0] + '_' + profile.id.slice(-4);
        
        // Generate unique referral code for the new user
        const userReferralCode = await generateUniqueReferralCode();
        
        // Create new user without trial details - they'll select trial after login
        user = await storage.createUser({
          email: email,
          username: username,
          password: null, // No password for OAuth users
          firstName: profile.name?.givenName,
          lastName: profile.name?.familyName,
          fullName: profile.displayName,
          profileImageUrl: profile.photos?.[0]?.value,
          googleAvatar: profile.photos?.[0]?.value,
          role: "user",
          tier: "free", // Default tier, will be updated when they select trial
          credits: 0, // Will be set when they select trial
          emailVerified: true, // Google accounts are pre-verified
          needsTrialSelection: true, // New users need to select trial
          referralCode: userReferralCode, // Add referral code for new user
        });
        safeDebugLog('[OAuth Debug] New user created:', {
          userId: user.id,
          email: user.email,
          needsTrialSelection: user.needsTrialSelection,
        });
      } else {
        safeDebugLog('[OAuth Debug] Updating existing user:', {
          userId: user.id,
          email: user.email,
          needsTrialSelection: user.needsTrialSelection,
        });

        // For existing users, clear needsTrialSelection if they have a tier/subscription
        const shouldClearTrialSelection = user.tier !== 'free' || user.isPaid || user.isAdmin || user.role === 'admin';

        // Update existing user's Google info
        await storage.updateUser(user.id, {
          googleAvatar: profile.photos?.[0]?.value,
          profileImageUrl: user.profileImageUrl || profile.photos?.[0]?.value,
          emailVerified: true,
          lastLoginAt: new Date(),
          // Clear trial selection requirement for users who already have subscriptions or are admins
          ...(shouldClearTrialSelection && { needsTrialSelection: false }),
        });

        // Refresh user data after update
        user = await storage.getUser(user.id);
      }
      
      safeDebugLog('[OAuth Debug] Strategy callback successful, returning user:', {
        userId: user.id,
        email: user.email,
        tier: user.tier,
        needsTrialSelection: user.needsTrialSelection,
      });
      
      return done(null, user);
    } catch (error) {
      safeDebugLog('[OAuth Error] Strategy callback failed:', {
        ...debugInfo,
        error: error instanceof Error ? {
          name: error.name,
          message: error.message,
          stack: isDebugEnabled ? error.stack : undefined,
        } : error,
      });
      return done(error);
    }
  }));

  // Serialize/deserialize functions are now set up in index.ts to avoid duplicates
}

// Passport middleware is now mounted in index.ts to avoid duplicates

// Helper to validate return URL to prevent open redirect attacks
function isValidReturnUrl(url: string): boolean {
  if (!url) return false;
  
  // Must start with / but not with // (protocol-relative URL)
  if (!url.startsWith('/') || url.startsWith('//')) {
    return false;
  }
  
  // Should not contain @ or : which could be used for URL manipulation
  if (url.includes('@') || url.includes(':')) {
    return false;
  }
  
  // Valid internal paths we allow
  const validPaths = [
    '/dashboard',
    '/auth',
    '/trial-selection',
    '/checkout',
    '/posts',
    '/analytics',
    '/campaigns',
    '/platforms',
    '/settings',
    '/ai-generate',
    '/'
  ];
  
  // Check if URL starts with any valid path
  return validPaths.some(path => url === path || url.startsWith(path + '/') || url.startsWith(path + '?'));
}

// Initiate Google OAuth flow
router.get("/google", async (req: Request, res: Response, next: Function) => {
  logMobileDiagnostics(req, 'oauth-initiate');

  // Generate and store state parameter for CSRF protection using crypto for better security
  const state = randomBytes(32).toString('hex');
  req.session.oauthState = state;

  console.log('[OAuth] Generated state:', state);
  console.log('[OAuth] Session ID before save:', req.sessionID);

  // Log effective callback URL being used
  const effectiveCallbackUrl = getCallbackUrl(req);

  logOAuthEvent('oauth-initiate', {
    sessionID: req.sessionID,
    state: state,
    effectiveCallbackUrl: effectiveCallbackUrl,
    userAgent: req.get('User-Agent'),
    host: req.get('Host')
  });
  
  const debugInfo = {
    userAgent: req.get('User-Agent'),
    origin: req.get('Origin'),
    referer: req.get('Referer'),
    host: req.get('Host'),
    query: req.query,
    timestamp: new Date().toISOString(),
    isMobile: /Mobile|Android|iPhone|iPad|BlackBerry|Opera Mini|IEMobile/.test(req.get('User-Agent') || ''),
    generatedState: state,
    effectiveCallbackUrl,
  };
  
  safeDebugLog('[OAuth Debug] Initiating Google OAuth flow:', debugInfo);
  
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    console.error('[OAuth Error] Google OAuth not configured');
    return res.status(500).json({ 
      message: "Google OAuth not configured. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables." 
    });
  }
  
  // Store return URL in session if provided and valid
  const returnUrl = (req.query.return as string) || '/';
  if (isValidReturnUrl(returnUrl)) {
    req.session.returnTo = returnUrl;
    req.session.returnUrl = returnUrl; // Store in both places for compatibility
    console.log('[OAuth] Valid return URL stored in session:', returnUrl);
  } else {
    console.warn('[OAuth Warning] Invalid return URL attempted:', returnUrl);
    req.session.returnTo = '/';
    req.session.returnUrl = '/';
  }
  
  console.log('[OAuth] Session state before save:', {
    sessionId: req.sessionID,
    oauthState: req.session.oauthState,
    returnTo: req.session.returnTo,
    userId: req.session.userId
  });
  
  // Explicitly save session before redirecting to Google
  try {
    await new Promise<void>((resolve, reject) => {
      req.session.save((saveErr) => {
        if (saveErr) {
          console.error('[OAuth] Failed to save session before redirect:', saveErr);
          reject(saveErr);
          return;
        }
        
        console.log('[OAuth] Session saved successfully, redirecting to Google');
        console.log('[OAuth] Session ID after save:', req.sessionID);
        resolve();
      });
    });
    
    const callbackURL = getCallbackUrl(req);
    safeDebugLog('[OAuth Debug] Starting passport.authenticate for Google', { state, callbackURL });
    passport.authenticate('google', {
      scope: ['openid', 'email', 'profile'],
      state: state, // Include state parameter for CSRF protection
      callbackURL: callbackURL // Use the computed callback URL
    })(req, res, next);
  } catch (error) {
    console.error('[OAuth] Session save error:', error);
    return res.status(500).json({ 
      message: 'Failed to initialize authentication session',
      error: 'session_save_failed' 
    });
  }
});

// Google OAuth callback handler with comprehensive error logging
// Google OAuth callback handler with comprehensive error logging
router.get('/google/callback', (req, res, next) => {
  passport.authenticate('google', { failureRedirect: '/auth?error=google' },
    (err, user) => {
      if (err) return next(err);
      if (!user) return res.redirect('/auth?error=no_user');

      req.login(user, (err) => {           // <--- puts user.id into session.passport
        if (err) return next(err);

        // Optional: legacy flag if other code checks it
        req.session.userId = user.id;

        const returnTo = req.session.returnTo || '/';
        delete req.session.returnTo;

        req.session.save((saveErr) => {    // <--- persist before redirect
          if (saveErr) {
            console.error('[SESSION SAVE ERROR @ GOOGLE CALLBACK]', saveErr);
            return res.status(500).send({
              message: 'Failed to persist auth session',
              error: 'session_save_failed'
            });
          }
          return res.redirect(returnTo);
        });
      });
    }
  )(req, res, next);
});

export default router;
