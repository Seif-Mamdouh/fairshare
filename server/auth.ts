import { createHash, randomBytes } from "node:crypto";
export const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export const token = (prefix = "") =>
  prefix + randomBytes(32).toString("base64url");
