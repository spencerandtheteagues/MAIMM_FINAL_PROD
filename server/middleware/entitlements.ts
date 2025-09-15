import { Request, Response, NextFunction } from "express";
import { storage } from "../storage";
import { hasEntitlement, PlanKey } from "../../config/plan-features";

function getUser(req: Request): any {
  const anyReq = req as any;
  return anyReq.user || null;
}

export function requireCredits(amount: number, featureKey?: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const user = getUser(req);
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    if (user.isAdmin || user.creditsUnlimited) return next();

    try {
      const full = await storage.getUser(user.id);
      const balance = (full?.credits ?? 0) as number;
      if (balance < amount) return res.status(402).json({ message: "Insufficient credits", featureKey, required: amount, balance });
      if ((storage as any).addCreditTransaction) {
        await (storage as any).addCreditTransaction({
          userId: user.id,
          amount: -amount,
          type: "debit",
          description: featureKey || "usage",
        });
      } else {
        await storage.updateUser(user.id, { credits: balance - amount } as any);
      }
      next();
    } catch (e: any) {
      res.status(500).json({ message: "Credit check failed: " + e.message });
    }
  };
}

export function requireEntitlement(feature: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = getUser(req);
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    if (user.isAdmin || user.creditsUnlimited) return next();
    const plan = (user.tier || "starter") as PlanKey;
    if (!hasEntitlement(plan, feature as any)) return res.status(403).json({ message: "Feature not included in plan", feature, plan });
    next();
  };
}

export function enforceTrialGating() {
  return async (req: Request, res: Response, next: NextFunction) => {
    const user = getUser(req);
    if (!user) return res.status(401).json({ message: "Not authenticated" });

    const now = new Date();
    const status = user.subscriptionStatus;
    const trialEndsAt = user.trialEndsAt ? new Date(user.trialEndsAt) : null;

    if (trialEndsAt && now > trialEndsAt && (!user.subscriptionPlan || user.subscriptionPlan === "none")) {
      const allowed = req.path.startsWith("/api/billing") || req.path.startsWith("/api/subscription") || req.path.startsWith("/api/profile");
      if (!allowed) return res.status(402).json({ message: "Trial ended. Please subscribe to continue." });
    }

    if (status === "trial_lite") {
      const blockedLite = req.path.includes("/campaign") || req.path.includes("/video");
      if (blockedLite) return res.status(403).json({ message: "This feature is unavailable during the Lite trial." });
    }

    next();
  };
}
