import express, { type Request, Response, NextFunction } from "express";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import session from "express-session";
import connectPg from "connect-pg-simple";
import passport from "passport";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import stripeWebhook from "./stripe-webhook";

const app = express();

// Trust proxy for rate limiting to work correctly behind proxies
app.set("trust proxy", 1);

// Redirect www to apex domain to maintain OAuth consistency
app.use((req, res, next) => {
  if (req.headers.host === 'www.myaimediamgr.com') {
    return res.redirect(301, `https://myaimediamgr.com${req.originalUrl}`);
  }
  next();
});

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https:"],
      styleSrc: ["'self'", "'unsafe-inline'", "https:"],
      fontSrc: ["'self'", "data:", "https:"],
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      connectSrc: ["'self'", "https:", "wss:"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

// CORS configuration
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
}));

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply rate limiting to API routes
app.use('/api/', apiLimiter);

// Stricter rate limiting for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 requests per windowMs
  message: 'Too many authentication attempts, please try again later.',
  skipSuccessfulRequests: true,
});

app.use('/api/login', authLimiter);
app.use('/api/callback', authLimiter);

// IMPORTANT: Stripe webhook MUST be registered BEFORE body parser middleware
// to preserve raw body for signature verification
app.use('/api/stripe', stripeWebhook);

// Body parser middleware - MUST come AFTER webhook routes
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: false, limit: '10mb' }));

// Serve attached assets (generated images, videos, etc.)
app.use('/attached_assets', express.static('attached_assets'));

// Session and Passport middleware - MUST be mounted BEFORE routes
const PgStore = connectPg(session);

// Sanity check early
if (!process.env.DATABASE_URL) {
  console.error('[BOOT] Missing DATABASE_URL — session store cannot connect.');
}

const store = new PgStore({
  // Prefer conObject so we can force TLS; Render usually requires it
  conObject: {
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },   // ← critical on Render
  },
  tableName: 'session',                   // keep lowercase; default for pg-simple
  schemaName: 'public',
  createTableIfMissing: true,
});

store.on('error', (err: any) => {
  console.error('[SESSION STORE ERROR]', {
    message: err?.message,
    code: err?.code,
    detail: err?.detail,
    hint: err?.hint,
    schema: err?.schema,
    table: err?.table,
    where: err?.where,
    stack: err?.stack,
  });
});

app.use(session({
  name: 'mam.sid',
  secret: process.env.SESSION_SECRET!,    // must be set in Render env
  store,
  resave: false,
  saveUninitialized: false,
  proxy: true,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',                      // works for top-level OAuth redirects
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  },
}));

app.use(passport.initialize());
app.use(passport.session());
console.log('[Server] Session and Passport middleware mounted in index.ts');

// Session health check endpoint for debugging
app.get('/__session-health', (req, res) => {
  req.session.__ts = Date.now();
  req.session.save((err) => {
    if (err) {
      console.error('[SESSION HEALTH] save failed', err);
      return res.status(500).json({ ok: false, err: String(err) });
    }
    res.json({ ok: true });
  });
});

// Set up Passport serialize/deserialize - MUST be done before routes
passport.serializeUser((user: any, done) => {
  const id = user.id ?? user.user_id ?? user.uid;
  if (!id) {
    console.error('[passport] serialize ERROR: No user id found:', user);
    return done(new Error('No user id in serializeUser'));
  }
  console.log('[passport] serialize', id);
  done(null, id);
});

passport.deserializeUser(async (id: string, done) => {
  try {
    // Import storage dynamically to avoid circular imports
    const { storage } = await import('./storage');
    const user = await storage.getUser(id);
    console.log('[passport] deserialize', id, Boolean(user));
    done(null, user || false);
  } catch (e) {
    console.error('[passport] deserialize ERROR:', e);
    done(e);
  }
});

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);
  });
})();
