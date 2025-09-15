import { Router, Request, Response } from "express";

const router = Router();

router.get("/privacy", (_req: Request, res: Response) => {
  res.type("text/plain").send("Privacy Policy - MyAiMediaMgr");
});

router.get("/terms", (_req: Request, res: Response) => {
  res.type("text/plain").send("Terms of Service - MyAiMediaMgr");
});

router.get("/data-deletion", (_req: Request, res: Response) => {
  res.type("text/plain").send("Data Deletion Instructions - MyAiMediaMgr");
});

export default router;
