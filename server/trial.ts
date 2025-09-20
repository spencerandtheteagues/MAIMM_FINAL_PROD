import { Router } from "express";
import { TRIAL, TrialVariant } from "../config/trial";
import { storage } from "./storage";
import { signJwt } from "./auth/jwt";
import { generateUniqueUsername } from "./google-auth";

export const trialRouter = Router();

function getUserId(req: any): string | null {
  if (req.user?.sub) return req.user.sub;
  if (req.session?.userId) return req.session.userId;
  if (req.user?.id) return req.user.id;
  if (req.user?.claims?.sub) return req.user.claims.sub;
  return null;
}

function requireAuth(req:any,res:any,next:any){
  const id = getUserId(req);
  if (id) {
    req.user = { id };
    return next();
  }
  return res.status(401).json({ error:"AUTH_REQUIRED" });
}

trialRouter.get("/status", requireAuth, async (req:any,res:any)=>{
  const u = await storage.getUser(req.user.id);
  res.json({
    variant: u?.trialVariant,
    startedAt: u?.trialStartedAt,
    endsAt: u?.trialEndsAt,
    imagesRemaining: u?.trialImagesRemaining ?? 0,
    videosRemaining: u?.trialVideosRemaining ?? 0,
    emailVerified: !!u?.emailVerified,
    cardOnFile: !!u?.cardOnFile
  });
});

trialRouter.post("/select", async (req:any,res:any)=>{
  const planId = (req.body?.planId as string) || "";
  const variant = (req.body?.variant as string) || (planId === "lite" ? "nocard7" : String(TRIAL.variant));
  if(!TRIAL.variants[String(variant) as TrialVariant]) return res.status(400).json({ error:"BAD_VARIANT" });
  const v = TRIAL.variants[String(variant) as TrialVariant];
  const now = new Date();
  const end = new Date(now.getTime() + v.days*24*3600*1000);

  const authUserId = getUserId(req);
  if (authUserId) {
    await storage.updateUser(authUserId, {
      trialVariant: variant,
      trialStartedAt: now,
      trialEndsAt: end,
      trialImagesRemaining: v.images,
      trialVideosRemaining: v.videos,
      needsTrialSelection: false,
      tier: "free",
      credits: v.credits || 50,
      subscriptionStatus: "trial",
      trialPlan: variant,
    });
    return res.json({ ok:true, variant, endsAt: end.toISOString(), redirectPath: "/" });
  }

  const pendingRaw = req.cookies?.pending_oauth;
  if (!pendingRaw) {
    return res.status(401).json({ error: "AUTH_REQUIRED" });
  }

  try {
    const pending = JSON.parse(pendingRaw || "{}") || {};
    if (!pending?.email) {
      return res.status(400).json({ error: "INVALID_PENDING" });
    }

    const uniqueUsername = await generateUniqueUsername(pending.baseUsername || pending.email?.split("@")[0] || "");
    const newUser = await storage.createUser({
      email: pending.email,
      username: uniqueUsername,
      firstName: pending.firstName || null,
      lastName: pending.lastName || null,
      fullName: pending.fullName || null,
      googleAvatar: pending.googleAvatar || null,
      role: "user",
      tier: "free",
      credits: v.credits || 50,
      accountStatus: "active",
      subscriptionStatus: "trial",
      needsTrialSelection: false,
      emailVerified: true,
      trialPlan: variant,
      trialStartDate: now,
      trialEndDate: end,
      trialVariant: variant,
      trialStartedAt: now,
      trialEndsAt: end,
      trialImagesRemaining: v.images,
      trialVideosRemaining: v.videos,
    });

    const token = signJwt({
      sub: String(newUser.id),
      email: newUser.email,
      name: newUser.fullName,
      picture: newUser.googleAvatar,
      roles: [newUser.role],
    });

    res.clearCookie("pending_oauth");
    res.cookie("mam_jwt", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return res.json({ ok:true, variant, endsAt: end.toISOString(), redirectPath: "/" });
  } catch (_e) {
    return res.status(400).json({ error: "INVALID_PENDING" });
  }
});
