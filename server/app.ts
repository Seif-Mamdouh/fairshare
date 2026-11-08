import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { z, ZodError } from "zod";
import type { Database } from "./db";
import { hash, token, passwordHash, verifyPassword } from "./auth";
import {
  balances,
  simplifyDebts,
  expenseSchema,
  receiptSchema,
  validateSplits,
  currencies,
  moneySchema,
} from "../shared/domain";
class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
const fail = (status: number, message: string): never => {
  throw new HttpError(status, message);
};
const uid = () => randomUUID();
const nameSchema = z.string().trim().min(1).max(80);
const param = (req: Request, name: string) => String(req.params[name]);
export function createApp(db: Database) {
  const app = express();
  app.disable("x-powered-by");
  // Vercel overwrites X-Forwarded-For; trust its single ingress hop only there.
  app.set("trust proxy", process.env.VERCEL === "1" ? 1 : false);
  app.use((req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    const origin = req.headers.origin;
    const allowed = (process.env.ALLOWED_ORIGINS || "http://localhost:8081")
      .split(",")
      .map((s: string) => s.trim());
    const ownOrigin = `${req.headers["x-forwarded-proto"] || req.protocol}://${req.headers.host}`;
    if (origin && origin !== ownOrigin && !allowed.includes(origin))
      return res.status(403).json({ error: "Origin is not allowed" });
    if (origin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.setHeader(
        "Access-Control-Allow-Headers",
        "Authorization,Content-Type",
      );
      res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
    }
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  });
  app.use(express.json({ limit: "1600kb" }));
  const asyncRoute =
    (fn: (req: Request, res: Response) => Promise<unknown>) =>
    (req: Request, res: Response, next: NextFunction) => {
      Promise.resolve(fn(req, res)).catch(next);
    };
  const credential = (req: Request) =>
    req.headers.authorization?.replace(/^Bearer /i, "") ||
    req.headers.cookie
      ?.split(";")
      .map((s: string) => s.trim())
      .find((s: string) => s.startsWith("fairshare_session="))
      ?.slice(18) ||
    "";
  async function user(req: Request) {
    const rows = (
      await db.query(
        "SELECT u.id,u.name,u.email FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now()",
        [hash(credential(req))],
      )
    ).rows;
    return rows[0] || fail(401, "Sign in to continue");
  }
  async function groupAccess(req: Request, groupId: string, owner = false) {
    const u = await user(req);
    const g = (
      await db.query(
        "SELECT g.* FROM groups g JOIN members m ON m.group_id=g.id WHERE g.id=$1 AND m.user_id=$2",
        [groupId, u.id],
      )
    ).rows[0];
    if (!g) fail(404, "Group not found");
    if (owner && g.owner_id !== u.id)
      fail(403, "Only the group owner can do this");
    return { u, g };
  }
  async function limit(key: string, max = 30) {
    const r = (
      await db.query(
        "INSERT INTO rate_limits(key,hits,reset_at) VALUES($1,1,now()+interval '15 minutes') ON CONFLICT(key) DO UPDATE SET hits=CASE WHEN rate_limits.reset_at<now() THEN 1 ELSE rate_limits.hits+1 END,reset_at=CASE WHEN rate_limits.reset_at<now() THEN now()+interval '15 minutes' ELSE rate_limits.reset_at END RETURNING hits",
        [hash(key)],
      )
    ).rows[0];
    if (r.hits > max) fail(429, "Too many requests. Try again in 15 minutes.");
  }
  async function session(res: Response, userId: string) {
    const value = token("fs_");
    await db.query(
      "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '30 days')",
      [hash(value), userId],
    );
    res.cookie("fairshare_session", value, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 30 * 86400000,
      path: "/",
    });
    return value;
  }
  async function validateExpense(
    connection: Database,
    gid: string,
    data: z.infer<typeof expenseSchema>,
  ) {
    const members = (
      await connection.query("SELECT id FROM members WHERE group_id=$1", [gid])
    ).rows;
    try {
      validateSplits(
        data,
        members.map((m) => m.id),
      );
    } catch (e) {
      fail(400, (e as Error).message);
    }
  }
  async function addExpense(
    connection: Database,
    gid: string,
    data: z.infer<typeof expenseSchema>,
    userId: string,
  ) {
    await validateExpense(connection, gid, data);
    const id = uid();
    return (
      await connection.query(
        "INSERT INTO expenses(id,group_id,title,amount_minor,paid_by,splits,category,spent_on,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *",
        [
          id,
          gid,
          data.title,
          data.amountMinor,
          data.paidBy,
          JSON.stringify(data.splits),
          data.category,
          data.spentOn,
          userId,
        ],
      )
    ).rows[0];
  }
  function verifyImage(image?: string) {
    if (!image) return;
    const match = image.match(
      /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/,
    );
    if (!match) fail(400, "Receipt must be a PNG, JPEG, or WebP data URL");
    const bytes = Buffer.from(match![2], "base64");
    if (bytes.length > 1024 * 1024)
      fail(400, "Receipt image must be at most 1 MB");
    const valid =
      (match![1] === "png" &&
        bytes.subarray(0, 8).toString("hex") === "89504e470d0a1a0a") ||
      (match![1] === "jpeg" &&
        bytes.subarray(0, 3).toString("hex") === "ffd8ff") ||
      (match![1] === "webp" &&
        bytes.toString("ascii", 0, 4) === "RIFF" &&
        bytes.toString("ascii", 8, 12) === "WEBP");
    if (!valid) fail(400, "Image contents do not match the declared format");
  }
  async function submitReceipt(
    gid: string,
    raw: unknown,
    agentId: string | null,
    userId: string | null,
  ) {
    const data = receiptSchema.parse(raw);
    verifyImage(data.imageData);
    const { imageData, ...payload } = data;
    return db.transaction(async (tx) => {
      const group = (
        await tx.query("SELECT currency FROM groups WHERE id=$1 FOR UPDATE", [
          gid,
        ])
      ).rows[0];
      if (data.currency !== group.currency)
        fail(400, "Receipt currency must match the group");
      await validateExpense(tx, gid, data);
      if (agentId) {
        const existing = (
          await tx.query(
            "SELECT * FROM receipts WHERE agent_id=$1 AND source_id=$2",
            [agentId, data.sourceId],
          )
        ).rows[0];
        if (existing) {
          if (
            !isDeepStrictEqual(existing.payload, payload) ||
            existing.image_data !== (imageData || null)
          )
            fail(409, "sourceId already exists with different content");
          return { id: existing.id, status: existing.status, replayed: true };
        }
      }
      const id = uid();
      await tx.query(
        "INSERT INTO receipts(id,group_id,agent_id,submitted_by,source_id,payload,image_data) VALUES($1,$2,$3,$4,$5,$6,$7)",
        [
          id,
          gid,
          agentId,
          userId,
          data.sourceId,
          JSON.stringify(payload),
          imageData || null,
        ],
      );
      return { id, status: "pending", replayed: false };
    });
  }
  app.get(
    "/api/health",
    asyncRoute(async (_req, res) => {
      await db.query("SELECT 1");
      res.json({ status: "ok" });
    }),
  );
  app.post(
    "/api/auth/register",
    asyncRoute(async (req, res) => {
      await limit("auth-ip:" + req.ip);
      const data = z
        .object({
          name: nameSchema,
          email: z.string().email().max(254),
          password: z.string().min(10).max(128),
        })
        .parse(req.body);
      await limit("auth:" + data.email.toLowerCase());
      const id = uid();
      try {
        await db.query(
          "INSERT INTO users(id,name,email,password_hash) VALUES($1,$2,$3,$4)",
          [
            id,
            data.name,
            data.email.toLowerCase(),
            await passwordHash(data.password),
          ],
        );
      } catch (e: any) {
        if (e.code === "23505") fail(409, "This email is already registered");
        throw e;
      }
      res
        .status(201)
        .json({
          token: await session(res, id),
          user: { id, name: data.name, email: data.email.toLowerCase() },
        });
    }),
  );
  app.post(
    "/api/auth/login",
    asyncRoute(async (req, res) => {
      await limit("auth-ip:" + req.ip);
      const data = z
        .object({
          email: z.string().email().max(254),
          password: z.string().max(128),
        })
        .parse(req.body);
      await limit("auth:" + data.email.toLowerCase());
      const u = (
        await db.query("SELECT * FROM users WHERE email=$1", [
          data.email.toLowerCase(),
        ])
      ).rows[0];
      const dummy = "0".repeat(32) + ":" + "0".repeat(128);
      const valid = await verifyPassword(
        data.password,
        u?.password_hash || dummy,
      );
      if (!u || !valid) fail(401, "Incorrect email or password");
      res.json({
        token: await session(res, u.id),
        user: { id: u.id, name: u.name, email: u.email },
      });
    }),
  );
  app.post(
    "/api/auth/logout",
    asyncRoute(async (req, res) => {
      await db.query("DELETE FROM sessions WHERE token_hash=$1", [
        hash(credential(req)),
      ]);
      res.clearCookie("fairshare_session", { path: "/" });
      res.json({ ok: true });
    }),
  );
  app.get(
    "/api/me",
    asyncRoute(async (req, res) => res.json(await user(req))),
  );
  app.get(
    "/api/groups",
    asyncRoute(async (req, res) => {
      const u = await user(req);
      res.json(
        (
          await db.query(
            "SELECT g.id,g.name,g.currency,g.owner_id,g.created_at FROM groups g JOIN members m ON m.group_id=g.id WHERE m.user_id=$1 ORDER BY g.created_at DESC",
            [u.id],
          )
        ).rows,
      );
    }),
  );
  app.post(
    "/api/groups",
    asyncRoute(async (req, res) => {
      const u = await user(req);
      const data = z
        .object({ name: nameSchema, currency: z.enum(currencies) })
        .parse(req.body);
      const id = uid();
      await db.transaction(async (tx) => {
        await tx.query(
          "INSERT INTO groups(id,name,currency,owner_id,invite_token) VALUES($1,$2,$3,$4,$5)",
          [id, data.name, data.currency, u.id, token("join_")],
        );
        await tx.query(
          "INSERT INTO members(id,group_id,name,user_id) VALUES($1,$2,$3,$4)",
          [uid(), id, u.name, u.id],
        );
      });
      res.status(201).json({ id, ...data });
    }),
  );
  app.post(
    "/api/groups/join",
    asyncRoute(async (req, res) => {
      const u = await user(req);
      const { inviteToken } = z
        .object({ inviteToken: z.string().max(100) })
        .parse(req.body);
      await limit("join:" + u.id);
      const g = (
        await db.query("SELECT id FROM groups WHERE invite_token=$1", [
          inviteToken,
        ])
      ).rows[0];
      if (!g) fail(404, "Invite not found");
      await db.query(
        "INSERT INTO members(id,group_id,name,user_id) VALUES($1,$2,$3,$4) ON CONFLICT(group_id,user_id) DO NOTHING",
        [uid(), g.id, u.name, u.id],
      );
      res.json({ id: g.id });
    }),
  );
  app.get(
    "/api/groups/:id",
    asyncRoute(async (req, res) => {
      const { g, u } = await groupAccess(req, param(req, "id"));
      const [members, expenses, settlements, receipts, agents] =
        await Promise.all(
          [
            "SELECT * FROM members WHERE group_id=$1 ORDER BY id",
            "SELECT * FROM expenses WHERE group_id=$1 ORDER BY created_at DESC",
            "SELECT * FROM settlements WHERE group_id=$1 ORDER BY created_at DESC",
            "SELECT id,agent_id,source_id,payload,status,expense_id,created_at,(image_data IS NOT NULL) AS has_image FROM receipts WHERE group_id=$1 ORDER BY created_at DESC",
            "SELECT id,name,created_at,revoked_at FROM agents WHERE group_id=$1 ORDER BY created_at DESC",
          ].map((q) => db.query(q, [g.id])),
        );
      const net = balances(members.rows, expenses.rows, settlements.rows);
      if (g.owner_id !== u.id) delete g.invite_token;
      res.json({
        ...g,
        members: members.rows,
        expenses: expenses.rows,
        settlements: settlements.rows,
        receipts: receipts.rows,
        agents: agents.rows,
        balances: net,
        transfers: simplifyDebts(net),
      });
    }),
  );
  app.post(
    "/api/groups/:id/members",
    asyncRoute(async (req, res) => {
      const { g } = await groupAccess(req, param(req, "id"), true);
      const name = nameSchema.parse(req.body.name);
      const member = (
        await db.query(
          "INSERT INTO members(id,group_id,name) VALUES($1,$2,$3) RETURNING *",
          [uid(), g.id, name],
        )
      ).rows[0];
      res.status(201).json(member);
    }),
  );
  app.post(
    "/api/groups/:id/invite",
    asyncRoute(async (req, res) => {
      const { g } = await groupAccess(req, param(req, "id"), true);
      const value = token("join_");
      await db.query("UPDATE groups SET invite_token=$1 WHERE id=$2", [
        value,
        g.id,
      ]);
      res.json({ inviteToken: value });
    }),
  );
  app.post(
    "/api/groups/:id/expenses",
    asyncRoute(async (req, res) => {
      const { g, u } = await groupAccess(req, param(req, "id"));
      const data = expenseSchema.parse(req.body);
      res
        .status(201)
        .json(await db.transaction((tx) => addExpense(tx, g.id, data, u.id)));
    }),
  );
  app.delete(
    "/api/groups/:id/expenses/:expenseId",
    asyncRoute(async (req, res) => {
      const { g, u } = await groupAccess(req, param(req, "id"));
      const e = (
        await db.query("SELECT * FROM expenses WHERE id=$1 AND group_id=$2", [
          param(req, "expenseId"),
          g.id,
        ])
      ).rows[0];
      if (!e) fail(404, "Expense not found");
      if (e.created_by !== u.id && g.owner_id !== u.id)
        fail(403, "Only the author or group owner can remove an expense");
      await db.query(
        "UPDATE expenses SET voided_at=COALESCE(voided_at,now()) WHERE id=$1",
        [e.id],
      );
      res.json({ ok: true });
    }),
  );
  app.post(
    "/api/groups/:id/settlements",
    asyncRoute(async (req, res) => {
      const { g, u } = await groupAccess(req, param(req, "id"));
      const data = z
        .object({
          fromMember: z.string(),
          toMember: z.string(),
          amountMinor: moneySchema,
          note: z.string().max(200).default(""),
        })
        .parse(req.body);
      if (data.fromMember === data.toMember)
        fail(400, "Choose two different members");
      const ids = (
        await db.query("SELECT id FROM members WHERE group_id=$1", [g.id])
      ).rows.map((m) => m.id);
      if (!ids.includes(data.fromMember) || !ids.includes(data.toMember))
        fail(400, "Both members must belong to this group");
      res
        .status(201)
        .json(
          (
            await db.query(
              "INSERT INTO settlements(id,group_id,from_member,to_member,amount_minor,note,created_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *",
              [
                uid(),
                g.id,
                data.fromMember,
                data.toMember,
                data.amountMinor,
                data.note,
                u.id,
              ],
            )
          ).rows[0],
        );
    }),
  );
  app.post(
    "/api/groups/:id/receipts",
    asyncRoute(async (req, res) => {
      const { g, u } = await groupAccess(req, param(req, "id"));
      res.status(201).json(await submitReceipt(g.id, req.body, null, u.id));
    }),
  );
  app.get(
    "/api/groups/:id/receipts/:receiptId/image",
    asyncRoute(async (req, res) => {
      const { g } = await groupAccess(req, param(req, "id"));
      const row = (
        await db.query(
          "SELECT image_data FROM receipts WHERE id=$1 AND group_id=$2",
          [param(req, "receiptId"), g.id],
        )
      ).rows[0];
      if (!row?.image_data) fail(404, "Receipt image not found");
      res.json({ imageData: row.image_data });
    }),
  );
  app.post(
    "/api/groups/:id/receipts/:receiptId/review",
    asyncRoute(async (req, res) => {
      const { g, u } = await groupAccess(req, param(req, "id"));
      const data = z
        .object({
          action: z.enum(["approve", "reject"]),
          expense: expenseSchema.optional(),
        })
        .parse(req.body);
      const result = await db.transaction(async (tx) => {
        const receipt = (
          await tx.query(
            "SELECT * FROM receipts WHERE id=$1 AND group_id=$2 FOR UPDATE",
            [param(req, "receiptId"), g.id],
          )
        ).rows[0];
        if (!receipt) fail(404, "Receipt not found");
        if (receipt.status !== "pending")
          return {
            status: receipt.status,
            expenseId: receipt.expense_id,
            replayed: true,
          };
        let expenseId = null;
        if (data.action === "approve") {
          const { currency, sourceId, notes, ...original } = receipt.payload;
          const expense = await addExpense(
            tx,
            g.id,
            data.expense || expenseSchema.parse(original),
            u.id,
          );
          expenseId = expense.id;
        }
        const status = data.action === "approve" ? "approved" : "rejected";
        await tx.query(
          "UPDATE receipts SET status=$1,expense_id=$2,reviewed_at=now() WHERE id=$3",
          [status, expenseId, receipt.id],
        );
        return { status, expenseId };
      });
      res.json(result);
    }),
  );
  app.post(
    "/api/groups/:id/agents",
    asyncRoute(async (req, res) => {
      const { g } = await groupAccess(req, param(req, "id"), true);
      const name = nameSchema.parse(req.body.name);
      const key = token("fsa_");
      const id = uid();
      await db.query(
        "INSERT INTO agents(id,group_id,name,token_hash) VALUES($1,$2,$3,$4)",
        [id, g.id, name, hash(key)],
      );
      res.status(201).json({ id, name, key, groupId: g.id });
    }),
  );
  app.delete(
    "/api/groups/:id/agents/:agentId",
    asyncRoute(async (req, res) => {
      const { g } = await groupAccess(req, param(req, "id"), true);
      await db.query(
        "UPDATE agents SET revoked_at=now() WHERE id=$1 AND group_id=$2",
        [param(req, "agentId"), g.id],
      );
      res.json({ ok: true });
    }),
  );
  async function agent(req: Request) {
    const a = (
      await db.query(
        "SELECT * FROM agents WHERE token_hash=$1 AND revoked_at IS NULL",
        [hash(credential(req))],
      )
    ).rows[0];
    if (!a) fail(401, "Invalid or revoked agent key");
    await limit("agent:" + a.id, 120);
    return a;
  }
  app.get(
    "/api/v1/agent/context",
    asyncRoute(async (req, res) => {
      const a = await agent(req);
      const g = (
        await db.query("SELECT id,name,currency FROM groups WHERE id=$1", [
          a.group_id,
        ])
      ).rows[0];
      const members = (
        await db.query(
          "SELECT id,name FROM members WHERE group_id=$1 ORDER BY id",
          [a.group_id],
        )
      ).rows;
      res.json({
        group: g,
        members,
        agent: { id: a.id, name: a.name },
        capabilities: ["receipts:submit", "receipts:read-own"],
      });
    }),
  );
  app.post(
    "/api/v1/agent/receipts",
    asyncRoute(async (req, res) => {
      const a = await agent(req);
      const result = await submitReceipt(a.group_id, req.body, a.id, null);
      res.status(result.replayed ? 200 : 201).json(result);
    }),
  );
  app.get(
    "/api/v1/agent/receipts/:id",
    asyncRoute(async (req, res) => {
      const a = await agent(req);
      const r = (
        await db.query(
          "SELECT id,status,expense_id,created_at,reviewed_at FROM receipts WHERE id=$1 AND agent_id=$2",
          [param(req, "id"), a.id],
        )
      ).rows[0];
      if (!r) fail(404, "Receipt not found");
      res.json(r);
    }),
  );
  app.use("/api", (_req, res) =>
    res.status(404).json({ error: "Endpoint not found" }),
  );
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ZodError)
      return res
        .status(400)
        .json({
          error: err.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join("; "),
        });
    const status = err.status || 500;
    if (status >= 500) console.error("API error", err.message);
    res
      .status(status)
      .json({
        error:
          status >= 500
            ? "Something went wrong. Please try again."
            : err.message,
      });
  });
  return app;
}
