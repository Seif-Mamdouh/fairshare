import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { URL } from "node:url";
import request from "supertest";
import { localDatabase } from "../server/db";
import { createApp } from "../server/app";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { equalSplit } from "../shared/domain";
test("complete API journey, authorization, receipt concurrency, and MCP", async (t) => {
  const db = await localDatabase();
  for (const statement of (
    await readFile(new URL("../server/schema.sql", import.meta.url), "utf8")
  )
    .split(";")
    .filter((s) => s.trim()))
    await db.query(statement);
  const app = createApp(db),
    http = request(app);
  let auth = "",
    other = "",
    gid = "",
    a = "",
    b = "",
    agentKey = "",
    receiptId = "",
    expenseId = "",
    invite = "";
  const bearer = (key = auth) => ({ Authorization: "Bearer " + key });
  await t.test("automatic private workspaces and cookie sessions", async () => {
    await http.get("/api/groups").expect(401);
    const result = await http.post("/api/workspace").send({}).expect(201);
    auth = result.body.token;
    assert.ok(result.headers["set-cookie"][0].includes("HttpOnly"));
    await http
      .get("/api/me")
      .set("Cookie", result.headers["set-cookie"])
      .expect(200);
    await http
      .post("/api/me/name")
      .set(bearer())
      .send({ name: "Ava" })
      .expect(200);
    const resumed = await http
      .post("/api/workspace")
      .set(bearer())
      .send({})
      .expect(200);
    assert.equal(resumed.body.user.id, result.body.user.id);
    other = (await http.post("/api/workspace").send({}).expect(201)).body.token;
    await http
      .post("/api/me/name")
      .set(bearer(other))
      .send({ name: "Other" })
      .expect(200);
  });
  await t.test("group isolation and members", async () => {
    gid = (
      await http
        .post("/api/groups")
        .set(bearer())
        .send({ name: "Lisbon weekend", currency: "USD" })
        .expect(201)
    ).body.id;
    await http
      .get("/api/groups/" + gid)
      .set(bearer(other))
      .expect(404);
    b = (
      await http
        .post("/api/groups/" + gid + "/members")
        .set(bearer())
        .send({ name: "Ben" })
        .expect(201)
    ).body.id;
    const detail = (
      await http
        .get("/api/groups/" + gid)
        .set(bearer())
        .expect(200)
    ).body;
    a = detail.members.find((m: any) => m.name === "Ava").id;
    invite = detail.invite_token;
  });
  const expense = () => ({
    title: "Dinner",
    amountMinor: 10001,
    paidBy: a,
    splits: equalSplit(10001, [a, b]),
    category: "Food & drink",
    spentOn: "2026-11-08",
  });
  await t.test("expense validation and exact balances", async () => {
    await http
      .post("/api/groups/" + gid + "/expenses")
      .set(bearer())
      .send({ ...expense(), amountMinor: 10000 })
      .expect(400);
    await http
      .post("/api/groups/" + gid + "/expenses")
      .set(bearer())
      .send({ ...expense(), paidBy: "foreign-member" })
      .expect(400);
    expenseId = (
      await http
        .post("/api/groups/" + gid + "/expenses")
        .set(bearer())
        .send(expense())
        .expect(201)
    ).body.id;
    const detail = (await http.get("/api/groups/" + gid).set(bearer())).body;
    assert.equal(detail.balances[a], 5000);
    assert.equal(detail.balances[b], -5000);
  });
  await t.test("agent scope, invalid key, and pending receipt", async () => {
    agentKey = (
      await http
        .post("/api/groups/" + gid + "/agents")
        .set(bearer())
        .send({ name: "Claude" })
        .expect(201)
    ).body.key;
    await http.get("/api/v1/agent/context").set(bearer("wrong")).expect(401);
    await http
      .get("/api/groups/" + gid)
      .set(bearer(agentKey))
      .expect(401);
    await http
      .post("/api/groups/" + gid + "/expenses")
      .set(bearer(agentKey))
      .send(expense())
      .expect(401);
    const ctx = (
      await http.get("/api/v1/agent/context").set(bearer(agentKey)).expect(200)
    ).body;
    assert.equal(ctx.group.id, gid);
    assert.equal(ctx.members.length, 2);
    const result = await http
      .post("/api/v1/agent/receipts")
      .set(bearer(agentKey))
      .send({ ...expense(), currency: "USD", sourceId: "vendor-receipt-1" })
      .expect(201);
    receiptId = result.body.id;
    assert.equal(result.body.status, "pending");
    assert.equal(
      (await http.get("/api/groups/" + gid).set(bearer())).body.expenses.length,
      1,
    );
  });
  await t.test(
    "receipt replay, content conflict, currency and image validation",
    async () => {
      const payload = {
        ...expense(),
        currency: "USD",
        sourceId: "vendor-receipt-1",
      };
      assert.equal(
        (
          await http
            .post("/api/v1/agent/receipts")
            .set(bearer(agentKey))
            .send(payload)
            .expect(200)
        ).body.id,
        receiptId,
      );
      await http
        .post("/api/v1/agent/receipts")
        .set(bearer(agentKey))
        .send({ ...payload, title: "Changed" })
        .expect(409);
      await http
        .post("/api/v1/agent/receipts")
        .set(bearer(agentKey))
        .send({
          ...payload,
          splits: [
            { memberId: a, amountMinor: 5000 },
            { memberId: b, amountMinor: 5001 },
          ],
        })
        .expect(409);
      await http
        .post("/api/v1/agent/receipts")
        .set(bearer(agentKey))
        .send({ ...payload, sourceId: "wrong-currency", currency: "EUR" })
        .expect(400);
      await http
        .post("/api/v1/agent/receipts")
        .set(bearer(agentKey))
        .send({
          ...payload,
          sourceId: "image",
          imageData: "data:image/png;base64,SGVsbG8=",
        })
        .expect(400);
      const results = await Promise.all(
        [1, 2, 3].map(() =>
          http
            .post("/api/v1/agent/receipts")
            .set(bearer(agentKey))
            .send({ ...payload, sourceId: "concurrent" }),
        ),
      );
      assert.equal(new Set(results.map((r) => r.body.id)).size, 1);
      assert.equal(results.filter((r) => r.status === 201).length, 1);
    },
  );
  await t.test("concurrent approval creates exactly one expense", async () => {
    await http
      .post("/api/groups/" + gid + "/receipts/" + receiptId + "/review")
      .set(bearer(agentKey))
      .send({ action: "approve" })
      .expect(401);
    const results = await Promise.all(
      [1, 2, 3].map(() =>
        http
          .post("/api/groups/" + gid + "/receipts/" + receiptId + "/review")
          .set(bearer())
          .send({ action: "approve" }),
      ),
    );
    assert.ok(results.every((r) => r.status === 200));
    assert.equal(new Set(results.map((r) => r.body.expenseId)).size, 1);
    assert.equal(
      (await http.get("/api/groups/" + gid).set(bearer())).body.expenses.length,
      2,
    );
    assert.equal(
      (
        await http
          .get("/api/v1/agent/receipts/" + receiptId)
          .set(bearer(agentKey))
      ).body.status,
      "approved",
    );
  });
  await t.test("payment, voiding, and account collaboration", async () => {
    await http
      .post("/api/groups/" + gid + "/settlements")
      .set(bearer())
      .send({
        fromMember: b,
        toMember: a,
        amountMinor: 5000,
        note: "Bank transfer",
      })
      .expect(201);
    await http
      .delete("/api/groups/" + gid + "/expenses/" + expenseId)
      .set(bearer())
      .expect(200);
    const d = (await http.get("/api/groups/" + gid).set(bearer())).body;
    assert.equal(d.balances[a], 0);
    assert.equal(d.balances[b], 0);
    await http
      .post("/api/groups/join")
      .set(bearer(other))
      .send({ inviteToken: invite })
      .expect(200);
    const joined = (
      await http
        .get("/api/groups/" + gid)
        .set(bearer(other))
        .expect(200)
    ).body;
    assert.equal(joined.invite_token, undefined);
    await http
      .post("/api/groups/" + gid + "/agents")
      .set(bearer(other))
      .send({ name: "Denied" })
      .expect(403);
  });
  await t.test(
    "MCP handshake, tools, and real receipt submission",
    async () => {
      const server = app.listen(0, "127.0.0.1");
      await new Promise<void>((resolve) => server.once("listening", resolve));
      const port = (server.address() as any).port;
      const client = new Client({ name: "test-client", version: "1.0.0" });
      const transport = new StdioClientTransport({
        command: process.execPath,
        args: ["--import", "tsx", "scripts/mcp.ts"],
        cwd: process.cwd(),
        env: {
          ...Object.fromEntries(
            Object.entries(process.env).filter(
              (entry): entry is [string, string] =>
                typeof entry[1] === "string",
            ),
          ),
          FAIRSHARE_URL: `http://127.0.0.1:${port}`,
          FAIRSHARE_AGENT_KEY: agentKey,
        },
        stderr: "pipe",
      });
      try {
        await client.connect(transport);
        assert.equal((await client.listTools()).tools.length, 3);
        const context: any = await client.callTool({
          name: "get_group_context",
          arguments: {},
        });
        assert.equal(JSON.parse(context.content[0].text).group.id, gid);
        const result: any = await client.callTool({
          name: "submit_receipt",
          arguments: { ...expense(), currency: "USD", sourceId: "mcp-1" },
        });
        assert.equal(result.isError, false);
        assert.equal(JSON.parse(result.content[0].text).status, "pending");
      } finally {
        await client.close();
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    },
  );
  await t.test(
    "agent and workspace revocation invalidate credentials",
    async () => {
      const id = (await http.get("/api/v1/agent/context").set(bearer(agentKey)))
        .body.agent.id;
      await http
        .delete("/api/groups/" + gid + "/agents/" + id)
        .set(bearer())
        .expect(200);
      await http.get("/api/v1/agent/context").set(bearer(agentKey)).expect(401);
      await http.delete("/api/workspace/session").set(bearer()).expect(200);
      await http.get("/api/me").set(bearer()).expect(401);
    },
  );
  await db.close();
});
