import { test } from "node:test";
import { URL } from "node:url";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import request from "supertest";
import { localDatabase } from "../server/db";
import { createApp } from "../server/app";
import { BankVault, BankError, type Banking } from "../server/bank-provider";
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
