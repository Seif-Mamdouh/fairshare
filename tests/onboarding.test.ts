import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { URL } from "node:url";
import request from "supertest";
import { localDatabase } from "../server/db";
import { createApp } from "../server/app";
import {
  inviteTokenFrom,
  inviteLink,
  agentConnectionLabel,
  mcpConfiguration,
  agentInstructions,
} from "../shared/onboarding";
import { equalSplit } from "../shared/domain";

test("invite links preserve opaque tokens and reject unrelated or malformed links", () => {
  const token = "join_" + "A".repeat(43);
  const link = inviteLink("https://fairshare.example", token);
  assert.equal(link, "https://fairshare.example/#join=" + token);
  for (const value of [
    link,
    token,
    " https://fairshare.example/?invite=" + token + " ",
  ])
    assert.equal(inviteTokenFrom(value), token);
  for (const value of [
    "javascript:alert(1)",
    "https://fairshare.example/#join=abc",
    "join_short",
    "https://fairshare.example/",
    "data:text/plain," + token,
  ])
    assert.equal(inviteTokenFrom(value), null);
});
test("agent setup is honest and keeps private keys out of shareable instructions", () => {
  assert.equal(agentConnectionLabel({}), "Not connected yet");
  assert.equal(
    agentConnectionLabel({ last_used_at: "2026-11-08" }),
    "Connection verified",
  );
  assert.equal(
    agentConnectionLabel({
      last_used_at: "2026-11-08",
      revoked_at: "2026-11-09",
    }),
    "Access revoked",
  );
  const secret = "test-private-agent-key";
  const config = JSON.parse(
    mcpConfiguration(
      "https://fairshare.example",
      "/Users/test/Fairshare app",
      secret,
    ),
  );
  assert.equal(config.mcpServers.fairshare.env.FAIRSHARE_AGENT_KEY, secret);
  assert.equal(
    config.mcpServers.fairshare.args[1],
    "/Users/test/Fairshare app/node_modules/tsx/dist/loader.mjs",
  );
  assert.ok(!agentInstructions("https://fairshare.example").includes(secret));
  assert.throws(() =>
    mcpConfiguration("https://fairshare.example", "relative/path", secret),
  );
});
test("invite acceptance, scoped selection, and observed agent connections", async (t) => {
  const db = await localDatabase();
  for (const sql of (
    await readFile(new URL("../server/schema.sql", import.meta.url), "utf8")
  )
    .split(";")
    .filter((s) => s.trim()))
    await db.query(sql);
  const http = request(createApp(db));
  const auth = (key: string) => ({ Authorization: "Bearer " + key });
  const register = async (name: string) =>
    (
      await http
        .post("/api/auth/register")
        .send({
          name,
          email: name + "@example.test",
          password: "onboarding-test-password",
        })
        .expect(201)
    ).body;
  const owner = await register("Owner");
  const groupId = (
    await http
      .post("/api/groups")
      .set(auth(owner.token))
      .send({ name: "Shared expenses", currency: "USD" })
      .expect(201)
  ).body.id;
  const detail = async (key = owner.token) =>
    (
      await http
        .get("/api/groups/" + groupId)
        .set(auth(key))
        .expect(200)
    ).body;
  let invite = (await detail()).invite_token;
  await t.test(
    "public preview reveals only group name, currency and member count",
    async () => {
      const result = (
        await http
          .post("/api/invites/preview")
          .send({ inviteToken: invite })
          .expect(200)
      ).body;
      assert.deepEqual(result, {
        name: "Shared expenses",
        currency: "USD",
        member_count: 1,
      });
      await http.get("/api/groups/" + groupId).expect(401);
      await http
        .post("/api/groups/join")
        .send({ inviteToken: invite })
        .expect(401);
      await http
        .post("/api/invites/preview")
        .send({ inviteToken: "malformed" })
        .expect(400);
    },
  );
  const person = await register("Invitee");
  await t.test(
    "new account can join from the same invitation exactly once",
    async () => {
      for (let i = 0; i < 2; i++)
        await http
          .post("/api/groups/join")
          .set(auth(person.token))
          .send({ inviteToken: invite })
          .expect(200);
      const group = await detail(person.token);
      assert.equal(group.members.length, 2);
      assert.equal(group.invite_token, undefined);
      await http
        .post("/api/groups/" + groupId + "/invite")
        .set(auth(person.token))
        .expect(403);
    },
  );
  await t.test(
    "replacement invalidates old invitations while preserving members",
    async () => {
      const replacement = (
        await http
          .post("/api/groups/" + groupId + "/invite")
          .set(auth(owner.token))
          .expect(200)
      ).body.inviteToken;
      await http
        .post("/api/invites/preview")
        .send({ inviteToken: invite })
        .expect(404);
      await http
        .post("/api/groups/join")
        .set(auth(person.token))
        .send({ inviteToken: invite })
        .expect(404);
      invite = replacement;
      await http
        .post("/api/invites/preview")
        .send({ inviteToken: invite })
        .expect(200);
      assert.equal((await detail()).members.length, 2);
    },
  );
  await t.test(
    "selected people and whole group splits affect only their participants",
    async () => {
      const named = (
        await http
          .post("/api/groups/" + groupId + "/members")
          .set(auth(owner.token))
          .send({ name: "Named person" })
          .expect(201)
      ).body;
      const group = await detail();
      const payer = group.members.find(
        (m: any) => m.user_id === owner.user.id,
      ).id;
      const invitee = group.members.find(
        (m: any) => m.user_id === person.user.id,
      ).id;
      await http
        .post("/api/groups/" + groupId + "/expenses")
        .set(auth(owner.token))
        .send({
          title: "Just two of us",
          amountMinor: 1001,
          paidBy: payer,
          splits: equalSplit(1001, [payer, named.id]),
          category: "Other",
          spentOn: "2026-11-08",
        })
        .expect(201);
      assert.equal((await detail()).balances[invitee], 0);
      await http
        .post("/api/groups/" + groupId + "/expenses")
        .set(auth(owner.token))
        .send({
          title: "Whole group",
          amountMinor: 300,
          paidBy: payer,
          splits: equalSplit(
            300,
            group.members.map((m: any) => m.id),
          ),
          category: "Other",
          spentOn: "2026-11-08",
        })
        .expect(201);
      assert.equal((await detail()).balances[invitee], -100);
    },
  );
  await t.test(
    "key creation and owner status checks never imply a connection",
    async () => {
      await http
        .post("/api/groups/" + groupId + "/agents")
        .set(auth(person.token))
        .send({ name: "Unauthorized" })
        .expect(403);
      const agent = (
        await http
          .post("/api/groups/" + groupId + "/agents")
          .set(auth(owner.token))
          .send({ name: "My assistant" })
          .expect(201)
      ).body;
      const before = await detail();
      const entry = before.agents.find((a: any) => a.id === agent.id);
      assert.equal(entry.last_used_at, null);
      assert.equal(JSON.stringify(before).includes(agent.key), false);
      assert.equal("token_hash" in entry, false);
      assert.equal("key" in entry, false);
      assert.equal(
        (await detail()).agents.find((a: any) => a.id === agent.id)
          .last_used_at,
        null,
      );
      await http.get("/api/v1/agent/context").set(auth("invalid")).expect(401);
      assert.equal(
        (await detail()).agents.find((a: any) => a.id === agent.id)
          .last_used_at,
        null,
      );
      await http.get("/api/v1/agent/context").set(auth(agent.key)).expect(200);
      const connected = (await detail()).agents.find(
        (a: any) => a.id === agent.id,
      );
      assert.ok(connected.last_used_at);
      await http
        .post("/api/groups/join")
        .set(auth(agent.key))
        .send({ inviteToken: invite })
        .expect(401);
      await http
        .delete("/api/groups/" + groupId + "/agents/" + agent.id)
        .set(auth(owner.token))
        .expect(200);
      await http.get("/api/v1/agent/context").set(auth(agent.key)).expect(401);
      const revoked = (await detail()).agents.find(
        (a: any) => a.id === agent.id,
      );
      assert.equal(revoked.last_used_at, connected.last_used_at);
      assert.ok(revoked.revoked_at);
    },
  );
  await db.close();
});
