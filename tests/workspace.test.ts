import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { URL } from "node:url";
import request from "supertest";
import { localDatabase } from "../server/db";
import { createApp } from "../server/app";
import { hash, token } from "../server/auth";
async function setup() {
  const db = await localDatabase();
  for (const sql of (
    await readFile(new URL("../server/schema.sql", import.meta.url), "utf8")
  )
    .split(";")
    .filter((s) => s.trim()))
    await db.query(sql);
  return { db, http: request(createApp(db)) };
}
const auth = (key: string) => ({ Authorization: "Bearer " + key });
test("fresh workspaces are isolated and cookie/native sessions resume the same identity", async () => {
  const { db, http } = await setup();
  try {
    const a = await http.post("/api/workspace").send({}).expect(201),
      b = await http.post("/api/workspace").send({}).expect(201);
    assert.notEqual(a.body.user.id, b.body.user.id);
    assert.notEqual(a.body.token, b.body.token);
    assert.deepEqual(
      (await http.get("/api/groups").set(auth(a.body.token)).expect(200)).body,
      [],
    );
    const group = (
      await http
        .post("/api/groups")
        .set(auth(a.body.token))
        .send({ name: "Private", currency: "USD" })
        .expect(201)
    ).body;
    await http
      .get("/api/groups/" + group.id)
      .set(auth(b.body.token))
      .expect(404);
    await http.get("/api/groups/" + group.id).expect(401);
    assert.deepEqual(
      (await http.get("/api/groups").set(auth(b.body.token))).body,
      [],
    );
    const cookie = a.headers["set-cookie"][0];
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Strict/);
    assert.match(cookie, /Max-Age=31536000/);
    const web = (
      await http
        .post("/api/workspace")
        .set("Cookie", cookie)
        .send({})
        .expect(200)
    ).body;
    const native = (
      await http
        .post("/api/workspace")
        .set(auth(a.body.token))
        .send({})
        .expect(200)
    ).body;
    assert.equal(web.user.id, a.body.user.id);
    assert.equal(native.token, a.body.token);
    await http
      .post("/api/workspace")
      .send({ userId: a.body.user.id })
      .expect(400);
    assert.equal(
      (await db.query("SELECT count(*)::int n FROM users")).rows[0].n,
      2,
    );
  } finally {
    await db.close();
  }
});
test("existing real-style sessions preserve identity, history, agent credentials and unused legacy fields", async () => {
  const { db, http } = await setup();
  try {
    const key = token("fs_");
    await db.query(
      "INSERT INTO users(id,name,email,password_hash,phone_e164,phone_verified_at) VALUES('existing','Existing person','legacy@example.test','legacy-hash','+12025550121',now())",
    );
    await db.query(
      "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,'existing',now()+interval '7 days')",
      [hash(key)],
    );
    const before = (await db.query("SELECT * FROM users WHERE id='existing'"))
      .rows[0];
    const group = (
      await http
        .post("/api/groups")
        .set(auth(key))
        .send({ name: "Existing group", currency: "USD" })
    ).body;
    const detail = (await http.get("/api/groups/" + group.id).set(auth(key)))
      .body;
    const paidBy = detail.members[0].id;
    await http
      .post("/api/groups/" + group.id + "/expenses")
      .set(auth(key))
      .send({
        title: "Existing expense",
        amountMinor: 1200,
        paidBy,
        splits: [{ memberId: paidBy, amountMinor: 1200 }],
        category: "Other",
        spentOn: "2026-11-09",
      })
      .expect(201);
    const agent = (
      await http
        .post("/api/groups/" + group.id + "/agents")
        .set(auth(key))
        .send({ name: "Existing assistant" })
    ).body;
    const dataBefore = (
      await http.get("/api/groups/" + group.id).set(auth(key))
    ).body;
    const resumed = await Promise.all(
      [1, 2].map(() =>
        http.post("/api/workspace").set(auth(key)).send({}).expect(200),
      ),
    );
    for (const r of resumed) {
      assert.deepEqual(r.body.user, {
        id: "existing",
        name: "Existing person",
        phone_e164: "+12025550121",
      });
      assert.equal(r.body.created, false);
      assert.equal(r.body.token, key);
    }
    assert.deepEqual(
      (await db.query("SELECT * FROM users WHERE id='existing'")).rows[0],
      before,
    );
    assert.deepEqual(
      (await http.get("/api/groups/" + group.id).set(auth(key))).body,
      dataBefore,
    );
    await http.get("/api/v1/agent/context").set(auth(agent.key)).expect(200);
    const expiry = (
      await db.query("SELECT expires_at FROM sessions WHERE token_hash=$1", [
        hash(key),
      ])
    ).rows[0].expires_at;
    assert.ok(new Date(expiry).getTime() > Date.now() + 364 * 86400000);
    assert.equal(
      (await db.query("SELECT count(*)::int n FROM users")).rows[0].n,
      1,
    );
  } finally {
    await db.close();
  }
});
test("guests join invitations without registration and display names preserve accounting identity", async () => {
  const { db, http } = await setup();
  try {
    const owner = (await http.post("/api/workspace").send({})).body;
    const group = (
      await http
        .post("/api/groups")
        .set(auth(owner.token))
        .send({ name: "Shared", currency: "USD" })
    ).body;
    const detail = (
      await http.get("/api/groups/" + group.id).set(auth(owner.token))
    ).body;
    const preview = (
      await http
        .post("/api/invites/preview")
        .send({ inviteToken: detail.invite_token })
        .expect(200)
    ).body;
    assert.equal(preview.name, "Shared");
    const guest = (await http.post("/api/workspace").send({}).expect(201)).body;
    await http
      .post("/api/groups/join")
      .set(auth(guest.token))
      .send({ inviteToken: detail.invite_token })
      .expect(200);
    await http
      .post("/api/groups/join")
      .set(auth(guest.token))
      .send({ inviteToken: detail.invite_token })
      .expect(200);
    const joined = (
      await http.get("/api/groups/" + group.id).set(auth(guest.token))
    ).body;
    assert.equal(joined.members.length, 2);
    const me = joined.members.find((m: any) => m.user_id === guest.user.id);
    await http
      .post("/api/groups/" + group.id + "/expenses")
      .set(auth(guest.token))
      .send({
        title: "Shared expense",
        amountMinor: 3000,
        paidBy: me.id,
        splits: joined.members.map((m: any) => ({
          memberId: m.id,
          amountMinor: 1500,
        })),
        category: "Other",
        spentOn: "2026-11-09",
      })
      .expect(201);
    const snapshot = (
      await http.get("/api/groups/" + group.id).set(auth(guest.token))
    ).body;
    await http
      .post("/api/me/name")
      .set(auth(guest.token))
      .send({ name: "New display name" })
      .expect(200);
    const after = (
      await http.get("/api/groups/" + group.id).set(auth(guest.token))
    ).body;
    assert.equal(
      after.members.find((m: any) => m.id === me.id).name,
      "New display name",
    );
    assert.deepEqual(after.expenses, snapshot.expenses);
    assert.deepEqual(after.balances, snapshot.balances);
    await http.post("/api/me/name").send({ name: "Intruder" }).expect(401);
    await http
      .post("/api/me/name")
      .set(auth(guest.token))
      .send({ name: "", userId: owner.user.id })
      .expect(400);
  } finally {
    await db.close();
  }
});
test("invalid, expired and revoked sessions never recover a previous private identity", async () => {
  const { db, http } = await setup();
  try {
    const first = (await http.post("/api/workspace").send({})).body;
    await db.query(
      "UPDATE sessions SET expires_at=now()-interval '1 second' WHERE token_hash=$1",
      [hash(first.token)],
    );
    await http.get("/api/me").set(auth(first.token)).expect(401);
    const replacement = (
      await http
        .post("/api/workspace")
        .set(auth(first.token))
        .send({})
        .expect(201)
    ).body;
    assert.notEqual(replacement.user.id, first.user.id);
    await http
      .delete("/api/workspace/session")
      .set(auth(replacement.token))
      .expect(200);
    await http.get("/api/me").set(auth(replacement.token)).expect(401);
    const next = (
      await http
        .post("/api/workspace")
        .set(auth("invalid"))
        .send({})
        .expect(201)
    ).body;
    assert.notEqual(next.user.id, first.user.id);
    assert.equal(
      (await db.query("SELECT count(*)::int n FROM users")).rows[0].n,
      3,
    );
  } finally {
    await db.close();
  }
});
test("login and OTP endpoints are absent and new-identity creation is bounded", async () => {
  const { db, http } = await setup();
  try {
    for (const path of [
      "register",
      "login",
      "logout",
      "phone/start",
      "phone/check",
    ])
      await http
        .post("/api/auth/" + path)
        .send({})
        .expect(404);
    await http.get("/api/auth/methods").expect(404);
    let existing = "";
    for (let i = 0; i < 20; i++)
      existing = (await http.post("/api/workspace").send({}).expect(201)).body
        .token;
    await http.post("/api/workspace").send({}).expect(429);
    await http.post("/api/workspace").set(auth(existing)).send({}).expect(200);
    await http
      .post("/api/workspace")
      .set("Origin", "https://untrusted.example")
      .send({})
      .expect(403);
  } finally {
    await db.close();
  }
});
test("production device cookies remain Secure", async () => {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  const { db, http } = await setup();
  try {
    const result = await http.post("/api/workspace").send({}).expect(201);
    assert.match(result.headers["set-cookie"][0], /Secure/);
  } finally {
    await db.close();
    if (previous === undefined) Reflect.deleteProperty(process.env, "NODE_ENV");
    else process.env.NODE_ENV = previous;
  }
});

test("browser bootstrap keeps the session credential in its HttpOnly cookie", async () => {
  const { db, http } = await setup();
  try {
    const first = await http
      .post("/api/workspace")
      .set("Sec-Fetch-Mode", "cors")
      .send({})
      .expect(201);
    assert.equal(first.body.token, undefined);
    assert.match(first.headers["set-cookie"][0], /HttpOnly/);
    const again = await http
      .post("/api/workspace")
      .set("Sec-Fetch-Mode", "cors")
      .set("Cookie", first.headers["set-cookie"])
      .send({})
      .expect(200);
    assert.equal(again.body.token, undefined);
    assert.equal(again.body.user.id, first.body.user.id);
  } finally {
    await db.close();
  }
});
