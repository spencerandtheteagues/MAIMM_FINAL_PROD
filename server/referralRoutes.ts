import { Router, Request, Response } from "express";
import { storage } from "./storage";
import { requireAuth } from "./auth";
import { z } from "zod";

const router = Router();

// Helper function to get user ID from request
function getUserId(req: any): string | null {
  return req.session?.userId || req.user?.claims?.sub || req.user?.id || null;
}

// Get user's referral information
router.get("/me", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const user = await storage.getUser(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Generate referral code if user doesn't have one
    let userWithCode = user;
    if (!user.referralCode) {
      userWithCode = await storage.generateReferralCode(userId) || user;
    }

    // Get referral stats
    const stats = await storage.getReferralStats(userId);

    // Get recent referrals
    const recentReferrals = await storage.getReferralsByReferrer(userId);

    const baseUrl = process.env.APP_URL || process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
    const referralLink = `${baseUrl}/register?ref=${userWithCode.referralCode}`;

    res.json({
      referralCode: userWithCode.referralCode,
      referralLink,
      stats,
      recentReferrals: recentReferrals.slice(0, 10), // Limit to 10 recent referrals
    });
  } catch (error: any) {
    console.error("Error fetching referral data:", error);
    res.status(500).json({ message: "Failed to fetch referral data" });
  }
});

// Generate new referral code (if user doesn't have one)
router.post("/generate-code", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const user = await storage.generateReferralCode(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const baseUrl = process.env.APP_URL || process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
    const referralLink = `${baseUrl}/register?ref=${user.referralCode}`;

    res.json({
      referralCode: user.referralCode,
      referralLink,
    });
  } catch (error: any) {
    console.error("Error generating referral code:", error);
    res.status(500).json({ message: "Failed to generate referral code" });
  }
});

// Validate referral code (used during registration)
const validateReferralSchema = z.object({
  referralCode: z.string().min(1, "Referral code is required"),
});

router.post("/validate", async (req: Request, res: Response) => {
  try {
    const { referralCode } = validateReferralSchema.parse(req.body);

    const referrer = await storage.getUserByReferralCode(referralCode);
    if (!referrer) {
      return res.status(404).json({ 
        message: "Invalid referral code",
        valid: false 
      });
    }

    res.json({
      valid: true,
      referrerName: referrer.fullName || referrer.username,
      referrerBusinessName: referrer.businessName,
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        message: "Invalid request", 
        errors: error.errors 
      });
    }
    console.error("Error validating referral code:", error);
    res.status(500).json({ message: "Failed to validate referral code" });
  }
});

// Process referral (called after successful registration)
const processReferralSchema = z.object({
  referralCode: z.string().min(1, "Referral code is required"),
  newUserId: z.string().min(1, "New user ID is required"),
});

router.post("/process", async (req: Request, res: Response) => {
  try {
    const { referralCode, newUserId } = processReferralSchema.parse(req.body);

    // Find referrer
    const referrer = await storage.getUserByReferralCode(referralCode);
    if (!referrer) {
      return res.status(404).json({ message: "Invalid referral code" });
    }

    // Prevent self-referrals
    if (referrer.id === newUserId) {
      return res.status(400).json({ message: "Cannot refer yourself" });
    }

    // Check if this user was already referred
    const existingReferral = await storage.getReferralsByUser(newUserId);
    if (existingReferral.length > 0) {
      return res.status(400).json({ message: "User already has a referrer" });
    }

    // Create referral record
    const referral = await storage.createReferral({
      referrerId: referrer.id,
      referredUserId: newUserId,
      referralCode,
      creditsEarned: 0,
      status: "pending",
    });

    // Award credits to referrer (100 credits)
    const referrerCredits = 100;
    await storage.updateUser(referrer.id, {
      credits: (referrer.credits || 0) + referrerCredits,
    });

    // Award welcome credits to new user (25 credits)
    const welcomeCredits = 25;
    await storage.updateUser(newUserId, {
      credits: welcomeCredits,
      referredBy: referralCode,
    });

    // Complete the referral
    await storage.completeReferral(referral.id, referrerCredits);

    // Create credit transactions for tracking
    await storage.createCreditTransaction({
      userId: referrer.id,
      amount: referrerCredits,
      type: "referral_bonus",
      description: "Referral bonus for successful referral",
    });

    await storage.createCreditTransaction({
      userId: newUserId,
      amount: welcomeCredits,
      type: "referral_welcome",
      description: "Welcome credits from referral signup",
    });

    res.json({
      message: "Referral processed successfully",
      referrerCreditsEarned: referrerCredits,
      welcomeCredits,
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        message: "Invalid request", 
        errors: error.errors 
      });
    }
    console.error("Error processing referral:", error);
    res.status(500).json({ message: "Failed to process referral" });
  }
});

// Get referral stats for admin/analytics
router.get("/stats", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const stats = await storage.getReferralStats(userId);
    res.json(stats);
  } catch (error: any) {
    console.error("Error fetching referral stats:", error);
    res.status(500).json({ message: "Failed to fetch referral stats" });
  }
});

export default router;
