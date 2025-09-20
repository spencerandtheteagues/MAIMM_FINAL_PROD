import { Request, Response, NextFunction } from "express";
import { storage } from "../storage";

// Endpoints that are allowed even when access is restricted
const ALLOWED_ENDPOINTS = [
  '/api/user',
  '/api/auth',
  '/api/billing',
  '/api/subscription',
  '/api/credits',
  '/api/stripe',
  '/api/verification',
  '/api/trial',
  '/health',
  '/metrics',
  '/api/notifications'
];

// AI endpoints that require credits or subscription
const AI_ENDPOINTS = [
  '/api/ai',
  '/api/campaigns/generate',
  '/api/content/generate'
];

// Credit costs for different operations
const CREDIT_COSTS = {
  text: 1,
  image: 5,
  video: 20,
  campaign: 14 // For 14-post campaigns
};

/**
 * Enhanced middleware to enforce platform access restrictions
 * Handles trial expiration, subscription failures, and credit requirements
 */
export async function enforcePlatformAccess(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    if (!req.path.startsWith('/api')) {
      return next();
    }

    // Skip enforcement for allowed endpoints
    const isAllowedEndpoint = ALLOWED_ENDPOINTS.some(endpoint => 
      req.path.startsWith(endpoint)
    );
    
    if (isAllowedEndpoint) {
      return next();
    }

    // Get user ID from session or request
    const userId = getUserId(req);
    
    if (!userId) {
      // No user, let auth middleware handle it
      return next();
    }

    // Get user from storage
    const user = await storage.getUser(userId);
    
    if (!user) {
      return res.status(401).json({ 
        message: "User not found",
        restrictionType: "auth_required"
      });
    }

    // Check access restrictions in order of priority
    const accessCheck = await checkUserAccess(user, req.path);
    
    if (!accessCheck.allowed) {
      console.log(`Blocking access for user ${userId} - ${accessCheck.reason}`);
      return res.status(403).json(accessCheck.response);
    }

    // Store user on request for downstream handlers
    (req as any).user = user;
    next();
  } catch (error) {
    console.error("Error in platform access enforcement:", error);
    // On error, allow request to continue (fail open for security)
    next();
  }
}

/**
 * Helper function to get user ID from request
 */
function getUserId(req: any): string | null {
  if (req.session?.userId) return req.session.userId;
  if (req.user?.id) return req.user.id;
  if (req.user?.claims?.sub) return req.user.claims.sub;
  return null;
}

/**
 * Comprehensive access checking function
 */
async function checkUserAccess(user: any, requestPath: string) {
  const now = new Date();

  // 0. Admin users bypass all restrictions
  if (user.role === 'admin') {
    return { allowed: true };
  }

  // 1. Check trial expiration for trial users
  const trialTiers = ['free_trial', 'nocard7', 'card7', 'free'];
  const isOnTrial = trialTiers.includes(user.tier);
  
  if (isOnTrial && user.trialEndsAt) {
    const trialEndsAt = new Date(user.trialEndsAt);
    const isTrialExpired = now > trialEndsAt;
    
    if (isTrialExpired) {
      return {
        allowed: false,
        reason: "trial_expired",
        response: {
          message: "Your free trial has ended! 🚀",
          restrictionType: "trial_expired",
          trialEndsAt: user.trialEndsAt,
          currentCredits: user.credits || 0,
          userTier: user.tier,
          friendlyMessage: "Ready to unlock the full power of AI-driven social media? Choose a plan that works for you!",
          ctaOptions: [
            { type: "upgrade", text: "View Plans", action: "/pricing" },
            { type: "credits", text: "Buy Credits Instead", action: "/billing" }
          ]
        }
      };
    }
  }
  
  // 2. Check subscription payment failures
  if (user.subscriptionStatus === 'cancelled' || user.subscriptionStatus === 'expired') {
    const isSubscriptionTier = ['starter', 'professional', 'business'].includes(user.tier);
    
    if (isSubscriptionTier) {
      return {
        allowed: false,
        reason: "subscription_failed",
        response: {
          message: "Payment method needs attention 💳",
          restrictionType: "payment_failed",
          subscriptionStatus: user.subscriptionStatus,
          currentCredits: user.credits || 0,
          userTier: user.tier,
          friendlyMessage: "We couldn't process your payment. Update your billing info to keep creating amazing content!",
          ctaOptions: [
            { type: "billing", text: "Update Payment", action: "/billing" },
            { type: "credits", text: "Buy Credits Instead", action: "/billing" },
            { type: "support", text: "Contact Support", action: "/help" }
          ]
        }
      };
    }
  }
  
  // 3. Check credit requirements for AI operations
  const isAIEndpoint = AI_ENDPOINTS.some(endpoint => requestPath.startsWith(endpoint));
  
  if (isAIEndpoint) {
    const credits = user.credits || 0;
    
    // Check if user has any credits for AI operations
    if (credits < CREDIT_COSTS.text) {
      return {
        allowed: false,
        reason: "insufficient_credits",
        response: {
          message: "You're out of credits! ⚡",
          restrictionType: "insufficient_credits",
          currentCredits: credits,
          requiredCredits: CREDIT_COSTS.text,
          userTier: user.tier,
          friendlyMessage: "Credits power all our AI magic! Get more to keep creating amazing content.",
          ctaOptions: [
            { type: "credits", text: "Buy Credits", action: "/billing" },
            { type: "upgrade", text: "Upgrade Plan", action: "/pricing" }
          ]
        }
      };
    }
    
    // Warn if credits are getting low
    if (credits < 10) {
      // Allow access but add warning to response headers
      return {
        allowed: true,
        warning: {
          type: "low_credits",
          message: "Running low on credits!",
          currentCredits: credits,
          recommendedAction: "Consider buying more credits or upgrading your plan"
        }
      };
    }
  }
  
  // 4. All checks passed
  return { allowed: true };
}

/**
 * Legacy function name for backward compatibility
 */
export const enforceTrialExpiration = enforcePlatformAccess;

/**
 * Helper function to check if a user's trial has expired
 */
export async function isUserTrialExpired(userId: string): Promise<boolean> {
  try {
    const user = await storage.getUser(userId);
    
    if (!user) {
      return false;
    }

    const trialTiers = ['free_trial', 'nocard7', 'card7', 'free'];
    const isOnTrial = trialTiers.includes(user.tier);
    
    if (!isOnTrial) {
      return false;
    }

    const now = new Date();
    const trialEndsAt = user.trialEndsAt;
    
    if (!trialEndsAt) {
      return false;
    }

    return now > new Date(trialEndsAt);
  } catch (error) {
    console.error("Error checking trial expiration:", error);
    return false;
  }
}

/**
 * Helper function to check if user has sufficient credits
 */
export async function hasUserSufficientCredits(userId: string, operation: string): Promise<boolean> {
  try {
    const user = await storage.getUser(userId);
    if (!user) return false;
    
    const requiredCredits = CREDIT_COSTS[operation as keyof typeof CREDIT_COSTS] || 1;
    return (user.credits || 0) >= requiredCredits;
  } catch (error) {
    console.error("Error checking credit sufficiency:", error);
    return false;
  }
}
