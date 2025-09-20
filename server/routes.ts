import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertPostSchema, insertAiSuggestionSchema, insertCampaignSchema } from "@shared/schema";
import { z } from "zod";
import { aiService } from "./ai-service";
import aiRoutes from "./aiRoutes";
import aiChatRoutes from "./aiChatRoutes";
import { generateXAuthUrl, handleXOAuthCallback, postToXWithOAuth } from "./x-oauth";
import authRoutes, { requireAuth, requireAdmin } from "./auth";
import { registerGoogleAuth } from "./google-auth";
import { authOptional, authRequired } from "./auth/jwt";
import cookieParser from "cookie-parser";
import adminPasswordRoutes from "./adminPasswordReset";
import stripeRoutes from "./stripeRoutes";
import userRoutes from "./userRoutes";
import adminRoutes from "./adminRoutes";
import healthRoutes from "./health";
import { createApprovalRoutes } from "./approvalRoutes";
import { createLibraryRoutes } from "./libraryRoutes";
import { createCampaignRoutes } from "./campaignRoutes";
import { createBrandRoutes } from "./brandRoutes";
import { createFeedbackRoutes } from "./feedbackRoutes";
import { createMetricsRoute, trackApiMetrics } from "./metrics";
import { trialRouter } from "./trial";
import verificationRoutes from "./verificationRoutes";
import referralRoutes from "./referralRoutes";
import { enforceTrialExpiration, isUserTrialExpired } from "./middleware/trialEnforcement";
import { checkUserAccess } from "./middleware/accessControl";
import { trackUserActivity } from "./middleware/activityTracker";

// Helper function to get user ID from request regardless of auth method
function getUserId(req: any): string | null {
  // Check JWT auth (new stateless system)
  if (req.user?.sub) {
    return req.user.sub;
  }
  // Check legacy session-based auth (for backward compatibility)
  if (req.session?.userId) {
    return req.session.userId;
  }
  // Check if user object has id directly (from session auth middleware)
  if (req.user?.id) {
    return req.user.id;
  }
  // Check Replit auth claims
  if (req.user?.claims?.sub) {
    return req.user.claims.sub;
  }
  return null;
}

// Middleware to check if user needs to select a trial
async function checkTrialSelection(req: any, res: any, next: Function) {
  // CRITICAL: Skip this check during OAuth flow to prevent interrupting authentication
  // Google OAuth callback MUST complete before checking trial selection
  if (req.path === '/api/trial/select' ||
      req.path === '/api/user' ||
      req.path.startsWith('/api/auth/') || // Covers all auth endpoints including OAuth callbacks
      req.path.startsWith('/api/verification/') ||
      req.path.startsWith('/api/stripe/') ||
      req.path.startsWith('/api/billing/')) {
    return next();
  }

  const userId = getUserId(req);
  
  if (userId) {
    try {
      const user = await storage.getUser(userId);
      if (user?.needsTrialSelection) {
        // Check if user actually needs trial selection or if they already have a trial/plan
        const hasExistingPlan = user.tier !== 'free' ||
                               user.subscriptionStatus === 'active' ||
                               (user.subscriptionStatus === 'trial' && user.trialStartDate && user.trialPlan);

        if (hasExistingPlan) {
          // User already has a plan but flag wasn't cleared - fix it
          try {
            await storage.updateUser(userId, { needsTrialSelection: false });
            console.log(`Cleared needsTrialSelection flag for existing user ${userId}`);
          } catch (updateError) {
            console.error("Failed to clear needsTrialSelection flag:", updateError);
          }
        } else {
          // User genuinely needs to select a trial
          return res.status(403).json({
            message: "Trial selection required",
            needsTrialSelection: true
          });
        }
      }
    } catch (error) {
      console.error("Error checking trial selection:", error);
    }
  }
  
  next();
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Add metrics middleware
  app.use(trackApiMetrics);
  
  // Health routes (no auth required)
  app.use("/", healthRoutes);

  // Metrics endpoint (no auth for monitoring)
  app.get("/metrics", createMetricsRoute());

  // Cookie parser middleware (for JWT cookies)
  app.use(cookieParser());

  // JWT auth middleware (optional - adds user to req if token exists)
  app.use(authOptional);

  // Use app auth routes (Replit auth disabled for Render deployment)
  app.use("/api/auth", authRoutes);

  // Admin password management routes (secure)
  app.use("/api/admin", adminPasswordRoutes);

  // Google OAuth routes (available regardless of Replit auth)
  registerGoogleAuth(app);
  
  // Wire up email verification routes (no auth required)
  app.use("/api/verification", verificationRoutes);
  
  // Add trial selection check middleware
  app.use(checkTrialSelection);
  
  // Add activity tracking middleware (must come after auth)
  app.use(trackUserActivity);
  
  // Add access control middleware (check pause and trial)
  app.use(checkUserAccess);
  
  // Add trial expiration enforcement middleware
  // This must come after authentication but before route handlers
  app.use(enforceTrialExpiration);
  
  // Use app auth middleware (Replit auth disabled for Render deployment)
  const isAuthenticated = requireAuth;
  
  // Wire up the new AI routes with proper authentication
  app.use("/api/ai", async (req: any, res, next) => {
    // Check for JWT authentication first (primary method)
    const token = req.cookies?.mam_jwt;
    if (token) {
      try {
        const { verifyJwt } = await import('./auth/jwt');
        const jwtClaims = verifyJwt(token);
        if (jwtClaims?.sub) {
          // Get the user from storage and set it on req.user
          const user = await storage.getUser(jwtClaims.sub);
          if (user) {
            req.user = {
              id: user.id,
              email: user.email,
              username: user.username,
              businessName: user.businessName,
              role: user.role,
              tier: user.tier,
              isAdmin: user.isAdmin,
              sub: jwtClaims.sub, // For JWT compatibility
              claims: { sub: user.id } // For legacy compatibility
            };
          }
        }
      } catch (jwtError) {
        console.error("JWT verification failed for AI routes:", jwtError);
      }
    }
    // Check for session-based authentication as fallback
    else if (req.session?.userId) {
      // Get the user from storage and set it on req.user
      try {
        const user = await storage.getUser(req.session.userId);
        if (user) {
          req.user = {
            id: user.id,
            email: user.email,
            username: user.username,
            businessName: user.businessName,
            role: user.role,
            tier: user.tier,
            isAdmin: user.isAdmin,
            claims: { sub: user.id } // For compatibility
          };
        }
      } catch (error) {
        console.error("Error loading user for AI routes:", error);
      }
    }
    // Check for Replit auth
    else if (req.user?.claims?.sub) {
      // Get the user from storage and set proper user object
      try {
        const user = await storage.getUser(req.user.claims.sub);
        if (user) {
          req.user = {
            id: user.id,
            email: user.email,
            username: user.username,
            businessName: user.businessName,
            role: user.role,
            tier: user.tier,
            isAdmin: user.isAdmin,
            claims: { sub: user.id }
          };
        }
      } catch (error) {
        console.error("Error loading user for AI routes:", error);
      }
    }
    // If still no user, allow demo access
    else {
      try {
        const demoUser = await storage.getUserByUsername("spencer.teague");
        if (demoUser) {
          req.user = {
            id: demoUser.id,
            email: demoUser.email,
            username: demoUser.username,
            businessName: demoUser.businessName,
            role: demoUser.role,
            tier: demoUser.tier,
            isAdmin: demoUser.isAdmin,
            claims: { sub: demoUser.id }
          };
        }
      } catch (error) {
        console.error("Error loading demo user for AI routes:", error);
      }
    }
    next();
  }, aiRoutes);
  
  // Wire up AI Chat routes (with conditional authentication)
  app.use("/api/ai-chat", async (req: any, res, next) => {
    // Allow health endpoint without authentication
    if (req.path === '/health') {
      return next();
    }

    // Check for JWT authentication first (primary method)
    const token = req.cookies?.mam_jwt;
    if (token) {
      try {
        const { verifyJwt } = await import('./auth/jwt');
        const jwtClaims = verifyJwt(token);
        if (jwtClaims?.sub) {
          // Get the user from storage and set it on req.user
          const user = await storage.getUser(jwtClaims.sub);
          if (user) {
            req.user = {
              id: user.id,
              email: user.email,
              username: user.username,
              businessName: user.businessName,
              role: user.role,
              tier: user.tier,
              isAdmin: user.isAdmin,
              sub: jwtClaims.sub, // For JWT compatibility
              claims: { sub: user.id } // For legacy compatibility
            };
          }
        }
      } catch (jwtError) {
        console.error("JWT verification failed for AI chat routes:", jwtError);
      }
    }
    // Check for session-based authentication as fallback
    else if (req.session?.userId) {
      // Get the user from storage and set it on req.user
      try {
        const user = await storage.getUser(req.session.userId);
        if (user) {
          req.user = {
            id: user.id,
            email: user.email,
            username: user.username,
            businessName: user.businessName,
            role: user.role,
            tier: user.tier,
            isAdmin: user.isAdmin,
            claims: { sub: user.id } // For compatibility
          };
        }
      } catch (error) {
        console.error("Error loading user for AI chat routes:", error);
      }
    }
    // Check for Replit auth
    else if (req.user?.claims?.sub) {
      // Get the user from storage and set proper user object
      try {
        const user = await storage.getUser(req.user.claims.sub);
        if (user) {
          req.user = {
            id: user.id,
            email: user.email,
            username: user.username,
            businessName: user.businessName,
            role: user.role,
            tier: user.tier,
            isAdmin: user.isAdmin,
            claims: { sub: user.id }
          };
        }
      } catch (error) {
        console.error("Error loading user for AI chat routes:", error);
      }
    }
    // If still no user, allow demo access for testing
    else {
      try {
        // For demo/testing purposes, use a demo user
        const demoUser = await storage.getUserByUsername("spencer.teague");
        if (demoUser) {
          req.user = {
            id: demoUser.id,
            email: demoUser.email,
            username: demoUser.username,
            businessName: demoUser.businessName,
            role: demoUser.role,
            tier: demoUser.tier,
            isAdmin: demoUser.isAdmin,
            claims: { sub: demoUser.id }
          };
        } else {
          // If no demo user exists, return authentication required
          return res.status(401).json({ message: "Authentication required for AI chat" });
        }
      } catch (error) {
        console.error("Error loading demo user for AI chat routes:", error);
        return res.status(401).json({ message: "Authentication required for AI chat" });
      }
    }
    next();
  }, aiChatRoutes);
  
  // Wire up user management routes
  app.use("/api/user", userRoutes);
  
  // Wire up Stripe billing routes
  app.use("/api/billing", stripeRoutes);
  app.use("/api/stripe", stripeRoutes);
  
  // Also expose subscription and credit routes
  app.use("/api/subscription", stripeRoutes);
  app.use("/api/credits", stripeRoutes);
  
  // Wire up admin routes
  app.use("/api/admin", adminRoutes);
  
  // Wire up approval queue routes
  app.use(createApprovalRoutes(storage));
  
  // Wire up library routes
  app.use(createLibraryRoutes(storage));
  
  // Wire up campaign routes
  app.use(createCampaignRoutes(storage));
  
  // Wire up brand profile routes
  app.use(createBrandRoutes(storage));
  
  // Wire up feedback routes
  app.use(createFeedbackRoutes(storage));
  
  // Wire up trial routes
  app.use("/api/trial", trialRouter);
  
  // Wire up referral routes
  app.use("/api/referral", referralRoutes);
  app.use("/api/referrals", referralRoutes); // Keep backward compatibility
  
  // Wire up schedule routes
  const { createScheduleRoutes } = await import("./scheduleRoutes");
  app.use(createScheduleRoutes(storage));

  // Wire up content validation routes
  const { createContentValidationRoutes } = await import("./contentValidationRoutes");
  app.use(createContentValidationRoutes());
  
  // Auth routes
  app.get('/api/auth/user', async (req: any, res) => {
    try {
      // Check for authenticated user - support both JWT and legacy auth
      const userId = req.user?.sub || req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });
  
  // Get current user - works with both auth systems
  app.get("/api/user", async (req: any, res) => {
    try {
      let userId: string | undefined;

      // Check for JWT auth (new stateless system)
      if (req.user?.sub) {
        userId = req.user.sub;
      }
      // Check for session-based auth (app auth)
      else if (req.session?.userId) {
        userId = req.session.userId;
      }
      // Check for Replit auth
      else if (req.user?.claims?.sub) {
        userId = req.user.claims.sub;
      }
      // No fallback to demo user - require authentication
      else {
        return res.status(401).json({ message: "Not authenticated" });
      }
      
      // Get the authenticated user
      let user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Generate referral code if user doesn't have one
      if (!user.referralCode) {
        user = await storage.generateReferralCode(userId) || user;
      }

      res.json(user);
    } catch (error) {
      console.error("Error getting user:", error);
      res.status(500).json({ message: "Failed to get user" });
    }
  });

  // Get connected platforms status - REAL CONNECTION STATUS
  app.get("/api/platforms", async (req: any, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const platforms = await storage.getPlatformsByUserId(userId);
      
      // Return REAL platform connection status
      const platformStatus = [
        { name: "Instagram", connected: platforms.some(p => p.name === "Instagram" && p.isConnected) },
        { name: "Facebook", connected: platforms.some(p => p.name === "Facebook" && p.isConnected) },
        { name: "X.com", connected: platforms.some(p => p.name === "X (Twitter)" && p.isConnected) },
        { name: "TikTok", connected: platforms.some(p => p.name === "TikTok" && p.isConnected) },
        { name: "LinkedIn", connected: platforms.some(p => p.name === "LinkedIn" && p.isConnected) },
      ];
      
      res.json(platformStatus);
    } catch (error) {
      res.status(500).json({ message: "Failed to get platforms" });
    }
  });

  // Connect platform with API keys
  app.post("/api/platforms/connect-api", async (req: any, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const { platform, apiKey, apiSecret, accessToken, accessTokenSecret, pageId, clientId, clientSecret } = req.body;
      
      if (!platform) {
        return res.status(400).json({ message: "Platform name is required" });
      }
      
      // Validate required fields based on platform
      const requiredFields: Record<string, string[]> = {
        "X.com": ["apiKey", "apiSecret", "accessToken", "accessTokenSecret"],
        "Instagram": ["clientId", "clientSecret", "accessToken"],
        "Facebook": ["pageId", "accessToken"],
        "TikTok": ["clientId", "clientSecret"],
        "LinkedIn": ["clientId", "clientSecret", "accessToken"]
      };
      
      const required = requiredFields[platform];
      if (!required) {
        return res.status(400).json({ message: "Invalid platform" });
      }
      
      for (const field of required) {
        if (!req.body[field]) {
          return res.status(400).json({ message: `${field} is required for ${platform}` });
        }
      }
      
      // Create platform connection
      const platformData = {
        userId,
        name: platform === "X.com" ? "X (Twitter)" : platform,
        isConnected: true,
        credentials: {
          apiKey: apiKey || null,
          apiSecret: apiSecret || null,
          accessToken: accessToken || null,
          accessTokenSecret: accessTokenSecret || null,
          pageId: pageId || null,
          clientId: clientId || null,
          clientSecret: clientSecret || null
        }
      };
      
      await storage.createPlatform(platformData);
      res.json({ success: true, message: `Successfully connected to ${platform}` });
    } catch (error) {
      console.error("Error connecting platform:", error);
      res.status(500).json({ message: "Failed to connect platform" });
    }
  });

  // Disconnect platform
  app.delete("/api/platforms/:platformName", async (req: any, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const platformName = req.params.platformName === "X.com" ? "X (Twitter)" : req.params.platformName;
      
      const platforms = await storage.getPlatformsByUserId(userId);
      const platform = platforms.find(p => p.name === platformName);
      
      if (!platform) {
        return res.status(404).json({ message: "Platform not found" });
      }
      
      await storage.deletePlatform(platform.id);
      res.json({ success: true, message: `Disconnected from ${platformName}` });
    } catch (error) {
      console.error("Error disconnecting platform:", error);
      res.status(500).json({ message: "Failed to disconnect platform" });
    }
  });


  // Get user's posts
  app.get("/api/posts", async (req: any, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const { status } = req.query;
      let posts;
      
      if (status && typeof status === "string") {
        posts = await storage.getPostsByStatus(userId, status);
      } else {
        posts = await storage.getPostsByUserId(userId);
      }
      
      res.json(posts);
    } catch (error) {
      res.status(500).json({ message: "Failed to get posts" });
    }
  });

  // Get pending posts for approval queue
  app.get("/api/posts/pending", async (req: any, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const posts = await storage.getPostsByStatus(userId, "pending");
      res.json(posts);
    } catch (error) {
      res.status(500).json({ message: "Failed to get pending posts" });
    }
  });

  // Get approved posts
  app.get("/api/posts/approved", async (req: any, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const posts = await storage.getPostsByStatus(userId, "approved");
      res.json(posts);
    } catch (error) {
      res.status(500).json({ message: "Failed to get approved posts" });
    }
  });

  // Get rejected posts
  app.get("/api/posts/rejected", async (req: any, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const posts = await storage.getPostsByStatus(userId, "rejected");
      res.json(posts);
    } catch (error) {
      res.status(500).json({ message: "Failed to get rejected posts" });
    }
  });

  // Get draft posts
  app.get("/api/posts/draft", async (req: any, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const posts = await storage.getPostsByStatus(userId, "draft");
      res.json(posts);
    } catch (error) {
      res.status(500).json({ message: "Failed to get draft posts" });
    }
  });

  // Get scheduled posts
  app.get("/api/posts/scheduled", async (req: any, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const posts = await storage.getPostsByStatus(userId, "scheduled");
      res.json(posts);
    } catch (error) {
      res.status(500).json({ message: "Failed to get scheduled posts" });
    }
  });

  // Get published posts
  app.get("/api/posts/published", async (req: any, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const posts = await storage.getPostsByStatus(userId, "published");
      res.json(posts);
    } catch (error) {
      res.status(500).json({ message: "Failed to get published posts" });
    }
  });

  // Get campaigns
  app.get("/api/campaigns", async (req: any, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const campaigns = await storage.getCampaignsByUserId(userId);
      res.json(campaigns);
    } catch (error) {
      res.status(500).json({ message: "Failed to get campaigns" });
    }
  });

  // Get campaign by ID
  app.get("/api/campaigns/:id", async (req: any, res) => {
    try {
      const campaign = await storage.getCampaign(req.params.id);
      if (!campaign) {
        return res.status(404).json({ message: "Campaign not found" });
      }
      res.json(campaign);
    } catch (error) {
      res.status(500).json({ message: "Failed to get campaign" });
    }
  });

  // Get posts for a campaign
  app.get("/api/campaigns/:id/posts", async (req: any, res) => {
    try {
      const posts = await storage.getPostsByCampaignId(req.params.id);
      res.json(posts);
    } catch (error) {
      res.status(500).json({ message: "Failed to get campaign posts" });
    }
  });

  // Create campaign
  app.post("/api/campaigns", async (req: any, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const campaignData = insertCampaignSchema.parse({
        ...req.body,
        userId,
        startDate: new Date(req.body.startDate),
        endDate: new Date(req.body.endDate || new Date(new Date(req.body.startDate).getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()),
      });
      
      const campaign = await storage.createCampaign(campaignData);
      res.status(201).json(campaign);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid campaign data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create campaign" });
    }
  });

  // Update campaign
  app.patch("/api/campaigns/:id", async (req: any, res) => {
    try {
      const campaign = await storage.updateCampaign(req.params.id, req.body);
      if (!campaign) {
        return res.status(404).json({ message: "Campaign not found" });
      }
      res.json(campaign);
    } catch (error) {
      res.status(500).json({ message: "Failed to update campaign" });
    }
  });

  // Generate campaign content
  app.post("/api/campaigns/:id/generate", async (req: any, res) => {
    try {
      const campaign = await storage.getCampaign(req.params.id);
      if (!campaign) {
        return res.status(404).json({ message: "Campaign not found" });
      }

      // Update campaign status to generating
      await storage.updateCampaign(campaign.id, { status: "generating", generationProgress: 0 });
      
      console.log(`🚀 Starting campaign generation: ${campaign.id} - Creating 14 posts (7 days × 2 posts/day)`);

      // Generate campaign posts asynchronously
      (async () => {
        try {
          const startDate = new Date(campaign.startDate);
          // ALWAYS create exactly 14 posts (7 days × 2 posts/day)
          const totalPosts = 14;
          
          console.log(`📝 Generating ${totalPosts} posts for campaign...`);
          
          const posts = [];
          for (let i = 0; i < totalPosts; i++) {
            const dayOffset = Math.floor(i / 2);
            const isAfternoonPost = i % 2 === 1;
            const scheduledDate = new Date(startDate);
            scheduledDate.setDate(scheduledDate.getDate() + dayOffset);
            scheduledDate.setHours(isAfternoonPost ? 15 : 9, 0, 0, 0);

            // Generate content for each post
            const topic = `${campaign.businessName} ${campaign.productName || 'product'} - ${campaign.callToAction}`;
            const contentSuggestions = await aiService.generateContent({
              topic,
              tone: campaign.brandTone,
              platform: campaign.platform,
              includeHashtags: true,
              includeEmojis: true,
              length: "medium",
            });

            // ALWAYS generate image for campaign posts
            console.log(`🎨 Generating image ${i + 1}/${totalPosts}...`);
            const imageResult = await aiService.generateImage({
              prompt: `${campaign.businessName} ${campaign.productName || 'product'} promotional content, ${campaign.visualStyle || 'modern'} style, day ${dayOffset + 1} of campaign`,
              style: campaign.visualStyle || 'modern',
              aspectRatio: campaign.platform === "Instagram" ? "1:1" : "16:9",
            });
            const imageUrl = imageResult.url;
            
            // Auto-save to content library
            if (imageUrl) {
              try {
                const savedItem = await storage.createContentLibraryItem({
                  userId: campaign.userId,
                  type: "image",
                  url: imageUrl,
                  thumbnail: imageUrl,
                  caption: contentSuggestions[0],
                  businessName: campaign.businessName,
                  productName: campaign.productName,
                  platform: campaign.platform,
                  tags: ["campaign", "ai_generated", `day_${dayOffset + 1}`],
                  metadata: {
                    campaignId: campaign.id,
                    postNumber: i + 1,
                    scheduledFor: scheduledDate,
                    generatedAt: new Date()
                  }
                });
                console.log(`✅ Saved campaign image ${i + 1} to content library:`, savedItem.id);
              } catch (err) {
                console.error(`❌ Failed to save campaign image ${i + 1} to library:`, err);
              }
            }

            posts.push({
              content: contentSuggestions[0],
              imageUrl,
              scheduledFor: scheduledDate,
            });

            // Update progress
            const progress = Math.round(((i + 1) / totalPosts) * 100);
            await storage.updateCampaign(campaign.id, { generationProgress: progress });
          }

          // Create posts in storage
          for (const post of posts) {
            await storage.createPost({
              userId: campaign.userId,
              campaignId: campaign.id,
              content: post.content,
              mediaUrls: post.imageUrl ? [post.imageUrl] : [],
              platforms: [campaign.platform],
              status: "pending",
              scheduledFor: post.scheduledFor,
              aiGenerated: true,
            });
          }

          // Update campaign status to review
          await storage.updateCampaign(campaign.id, { 
            status: "review",
            generationProgress: 100,
          });
          
          console.log(`✅ Campaign generation complete! Created ${posts.length} posts in approval queue`);
        } catch (error) {
          console.error("Failed to generate campaign:", error);
          await storage.updateCampaign(campaign.id, { 
            status: "draft",
            generationProgress: 0,
          });
        }
      })();

      res.json({ message: "Campaign generation started" });
    } catch (error) {
      res.status(500).json({ message: "Failed to generate campaign" });
    }
  });

  // Create new post
  app.post("/api/posts", async (req: any, res) => {
    try {
      // Get user ID from JWT, session, or auth
      const userId = req.user?.sub || req.session?.userId || req.user?.claims?.sub;
      
      // Require authentication for post creation
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }
      
      // Extract media URLs from the request
      const mediaUrls = [];
      if (req.body.imageUrl) mediaUrls.push(req.body.imageUrl);
      if (req.body.videoUrl) mediaUrls.push(req.body.videoUrl);
      
      // Support 'kind' parameter for test compatibility
      const kind = req.body.kind || 'text';
      
      const postData = insertPostSchema.parse({
        ...req.body,
        userId,
        mediaUrls: mediaUrls.length > 0 ? mediaUrls : undefined,
        status: req.body.status || 'draft',
        platforms: req.body.platforms || [],
      });
      
      // Create the post with enhanced metadata for library tracking
      const post = await storage.createPost({
        ...postData,
        metadata: {
          ...req.body.metadata,
          imageUrl: req.body.imageUrl,
          videoUrl: req.body.videoUrl,
          savedToLibrary: true,
          libraryCreatedAt: new Date().toISOString(),
        }
      });
      
      // Also save AI-generated content to suggestions for reuse
      if (req.body.aiGenerated && req.body.content) {
        await storage.createAiSuggestion({
          userId,
          prompt: req.body.metadata?.businessName || "Generated content",
          suggestions: [req.body.content],
          selected: req.body.content,
        });
      }
      
      res.status(201).json(post);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid post data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create post" });
    }
  });

  // Update post
  app.patch("/api/posts/:id", async (req: any, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;
      
      // Convert scheduledFor string to Date if present
      if (updates.scheduledFor && typeof updates.scheduledFor === 'string') {
        updates.scheduledFor = new Date(updates.scheduledFor);
      }
      
      const post = await storage.updatePost(id, updates);
      if (!post) {
        return res.status(404).json({ message: "Post not found" });
      }
      
      res.json(post);
    } catch (error) {
      res.status(500).json({ message: "Failed to update post" });
    }
  });

  // Delete post
  app.delete("/api/posts/:id", async (req: any, res) => {
    try {
      const { id } = req.params;
      const deleted = await storage.deletePost(id);
      
      if (!deleted) {
        return res.status(404).json({ message: "Post not found" });
      }
      
      res.json({ message: "Post deleted successfully" });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete post" });
    }
  });

  // Publish a post immediately
  app.post("/api/posts/:id/publish", async (req: any, res) => {
    try {
      const { id } = req.params;
      const post = await storage.getPost(id);
      
      if (!post) {
        return res.status(404).json({ message: "Post not found" });
      }
      
      // Update post status to published
      const updatedPost = await storage.updatePost(id, {
        status: "published",
        publishedAt: new Date()
      });
      
      // TODO: Actually publish to connected platforms
      // This would involve calling platform APIs
      
      res.json(updatedPost);
    } catch (error) {
      res.status(500).json({ message: "Failed to publish post" });
    }
  });

  // Generate AI content suggestions
  app.post("/api/ai/suggestions", async (req: any, res) => {
    try {
      const { prompt } = req.body;
      
      if (!prompt || typeof prompt !== "string") {
        return res.status(400).json({ message: "Prompt is required" });
      }

      // Generate AI suggestions using real AI
      const suggestions = await generateAISuggestions(prompt);
      
      const aiSuggestion = await storage.createAiSuggestion({
        userId: req.user.claims.sub,
        prompt,
        suggestions,
        selected: false,
      });

      res.json(aiSuggestion);
    } catch (error) {
      res.status(500).json({ message: "Failed to generate AI suggestions" });
    }
  });

  // Generate AI content with enhanced parameters
  app.post("/api/ai/generate", async (req: any, res) => {
    try {
      const {
        topic,
        tone,
        platform,
        platforms, // Array of selected platforms
        contentType,
        includeHashtags = true,
        includeEmojis = true,
        length = "medium",
        generateImage,
        imageStyle,
        generateVideo,
        videoStyle,
      } = req.body;

      let content = null;
      let imageUrl = null;
      let videoUrl = null;
      let hashtags = [];

      // Determine character limit based on selected platforms
      const selectedPlatforms = platforms || [platform] || ["Instagram"];
      const characterLimits: { [key: string]: number } = {
        "Instagram": 2200,
        "Facebook": 63206,
        "X (Twitter)": 280,
        "TikTok": 2200,
        "LinkedIn": 3000
      };
      
      // Get the minimum character limit from selected platforms
      const charLimit = Math.min(...selectedPlatforms.map((p: string) => 
        characterLimits[p] || 280
      ));

      // Generate text content
      if (contentType === "text" || !contentType) {
        const suggestions = await aiService.generateContent({
          topic: topic || "social media post",
          tone: tone || "professional",
          platform: platform || selectedPlatforms[0] || "Instagram",
          includeHashtags,
          includeEmojis,
          length,
          characterLimit: charLimit, // Pass character limit to AI
        });
        content = suggestions[0]; // Use the first suggestion
        
        // Ensure content doesn't exceed limit
        if (content && content.length > charLimit) {
          content = content.substring(0, charLimit - 3) + "...";
        }
        
        // Generate hashtags separately if needed
        if (includeHashtags && content) {
          hashtags = await aiService.generateHashtags(content, platform || "Instagram");
        }
      }

      // Generate image if requested
      if (generateImage || contentType === "image") {
        const imageResult = await aiService.generateImage({
          prompt: topic || "beautiful landscape",
          style: imageStyle,
          aspectRatio: platform === "Instagram" ? "1:1" : "16:9",
        });
        imageUrl = imageResult.url;
      }

      // Generate video if requested
      if (generateVideo || contentType === "video") {
        const videoResult = await aiService.generateVideo({
          prompt: topic || "engaging social media video",
          style: videoStyle,
          aspectRatio: platform === "TikTok" ? "9:16" : "16:9",
        });
        videoUrl = videoResult.url;
      }
      
      // Auto-save generated media to content library
      const userId = getUserId(req);
      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      
      if (imageUrl) {
        await storage.createContentLibraryItem({
          userId,
          name: `AI Generated Image - ${new Date().toLocaleDateString()}`,
          type: "image",
          url: imageUrl,
          size: 0, // Size can be calculated if needed
          metadata: {
            prompt: topic || "beautiful landscape",
            style: imageStyle,
            platform,
            aspectRatio: platform === "Instagram" ? "1:1" : "16:9",
            aiGenerated: true,
          },
        });
      }
      
      if (videoUrl) {
        await storage.createContentLibraryItem({
          userId,
          name: `AI Generated Video - ${new Date().toLocaleDateString()}`,
          type: "video",
          url: videoUrl,
          size: 0, // Size can be calculated if needed
          metadata: {
            prompt: topic || "engaging social media video",
            style: videoStyle,
            platform,
            aspectRatio: platform === "TikTok" ? "9:16" : "16:9",
            aiGenerated: true,
          },
        });
      }
      
      res.json({ 
        content, 
        imageUrl, 
        videoUrl,
        hashtags,
        suggestions: content ? [content] : [], 
      });
    } catch (error) {
      console.error('AI generation error:', error);
      res.status(500).json({ message: error instanceof Error ? error.message : "Failed to generate AI content" });
    }
  });

  // Get dashboard analytics - REAL DATA ONLY
  app.get("/api/analytics/dashboard", async (req: any, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      
      // Get REAL data from storage
      const [posts, platforms] = await Promise.all([
        storage.getPostsByUserId(userId),
        storage.getPlatformsByUserId(userId),
      ]);

      // Calculate REAL metrics from actual posts
      const publishedPosts = posts.filter(p => p.status === "published");
      const pendingPosts = posts.filter(p => p.status === "pending");
      const scheduledPosts = posts.filter(p => p.status === "scheduled");
      
      // Calculate total engagement from published posts only
      const totalEngagement = publishedPosts.reduce((sum, post) => {
        if (post.engagementData) {
          return sum + (post.engagementData.likes || 0) + 
                      (post.engagementData.comments || 0) + 
                      (post.engagementData.shares || 0);
        }
        return sum;
      }, 0);

      // Return REAL analytics data
      const dashboardData = {
        totalPosts: posts.length,
        totalEngagement: totalEngagement,
        pendingApproval: pendingPosts.length,
        scheduledPosts: scheduledPosts.length,
        metrics: {
          totalReach: publishedPosts.reduce((sum, p) => sum + (p.engagementData?.reach || 0), 0),
          engagement: totalEngagement,
          newFollowers: 0, // Real platform API would provide this
          clickRate: 0, // Real platform API would provide this
        },
        platformPerformance: [], // Empty until real platforms are connected
        engagementOverTime: [], // Empty until real data exists
        topPerformingPosts: publishedPosts
          .filter(p => p.engagementData)
          .sort((a, b) => {
            const aEngagement = (a.engagementData?.likes || 0) + (a.engagementData?.comments || 0);
            const bEngagement = (b.engagementData?.likes || 0) + (b.engagementData?.comments || 0);
            return bEngagement - aEngagement;
          })
          .slice(0, 5)
          .map(post => ({
            id: post.id,
            platform: post.platforms?.[0] || "Unknown",
            content: post.content.substring(0, 50) + "...",
            publishedAt: post.publishedAt?.toISOString() || "Unknown",
            engagement: post.engagementData || { likes: 0, comments: 0, shares: 0 },
            engagementRate: 0,
          })),
      };

      res.json(dashboardData);
    } catch (error) {
      res.status(500).json({ message: "Failed to get analytics" });
    }
  });

  // Notification endpoints
  app.get("/api/notifications", async (req: any, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const notifications = await storage.getNotificationsByUserId(userId);
      res.json(notifications);
    } catch (error) {
      console.error("Error getting notifications:", error);
      res.status(500).json({ message: "Failed to get notifications" });
    }
  });

  app.get("/api/notifications/unread-count", async (req: any, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const count = await storage.getUnreadNotificationCount(userId);
      res.json({ count });
    } catch (error) {
      console.error("Error getting unread count:", error);
      res.status(500).json({ message: "Failed to get unread count" });
    }
  });

  app.patch("/api/notifications/:id/read", async (req: any, res) => {
    try {
      const notification = await storage.markNotificationAsRead(req.params.id);
      if (!notification) {
        return res.status(404).json({ message: "Notification not found" });
      }
      res.json(notification);
    } catch (error) {
      console.error("Error marking notification as read:", error);
      res.status(500).json({ message: "Failed to mark notification as read" });
    }
  });

  app.patch("/api/notifications/read-all", async (req: any, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      await storage.markAllNotificationsAsRead(userId);
      res.json({ message: "All notifications marked as read" });
    } catch (error) {
      console.error("Error marking all as read:", error);
      res.status(500).json({ message: "Failed to mark all as read" });
    }
  });

  // Admin notification endpoint - send notification to specific user or all users
  app.post("/api/notifications", async (req: any, res) => {
    try {
      const adminUserId = getUserId(req);
      if (!adminUserId) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const user = await storage.getUser(adminUserId);
      
      // Check if user is admin
      if (user?.role !== "admin") {
        return res.status(403).json({ message: "Only admins can send notifications" });
      }

      const { userId, title, message, type = "admin_message", actionUrl } = req.body;

      if (userId) {
        // Send to specific user
        const notification = await storage.createNotification({
          userId,
          fromUserId: adminUserId,
          type,
          title,
          message,
          actionUrl,
          read: false,
        });
        res.json(notification);
      } else {
        // Send to all users (global notification)
        await storage.createGlobalNotification({
          fromUserId: adminUserId,
          type,
          title,
          message,
          actionUrl,
          read: false,
        });
        res.json({ message: "Global notification sent to all users" });
      }
    } catch (error) {
      console.error("Error creating notification:", error);
      res.status(500).json({ message: "Failed to create notification" });
    }
  });

  // Content Library endpoints
  app.get("/api/content-library", async (req: any, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const contentItems = await storage.getContentLibraryByUserId(userId);
      res.json(contentItems);
    } catch (error) {
      console.error("Error getting content library:", error);
      res.status(500).json({ message: "Failed to get content library" });
    }
  });

  app.post("/api/content-library", async (req: any, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const contentItem = await storage.createContentLibraryItem({
        userId,
        ...req.body,
      });
      res.json(contentItem);
    } catch (error) {
      console.error("Error creating content library item:", error);
      res.status(500).json({ message: "Failed to save to content library" });
    }
  });

  // Missing approval queue endpoint
  app.post("/api/posts/approval-queue", async (req: any, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const { type, url, businessName, platforms, caption } = req.body;
      
      // Save media to content library first
      if (url && (type === 'image' || type === 'video')) {
        await storage.createContentLibraryItem({
          userId,
          type,
          url,
          thumbnail: type === 'image' ? url : null,
          caption: caption || null,
          businessName: businessName || null,
          platform: platforms?.[0] || null,
          tags: [`${type}_generated`],
          metadata: {
            generatedFromApprovalQueue: true,
            platforms,
            createdAt: new Date()
          }
        });
      }
      
      // Create post in pending status for approval
      const post = await storage.createPost({
        userId,
        content: caption || `${type} content for ${businessName || 'business'}`,
        platforms: platforms || ['Instagram'],
        status: 'pending',
        mediaUrls: url ? [url] : [],
        aiGenerated: true,
        metadata: {
          type,
          businessName,
          sentToApprovalQueue: true,
          originalRequest: req.body
        }
      });
      
      res.json({ success: true, post, message: "Content sent to approval queue" });
    } catch (error) {
      console.error("Error sending to approval queue:", error);
      res.status(500).json({ message: "Failed to send to approval queue" });
    }
  });

  app.delete("/api/content-library/:id", async (req: any, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const success = await storage.deleteContentLibraryItem(req.params.id, userId);
      if (!success) {
        return res.status(404).json({ message: "Content not found or unauthorized" });
      }
      res.json({ message: "Content deleted successfully" });
    } catch (error) {
      console.error("Error deleting content:", error);
      res.status(500).json({ message: "Failed to delete content" });
    }
  });

  app.patch("/api/content-library/:id", async (req: any, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const contentItem = await storage.updateContentLibraryItem(req.params.id, userId, req.body);
      if (!contentItem) {
        return res.status(404).json({ message: "Content not found or unauthorized" });
      }
      res.json(contentItem);
    } catch (error) {
      console.error("Error updating content:", error);
      res.status(500).json({ message: "Failed to update content" });
    }
  });

  // Campaign endpoints
  app.get("/api/campaigns", async (req: any, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const campaigns = await storage.getCampaignsByUserId(userId);
      res.json(campaigns);
    } catch (error) {
      res.status(500).json({ message: "Failed to get campaigns" });
    }
  });

  app.get("/api/campaigns/approval-queue", async (req: any, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const campaigns = await storage.getCampaignsByStatus(userId, "pending_approval");
      res.json(campaigns);
    } catch (error) {
      res.status(500).json({ message: "Failed to get approval queue" });
    }
  });

  app.post("/api/campaigns", async (req: any, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const user = await storage.getUser(userId);
      
      // Check if user is paid (admins bypass this restriction)
      if (!user?.isPaid && user?.role !== "admin") {
        return res.status(403).json({ message: "Campaign creation requires a paid account" });
      }
      
      const campaignData = {
        ...req.body,
        userId,
        status: "generating",
        totalPosts: 14,
        generationProgress: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      
      const campaign = await storage.createCampaign(campaignData);
      res.json(campaign);
    } catch (error) {
      res.status(500).json({ message: "Failed to create campaign" });
    }
  });

  app.post("/api/campaigns/:id/generate-all", async (req: any, res) => {
    try {
      const { id } = req.params;
      const { posts, contentType, businessName, productName, targetAudience, brandTone, keyMessages, callToAction } = req.body;
      
      const generatedPosts = [];
      
      for (const post of posts) {
        // Generate unique content for each post
        const prompt = `Create a ${brandTone} social media post for ${businessName} ${productName || ''} 
          targeting ${targetAudience}. Key messages: ${keyMessages}. 
          Call to action: ${callToAction}. 
          This is post ${post.slot} for day ${post.day} of a 7-day campaign.`;
        
        // Generate text content
        const contentResult = await aiService.generateContent({
          topic: prompt,
          tone: brandTone,
          platform: post.platforms[0],
          includeHashtags: true,
          includeEmojis: true,
          length: "medium",
        });
        
        let imageUrl = null;
        if (contentType === "image") {
          // Generate image for each post
          const imageResult = await aiService.generateImage({
            prompt: `${businessName} ${productName || ''} promotional image, ${brandTone} style`,
            style: "modern",
            aspectRatio: post.platforms[0] === "Instagram" ? "1:1" : "16:9",
          });
          imageUrl = imageResult.url;
        }
        
        generatedPosts.push({
          ...post,
          content: contentResult[0],
          imageUrl,
        });
        
        // Update campaign progress
        const progress = Math.round((generatedPosts.length / 14) * 100);
        await storage.updateCampaign(id, { generationProgress: progress });
      }
      
      // Save posts to storage
      for (const post of generatedPosts) {
        await storage.createPost({
          userId: req.user.claims.sub,
          campaignId: id,
          content: post.content,
          platforms: post.platforms,
          status: "draft",
          scheduledFor: post.scheduledTime,
          mediaUrls: post.imageUrl ? [post.imageUrl] : [],
          aiGenerated: true,
          metadata: {
            day: post.day,
            slot: post.slot,
            campaignPost: true,
          }
        });
      }
      
      await storage.updateCampaign(id, { 
        status: "review",
        generationProgress: 100 
      });
      
      res.json(generatedPosts);
    } catch (error) {
      console.error("Campaign generation error:", error);
      res.status(500).json({ message: "Failed to generate campaign posts" });
    }
  });

  app.patch("/api/campaigns/:campaignId/posts/:postId", async (req: any, res) => {
    try {
      const { postId } = req.params;
      const { status } = req.body;
      
      const post = await storage.updatePost(postId, { status });
      res.json(post);
    } catch (error) {
      res.status(500).json({ message: "Failed to update post" });
    }
  });

  app.delete("/api/campaigns/:campaignId/posts/:postId", async (req: any, res) => {
    try {
      const { postId } = req.params;
      await storage.deletePost(postId);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete post" });
    }
  });

  app.post("/api/campaigns/:id/approve", async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = getUserId(req);
      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      
      // Get all campaign posts
      const posts = await storage.getPostsByCampaignId(id);
      
      // Check if there are approved posts
      const approvedPosts = posts.filter(p => p.status === "approved");
      if (approvedPosts.length === 0) {
        return res.status(400).json({ message: "No approved posts in campaign" });
      }
      
      // Deduct credits (14 credits for campaign)
      const user = await storage.getUser(userId);
      if (user && user.credits !== undefined && user.credits < 14) {
        return res.status(403).json({ message: "Insufficient credits" });
      }
      
      await storage.updateUser(userId, { 
        credits: (user?.credits || 100) - 14 
      });
      
      // Update campaign status to active
      const campaign = await storage.updateCampaign(id, { 
        status: "active",
        startDate: new Date(),
      });
      
      // Schedule all approved posts
      for (const post of approvedPosts) {
        await storage.updatePost(post.id, { 
          status: "scheduled" 
        });
      }
      
      res.json(campaign);
    } catch (error) {
      res.status(500).json({ message: "Failed to approve campaign" });
    }
  });

  app.patch("/api/campaigns/:id", async (req: any, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;
      
      const campaign = await storage.updateCampaign(id, updates);
      res.json(campaign);
    } catch (error) {
      res.status(500).json({ message: "Failed to update campaign" });
    }
  });

  // X.com OAuth endpoints
  app.get("/api/platforms/x/connect", async (req: any, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      } // Works in demo mode
      const { url, state, codeVerifier } = generateXAuthUrl(userId);
      
      // Code verifier is now stored server-side for security
      console.log('Generated X.com OAuth URL for user:', userId);
      res.json({
        authUrl: url,
        state
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to generate auth URL" });
    }
  });

  // OAuth callback endpoint
  app.get("/api/auth/x/callback", async (req: any, res) => {
    try {
      const { code, state } = req.query;

      if (!code || !state) {
        return res.status(400).json({ message: "Missing required parameters" });
      }

      console.log('X.com OAuth callback received:', { code: '***', state });

      const result = await handleXOAuthCallback(
        code as string,
        state as string
      );
      
      if (result.success) {
        // Redirect to success page
        res.redirect("/platforms?connected=x");
      } else {
        res.redirect("/platforms?error=" + encodeURIComponent(result.error || "Connection failed"));
      }
    } catch (error) {
      res.redirect("/platforms?error=Connection%20failed");
    }
  });

  // Post to X endpoint
  app.post("/api/platforms/x/post", async (req: any, res) => {
    try {
      const { content, platformId } = req.body;
      
      // Get platform from storage
      const platform = await storage.getPlatformById(platformId);
      if (!platform || !platform.accessToken) {
        return res.status(400).json({ message: "Platform not connected" });
      }
      
      // Post to X
      const result = await postToXWithOAuth(platform.accessToken, content);
      
      if (result.success) {
        res.json({ 
          success: true, 
          tweetId: result.tweetId,
          url: `https://x.com/i/web/status/${result.tweetId}`
        });
      } else {
        res.status(500).json({ message: result.error });
      }
    } catch (error) {
      res.status(500).json({ message: "Failed to post to X" });
    }
  });

  // Notification endpoints
  app.get("/api/notifications/popup", async (req: any, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      
      const popupMessages = await storage.getUnreadPopupMessages(userId);
      res.json(popupMessages);
    } catch (error) {
      res.status(500).json({ message: "Failed to get popup messages" });
    }
  });

  app.post("/api/notifications/:id/delivered", async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = getUserId(req);
      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      
      await storage.markMessageDelivered(id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to mark message delivered" });
    }
  });

  // Trial status endpoint
  app.get("/api/user/trial-status", async (req: any, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      const now = new Date();
      const trialEndDate = user.trialEndDate || user.trialEndsAt;
      
      let isTrialUser = false;
      let daysRemaining = 0;
      let hasExpired = false;
      
      if (user.tier === 'free' && !user.isPaid && trialEndDate) {
        isTrialUser = true;
        const endDate = new Date(trialEndDate);
        const timeDiff = endDate.getTime() - now.getTime();
        daysRemaining = Math.max(0, Math.ceil(timeDiff / (1000 * 60 * 60 * 24)));
        hasExpired = daysRemaining === 0 && timeDiff < 0;
      }
      
      res.json({
        isTrialUser,
        trialEndDate,
        daysRemaining,
        hasExpired,
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to get trial status" });
    }
  });
  
  // Note: Admin endpoints are handled in adminRoutes.ts
  // This duplicate endpoint should be removed to avoid conflicts

  const httpServer = createServer(app);
  return httpServer;
}

// AI suggestion generator using real AI
async function generateAISuggestions(prompt: string): Promise<string[]> {
  try {
    const suggestions = await aiService.generateContent({
      topic: prompt,
      tone: "engaging",
      platform: "Instagram",
      includeHashtags: true,
      includeEmojis: true,
      length: "medium",
    });
    return suggestions;
  } catch (error) {
    console.error("AI suggestion generation failed:", error);
    // Fallback suggestions
    return [
      "✨ Share your story with the world! #SocialMedia #ContentCreation",
      "🚀 Elevate your brand with engaging content! #Marketing #Business",
      "💡 Connect with your audience authentically! #Engagement #Community",
    ];
  }
}
