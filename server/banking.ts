import type { Express, Request, RequestHandler } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Database } from "./db";
import { expenseSchema, type ExpenseInput } from "../shared/domain";
import { BankError, type Banking } from "./bank-provider";
type Dependencies = {
  db: Database;
  banking: Banking | null;
  user(req: Request): Promise<{ id: string; name: string }>;
  limit(key: string, max?: number): Promise<void>;
  route(fn: (req: Request, res: any) => Promise<unknown>): RequestHandler;
  addExpense(
    tx: Database,
    gid: string,
    data: ExpenseInput,
    uid: string,
  ): Promise<any>;
};
const id = () => randomUUID();
const deny = (status: number, message: string): never => {
  throw new BankError(status, message);
};
const reconnectCodes = new Set([
  "ITEM_LOGIN_REQUIRED",
  "INVALID_ACCESS_TOKEN",
  "ITEM_NOT_FOUND",
  "ITEM_ACCESS_NOT_GRANTED",
  "USER_PERMISSION_REVOKED",
]);
export function installBanking(app: Express, d: Dependencies) {
  const { db, user, limit, banking: b } = d;
  const route = (fn: (req: Request, res: any) => Promise<unknown>) =>
    d.route(async (req, res) => {
      try {
        return await fn(req, res);
      } catch (e) {
        if (e instanceof BankError)
          return res.status(e.status).json({ error: e.message });
        throw e;
      }
    });
  const ready = (): Banking =>
    b ||
    deny(
      503,
      "Bank connections are not enabled yet. The app owner must complete Plaid setup.",
    );
  const context = (uid: string, kind: string, key: string) =>
    JSON.stringify([uid, kind, key]);
  async function owned(tx: Database, uid: string, key: string) {
    const link = (
      await tx.query(
        "SELECT * FROM bank_links WHERE id=$1 AND user_id=$2 FOR UPDATE",
        [key, uid],
      )
    ).rows[0];
    return link || deny(404, "Bank connection not found");
  }
  function access(link: any) {
    const provider = ready();
    if (link.environment !== provider.environment)
      deny(
        409,
        "Bank environment changed. Restore the original provider configuration to disconnect this connection.",
      );
    return provider.vault.open(
      link.token_ciphertext,
      context(link.user_id, "item", link.id),
    );
  }
  app.get("/api/bank/ios-association", (_req, res) => {
    const team = process.env.APPLE_TEAM_ID;
    if (!team || !/^[A-Z0-9]{10}$/.test(team))
      return res
        .status(404)
        .json({ error: "Native bank callback is not configured" });
    res.json({
      applinks: {
        apps: [],
        details: [
          { appID: team + ".app.fairshare.mobile", paths: ["/bank-oauth"] },
        ],
      },
    });
  });
  app.get(
    "/api/bank",
    route(async (req, res) => {
      const u = await user(req);
      const links = (
        await db.query(
          "SELECT id,status,last_synced_at,environment FROM bank_links WHERE user_id=$1 AND status<>'disconnected' ORDER BY created_at",
          [u.id],
        )
      ).rows;
      const accounts = (
        await db.query(
          "SELECT a.id,a.link_id,a.name,a.mask,a.type,a.subtype FROM bank_accounts a JOIN bank_links l ON l.id=a.link_id WHERE l.user_id=$1 AND l.status<>'disconnected' ORDER BY a.name",
          [u.id],
        )
      ).rows;
      res.json({
        configured: !!b,
        environment: b?.environment || null,
        platforms: {
          web: !!b?.webRedirect,
          ios: !!b?.iosRedirect,
          android: !!b?.androidPackage,
        },
        links,
        accounts,
      });
    }),
  );
  app.post(
    "/api/bank/link-token",
    route(async (req, res) => {
      const u = await user(req),
        provider = ready();
      const data = z
        .object({
          platform: z.enum(["web", "ios", "android"]),
          consent: z.literal(true),
        })
        .strict()
        .parse(req.body);
      await limit("bank-link:" + u.id, 6);
      const redirect =
        data.platform === "ios" ? provider.iosRedirect : provider.webRedirect;
      if (data.platform === "android" ? !provider.androidPackage : !redirect)
        deny(503, "Bank linking is not configured for this platform yet.");
      const result = await provider.call("/link/token/create", {
        user: { client_user_id: u.id },
        client_name: "Fairshare",
        products: ["transactions"],
        country_codes: ["US"],
        language: "en",
        transactions: { days_requested: 90 },
        account_filters: {
          depository: { account_subtypes: ["checking", "savings"] },
          credit: { account_subtypes: ["credit card"] },
        },
        ...(data.platform === "android"
          ? { android_package_name: provider.androidPackage }
          : { redirect_uri: redirect }),
      });
      if (!result.link_token || !result.expiration)
        deny(503, "The bank provider did not create a Link session.");
      const sessionId = id();
      await db.query(
        "DELETE FROM bank_link_sessions WHERE user_id=$1 AND expires_at<now() AND link_id IS NULL",
        [u.id],
      );
      await db.query(
        "INSERT INTO bank_link_sessions(id,user_id,token_ciphertext,expires_at) VALUES($1,$2,$3,$4)",
        [
          sessionId,
          u.id,
          provider.vault.seal(
            result.link_token,
            context(u.id, "link", sessionId),
          ),
          result.expiration,
        ],
      );
      res.json({ id: sessionId, linkToken: result.link_token });
    }),
  );
  app.post(
    "/api/bank/link/:id/complete",
    route(async (req, res) => {
      const u = await user(req),
        provider = ready();
      const { publicToken } = z
        .object({ publicToken: z.string().min(10).max(500) })
        .strict()
        .parse(req.body);
      await limit("bank-exchange:" + u.id, 20);
      const result = await db.transaction(async (tx) => {
        const s = (
          await tx.query(
            "SELECT * FROM bank_link_sessions WHERE id=$1 AND user_id=$2 FOR UPDATE",
            [String(req.params.id), u.id],
          )
        ).rows[0];
        if (!s) deny(404, "Link session not found");
        if (s.link_id) return { id: s.link_id, replayed: true };
        if (new Date(s.expires_at).getTime() <= Date.now())
          deny(410, "This Link session expired. Start a new bank connection.");
        // Sandbox can use the SDK callback without the separately enabled Link-events feature.
        // Real bank connections always require server-side session/token binding.
        if (
          provider.environment === "production" ||
          provider.verifyLinkEvents !== false
        ) {
          const events = await provider.call("/link/token/get", {
            link_token: provider.vault.open(
              s.token_ciphertext,
              context(u.id, "link", s.id),
            ),
          });
          const matches = (events.link_sessions || []).some(
            (session: any) =>
              (session.results?.item_add_results || []).some(
                (r: any) => r.public_token === publicToken,
              ) || session.on_success?.public_token === publicToken,
          );
          if (!matches)
            deny(
              409,
              "Plaid has not verified this Link session yet. Retry completion in a moment.",
            );
        }
        const exchange = await provider.call("/item/public_token/exchange", {
          public_token: publicToken,
        });
        if (!exchange.access_token || !exchange.item_id)
          deny(503, "The bank provider did not complete the connection.");
        const linkId = id();
        try {
          await tx.query(
            "INSERT INTO bank_links(id,user_id,provider_item_id,token_ciphertext,environment) VALUES($1,$2,$3,$4,$5)",
            [
              linkId,
              u.id,
              exchange.item_id,
              provider.vault.seal(
                exchange.access_token,
                context(u.id, "item", linkId),
              ),
              provider.environment,
            ],
          );
          await tx.query(
            "UPDATE bank_link_sessions SET link_id=$1,token_ciphertext=NULL WHERE id=$2",
            [linkId, s.id],
          );
        } catch {
          // A token that could not be retained must not leave a new provider Item active.
          await provider.call("/item/remove", {
            access_token: exchange.access_token,
          });
          deny(
            503,
            "The bank connection could not be saved. Please start again.",
          );
        }
        return { id: linkId, replayed: false };
      });
      res.json(result);
    }),
  );
  app.post(
    "/api/bank/links/:id/sync",
    route(async (req, res) => {
      const u = await user(req),
        provider = ready(),
        linkId = String(req.params.id);
      await limit("bank-sync:" + u.id, 30);
      try {
        const result = await db.transaction(async (tx) => {
          const link = await owned(tx, u.id, linkId);
          if (link.status !== "connected")
            deny(
              409,
              "This bank connection needs attention. Disconnect it and connect again.",
            );
          const accessToken = access(link),
            started = Date.now(),
            initial = link.cursor;
          let pages: any[] = [];
          for (let attempt = 0; attempt < 3; attempt++) {
            let cursor = initial;
            pages = [];
            try {
              for (let page = 0; ; page++) {
                if (page >= 50 || Date.now() - started > 16000)
                  deny(
                    503,
                    "Bank sync needs another attempt. No partial updates were saved.",
                  );
                const data = await provider.call("/transactions/sync", {
                  access_token: accessToken,
                  ...(cursor ? { cursor } : {}),
                  count: 500,
                });
                if (
                  typeof data.next_cursor !== "string" ||
                  typeof data.has_more !== "boolean" ||
                  !Array.isArray(data.added) ||
                  !Array.isArray(data.modified) ||
                  !Array.isArray(data.removed)
                )
                  deny(
                    503,
                    "The bank provider returned an incomplete sync. Please retry.",
                  );
                pages.push(data);
                cursor = data.next_cursor;
                if (!data.has_more) break;
              }
              break;
            } catch (e) {
              if (
                e instanceof BankError &&
                e.code === "TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION" &&
                attempt < 2
              )
                continue;
              throw e;
            }
          }
          const accounts = new Map<string, any>();
          for (const page of pages)
            for (const a of page.accounts || []) accounts.set(a.account_id, a);
          for (const a of accounts.values()) {
            await tx.query(
              "INSERT INTO bank_accounts(id,link_id,provider_account_id,name,mask,type,subtype) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(link_id,provider_account_id) DO UPDATE SET name=EXCLUDED.name,mask=EXCLUDED.mask,type=EXCLUDED.type,subtype=EXCLUDED.subtype",
              [
                id(),
                linkId,
                a.account_id,
                String(a.name || "Bank account").slice(0, 150),
                a.mask ? String(a.mask).slice(-4) : null,
                String(a.type || "unknown"),
                a.subtype || null,
              ],
            );
          }
          const accountIds = new Map(
            (
              await tx.query(
                "SELECT id,provider_account_id FROM bank_accounts WHERE link_id=$1",
                [linkId],
              )
            ).rows.map((a) => [a.provider_account_id, a.id]),
          );
          // Apply removals before additions across the complete batch (pending -> posted can span pages).
          for (const page of pages)
            for (const t of page.removed)
              await tx.query(
                "UPDATE bank_transactions SET removed=true,revision=revision+1 WHERE link_id=$1 AND provider_transaction_id=$2",
                [linkId, t.transaction_id],
              );
          for (const page of pages)
            for (const t of [...page.added, ...page.modified]) {
              const minor = Math.round(Number(t.amount) * 100),
                accountId = accountIds.get(t.account_id);
              if (
                !accountId ||
                !Number.isSafeInteger(minor) ||
                typeof t.transaction_id !== "string" ||
                !/^\d{4}-\d{2}-\d{2}$/.test(t.date)
              )
                deny(
                  503,
                  "The bank provider returned an unsupported transaction. No partial updates were saved.",
                );
              if (t.pending_transaction_id)
                await tx.query(
                  "UPDATE bank_transactions SET removed=true,revision=revision+1 WHERE link_id=$1 AND provider_transaction_id=$2",
                  [linkId, t.pending_transaction_id],
                );
              await tx.query(
                "INSERT INTO bank_transactions(id,link_id,account_id,provider_transaction_id,name,amount_minor,currency,spent_on,pending,source_key) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(link_id,provider_transaction_id) DO UPDATE SET account_id=EXCLUDED.account_id,name=EXCLUDED.name,amount_minor=EXCLUDED.amount_minor,currency=EXCLUDED.currency,spent_on=EXCLUDED.spent_on,pending=EXCLUDED.pending,removed=false,revision=bank_transactions.revision+1",
                [
                  id(),
                  linkId,
                  accountId,
                  t.transaction_id,
                  String(t.merchant_name || t.name || "Purchase").slice(0, 150),
                  minor,
                  t.iso_currency_code || null,
                  t.date,
                  !!t.pending,
                  provider.vault.fingerprint(u.id, t.transaction_id),
                ],
              );
            }
          await tx.query(
            "UPDATE bank_links SET cursor=$1,last_synced_at=now() WHERE id=$2",
            [pages.at(-1).next_cursor, linkId],
          );
          return { ok: true };
        });
        res.json(result);
      } catch (e) {
        if (e instanceof BankError && reconnectCodes.has(e.code)) {
          await db.query(
            "UPDATE bank_links SET status='attention' WHERE id=$1 AND user_id=$2 AND status='connected'",
            [linkId, u.id],
          );
          deny(
            409,
            "Your bank connection needs attention. Disconnect it and connect again through Plaid.",
          );
        }
        throw e;
      }
    }),
  );
  app.get(
    "/api/bank/transactions",
    route(async (req, res) => {
      const u = await user(req);
      const offset = z.coerce
        .number()
        .int()
        .min(0)
        .max(100000)
        .parse(req.query.offset || 0);
      const rows = (
        await db.query(
          "SELECT t.id,t.link_id,t.account_id,t.name,t.amount_minor,t.currency,t.spent_on,t.pending,t.revision,i.expense_id AS imported_expense_id FROM bank_transactions t JOIN bank_links l ON l.id=t.link_id LEFT JOIN bank_imports i ON i.user_id=l.user_id AND i.source_key=t.source_key WHERE l.user_id=$1 AND l.status='connected' AND t.removed=false ORDER BY t.spent_on DESC,t.id LIMIT 101 OFFSET $2",
          [u.id, offset],
        )
      ).rows;
      res.json({
        transactions: rows
          .slice(0, 100)
          .map((t) => ({ ...t, amount_minor: Number(t.amount_minor) })),
        nextOffset: rows.length > 100 ? offset + 100 : null,
      });
    }),
  );
  app.post(
    "/api/bank/transactions/:id/import",
    route(async (req, res) => {
      const u = await user(req);
      const data = z
        .object({
          groupId: z.string().min(1),
          revision: z.number().int().positive(),
          expense: expenseSchema,
        })
        .strict()
        .parse(req.body);
      const result = await db.transaction(async (tx) => {
        // Lock in the same order as sync and disconnect to prevent a stale or deleted import.
        const locator = (
          await tx.query(
            "SELECT l.id FROM bank_transactions t JOIN bank_links l ON l.id=t.link_id WHERE t.id=$1 AND l.user_id=$2",
            [String(req.params.id), u.id],
          )
        ).rows[0];
        if (!locator) deny(404, "Bank transaction not found");
        const link = await owned(tx, u.id, locator.id);
        if (link.status !== "connected")
          deny(409, "This bank connection is not active.");
        const t = (
          await tx.query(
            "SELECT * FROM bank_transactions WHERE id=$1 AND link_id=$2 FOR UPDATE",
            [String(req.params.id), link.id],
          )
        ).rows[0];
        if (!t) deny(404, "Bank transaction not found");
        // Per-user lock serializes imports of the same source across different Item links.
        await tx.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [u.id]);
        if (
          (
            await tx.query(
              "SELECT expense_id FROM bank_imports WHERE user_id=$1 AND source_key=$2",
              [u.id, t.source_key],
            )
          ).rows.length
        )
          deny(409, "This purchase was already added to an expense.");
        if (t.removed || t.pending)
          deny(409, "Only posted, current purchases can be shared.");
        if (
          t.revision !== data.revision ||
          Number(t.amount_minor) !== data.expense.amountMinor
        )
          deny(
            409,
            "This transaction changed. Reload and review the current purchase.",
          );
        const g = (
          await tx.query(
            "SELECT g.id,g.currency FROM groups g JOIN members m ON m.group_id=g.id WHERE g.id=$1 AND m.user_id=$2",
            [data.groupId, u.id],
          )
        ).rows[0];
        if (!g) deny(404, "Group not found");
        if (g.currency !== t.currency)
          deny(400, "Choose a group with the same currency as this purchase.");
        const expense = await d.addExpense(tx, g.id, data.expense, u.id);
        await tx.query(
          "INSERT INTO bank_imports(user_id,source_key,expense_id) VALUES($1,$2,$3)",
          [u.id, t.source_key, expense.id],
        );
        return { expenseId: expense.id };
      });
      res.status(201).json(result);
    }),
  );
  app.delete(
    "/api/bank/links/:id",
    route(async (req, res) => {
      const u = await user(req),
        provider = ready(),
        linkId = String(req.params.id);
      await limit("bank-disconnect:" + u.id, 30);
      const result = await db.transaction(async (tx) => {
        const link = await owned(tx, u.id, linkId);
        if (link.status === "disconnected") return { ok: true };
        try {
          await provider.call("/item/remove", { access_token: access(link) });
        } catch (e) {
          if (
            !(e instanceof BankError) ||
            !["INVALID_ACCESS_TOKEN", "ITEM_NOT_FOUND"].includes(e.code)
          ) {
            await tx.query(
              "UPDATE bank_links SET status='disconnecting' WHERE id=$1",
              [linkId],
            );
            return { ok: false };
          }
        }
        await tx.query("DELETE FROM bank_accounts WHERE link_id=$1", [linkId]);
        await tx.query("DELETE FROM bank_link_sessions WHERE link_id=$1", [
          linkId,
        ]);
        await tx.query(
          "UPDATE bank_links SET status='disconnected',token_ciphertext=NULL,provider_item_id=NULL,cursor=NULL WHERE id=$1",
          [linkId],
        );
        return { ok: true };
      });
      if (!result.ok)
        deny(
          503,
          "Plaid could not confirm disconnection. Import and sync are paused; retry Disconnect to revoke access and erase bank data.",
        );
      res.json(result);
    }),
  );
}
