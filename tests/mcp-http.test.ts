import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import request from "supertest";
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
      "get_group_context",
      "get_receipt_status",
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
