import { Router, Request, Response } from "express";

const router = Router();

function needsKeysResponse(res: Response) {
  return res.status(501).json({ needsKeys: true });
}

function hasKey(name: string) {
  return !!process.env[name];
}

router.get("/facebook/start", (_req, res) => {
  if (!hasKey("FACEBOOK_APP_ID") || !hasKey("FACEBOOK_APP_SECRET")) return needsKeysResponse(res);
  return res.status(200).json({ message: "Pending partner approval" });
});

router.get("/facebook/callback", (_req, res) => {
  return res.status(200).json({ message: "Pending partner approval" });
});

router.get("/x/start", (_req, res) => {
  if (!hasKey("X_CLIENT_ID") || !hasKey("X_CLIENT_SECRET")) return needsKeysResponse(res);
  return res.status(200).json({ message: "Pending partner approval" });
});

router.get("/x/callback", (_req, res) => {
  return res.status(200).json({ message: "Pending partner approval" });
});

router.get("/linkedin/start", (_req, res) => {
  if (!hasKey("LINKEDIN_CLIENT_ID") || !hasKey("LINKEDIN_CLIENT_SECRET")) return needsKeysResponse(res);
  return res.status(200).json({ message: "Pending partner approval" });
});

router.get("/linkedin/callback", (_req, res) => {
  return res.status(200).json({ message: "Pending partner approval" });
});

router.get("/tiktok/start", (_req, res) => {
  if (!hasKey("TIKTOK_CLIENT_ID") || !hasKey("TIKTOK_CLIENT_SECRET")) return needsKeysResponse(res);
  return res.status(200).json({ message: "Pending partner approval" });
});

router.get("/tiktok/callback", (_req, res) => {
  return res.status(200).json({ message: "Pending partner approval" });
});

router.post("/disconnect/:platform", (_req, res) => {
  return res.json({ ok: true });
});

export default router;
