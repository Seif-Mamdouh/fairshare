import type { Express, Request, Response } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Database } from "./db";
import { hash, token } from "./auth";
import { normalizePhone, type PhoneProvider } from "./phone-provider";
type Dependencies = {
  db: Database;
  provider: PhoneProvider | null;
  user: (req: Request) => Promise<any>;
  session: (res: Response, id: string) => Promise<string>;
  limit: (key: string, max?: number, seconds?: number) => Promise<void>;
  route: (handler: (req: Request, res: Response) => Promise<unknown>) => any;
};
const fail = (status: number, message: string): never => {
  throw Object.assign(new Error(message), { status });
};
const invalid = () =>
  fail(
    400,
    "This code is incorrect, expired, or already used. Request a new code if needed.",
  );
export function installPhoneAuth(
  app: Express,
  { db, provider, user, session, limit, route }: Dependencies,
) {
  app.get("/api/auth/methods", (_req, res) =>
    res.json({ phone: !!provider, email: true }),
  );
  app.post(
    "/api/auth/phone/start",
    route(async (req, res) => {
      if (!provider)
        fail(503, "Phone sign-in is not available yet. Use email for now.");
      await limit("phone-start-ip:" + req.ip, 10);
      const data = z
        .object({
          phone: z.string().max(80),
          purpose: z.enum(["login", "link"]).default("login"),
        })
        .parse(req.body);
      const owner = data.purpose === "link" ? await user(req) : null;
      const phone = normalizePhone(data.phone);
      await limit("phone-resend:" + phone, 1, 60);
      await limit("phone-start:" + phone, 3);
      await limit("phone-start-global", 20, 3600);
      const challenge = token("otp_");
      // Keep only short-lived challenges. No OTP values are stored in Fairshare.
      await db.query(
        "DELETE FROM phone_challenges WHERE expires_at<now()-interval '1 day'",
      );
      await db.query(
        "INSERT INTO phone_challenges(token_hash,phone_e164,purpose,user_id) VALUES($1,$2,$3,$4)",
        [hash(challenge), phone, data.purpose, owner?.id || null],
      );
      try {
        const verificationId = await provider!.start(phone);
        await db.query(
          "UPDATE phone_challenges SET verification_id=$1 WHERE token_hash=$2",
          [verificationId, hash(challenge)],
        );
      } catch (e) {
        await db.query("DELETE FROM phone_challenges WHERE token_hash=$1", [
          hash(challenge),
        ]);
        throw e;
      }
      res
        .status(202)
        .json({
          challenge,
          expiresIn: 600,
          resendAfter: 60,
          message:
            "A verification code has been requested. Enter the code from your text message.",
        });
    }),
  );
  app.post(
    "/api/auth/phone/check",
    route(async (req, res) => {
      if (!provider)
        fail(503, "Phone sign-in is not available yet. Use email for now.");
      await limit("phone-check-ip:" + req.ip, 60);
      const data = z
        .object({
          challenge: z.string().regex(/^otp_[A-Za-z0-9_-]{43}$/),
          code: z.string().regex(/^\d{4,10}$/),
          name: z.string().trim().min(1).max(80).optional(),
        })
        .parse(req.body);
      const challengeHash = hash(data.challenge);
      const existing = (
        await db.query(
          "SELECT purpose,user_id FROM phone_challenges WHERE token_hash=$1",
          [challengeHash],
        )
      ).rows[0];
      if (!existing) invalid();
      if (
        existing.purpose === "link" &&
        (await user(req)).id !== existing.user_id
      )
        fail(403, "Sign in to the account that requested this verification.");
      const challenge = (
        await db.query(
          "UPDATE phone_challenges SET attempts=attempts+1,checking=true WHERE token_hash=$1 AND consumed_at IS NULL AND expires_at>now() AND attempts<5 AND checking=false AND verification_id IS NOT NULL RETURNING *",
          [challengeHash],
        )
      ).rows[0];
      if (!challenge) invalid();
      try {
        await limit("phone-check:" + challenge.phone_e164, 15);
        const approved = await provider!.check(
          challenge.verification_id,
          challenge.phone_e164,
          data.code,
        );
        if (!approved) invalid();
        const signedIn = await db.transaction(async (tx) => {
          const current = (
            await tx.query(
              "SELECT * FROM phone_challenges WHERE token_hash=$1 AND consumed_at IS NULL AND expires_at>now() FOR UPDATE",
              [challengeHash],
            )
          ).rows[0];
          if (!current) invalid();
          let account;
          if (current.purpose === "link") {
            // The existing account ID and its email/groups are preserved. Never merge by name.
            try {
              account = (
                await tx.query(
                  "UPDATE users SET phone_e164=$1,phone_verified_at=now() WHERE id=$2 RETURNING id,name,email,phone_e164",
                  [current.phone_e164, current.user_id],
                )
              ).rows[0];
            } catch (e: any) {
              if (e.code === "23505")
                fail(
                  409,
                  "This phone cannot be linked to this account. Sign in using that phone or use a different number.",
                );
              throw e;
            }
          } else {
            account = (
              await tx.query(
                "INSERT INTO users(id,name,phone_e164,phone_verified_at) VALUES($1,$2,$3,now()) ON CONFLICT(phone_e164) DO UPDATE SET phone_verified_at=now() RETURNING id,name,email,phone_e164",
                [randomUUID(), data.name || "Member", current.phone_e164],
              )
            ).rows[0];
          }
          await tx.query(
            "UPDATE phone_challenges SET consumed_at=now() WHERE phone_e164=$1 AND verification_id=$2",
            [current.phone_e164, current.verification_id],
          );
          return account;
        });
        res.json({ token: await session(res, signedIn.id), user: signedIn });
      } finally {
        await db.query(
          "UPDATE phone_challenges SET checking=false WHERE token_hash=$1",
          [challengeHash],
        );
      }
    }),
  );
}
