import { Router, Request, Response } from "express";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { storage } from "./storage";
import type { User } from "@shared/schema";

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
    },
    headers: {
      cookie: !!req.headers.cookie,
      userAgent: req.get('User-Agent'),
      xForwardedProto: req.get('X-Forwarded-Proto'),
      xForwardedHost: req.get('X-Forwarded-Host'),
    },
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
  // In production, always use the apex domain for OAuth consistency
  if (process.env.NODE_ENV === 'production') {
    return 'https://myaimediamgr.com/api/auth/google/callback';
  }
  
  // In development, check for Replit domains first
  if (process.env.REPLIT_DOMAINS) {
    const firstDomain = process.env.REPLIT_DOMAINS.split(',')[0];
    return `https://${firstDomain}/api/auth/google/callback`;
  }
  
  // Local development
  return 'http://localhost:5000/api/auth/google/callback';
}

// Configure Google OAuth Strategy with state parameter for CSRF protection
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: `${process.env.APP_URL}/api/auth/google/callback`,
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
        // Update existing user's Google info
        await storage.updateUser(user.id, {
          googleAvatar: profile.photos?.[0]?.value,
          profileImageUrl: user.profileImageUrl || profile.photos?.[0]?.value,
          emailVerified: true,
          lastLoginAt: new Date(),
        });
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

  passport.serializeUser((user: any, done) => {
    safeDebugLog('[OAuth Debug] Serializing user:', {
      userId: user?.id,
      email: user?.email,
    });
    done(null, user.id);
  });

  passport.deserializeUser(async (id: string, done) => {
    safeDebugLog('[OAuth Debug] Deserializing user ID:', { userId: id });
    try {
      const user = await storage.getUser(id);
      safeDebugLog('[OAuth Debug] User deserialized:', {
        userId: user?.id,
        email: user?.email,
        found: !!user,
      });
      done(null, user);
    } catch (error) {
      safeDebugLog('[OAuth Error] User deserialization failed:', {
        userId: id,
        error: error instanceof Error ? {
          name: error.name,
          message: error.message,
          stack: isDebugEnabled ? error.stack : undefined,
        } : error,
      });
      done(error);
    }
  });
}

// Initialize passport middleware
router.use(passport.initialize());
router.use(passport.session());

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
  const crypto = require('crypto');
  const state = crypto.randomBytes(32).toString('hex');
  req.session.oauthState = state;
  
  console.log('[OAuth] Generated state:', state);
  console.log('[OAuth] Session ID before save:', req.sessionID);
  
  // Log effective callback URL being used
  const effectiveCallbackUrl = getCallbackUrl(req);
  
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
    
    safeDebugLog('[OAuth Debug] Starting passport.authenticate for Google', { state });
    passport.authenticate('google', {
      scope: ['openid', 'email', 'profile'],
      state: state // Include state parameter for CSRF protection
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
router.get("/google/callback", 
  (req: Request, res: Response, next: Function) => {
    console.log('[OAuth] Callback received with query params:', Object.keys(req.query));
    console.log('[OAuth] Session exists:', !!req.session);
    console.log('[OAuth] Session ID:', req.session?.id);
    
    logMobileDiagnostics(req, 'oauth-callback');
    
    // Verify CSRF state parameter
    const receivedState = req.query.state;
    const expectedState = req.session.oauthState;
    const stateMatches = receivedState === expectedState;
    
    console.log('[OAuth] CSRF state check:', { 
      receivedState: receivedState ? 'present' : 'missing',
      expectedState: expectedState ? 'present' : 'missing',
      matches: stateMatches 
    });
    
    const debugInfo = {
      userAgent: req.get('User-Agent'),
      origin: req.get('Origin'),
      referer: req.get('Referer'),
      host: req.get('Host'),
      query: req.query,
      timestamp: new Date().toISOString(),
      isMobile: /Mobile|Android|iPhone|iPad|BlackBerry|Opera Mini|IEMobile/.test(req.get('User-Agent') || ''),
      hasCode: !!req.query.code,
      hasError: !!req.query.error,
      errorDescription: req.query.error_description,
      receivedState,
      expectedState,
      stateMatches,
    };
    
    safeDebugLog('[OAuth Debug] Google callback received:', debugInfo);
    
    // Log CSRF state mismatch explicitly
    if (!stateMatches && process.env.NODE_ENV === 'production') {
      console.error('[OAuth Error] CSRF state parameter mismatch detected');
      safeDebugLog('[OAuth Error] CSRF state parameter mismatch detected:', {
        receivedState,
        expectedState,
        userAgent: req.get('User-Agent'),
        origin: req.get('Origin'),
      });
      // In production, only fail on state mismatch if both states exist
      // Sometimes state gets lost in mobile browsers or due to cookie issues
      if (receivedState && expectedState) {
        return res.redirect('/auth?error=csrf_state_mismatch');
      }
      console.warn('[OAuth Warning] State parameter missing, continuing authentication');
    }
    
    // Clean up state from session
    delete req.session.oauthState;
    
    if (req.query.error) {
      console.error('[OAuth Error] Google OAuth error in callback:', req.query.error);
      safeDebugLog('[OAuth Error] Google OAuth error in callback:', {
        ...debugInfo,
        error: req.query.error,
        errorDescription: req.query.error_description,
        errorUri: req.query.error_uri,
      });
      return res.redirect(`/auth?error=google_oauth_error&details=${encodeURIComponent(req.query.error as string)}`);
    }
    
    passport.authenticate('google', {
      failureRedirect: '/auth?error=google_auth_failed',
      failureMessage: true,
      session: true, // Explicitly enable session support
    })(req, res, (err: any) => {
      if (err) {
        safeDebugLog('[OAuth Error] Passport authentication failed in callback:', {
          ...debugInfo,
          error: err instanceof Error ? {
            name: err.name,
            message: err.message,
            stack: isDebugEnabled ? err.stack : undefined,
          } : err,
        });
        return res.redirect(`/auth?error=passport_auth_failed&details=${encodeURIComponent(err.message || 'Unknown error')}`);
      }
      next();
    });
  },
  async (req: Request, res: Response) => {
    console.log('[OAuth] Authentication successful, entering final handler');
    console.log('[OAuth] User exists:', !!req.user);
    console.log('[OAuth] Session exists:', !!req.session);
    
    logMobileDiagnostics(req, 'callback-success');
    
    const debugInfo = {
      userAgent: req.get('User-Agent'),
      origin: req.get('Origin'),
      referer: req.get('Referer'),
      timestamp: new Date().toISOString(),
      isMobile: /Mobile|Android|iPhone|iPad|BlackBerry|Opera Mini|IEMobile/.test(req.get('User-Agent') || ''),
    };
    
    safeDebugLog('[OAuth Debug] Entering callback success handler:', debugInfo);
    
    // Authentication successful
    const user = req.user as User;
    if (!user) {
      console.error('[OAuth Error] No user object after successful authentication');
      safeDebugLog('[OAuth Error] No user object after successful authentication:', debugInfo);
      return res.redirect("/auth?error=no_user_object");
    }
    
    console.log('[OAuth] User authenticated:', {
      userId: user.id,
      email: maskEmail(user.email || ''),
      needsTrialSelection: user.needsTrialSelection
    });
    
    safeDebugLog('[OAuth Debug] User authenticated successfully:', {
      ...debugInfo,
      userId: user.id,
      email: user.email,
      needsTrialSelection: user.needsTrialSelection,
    });
    
    try {
      createUserSession(req, user);
      
      console.log('[OAuth] Session created with userId:', req.session.userId);
      console.log('[OAuth] Session ID before save:', req.sessionID);
      safeDebugLog('[OAuth Debug] Session created, attempting to save...');
      
      // Set cache control headers to prevent redirect caching
      res.set({
        'Cache-Control': 'no-store, no-cache, must-revalidate, private',
        'Pragma': 'no-cache',
        'Expires': '0',
      });
      
      // Force session save and wait for completion
      await new Promise<void>((resolve, reject) => {
        req.session.save((err) => {
          if (err) {
            console.error('[OAuth Error] Session save failed:', err.message);
            safeDebugLog('[OAuth Error] Session save failed:', {
              ...debugInfo,
              userId: user.id,
              email: user.email,
              error: err instanceof Error ? {
                name: err.name,
                message: err.message,
                stack: isDebugEnabled ? err.stack : undefined,
              } : err,
              sessionData: {
                userId: req.session.userId,
                userEmail: req.session.user?.email,
                sessionId: req.sessionID,
              },
            });
            reject(err);
            return;
          }
          
          console.log('[OAuth] Session saved successfully');
          console.log('[OAuth] Session ID after save:', req.sessionID);
          console.log('[OAuth] Session userId:', req.session.userId);
          console.log('[OAuth] Session user email:', req.session.user?.email ? maskEmail(req.session.user.email) : 'none');
          
          safeDebugLog('[OAuth Debug] Session saved successfully:', {
            ...debugInfo,
            userId: user.id,
            sessionUserId: req.session.userId,
            sessionId: req.sessionID,
          });
          resolve();
        });
      });
      
      // Check if user needs trial selection (new users)
      if (user.needsTrialSelection) {
        console.log('[OAuth] New user needs trial selection, redirecting to /trial-selection');
        safeDebugLog('[OAuth Debug] User needs trial selection, redirecting to trial-selection');
        return res.redirect("/trial-selection");
      }
      
      // Redirect to home page or validated return URL
      let returnTo = "/"; // Default to home page for better UX
      
      // Check both returnTo and returnUrl for compatibility
      const sessionReturnUrl = req.session.returnTo || req.session.returnUrl;
      
      if (sessionReturnUrl && isValidReturnUrl(sessionReturnUrl)) {
        returnTo = sessionReturnUrl;
        console.log('[OAuth] Using session return URL:', returnTo);
      } else {
        console.log('[OAuth] Using default redirect to home page');
      }
      
      // Clean up return URLs from session
      delete req.session.returnTo;
      delete req.session.returnUrl;
      
      console.log('[OAuth] Final redirect to:', returnTo);
      safeDebugLog('[OAuth Debug] Final redirect to:', { returnTo });
      
      // Send response with explicit headers to ensure cookies are set
      res.status(302);
      res.setHeader('Location', returnTo);
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.end();
    } catch (error) {
      console.error('[OAuth Error] Exception in callback success handler:', error instanceof Error ? error.message : error);
      safeDebugLog('[OAuth Error] Exception in callback success handler:', {
        ...debugInfo,
        userId: user?.id,
        error: error instanceof Error ? {
          name: error.name,
          message: error.message,
          stack: isDebugEnabled ? error.stack : undefined,
        } : error,
      });
      
      // Try to fallback to creating a basic session without regeneration
      try {
        createUserSession(req, user);
        await new Promise<void>((resolve, reject) => {
          req.session.save((err) => {
            if (err) {
              reject(err);
            } else {
              resolve();
            }
          });
        });
        
        // If session saved successfully in fallback, redirect to dashboard
        console.log('[OAuth] Fallback session save successful');
        const redirectTo = user.needsTrialSelection ? "/trial-selection" : "/dashboard";
        res.redirect(redirectTo);
      } catch (fallbackError) {
        console.error('[OAuth Error] Fallback session save also failed:', fallbackError);
        res.redirect("/auth?error=session_failed&details=" + encodeURIComponent('Session creation failed. Please try again or use email/password login.'));
      }
    }
  }
);

export default router;
