import * as client from "openid-client";
import { Strategy, type VerifyFunction } from "openid-client/passport";

import passport from "passport";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import memoize from "memoizee";
import connectPg from "connect-pg-simple";
import { storage } from "./storage";

if (!process.env.REPLIT_DOMAINS) {
  throw new Error("Environment variable REPLIT_DOMAINS not provided");
}

const getOidcConfig = memoize(
  async () => {
    return await client.discovery(
      new URL(process.env.ISSUER_URL ?? "https://replit.com/oidc"),
      process.env.REPL_ID!
    );
  },
  { maxAge: 3600 * 1000 }
);

export function getSession() {
  if (!process.env.SESSION_SECRET) {
    throw new Error("SESSION_SECRET environment variable is required for secure session management");
  }
  
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: false,
    ttl: sessionTtl,
    tableName: "sessions",
  });
  
  // Determine if we're in production
  const isProduction = process.env.NODE_ENV === 'production';
  
  // For production, don't set domain to allow cookies to work on the exact domain
  // Setting domain to .myaimediamgr.com can cause issues with OAuth redirects
  const cookieDomain = undefined; // Let the browser handle domain automatically
  
  console.log('[Session Config] Environment:', process.env.NODE_ENV);
  console.log('[Session Config] Cookie domain:', cookieDomain || 'auto (browser default)');
  console.log('[Session Config] Secure cookies:', isProduction);
  console.log('[Session Config] SameSite:', isProduction ? "lax" : "lax");
  
  return session({
    name: "connect.sid",
    secret: process.env.SESSION_SECRET || "myaimediamgr-secret-key-change-in-production",
    store: sessionStore,
    resave: false,
    saveUninitialized: true, // Changed to true to ensure session is created for OAuth
    proxy: isProduction, // Trust proxy in production
    cookie: {
      httpOnly: true,
      secure: isProduction, // Use secure cookies in production
      sameSite: "lax", // Use 'lax' for better compatibility
      maxAge: sessionTtl,
      domain: cookieDomain, // Let browser handle domain
      path: '/', // Ensure cookie is available on all paths
    },
  });
}

function updateUserSession(
  user: any,
  tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers
) {
  user.claims = tokens.claims();
  user.access_token = tokens.access_token;
  user.refresh_token = tokens.refresh_token;
  user.expires_at = user.claims?.exp;
}

import { TRIAL_ALLOCATIONS } from "../shared/credits";

async function upsertUser(
  claims: any,
) {
  // Check if user already exists
  const existingUser = await storage.getUser(claims["sub"]);
  
  // If new user, create without trial - they must select it
  if (!existingUser) {
    await storage.upsertUser({
      id: claims["sub"],
      username: claims["sub"] || claims["email"],
      email: claims["email"],
      firstName: claims["first_name"],
      lastName: claims["last_name"],
      profileImageUrl: claims["profile_image_url"],
      emailVerified: true, // OAuth users are already verified by Replit
      // Mark that they need to select a trial/subscription
      needsTrialSelection: true,
      tier: "free", // Default tier until they select
      credits: 0, // No credits until they select a plan
    });
  } else {
    // Existing user - just update basic info
    await storage.upsertUser({
      id: claims["sub"],
      username: claims["sub"] || claims["email"],
      email: claims["email"],
      firstName: claims["first_name"],
      lastName: claims["last_name"],
      profileImageUrl: claims["profile_image_url"],
    });
  }
}

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());
  app.use(enforceTrialGating());
  app.use(passport.initialize());
  app.use(passport.session());

  const config = await getOidcConfig();

  const verify: VerifyFunction = async (
    tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers,
    verified: passport.AuthenticateCallback
  ) => {
    const user = {};
    updateUserSession(user, tokens);
    await upsertUser(tokens.claims());
    verified(null, user);
  };

  for (const domain of process.env
    .REPLIT_DOMAINS!.split(",")) {
    const strategy = new Strategy(
      {
        name: `replitauth:${domain}`,
        config,
        scope: "openid email profile offline_access",
        callbackURL: `https://${domain}/api/callback`,
      },
      verify,
    );
    passport.use(strategy);
  }

  passport.serializeUser((user: Express.User, cb) => cb(null, user));
  passport.deserializeUser((user: Express.User, cb) => cb(null, user));

  app.get("/api/login", (req, res, next) => {
    passport.authenticate(`replitauth:${req.hostname}`, {
      prompt: "login consent",
      scope: ["openid", "email", "profile", "offline_access"],
    })(req, res, next);
  });

  app.get("/api/callback", async (req, res, next) => {
    passport.authenticate(`replitauth:${req.hostname}`, async (err: any, user: any) => {
      if (err || !user) {
        return res.redirect("/api/login");
      }
      
      req.logIn(user, async (loginErr) => {
        if (loginErr) {
          return res.redirect("/api/login");
        }
        
        // Check if user needs to select a trial
        const userId = user.claims?.sub;
        if (userId) {
          const dbUser = await storage.getUser(userId);
          if (dbUser?.needsTrialSelection) {
            return res.redirect("/trial-selection");
          }
        }
        
        return res.redirect("/?showTrialWelcome=true");
      });
    })(req, res, next);
  });

  app.get("/api/logout", (req, res) => {
    req.logout(() => {
      res.redirect(
        client.buildEndSessionUrl(config, {
          client_id: process.env.REPL_ID!,
          post_logout_redirect_uri: `${req.protocol}://${req.hostname}`,
        }).href
      );
    });
  });
}

export const isAuthenticated: RequestHandler = async (req, res, next) => {
  const user = req.user as any;

  if (!req.isAuthenticated() || !user.expires_at) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const now = Math.floor(Date.now() / 1000);
  if (now <= user.expires_at) {
    return next();
  }

  const refreshToken = user.refresh_token;
  if (!refreshToken) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  try {
    const config = await getOidcConfig();
    const tokenResponse = await client.refreshTokenGrant(config, refreshToken);
    updateUserSession(user, tokenResponse);
    return next();
  } catch (error) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
};

export const isAdmin: RequestHandler = async (req, res, next) => {
  // Allow demo mode for Spencer (admin)
  if (!req.isAuthenticated()) {
    // In demo mode, check if it's the demo admin user
    const demoUser = await storage.getUser("demo-user-1");
    if (demoUser && demoUser.role === "admin") {
      req.user = { claims: { sub: "demo-user-1" } } as any;
      return next();
    }
    return res.status(401).json({ message: "Unauthorized" });
  }

  const user = req.user as any;
  const userId = user.claims?.sub;
  
  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const dbUser = await storage.getUser(userId);
  if (!dbUser || (!dbUser.isAdmin && dbUser.role !== "admin")) {
    return res.status(403).json({ message: "Admin access required" });
  }

  return next();
};
