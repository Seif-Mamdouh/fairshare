import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import request from "supertest";
import { createServer } from "node:http";
import { convertRewrites } from "@vercel/routing-utils";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { localDatabase } from "../server/db";
import { createApp } from "../server/app";
const auth = (key: string) => ({ Authorization: `Bearer ${key}` });
const rpc = (method: string, params: unknown = {}, id = 1) => ({
  jsonrpc: "2.0",
  id,
  method,
  params,
});
const init = rpc("initialize", {
  protocolVersion: "2025-03-26",
  capabilities: {},
  clientInfo: { name: "fairshare-test", version: "1.0.0" },
});
async function setup() {
  const db = await localDatabase();
  for (const sql of (await readFile("server/schema.sql", "utf8"))
    .split(";")
    .filter((s) => s.trim()))
    await db.query(sql);
  const app = createApp(db, { banking: null }),
    http = request(app);
  const owner = (await http.post("/api/workspace").send({}).expect(201)).body;
  const groups: any[] = [];
  for (const name of ["First private group", "Second private group"]) {
    const group = (
      await http
        .post("/api/groups")
        .set(auth(owner.token))
        .send({ name, currency: "USD" })
        .expect(201)
    ).body;
    const agent = (
      await http
        .post(`/api/groups/${group.id}/agents`)
        .set(auth(owner.token))
        .send({ name: "Receipt assistant" })
        .expect(201)
    ).body;
    const detail = (
      await http
        .get(`/api/groups/${group.id}`)
        .set(auth(owner.token))
        .expect(200)
    ).body;
    groups.push({ group, agent, detail });
  }
  const post = (key: string, body: object) =>
    http
      .post("/api/mcp")
      .set(auth(key))
      .set("Accept", "application/json, text/event-stream")
      .send(body);
  return { db, app, http, owner, groups, post };
}

test("hosted MCP initializes and lists the same bounded tools without transport sessions", async () => {
  const s = await setup();
  try {
    const key = s.groups[0].agent.key;
    const initialized = await s.post(key, init).expect(200);
    assert.equal(initialized.body.result.serverInfo.name, "fairshare-receipts");
    assert.equal(initialized.headers["mcp-session-id"], undefined);
    assert.match(initialized.headers["content-type"], /application\/json/);
    await s
      .post(key, { jsonrpc: "2.0", method: "notifications/initialized" })
      .expect(202);
    const list = await s.post(key, rpc("tools/list")).expect(200);
    assert.deepEqual(list.body.result.tools.map((t: any) => t.name).sort(), [
      "finalize_receipts",
      "get_group_context",
      "get_receipt_status",
      "list_receipt_drafts",
      "submit_receipt",
    ]);
    assert.equal(
      list.body.result.tools.find((t: any) => t.name === "submit_receipt")
        .annotations.idempotentHint,
      true,
    );
    const malformed = await s.post(key, { jsonrpc: "invalid" }).expect(400);
    assert.ok(malformed.body.error);
    const unknown = await s.post(key, rpc("invented/method")).expect(200);
    assert.equal(unknown.body.error.code, -32601);
    await s.http
      .post("/api/mcp")
      .set(auth(key))
      .set("Accept", "text/plain")
      .send(init)
      .expect(406);
    await s
      .post(key, rpc("tools/list"))
      .set("MCP-Protocol-Version", "1900-01-01")
      .expect(400);
    await s.http.get("/api/mcp").set(auth(key)).expect(405);
    await s.http.delete("/api/mcp").set(auth(key)).expect(405);
  } finally {
    await s.db.close();
  }
});

test("MCP reauthenticates each request, rejects workspace/cookie/query credentials, and preserves origin checks", async () => {
  const s = await setup();
  try {
    const { group, agent } = s.groups[0];
    await s.http.post("/api/mcp").send(init).expect(401);
    await s.post(s.owner.token, init).expect(401);
    await s.http
      .post("/api/mcp")
      .set("Cookie", `fairshare_session=${agent.key}`)
      .send(init)
      .expect(401);
    await s.http
      .post(`/api/mcp?token=${encodeURIComponent(agent.key)}`)
      .send(init)
      .expect(401);
    await s.http
      .post("/api/mcp?unexpected=1")
      .set(auth(agent.key))
      .send(init)
      .expect(400);
    await s
      .post(agent.key, init)
      .set("Origin", "https://attacker.example")
      .expect(403);
    await s.http
      .options("/api/mcp")
      .set("Origin", "https://attacker.example")
      .expect(403);
    const preflight = await s.http
      .options("/api/mcp")
      .set("Origin", "http://localhost:8081")
      .expect(204);
    assert.match(
      preflight.headers["access-control-allow-headers"],
      /MCP-Protocol-Version/,
    );
    await s.post(agent.key, init).expect(200);
    await s.http
      .delete(`/api/groups/${group.id}/agents/${agent.id}`)
      .set(auth(s.owner.token))
      .expect(200);
    await s.post(agent.key, rpc("tools/list")).expect(401);
    await s
      .post(
        agent.key,
        rpc("tools/call", { name: "get_group_context", arguments: {} }),
      )
      .expect(401);
  } finally {
    await s.db.close();
  }
});

test("official MCP client calls hosted tools across isolated groups and idempotent human-review receipts", async () => {
  const s = await setup();
  const server = s.app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address() as { port: number };
  const clients: Client[] = [];
  try {
    for (const { agent } of s.groups) {
      const client = new Client({
        name: "official-sdk-check",
        version: "1.0.0",
      });
      await client.connect(
        new StreamableHTTPClientTransport(
          new URL(`http://127.0.0.1:${address.port}/api/mcp`),
          { requestInit: { headers: auth(agent.key) } },
        ),
      );
      clients.push(client);
    }
    const result = (value: any) => JSON.parse(value.content[0].text);
    const context = result(
      await clients[0].callTool({ name: "get_group_context", arguments: {} }),
    );
    assert.equal(context.group.id, s.groups[0].group.id);
    assert.deepEqual(Object.keys(context.group).sort(), [
      "currency",
      "id",
      "name",
    ]);
    assert.deepEqual(Object.keys(context.members[0]).sort(), ["id", "name"]);
    assert.equal(
      JSON.stringify(context).includes(s.groups[1].group.name),
      false,
    );
    assert.ok(
      (
        await s.db.query("SELECT last_used_at FROM agents WHERE id=$1", [
          s.groups[0].agent.id,
        ])
      ).rows[0].last_used_at,
    );
    const receipt = {
      sourceId: "mcp-draft",
      title: "Reviewed dinner",
      amountMinor: 1234,
      currency: "USD",
      paidBy: context.members[0].id,
      splits: [{ memberId: context.members[0].id, amountMinor: 1234 }],
      spentOn: "2026-11-10",
      category: "Food & drink",
    };
    const submitted = result(
      await clients[0].callTool({ name: "submit_receipt", arguments: receipt }),
    );
    assert.equal(submitted.status, "pending");
    const replay = result(
      await clients[0].callTool({ name: "submit_receipt", arguments: receipt }),
    );
    assert.equal(replay.id, submitted.id);
    assert.equal(replay.replayed, true);
    assert.equal(
      (await s.db.query("SELECT count(*)::int n FROM expenses")).rows[0].n,
      0,
    );
    const changed = await clients[0].callTool({
      name: "submit_receipt",
      arguments: { ...receipt, title: "Changed" },
    });
    assert.equal(changed.isError, true);
    assert.equal(result(changed).status, 409);
    const own = result(
      await clients[0].callTool({
        name: "get_receipt_status",
        arguments: { receiptId: submitted.id },
      }),
    );
    assert.equal(own.id, submitted.id);
    const other = await clients[1].callTool({
      name: "get_receipt_status",
      arguments: { receiptId: submitted.id },
    });
    assert.equal(other.isError, true);
    assert.equal(result(other).status, 404);
    const foreignMembers = await clients[1].callTool({
      name: "submit_receipt",
      arguments: receipt,
    });
    assert.equal(foreignMembers.isError, true);
    assert.equal(result(foreignMembers).status, 400);
    const invalid = await clients[0].callTool({
      name: "submit_receipt",
      arguments: { ...receipt, amountMinor: -1 },
    });
    assert.equal(invalid.isError, true);
    const drafts = result(
      await clients[0].callTool({ name: "list_receipt_drafts", arguments: {} }),
    );
    assert.equal(drafts.receipts[0].id, submitted.id);
    assert.equal(drafts.receipts[0].payload.amountMinor, 1234);
    assert.deepEqual(
      result(
        await clients[1].callTool({
          name: "list_receipt_drafts",
          arguments: {},
        }),
      ).receipts,
      [],
    );
    for (const args of [
      { receiptIds: [submitted.id] },
      { receiptIds: [submitted.id], userConfirmed: false },
    ]) {
      assert.equal(
        (
          await clients[0].callTool({
            name: "finalize_receipts",
            arguments: args,
          })
        ).isError,
        true,
      );
    }
    const finalize = {
      name: "finalize_receipts",
      arguments: { receiptIds: [submitted.id], userConfirmed: true },
    };
    assert.equal(result(await clients[1].callTool(finalize)).status, 404);
    const posted = await Promise.all([
      clients[0].callTool(finalize),
      clients[0].callTool(finalize),
    ]);
    const first = result(posted[0]).receipts[0],
      second = result(posted[1]).receipts[0];
    assert.equal(first.status, "approved");
    assert.equal(first.expenseId, second.expenseId);
    assert.deepEqual([first.replayed, second.replayed].sort(), [false, true]);
    const expenses = (await s.db.query("SELECT * FROM expenses")).rows;
    assert.equal(expenses.length, 1);
    assert.equal(expenses[0].amount_minor, receipt.amountMinor);
    assert.equal(expenses[0].paid_by, receipt.paidBy);
    assert.deepEqual(expenses[0].splits, receipt.splits);
    assert.equal(expenses[0].created_by, s.owner.user.id);
    assert.deepEqual(
      result(
        await clients[0].callTool({
          name: "list_receipt_drafts",
          arguments: {},
        }),
      ).receipts,
      [],
    );
    assert.equal(
      result(
        await clients[0].callTool({
          name: "get_receipt_status",
          arguments: { receiptId: submitted.id },
        }),
      ).expense_id,
      first.expenseId,
    );
    const after = (await clients[0].listTools()).tools;
    assert.equal(
      after.some((t) => /bank|approve|password|phone|settle/.test(t.name)),
      false,
    );
  } finally {
    await Promise.all(clients.map((c) => c.close()));
    await new Promise<void>((resolve, reject) =>
      server.close((e) => (e ? reject(e) : resolve())),
    );
    await s.db.close();
  }
});

test("MCP respects the existing shared agent request quota", async () => {
  const s = await setup();
  try {
    const key = s.groups[0].agent.key;
    // One successful REST request establishes the same quota consumed by MCP.
    await s.http.get("/api/v1/agent/context").set(auth(key)).expect(200);
    await s.db.query("UPDATE rate_limits SET hits=120");
    await s.post(key, init).expect(429);
  } finally {
    await s.db.close();
  }
});

test("agent posting batches are atomic, scoped, validated and safe against app review retries", async () => {
  const s = await setup();
  try {
    const { group, agent, detail } = s.groups[0];
    const payer = detail.members[0].id;
    const participant = (
      await s.http
        .post(`/api/groups/${group.id}/members`)
        .set(auth(s.owner.token))
        .send({ name: "Dinner guest" })
        .expect(201)
    ).body.id;
    const make = async (sourceId: string) =>
      (
        await s.http
          .post("/api/v1/agent/receipts")
          .set(auth(agent.key))
          .send({
            sourceId,
            title: "Dinner",
            amountMinor: 1000,
            currency: "USD",
            spentOn: "2026-11-10",
            paidBy: payer,
            splits: [{ memberId: participant, amountMinor: 1000 }],
          })
          .expect(201)
      ).body.id;
    const ids = [await make("batch-1"), await make("batch-2")].sort();
    const post = (
      receiptIds: string[],
      userConfirmed: unknown = true,
      key = agent.key,
    ) =>
      s.http
        .post("/api/v1/agent/receipts/finalize")
        .set(auth(key))
        .send({ receiptIds, userConfirmed });
    await post(ids, false).expect(400);
    await post([]).expect(400);
    await post([ids[0], ids[0]]).expect(400);
    // A later missing ID rolls back even an earlier successful insert.
    await post([ids[0], "zz-missing"]).expect(404);
    assert.equal(
      (await s.db.query("SELECT count(*)::int n FROM expenses")).rows[0].n,
      0,
    );
    const sameGroupAgent = (
      await s.http
        .post(`/api/groups/${group.id}/agents`)
        .set(auth(s.owner.token))
        .send({ name: "Another agent" })
        .expect(201)
    ).body;
    await post(ids, true, sameGroupAgent.key).expect(404);
    await post(ids, true, s.groups[1].agent.key).expect(404);
    // Current persisted fields must still validate when the user posts.
    await s.db.query(
      "UPDATE receipts SET payload=jsonb_set(payload,'{currency}','\"EUR\"') WHERE id=$1",
      [ids[1]],
    );
    await post(ids).expect(400);
    assert.equal(
      (await s.db.query("SELECT count(*)::int n FROM expenses")).rows[0].n,
      0,
    );
    await s.db.query(
      "UPDATE receipts SET payload=jsonb_set(payload,'{currency}','\"USD\"') WHERE id=$1",
      [ids[1]],
    );
    await s.db.query(
      "UPDATE receipts SET payload=jsonb_set(payload,'{paidBy}',to_jsonb($1::text)) WHERE id=$2",
      [s.groups[1].detail.members[0].id, ids[1]],
    );
    await post(ids).expect(400);
    await s.db.query(
      "UPDATE receipts SET payload=jsonb_set(payload,'{paidBy}',to_jsonb($1::text)) WHERE id=$2",
      [payer, ids[1]],
    );
    await s.http
      .post(`/api/groups/${group.id}/receipts/${ids[1]}/review`)
      .set(auth(s.owner.token))
      .send({ action: "reject" })
      .expect(200);
    await post(ids).expect(409);
    assert.equal(
      (await s.db.query("SELECT count(*)::int n FROM expenses")).rows[0].n,
      0,
    );
    const fresh = await make("batch-3");
    // Concurrent agent batches and a person approving share the receipt lock.
    const posted = await Promise.all([
      post([ids[0], fresh]).expect(200),
      post([fresh, ids[0]]).expect(200),
      s.http
        .post(`/api/groups/${group.id}/receipts/${ids[0]}/review`)
        .set(auth(s.owner.token))
        .send({ action: "approve" })
        .expect(200),
    ]);
    assert.equal(
      posted[0].body.receipts[0].expenseId,
      posted[1].body.receipts[1].expenseId,
    );
    const view = (
      await s.http
        .get(`/api/groups/${group.id}`)
        .set(auth(s.owner.token))
        .expect(200)
    ).body;
    assert.equal(view.expenses.length, 2);
    assert.equal(view.balances[payer], 2000);
    assert.equal(view.balances[participant], -2000);
    await s.http
      .delete(`/api/groups/${group.id}/agents/${agent.id}`)
      .set(auth(s.owner.token))
      .expect(200);
    await post([fresh]).expect(401);
  } finally {
    await s.db.close();
  }
});

test("draft discovery paginates only this agent's pending receipts", async () => {
  const s = await setup();
  try {
    const { agent, group } = s.groups[0];
    await s.db.query(
      "INSERT INTO receipts(id,group_id,agent_id,source_id,payload) SELECT 'page-'||lpad(n::text,3,'0'),$1,$2,n::text,'{}'::jsonb FROM generate_series(1,101) n",
      [group.id, agent.id],
    );
    const list = (afterId?: string, key = agent.key) =>
      s.http
        .post("/api/v1/agent/receipts/drafts")
        .set(auth(key))
        .send(afterId ? { afterId } : {});
    const first = (await list().expect(200)).body;
    assert.equal(first.receipts.length, 100);
    assert.equal(first.nextAfterId, "page-100");
    const last = (await list(first.nextAfterId).expect(200)).body;
    assert.equal(last.receipts.length, 1);
    assert.equal(last.nextAfterId, null);
    assert.deepEqual(
      (await list(undefined, s.groups[1].agent.key).expect(200)).body.receipts,
      [],
    );
    await s.db.query(
      "UPDATE receipts SET status='rejected' WHERE id='page-101'",
    );
    assert.deepEqual(
      (await list(first.nextAfterId).expect(200)).body.receipts,
      [],
    );
  } finally {
    await s.db.close();
  }
});

test("production Vercel rewrite preserves authenticated MCP handshake", async () => {
  const s = await setup();
  const config = JSON.parse(await readFile("vercel.json", "utf8"));
  const routes = convertRewrites(config.rewrites) as {
    src: string;
    dest: string;
  }[];
  const server = createServer((req, res) => {
    const original = new URL(req.url!, "http://localhost");
    const route = routes.find((r) =>
      new RegExp(r.src).test(original.pathname),
    )!;
    const matches = new RegExp(route.src).exec(original.pathname)!;
    const destination = new URL(
      route.dest.replace(/\$(\d+)/g, (_, n) => matches[Number(n)] || ""),
      original,
    );
    // Vercel compiles unused path captures into the destination's query and its
    // Node helper preserves that query object while Express sees the original URL.
    const query = Object.fromEntries(original.searchParams);
    for (const [key, value] of destination.searchParams)
      if (!(key in query)) query[key] = value;
    Object.defineProperty(req, "query", { configurable: true, value: query });
    s.app(req as any, res as any);
  });
  try {
    const http = request(server),
      key = s.groups[0].agent.key;
    const post = (body: object, path = "/api/mcp") =>
      http
        .post(path)
        .set(auth(key))
        .set("Accept", "application/json, text/event-stream")
        .send(body);
    const initialized = await post(init);
    assert.equal(initialized.status, 200, JSON.stringify(initialized.body));
    assert.equal(initialized.body.result.serverInfo.name, "fairshare-receipts");
    await post({ jsonrpc: "2.0", method: "notifications/initialized" }).expect(
      202,
    );
    const discovered = await post(rpc("tools/list")).expect(200);
    assert.equal(discovered.body.result.tools.length, 5);
    await http.get("/api/mcp").set(auth(key)).expect(405);
    await http.delete("/api/mcp").set(auth(key)).expect(405);
    for (const query of ["token=not-a-credential", "path=mcp", "unexpected=1"])
      await post(init, "/api/mcp?" + query).expect(400);
    await http.post("/api/mcp").send(init).expect(401);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await s.db.close();
  }
});
