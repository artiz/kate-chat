import { Router, Request, Response } from "express";

export const router = Router();

router.get("/", async (req: Request, res: Response) => {
  res.status(200).json({ status: "ok", message: "Service is healthy" });
});
