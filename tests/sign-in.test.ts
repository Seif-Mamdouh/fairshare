import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import request from "supertest";
import { localDatabase } from "../server/db";
import { createApp } from "../server/app";
import { passwordHash, verifyPassword } from "../server/password";
const password = "a long test phrase 42!";
const auth = (token: string) => ({ Authorization: "Bearer " + token });
async function setup() {
  const db = await localDatabase();
  for (const sql of (await readFile("server/schema.sql", "utf8"))
    .split(";")
    .filter((s) => s.trim()))
    await db.query(sql);
  return { db, http: request(createApp(db)) };
}
test("passwords are salted, hashed, verified and malformed legacy values fail closed", async () => {
  const a = await passwordHash(password),
    b = await passwordHash(password);
  assert.notEqual(a, b);
  assert.ok(!a.includes(password));
  assert.equal(await verifyPassword(password, a), true);
  assert.equal(await verifyPassword("wrong", a), false);
  assert.equal(await verifyPassword(password, "legacy-hash"), false);
  assert.equal(await verifyPassword(password, null), false);
});
test("existing workspace upgrades once, preserves groups and banks, and signs in from independent devices", async () => {
  const { db, http } = await setup();
  try {
    const old = (await http.post("/api/workspace").send({}).expect(201)).body;
    await http
      .post("/api/me/phone")
      .set(auth(old.token))
      .send({ phone: "2025550123" })
      .expect(200);
    const group = (
      await http
        .post("/api/groups")
        .set(auth(old.token))
        .send({ name: "Existing history", currency: "USD" })
        .expect(201)
    ).body;
    await db.query(
      "INSERT INTO bank_links(id,user_id,environment) VALUES('existing-bank',$1,'sandbox')",
      [old.user.id],
    );
    const enabled = (
      await http
        .post("/api/auth/register")
        .set(auth(old.token))
        .send({ phone: "(202) 555-0123", password })
        .expect(200)
    ).body;
    assert.equal(enabled.user.id, old.user.id);
    assert.equal(enabled.user.sign_in_enabled, true);
    assert.notEqual(enabled.token, old.token);
    await http.get("/api/me").set(auth(old.token)).expect(401);
    await http
      .post("/api/auth/register")
      .set(auth(enabled.token))
      .send({ phone: "2025550123", password })
      .expect(409);
    const other = (
      await http
        .post("/api/auth/login")
        .send({ phone: "+1 202 555 0123", password })
        .expect(200)
    ).body;
    assert.equal(other.user.id, old.user.id);
    assert.notEqual(other.token, enabled.token);
    assert.equal(
      (await http.get("/api/groups").set(auth(other.token)).expect(200)).body[0]
        .id,
      group.id,
    );
    assert.equal(
      (await http.get("/api/bank").set(auth(other.token)).expect(200)).body
        .links[0].id,
      "existing-bank",
    );
    await http.get("/api/me").set(auth(enabled.token)).expect(200);
    assert.ok(!JSON.stringify(other).includes("hash"));
    const web = await http
      .post("/api/auth/login")
      .set("Origin", "http://localhost:8081")
      .send({ phone: "2025550123", password })
      .expect(200);
    assert.equal(web.body.token, undefined);
    assert.match(web.headers["set-cookie"][0], /HttpOnly/);
    assert.equal(
      (
        await http
          .get("/api/me")
          .set("Cookie", web.headers["set-cookie"][0])
          .expect(200)
      ).body.id,
      old.user.id,
    );
    await http
      .delete("/api/workspace/session")
      .set(auth(other.token))
      .expect(200);
    await http.get("/api/me").set(auth(other.token)).expect(401);
    await http.get("/api/me").set(auth(enabled.token)).expect(200);
  } finally {
    await db.close();
  }
});
test("knowing a claimed number cannot set a password, take over its account or reuse a wrong password", async () => {
  const { db, http } = await setup();
  try {
    const owner = (await http.post("/api/workspace").send({})).body,
      outsider = (await http.post("/api/workspace").send({})).body;
    await http
      .post("/api/me/phone")
      .set(auth(owner.token))
      .send({ phone: "2025550123" })
      .expect(200);
    await http
      .post("/api/auth/register")
      .set(auth(outsider.token))
      .send({ phone: "2025550123", password })
      .expect(409);
    await http
      .post("/api/auth/login")
      .send({ phone: "2025550123", password })
      .expect(401);
    await http
      .post("/api/auth/register")
      .send({ phone: "2025550123", password })
      .expect(401);
    await http
      .post("/api/auth/register")
      .set(auth(owner.token))
      .send({ phone: "2025550123", password: "short" })
      .expect(400);
    const enabled = (
      await http
        .post("/api/auth/register")
        .set(auth(owner.token))
        .send({ phone: "2025550123", password })
        .expect(200)
    ).body;
    const wrong = await http
      .post("/api/auth/login")
      .send({ phone: "2025550123", password: "incorrect" })
      .expect(401);
    const unknown = await http
      .post("/api/auth/login")
      .send({ phone: "2025550124", password: "incorrect" })
      .expect(401);
    assert.equal(wrong.body.error, unknown.body.error);
    await http
      .post("/api/me/phone")
      .set(auth(enabled.token))
      .send({ phone: "2025550124" })
      .expect(401);
    await http
      .post("/api/me/phone")
      .set(auth(enabled.token))
      .send({ phone: "2025550124", currentPassword: password })
      .expect(200);
    await http
      .post("/api/auth/login")
      .send({ phone: "2025550123", password })
      .expect(401);
    const moved = await http
      .post("/api/auth/login")
      .send({ phone: "2025550124", password })
      .expect(200);
    assert.equal(moved.body.user.id, owner.user.id);
    assert.equal(
      (await http.get("/api/me").set(auth(outsider.token))).body.id,
      outsider.user.id,
    );
  } finally {
    await db.close();
  }
});
test("password change requires current password and revokes every prior device session", async () => {
  const { db, http } = await setup();
  try {
    const guest = (await http.post("/api/workspace").send({})).body;
    const first = (
      await http
        .post("/api/auth/register")
        .set(auth(guest.token))
        .send({ phone: "2025550123", password })
        .expect(200)
    ).body;
    const second = (
      await http
        .post("/api/auth/login")
        .send({ phone: "2025550123", password })
        .expect(200)
    ).body;
    await http
      .post("/api/me/password")
      .set(auth(first.token))
      .send({ currentPassword: "wrong", password: "another long password" })
      .expect(401);
    const changed = (
      await http
        .post("/api/me/password")
        .set(auth(first.token))
        .send({ currentPassword: password, password: "another long password" })
        .expect(200)
    ).body;
    for (const t of [first.token, second.token])
      await http.get("/api/me").set(auth(t)).expect(401);
    await http.get("/api/me").set(auth(changed.token)).expect(200);
    await http
      .post("/api/auth/login")
      .send({ phone: "2025550123", password })
      .expect(401);
    await http
      .post("/api/auth/login")
      .send({ phone: "2025550123", password: "another long password" })
      .expect(200);
  } finally {
    await db.close();
  }
});
test("concurrent number registrations have one winner and login guessing is bounded", async () => {
  const { db, http } = await setup();
  try {
    const a = (await http.post("/api/workspace").send({})).body,
      b = (await http.post("/api/workspace").send({})).body;
    const results = await Promise.all(
      [a, b].map((u) =>
        http
          .post("/api/auth/register")
          .set(auth(u.token))
          .send({ phone: "2025550123", password }),
      ),
    );
    assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
    assert.equal(
      (await db.query("SELECT count(*)::int n FROM user_credentials")).rows[0]
        .n,
      1,
    );
    for (let i = 0; i < 10; i++)
      await http
        .post("/api/auth/login")
        .send({ phone: "2025550123", password: "incorrect" })
        .expect(401);
    await http
      .post("/api/auth/login")
      .send({ phone: "2025550123", password: "incorrect" })
      .expect(429);
  } finally {
    await db.close();
  }
});
