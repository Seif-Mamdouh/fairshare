// Opt-in end-to-end check of the bank routes against Plaid Sandbox (fake data only).
// Usage: npm run bank:sandbox-check   (see docs/BANKING.md, "Local Sandbox setup")
// It drives the real Express app over an isolated in-memory database; DATABASE_URL and
// the local work/ database are never opened. Tokens, secrets and account numbers are never printed.
import { URL, pathToFileURL } from "node:url";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import request from "supertest";
import { createApp } from "../server/app";
import { localDatabase } from "../server/db";
import {
  BankError,
  BankVault,
  configuredBanking,
  type Banking,
} from "../server/bank-provider";

type Env = Record<string, string | undefined>;
// First Platypus Bank: Plaid's standard non-OAuth Sandbox institution (user_good / pass_good).
const institution = "ins_109508";

export function preflight(env: Env): {
  action: "skip" | "refuse" | "run";
  message: string;
} {
  if (env.PLAID_ENV && env.PLAID_ENV !== "sandbox")
    return {
      action: "refuse",
      message: `refused: PLAID_ENV is "${env.PLAID_ENV}". This check only runs with PLAID_ENV=sandbox.`,
    };
  if (!env.PLAID_CLIENT_ID || !env.PLAID_SECRET)
    return {
      action: "skip",
      message:
        "skipped: set PLAID_CLIENT_ID / PLAID_SECRET (Plaid Sandbox keys) and PLAID_ENV=sandbox to run this check.",
    };
  if (!env.PLAID_ENV)
    return {
      action: "refuse",
      message:
        "refused: PLAID_ENV is not set. This check only runs with PLAID_ENV=sandbox.",
    };
  return { action: "run", message: "" };
}

class StepError extends Error {}
type Options = {
  log?: (line: string) => void;
  attempts?: number;
  delayMs?: number;
};

export async function sandboxCheck(provider: Banking, options: Options = {}) {
  const log = options.log || console.log,
    attempts = options.attempts ?? 8,
    delayMs = options.delayMs ?? 3000;
  if (provider.environment !== "sandbox")
    throw new StepError("The bank provider is not in sandbox mode.");
  // A token minted by /sandbox/public_token/create never appears in a Link session,
  // so Link-event verification is switched off for this isolated run only.
  const banking: Banking = { ...provider, verifyLinkEvents: false };
  const db = await localDatabase(); // in-memory PGlite; never DATABASE_URL
  let pass = 0,
    cleanup: (() => Promise<unknown>) | null = null;
  const ok = (line: string) => {
    pass++;
    log("  ok    " + line);
  };
  try {
    for (const sql of (
      await readFile(new URL("../server/schema.sql", import.meta.url), "utf8")
    )
      .split(";")
      .filter((s) => s.trim()))
      await db.query(sql);
    const http = request(createApp(db, { banking }));
    let token = "";
    const api = async (
      step: string,
      method: "get" | "post" | "delete",
      path: string,
      body?: unknown,
    ) => {
      const r = await http[method]("/api" + path)
        .set(token ? { Authorization: "Bearer " + token } : {})
        .send(body as object);
      if (r.status >= 400)
        throw new StepError(
          `${step}: HTTP ${r.status} ${r.body?.error || ""}`.trim(),
        );
      return r.body;
    };
    const workspace = await api("open workspace", "post", "/workspace", {});
    token = workspace.token;
    const state = await api("bank status", "get", "/bank");
    if (!state.configured || state.environment !== "sandbox")
      throw new StepError("bank status: the API does not report sandbox mode");
    ok(
      `API reports bank linking configured (sandbox); web redirect URI ${banking.webRedirect ? "set" : "not set (optional in sandbox)"}`,
    );

    const session = await api("create link token", "post", "/bank/link-token", {
      platform: "web",
      consent: true,
    });
    ok("POST /api/bank/link-token created a Link session");

    let created: any;
    try {
      created = await banking.call("/sandbox/public_token/create", {
        institution_id: institution,
        initial_products: ["transactions"],
      });
    } catch (e) {
      throw new StepError(
        "create sandbox public token: " +
          (e instanceof BankError && e.code
            ? e.code
            : "provider request failed"),
      );
    }
    if (typeof created?.public_token !== "string")
      throw new StepError("create sandbox public token: no token returned");
    ok(`Plaid Sandbox issued a public token for test bank ${institution}`);

    const link = await api(
      "complete link",
      "post",
      "/bank/link/" + session.id + "/complete",
      { publicToken: created.public_token },
    );
    // Best effort: do not leave the Sandbox Item behind if a later step fails.
    cleanup = () =>
      http
        .delete("/api/bank/links/" + link.id)
        .set({ Authorization: "Bearer " + token });
    ok("POST /api/bank/link/:id/complete exchanged and stored the connection");

    const listAll = async () => {
      const all: any[] = [];
      for (let offset: number | null = 0; offset !== null;) {
        const pageData: any = await api(
          "list transactions",
          "get",
          "/bank/transactions?offset=" + offset,
        );
        all.push(...pageData.transactions);
        offset = pageData.nextOffset;
      }
      return all;
    };
    // A new Item can return an empty first sync while Plaid prepares its history.
    let transactions: any[] = [],
      syncs = 0;
    while (syncs < attempts && !transactions.length) {
      if (syncs) await new Promise((r) => setTimeout(r, delayMs));
      await api("sync", "post", "/bank/links/" + link.id + "/sync", {});
      syncs++;
      transactions = await listAll();
    }
    const accounts = (await api("bank status", "get", "/bank")).accounts.length;
    if (!transactions.length)
      throw new StepError(
        `sync: ${syncs} sync call(s) succeeded but Plaid returned no transactions yet (${accounts} account(s)). Re-run in a minute.`,
      );
    ok(
      `POST /api/bank/links/:id/sync stored ${accounts} account(s) and ${transactions.length} transaction(s) after ${syncs} sync call(s)`,
    );

    const candidate = transactions.find(
      (t) => !t.pending && t.amount_minor > 0 && t.currency === "USD",
    );
    let imported = 0;
    if (candidate) {
      const group = await api("create group", "post", "/groups", {
        name: "Sandbox check",
        currency: "USD",
      });
      const member = (
        await api("read group", "get", "/groups/" + group.id)
      ).members.find((m: any) => m.user_id === workspace.user.id);
      await api(
        "import transaction",
        "post",
        "/bank/transactions/" + candidate.id + "/import",
        {
          groupId: group.id,
          revision: candidate.revision,
          expense: {
            title: "Sandbox purchase",
            amountMinor: candidate.amount_minor,
            paidBy: member.id,
            splits: [
              { memberId: member.id, amountMinor: candidate.amount_minor },
            ],
            category: "Other",
            spentOn: candidate.spent_on,
          },
        },
      );
      imported = 1;
      ok(
        "POST /api/bank/transactions/:id/import shared one purchase as an expense",
      );
    } else log("  note  no posted USD purchase to import; import step not run");

    cleanup = null;
    await api("disconnect", "delete", "/bank/links/" + link.id);
    const left = (await listAll()).length;
    if (left)
      throw new StepError(`disconnect: ${left} transaction(s) still listed`);
    ok(
      "DELETE /api/bank/links/:id removed the Sandbox Item and private bank data",
    );
    return {
      pass,
      accounts,
      transactions: transactions.length,
      imported,
      syncs,
    };
  } finally {
    if (cleanup) await cleanup().catch(() => {});
    await db.close();
  }
}

async function main() {
  await import("dotenv/config");
  const env = process.env,
    plan = preflight(env);
  if (plan.action !== "run") {
    console.log("bank:sandbox-check " + plan.message);
    return plan.action === "skip" ? 0 : 1;
  }
  if (env.BANK_TOKEN_ENCRYPTION_KEY) {
    try {
      new BankVault(env.BANK_TOKEN_ENCRYPTION_KEY);
    } catch {
      console.log(
        "bank:sandbox-check FAIL: BANK_TOKEN_ENCRYPTION_KEY is not 32 bytes of base64. Generate one with:\n  node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"",
      );
      return 1;
    }
  } else {
    // The database is discarded, so a throwaway key is enough for this run.
    env.BANK_TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("base64");
    console.log(
      "  note  BANK_TOKEN_ENCRYPTION_KEY is not set; using a throwaway key for this run. The app itself still needs one.",
    );
  }
  const banking = configuredBanking();
  if (!banking) {
    console.log("bank:sandbox-check FAIL: bank configuration is incomplete.");
    return 1;
  }
  console.log(
    "bank:sandbox-check: Plaid Sandbox, isolated in-memory database, fake data only",
  );
  try {
    const r = await sandboxCheck(banking);
    console.log(
      `bank:sandbox-check PASS: ${r.pass} steps, ${r.accounts} account(s), ${r.transactions} transaction(s), ${r.imported} imported, Sandbox Item removed`,
    );
    return 0;
  } catch (e) {
    console.log(
      "bank:sandbox-check FAIL at " +
        (e instanceof StepError
          ? e.message
          : "unexpected error: " + (e as Error).message),
    );
    return 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href)
  main().then((code) => {
    process.exitCode = code;
  });
