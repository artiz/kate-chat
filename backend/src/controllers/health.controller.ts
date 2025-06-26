import { Router, Request, Response } from "express";
import { createLogger } from "@/utils/logger";
const router = Router();

router.get("/", async (req: Request, res: Response) => {
  res.status(200).json({ status: "ok", message: "Service is healthy" });
});

export default router;
