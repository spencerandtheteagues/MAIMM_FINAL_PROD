import { Router, Request, Response } from "express";
import { storage } from "./storage";
import { requireAuth } from "./auth";

const router = Router();

function getUserId(req: Request) {
  const anyReq = req as any;
  return anyReq.user?.id || anyReq.session?.userId || anyReq.auth?.userId || null;
}

router.post("/lite", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ message: "Not authenticated" });

    const user = await storage.getUser(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    const now = new Date();
    const end = new Date(now.getTime() + 7 * 24 * 3600 * 1000);

    await storage.updateUser(user.id, {
      subscriptionStatus: "trial_lite",
      trialVariant: "lite7",
      trialStartedAt: now,
      trialEndsAt: end,
      needsTrialSelection: false,
    } as any);

    if ((storage as any).addCreditTransaction) {
      await (storage as any).addCreditTransaction({
        userId: user.id,
        amount: 50,
        type: "trial_grant",
        description: "Lite Trial credits (7d, no card)",
      });
    }

    res.json({ ok: true, trialEndsAt: end.toISOString() });
  } catch (err: any) {
    res.status(500).json({ message: "Failed to start Lite trial: " + err.message });
  }
});

export default router;
