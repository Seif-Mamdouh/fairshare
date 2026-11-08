import type { Request, Response } from "express";
import { createApp } from "../server/app";
import { postgresDatabase } from "../server/db";
let app: ReturnType<typeof createApp>;
export default function handler(req: Request, res: Response) {
  if (!process.env.DATABASE_URL)
    return res.status(503).json({ error: "Database is not configured" });
  app ||= createApp(postgresDatabase(process.env.DATABASE_URL));
  return app(req, res);
}
