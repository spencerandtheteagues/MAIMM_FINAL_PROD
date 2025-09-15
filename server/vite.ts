import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { createServer as createViteServer, createLogger } from "vite";
import { type Server } from "http";
import viteConfig from "../vite.config";
import { nanoid } from "nanoid";

const viteLogger = createLogger();

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

export async function setupVite(app: Express, server: Server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
        process.exit(1);
      },
    },
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;

    // Don't intercept API routes - let them return proper 404s
    if (url.startsWith('/api/')) {
      return res.status(404).json({ error: 'API endpoint not found' });
    }

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "..",
        "client",
        "index.html",
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`,
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Express) {
  // In production, the server runs from dist/index.js, so public files are at dist/public
  // In development or when not bundled, look for public in the project root
  let distPath = path.resolve(import.meta.dirname, "public");

  // If running from bundled dist/index.js, import.meta.dirname is 'dist'
  // If running from server/index.ts, import.meta.dirname is 'server'
  if (!fs.existsSync(distPath)) {
    // Try project root + dist/public (for development)
    const rootDistPath = path.resolve(process.cwd(), "dist", "public");
    if (fs.existsSync(rootDistPath)) {
      distPath = rootDistPath;
    } else {
      // Try one level up from server + dist/public
      const upDistPath = path.resolve(import.meta.dirname, "..", "dist", "public");
      if (fs.existsSync(upDistPath)) {
        distPath = upDistPath;
      }
    }
  }

  console.log(`[Static Server] Serving static files from: ${distPath}`);

  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  app.use(express.static(distPath));

  // fall through to index.html if the file doesn't exist, but NOT for API routes
  app.use("*", (req, res) => {
    // Don't intercept API routes
    if (req.originalUrl.startsWith('/api/')) {
      return res.status(404).json({ error: 'API endpoint not found' });
    }

    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
