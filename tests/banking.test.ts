import { test } from "node:test";
import { URL } from "node:url";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import request from "supertest";
import { localDatabase } from "../server/db";
import { createApp } from "../server/app";
import {
  BankVault,
  BankError,
  bankingProblems,
  type Banking,
} from "../server/bank-provider";
import { preflight, sandboxCheck } from "../scripts/bank-sandbox-check";
const auth = (token: string) => ({ Authorization: "Bearer " + token });
const account = {
  account_id: "account-private",
  name: "Test checking",
  mask: "1234",
  type: "depository",
  subtype: "checking",
  balances: { available: 99999 },
};
const transaction = (overrides: any = {}) => ({
  transaction_id: "purchase-1",
  account_id: account.account_id,
  name: "Private merchant",
  amount: 90,
  iso_currency_code: "USD",
  date: "2026-11-10",
  pending: false,
  ...overrides,
});
const page = (overrides: any = {}) => ({
  accounts: [account],
  added: [],
  modified: [],
  removed: [],
  has_more: false,
  next_cursor: "cursor-1",
  ...overrides,
});
async function setup(configured = true) {
  const db = await localDatabase();
  for (const sql of (
    await readFile(new URL("../server/schema.sql", import.meta.url), "utf8")
  )
    .split(";")
    .filter((x) => x.trim()))
    await db.query(sql);
  let n = 0;
  const calls: { path: string; body: any }[] = [];
  const mock = {
    sync: async (_body: any): Promise<any> => page({ added: [transaction()] }),
    remove: async (): Promise<any> => ({ removed: true }),
    verify: true,
  };
  const banking: Banking = {
    environment: "sandbox",
    vault: new BankVault(randomBytes(32).toString("base64")),
    webRedirect: "https://fairshare.example/",
    iosRedirect: "https://fairshare.example/bank-oauth",
    androidPackage: "app.fairshare.mobile",
    async call(path, body) {
      calls.push({ path, body });
      if (path === "/link/token/create")
        return {
          link_token: "link-test-" + ++n,
          expiration: new Date(Date.now() + 3600000).toISOString(),
        };
      if (path === "/link/token/get")
        return {
          link_sessions: mock.verify
            ? [
                {
                  results: {
                    item_add_results: [
                      {
                        public_token: String(body.link_token).replace(
                          "link-",
                          "public-",
                        ),
                      },
                    ],
                  },
                },
              ]
            : [],
        };
      if (path === "/item/public_token/exchange")
        return {
          access_token: "access-" + body.public_token,
          item_id: "item-" + body.public_token,
        };
      if (path === "/transactions/sync") return mock.sync(body);
      if (path === "/item/remove") return mock.remove();
      throw new Error("Unexpected provider call " + path);
    },
  };
  const http = request(createApp(db, { banking: configured ? banking : null }));
  const owner = (await http.post("/api/workspace").send({}).expect(201)).body;
  const other = (await http.post("/api/workspace").send({}).expect(201)).body;
  const group = (
    await http
      .post("/api/groups")
      .set(auth(owner.token))
      .send({ name: "Local test group", currency: "USD" })
      .expect(201)
  ).body;
  const invite = (
    await db.query("SELECT invite_token FROM groups WHERE id=$1", [group.id])
  ).rows[0].invite_token;
  await http
    .post("/api/groups/join")
    .set(auth(other.token))
    .send({ inviteToken: invite })
    .expect(200);
  const full = (
    await http
      .get("/api/groups/" + group.id)
      .set(auth(owner.token))
      .expect(200)
  ).body;
  const expense = {
    title: "Reviewed shared dinner",
    amountMinor: 9000,
    paidBy: full.members.find((m: any) => m.user_id === owner.user.id).id,
    splits: full.members.map((m: any) => ({
      memberId: m.id,
      amountMinor: 9000 / full.members.length,
    })),
    category: "Food & drink",
    spentOn: "2026-11-10",
  };
  async function link() {
    const s = (
      await http
        .post("/api/bank/link-token")
        .set(auth(owner.token))
        .send({ platform: "web", consent: true })
        .expect(200)
    ).body;
    const publicToken = s.linkToken.replace("link-", "public-");
    const l = (
      await http
        .post("/api/bank/link/" + s.id + "/complete")
        .set(auth(owner.token))
        .send({ publicToken })
        .expect(200)
    ).body;
    return { ...l, session: s, publicToken };
  }
  const sync = (id: string) =>
    http
      .post("/api/bank/links/" + id + "/sync")
      .set(auth(owner.token))
      .send({});
  const list = () => http.get("/api/bank/transactions").set(auth(owner.token));
  return {
    db,
    http,
    owner,
    other,
    group,
    full,
    expense,
    banking,
    calls,
    mock,
    link,
    sync,
    list,
  };
}
test("bank vault encrypts with authenticated owner context and rejects tampering", () => {
  const a = new BankVault(randomBytes(32).toString("base64")),
    b = new BankVault(randomBytes(32).toString("base64"));
  const sealed = a.seal("access-secret", "owner-1");
  assert.ok(!sealed.includes("access-secret"));
  assert.equal(a.open(sealed, "owner-1"), "access-secret");
  assert.throws(() => a.open(sealed, "owner-2"));
  assert.throws(() => b.open(sealed, "owner-1"));
  assert.notEqual(a.seal("access-secret", "owner-1"), sealed);
  assert.throws(() => new BankVault("bad"));
});
test("unconfigured banks require a workspace and show an explicit unavailable state", async () => {
  const x = await setup(false);
  try {
    await x.http.get("/api/bank").expect(401);
    const s = (
      await x.http.get("/api/bank").set(auth(x.owner.token)).expect(200)
    ).body;
    assert.equal(s.configured, false);
    assert.deepEqual(s.links, []);
    await x.http
      .post("/api/bank/link-token")
      .set(auth(x.owner.token))
      .send({ platform: "web", consent: true })
      .expect(503);
    assert.equal(x.calls.length, 0);
  } finally {
    await x.db.close();
  }
});
test("Link is Transactions-only, owner-bound, verified, encrypted and idempotent", async () => {
  const x = await setup();
  try {
    await x.http
      .post("/api/bank/link-token")
      .set(auth(x.owner.token))
      .send({ platform: "web", consent: false })
      .expect(400);
    const s = (
      await x.http
        .post("/api/bank/link-token")
        .set(auth(x.owner.token))
        .send({ platform: "web", consent: true })
        .expect(200)
    ).body;
    assert.deepEqual(x.calls[0].body.products, ["transactions"]);
    assert.deepEqual(x.calls[0].body.country_codes, ["US"]);
    assert.equal(x.calls[0].body.user.client_user_id, x.owner.user.id);
    const secret = (
      await x.db.query(
        "SELECT token_ciphertext FROM bank_link_sessions WHERE id=$1",
        [s.id],
      )
    ).rows[0].token_ciphertext;
    assert.ok(!secret.includes(s.linkToken));
    const p = s.linkToken.replace("link-", "public-");
    await x.http
      .post("/api/bank/link/" + s.id + "/complete")
      .set(auth(x.other.token))
      .send({ publicToken: p })
      .expect(404);
    await x.http
      .post("/api/bank/link/" + s.id + "/complete")
      .set(auth(x.owner.token))
      .send({ publicToken: "public-unrelated" })
      .expect(409);
    x.mock.verify = false;
    await x.http
      .post("/api/bank/link/" + s.id + "/complete")
      .set(auth(x.owner.token))
      .send({ publicToken: p })
      .expect(409);
    x.mock.verify = true;
    const a = (
      await x.http
        .post("/api/bank/link/" + s.id + "/complete")
        .set(auth(x.owner.token))
        .send({ publicToken: p })
        .expect(200)
    ).body;
    const b = (
      await x.http
        .post("/api/bank/link/" + s.id + "/complete")
        .set(auth(x.owner.token))
        .send({ publicToken: p })
        .expect(200)
    ).body;
    assert.equal(a.id, b.id);
    assert.equal(b.replayed, true);
    assert.equal(
      x.calls.filter((c) => c.path === "/item/public_token/exchange").length,
      1,
    );
    const stored = (await x.db.query("SELECT token_ciphertext FROM bank_links"))
      .rows[0];
    assert.ok(!stored.token_ciphertext.includes("access-"));
    const state = (await x.http.get("/api/bank").set(auth(x.owner.token))).body;
    assert.ok(!JSON.stringify(state).includes("token"));
    assert.ok(!JSON.stringify(state).includes("item-"));
    const native = (
      await x.http
        .post("/api/bank/link-token")
        .set(auth(x.owner.token))
        .send({ platform: "android", consent: true })
        .expect(200)
    ).body;
    assert.ok(native.linkToken);
    const last = x.calls.at(-1)!.body;
    assert.equal(last.android_package_name, "app.fairshare.mobile");
    assert.equal(last.redirect_uri, undefined);
  } finally {
    await x.db.close();
  }
});
test("private transactions stay invisible to group members and agent credentials", async () => {
  const x = await setup();
  try {
    const l = await x.link();
    await x.sync(l.id).expect(200);
    const own = (await x.list().expect(200)).body.transactions;
    assert.equal(own.length, 1);
    assert.equal(own[0].amount_minor, 9000);
    assert.ok(!JSON.stringify(own).includes("provider_transaction"));
    assert.ok(!JSON.stringify(own).includes("available"));
    const otherState = (await x.http.get("/api/bank").set(auth(x.other.token)))
      .body;
    assert.deepEqual(otherState.links, []);
    assert.deepEqual(otherState.accounts, []);
    assert.deepEqual(
      (await x.http.get("/api/bank/transactions").set(auth(x.other.token))).body
        .transactions,
      [],
    );
    await x.http
      .post("/api/bank/links/" + l.id + "/sync")
      .set(auth(x.other.token))
      .send({})
      .expect(404);
    await x.http
      .delete("/api/bank/links/" + l.id)
      .set(auth(x.other.token))
      .expect(404);
    await x.http
      .post("/api/bank/transactions/" + own[0].id + "/import")
      .set(auth(x.other.token))
      .send({
        groupId: x.group.id,
        revision: own[0].revision,
        expense: x.expense,
      })
      .expect(404);
    const agent = (
      await x.http
        .post("/api/groups/" + x.group.id + "/agents")
        .set(auth(x.owner.token))
        .send({ name: "Test agent" })
        .expect(201)
    ).body;
    await x.http.get("/api/bank").set(auth(agent.key)).expect(401);
    await x.http.get("/api/bank/transactions").set(auth(agent.key)).expect(401);
    const group = (
      await x.http.get("/api/groups/" + x.group.id).set(auth(x.owner.token))
    ).body;
    assert.equal(group.members.length, 2);
    assert.equal(group.expenses.length, 0);
    assert.ok(!JSON.stringify(group).includes("Private merchant"));
    assert.ok(!JSON.stringify(group).includes("account-private"));
  } finally {
    await x.db.close();
  }
});
test("sync atomically paginates, retries mutations, updates pending/posted and rolls back failures", async () => {
  const x = await setup();
  try {
    const l = await x.link();
    x.mock.sync = async () =>
      page({
        added: [transaction({ transaction_id: "pending-1", pending: true })],
        next_cursor: "initial",
      });
    await x.sync(l.id).expect(200);
    let attempt = 0;
    const cursors: any[] = [];
    x.mock.sync = async (body) => {
      cursors.push(body.cursor);
      if (body.cursor === "initial") {
        attempt++;
        return page({
          added: [transaction({ pending_transaction_id: "pending-1" })],
          next_cursor: "page-2",
          has_more: true,
        });
      }
      if (attempt === 1)
        throw new BankError(
          503,
          "retry",
          "TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION",
        );
      return page({
        removed: [{ transaction_id: "pending-1" }],
        next_cursor: "finished",
      });
    };
    await x.sync(l.id).expect(200);
    assert.deepEqual(cursors, ["initial", "page-2", "initial", "page-2"]);
    const t = (await x.list()).body.transactions;
    assert.equal(t.length, 1);
    assert.equal(t[0].pending, false);
    x.mock.sync = async () =>
      page({
        modified: [transaction({ amount: 95 })],
        next_cursor: "modified",
      });
    await x.sync(l.id).expect(200);
    const changed = (await x.list()).body.transactions[0];
    assert.equal(changed.id, t[0].id);
    assert.equal(changed.amount_minor, 9500);
    assert.ok(changed.revision > t[0].revision);
    x.mock.sync = async (body) => {
      if (body.cursor === "modified")
        return page({
          added: [transaction({ transaction_id: "must-rollback" })],
          next_cursor: "badpage",
          has_more: true,
        });
      throw new BankError(503, "Temporary error");
    };
    await x.sync(l.id).expect(503);
    assert.equal((await x.list()).body.transactions.length, 1);
    assert.equal(
      (await x.db.query("SELECT cursor FROM bank_links WHERE id=$1", [l.id]))
        .rows[0].cursor,
      "modified",
    );
  } finally {
    await x.db.close();
  }
});
test("review validates current purchase, membership, currency and splits, and prevents concurrent duplicate imports", async () => {
  const x = await setup();
  try {
    const l = await x.link();
    await x.sync(l.id).expect(200);
    let t = (await x.list()).body.transactions[0];
    const post = (payload: any) =>
      x.http
        .post("/api/bank/transactions/" + t.id + "/import")
        .set(auth(x.owner.token))
        .send(payload);
    const data = () => ({
      groupId: x.group.id,
      revision: t.revision,
      expense: x.expense,
    });
    await post({ ...data(), revision: 999 }).expect(409);
    await post({
      ...data(),
      expense: { ...x.expense, amountMinor: 8000 },
    }).expect(409);
    await post({
      ...data(),
      expense: {
        ...x.expense,
        splits: [{ memberId: "outsider", amountMinor: 9000 }],
      },
    }).expect(400);
    await post({ ...data(), groupId: "not-a-member" }).expect(404);
    const euro = (
      await x.http
        .post("/api/groups")
        .set(auth(x.owner.token))
        .send({ name: "Euro test", currency: "EUR" })
    ).body;
    await post({ ...data(), groupId: euro.id }).expect(400);
    x.mock.sync = async () =>
      page({ modified: [transaction({ pending: true })] });
    await x.sync(l.id).expect(200);
    t = (await x.list()).body.transactions[0];
    await post(data()).expect(409);
    x.mock.sync = async () => page({ modified: [transaction()] });
    await x.sync(l.id).expect(200);
    t = (await x.list()).body.transactions[0];
    const results = await Promise.all([post(data()), post(data())]);
    assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
    assert.equal(
      (await x.db.query("SELECT count(*)::int n FROM expenses")).rows[0].n,
      1,
    );
    assert.ok((await x.list()).body.transactions[0].imported_expense_id);
    x.mock.sync = async () =>
      page({ modified: [transaction({ amount: 100 })] });
    await x.sync(l.id).expect(200);
    assert.equal(
      (await x.db.query("SELECT amount_minor FROM expenses")).rows[0]
        .amount_minor,
      9000,
    );
  } finally {
    await x.db.close();
  }
});
test("revoked links need attention and disconnect retries retain only the secrets needed to revoke", async () => {
  const x = await setup();
  try {
    const l = await x.link();
    await x.sync(l.id).expect(200);
    const t = (await x.list()).body.transactions[0];
    await x.http
      .post("/api/bank/transactions/" + t.id + "/import")
      .set(auth(x.owner.token))
      .send({ groupId: x.group.id, revision: t.revision, expense: x.expense })
      .expect(201);
    x.mock.sync = async () => {
      throw new BankError(
        503,
        "Provider details must stay private",
        "ITEM_LOGIN_REQUIRED",
      );
    };
    const attention = await x.sync(l.id).expect(409);
    assert.ok(!attention.text.includes("Provider details"));
    assert.equal(
      (await x.http.get("/api/bank").set(auth(x.owner.token))).body.links[0]
        .status,
      "attention",
    );
    x.mock.remove = async () => {
      throw new BankError(503, "Temporary outage");
    };
    await x.http
      .delete("/api/bank/links/" + l.id)
      .set(auth(x.owner.token))
      .expect(503);
    const pending = (
      await x.db.query("SELECT * FROM bank_links WHERE id=$1", [l.id])
    ).rows[0];
    assert.equal(pending.status, "disconnecting");
    assert.ok(pending.token_ciphertext);
    await x.sync(l.id).expect(409);
    assert.deepEqual((await x.list()).body.transactions, []);
    x.mock.remove = async () => ({});
    await x.http
      .delete("/api/bank/links/" + l.id)
      .set(auth(x.owner.token))
      .expect(200);
    const removed = (
      await x.db.query("SELECT * FROM bank_links WHERE id=$1", [l.id])
    ).rows[0];
    assert.equal(removed.token_ciphertext, null);
    assert.equal(removed.cursor, null);
    assert.equal(removed.provider_item_id, null);
    for (const table of [
      "bank_accounts",
      "bank_transactions",
      "bank_link_sessions",
    ])
      assert.equal(
        (await x.db.query("SELECT count(*)::int n FROM " + table)).rows[0].n,
        0,
      );
    assert.equal(
      (await x.db.query("SELECT count(*)::int n FROM expenses")).rows[0].n,
      1,
    );
    // The minimal keyed import tombstone prevents a provider-ID replay after reconnect.
    const next = await x.link();
    x.mock.sync = async () => page({ added: [transaction()] });
    await x.sync(next.id).expect(200);
    const again = (await x.list()).body.transactions[0];
    assert.ok(again.imported_expense_id);
    await x.http
      .post("/api/bank/transactions/" + again.id + "/import")
      .set(auth(x.owner.token))
      .send({
        groupId: x.group.id,
        revision: again.revision,
        expense: x.expense,
      })
      .expect(409);
  } finally {
    await x.db.close();
  }
});

test("sandbox callback exchange needs an owned session; production still requires Link events", async () => {
  const s = await setup();
  try {
    s.banking.verifyLinkEvents = false;
    s.mock.verify = false;
    const start = (
      await s.http
        .post("/api/bank/link-token")
        .set(auth(s.owner.token))
        .send({ platform: "web", consent: true })
        .expect(200)
    ).body;
    const token = start.linkToken.replace("link-", "public-");
    await s.http
      .post("/api/bank/link/" + start.id + "/complete")
      .set(auth(s.other.token))
      .send({ publicToken: token })
      .expect(404);
    await s.http
      .post("/api/bank/link/" + start.id + "/complete")
      .set(auth(s.owner.token))
      .send({ publicToken: token })
      .expect(200);
    assert.equal(s.calls.filter((c) => c.path === "/link/token/get").length, 0);
    s.banking.environment = "production";
    const live = (
      await s.http
        .post("/api/bank/link-token")
        .set(auth(s.owner.token))
        .send({ platform: "web", consent: true })
        .expect(200)
    ).body;
    await s.http
      .post("/api/bank/link/" + live.id + "/complete")
      .set(auth(s.owner.token))
      .send({ publicToken: live.linkToken.replace("link-", "public-") })
      .expect(409);
    assert.equal(s.calls.filter((c) => c.path === "/link/token/get").length, 1);
  } finally {
    await s.db.close();
  }
});
test("sandbox web Link works without a redirect URI; production and iOS still require one", async () => {
  const x = await setup();
  try {
    const start = (platform: string) =>
      x.http
        .post("/api/bank/link-token")
        .set(auth(x.owner.token))
        .send({ platform, consent: true });
    const platforms = async () =>
      (await x.http.get("/api/bank").set(auth(x.owner.token)).expect(200)).body
        .platforms;
    await start("web").expect(200);
    assert.equal(
      x.calls.at(-1)!.body.redirect_uri,
      "https://fairshare.example/",
    );
    x.banking.webRedirect = "";
    x.banking.iosRedirect = undefined;
    assert.deepEqual(await platforms(), {
      web: true,
      ios: false,
      android: true,
    });
    await start("web").expect(200);
    assert.equal(x.calls.at(-1)!.path, "/link/token/create");
    assert.ok(!("redirect_uri" in x.calls.at(-1)!.body));
    assert.ok(!("android_package_name" in x.calls.at(-1)!.body));
    const before = x.calls.length;
    await start("ios").expect(503);
    x.banking.environment = "production";
    assert.equal((await platforms()).web, false);
    await start("web").expect(503);
    assert.equal(x.calls.length, before);
  } finally {
    await x.db.close();
  }
});
test("bank configuration problems are named without values", () => {
  const key = randomBytes(32).toString("base64");
  const env = {
    PLAID_ENV: "sandbox",
    PLAID_CLIENT_ID: "client-value",
    PLAID_SECRET: "secret-value",
    BANK_TOKEN_ENCRYPTION_KEY: key,
  };
  assert.deepEqual(bankingProblems(env), []);
  assert.deepEqual(
    bankingProblems({}).map((p) => p.split(" ")[0]),
    [
      "PLAID_CLIENT_ID",
      "PLAID_SECRET",
      "PLAID_ENV",
      "BANK_TOKEN_ENCRYPTION_KEY",
    ],
  );
  const bad = bankingProblems({
    ...env,
    PLAID_ENV: "production",
    BANK_TOKEN_ENCRYPTION_KEY: "short-secret-key",
  }).join(" ");
  assert.match(bad, /PLAID_LINK_EVENTS_ENABLED/);
  assert.match(bad, /BANK_TOKEN_ENCRYPTION_KEY/);
  assert.ok(!bad.includes("short-secret-key"));
});
test("sandbox check skips without credentials and refuses outside sandbox", () => {
  const keys = {
    PLAID_CLIENT_ID: "client-value",
    PLAID_SECRET: "secret-value",
  };
  const skipped = preflight({});
  assert.equal(skipped.action, "skip");
  assert.match(skipped.message, /skipped: set PLAID_CLIENT_ID \/ PLAID_SECRET/);
  assert.equal(preflight({ PLAID_ENV: "sandbox" }).action, "skip");
  assert.equal(preflight({ PLAID_ENV: "sandbox", ...keys }).action, "run");
  assert.equal(preflight(keys).action, "refuse");
  assert.equal(preflight({ PLAID_ENV: "production" }).action, "refuse");
  const refused = preflight({ PLAID_ENV: "production", ...keys });
  assert.equal(refused.action, "refuse");
  assert.ok(!refused.message.includes("secret-value"));
});
test("sandbox check drives link, exchange, sync, import and disconnect through the API without printing tokens", async () => {
  const x = await setup();
  await x.db.close();
  x.banking.verifyLinkEvents = true;
  x.banking.webRedirect = undefined;
  let syncs = 0;
  x.mock.sync = async () =>
    ++syncs === 1
      ? page({ accounts: [], next_cursor: "" })
      : page({
          added: [
            transaction(),
            transaction({ transaction_id: "pending-1", pending: true }),
          ],
        });
  const base = x.banking.call;
  const banking: Banking = {
    ...x.banking,
    call: async (path, body) => {
      if (path !== "/sandbox/public_token/create") return base(path, body);
      x.calls.push({ path, body });
      return { public_token: "public-sandbox-check-token" };
    },
  };
  const lines: string[] = [];
  const result = await sandboxCheck(banking, {
    log: (l) => lines.push(l),
    delayMs: 0,
  });
  assert.deepEqual(result, {
    pass: 7,
    accounts: 1,
    transactions: 2,
    imported: 1,
    syncs: 2,
  });
  assert.deepEqual(
    x.calls.map((c) => c.path),
    [
      "/link/token/create",
      "/sandbox/public_token/create",
      "/item/public_token/exchange",
      "/transactions/sync",
      "/transactions/sync",
      "/item/remove",
    ],
  );
  assert.deepEqual(x.calls[1].body, {
    institution_id: "ins_109508",
    initial_products: ["transactions"],
  });
  assert.doesNotMatch(
    lines.join("\n"),
    /public-sandbox|link-test|access-|1234/,
  );
  // A step failure is reported by name and still removes the Sandbox Item.
  x.mock.sync = async () => {
    throw new BankError(503, "provider detail", "INTERNAL_SERVER_ERROR");
  };
  await assert.rejects(
    sandboxCheck(banking, { log: () => {}, delayMs: 0 }),
    /sync: HTTP 503/,
  );
  assert.equal(x.calls.at(-1)!.path, "/item/remove");
  await assert.rejects(
    sandboxCheck({ ...banking, environment: "production" }, { log: () => {} }),
    /not in sandbox mode/,
  );
});
