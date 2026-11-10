import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { URL } from "node:url";
import request from "supertest";
import { localDatabase } from "../server/db";
import { createApp } from "../server/app";
import { normalizePhone } from "../server/phone";

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
const auth = (token: string) => ({ Authorization: "Bearer " + token });

test("phone normalization accepts valid US and international numbers and rejects ambiguous input", () => {
  for (const input of [
    "2025550123",
    "(202) 555-0123",
    "+1 202 555 0123",
    "1-202-555-0123",
  ])
    assert.equal(normalizePhone(input), "+12025550123");
  assert.equal(normalizePhone("+44 20 7946 0958"), "+442079460958");
  for (const input of [
    "",
    "123",
    "+12345",
    "0000000000",
    "2025550123 ext 4",
    "call +12025550123",
    "2025550123;DROP TABLE users",
    "+44 20 7946 0958 x123",
    "2025550123".repeat(9),
  ])
    assert.equal(normalizePhone(input), null, input);
});

test("phone claims require an existing session, normalize uniquely, and preserve identity and shared data privacy", async () => {
  const { db, http } = await setup();
  try {
    await http.post("/api/me/phone").send({ phone: "2025550123" }).expect(401);
    const a = (await http.post("/api/workspace").send({}).expect(201)).body;
    const b = (await http.post("/api/workspace").send({}).expect(201)).body;
    const claimed = (
      await http
        .post("/api/me/phone")
        .set(auth(a.token))
        .send({ phone: "(202) 555-0123" })
        .expect(200)
    ).body;
    assert.equal(claimed.id, a.user.id);
    assert.equal(claimed.phone_e164, "+12025550123");
    assert.equal(
      (
        await db.query("SELECT phone_verified_at FROM users WHERE id=$1", [
          a.user.id,
        ])
      ).rows[0].phone_verified_at,
      null,
    );
    await http
      .post("/api/me/phone")
      .set(auth(a.token))
      .send({ phone: "+12025550123" })
      .expect(200);
    await http
      .post("/api/me/phone")
      .set(auth(b.token))
      .send({ phone: "1 (202) 555-0123" })
      .expect(409);
    const resumed = (
      await http.post("/api/workspace").set(auth(b.token)).send({}).expect(200)
    ).body;
    assert.equal(resumed.user.id, b.user.id);
    assert.equal(resumed.user.phone_e164, null);
    assert.equal(
      (await http.get("/api/me").set(auth(a.token)).expect(200)).body
        .phone_e164,
      "+12025550123",
    );
    assert.equal(
      (
        await http
          .post("/api/me/name")
          .set(auth(a.token))
          .send({ name: "Same person" })
          .expect(200)
      ).body.phone_e164,
      "+12025550123",
    );
    await http
      .post("/api/me/phone")
      .set(auth(a.token))
      .send({ phone: "+12025550124", userId: b.user.id })
      .expect(400);
    await http
      .post("/api/me/phone")
      .set(auth(a.token))
      .send({ phone: "123" })
      .expect(400);
    const group = (
      await http
        .post("/api/groups")
        .set(auth(a.token))
        .send({ name: "Friends", currency: "USD" })
        .expect(201)
    ).body;
    const detail = (
      await http
        .get("/api/groups/" + group.id)
        .set(auth(a.token))
        .expect(200)
    ).body;
    await http
      .post("/api/groups/join")
      .set(auth(b.token))
      .send({ inviteToken: detail.invite_token })
      .expect(200);
    const shared = (
      await http
        .get("/api/groups/" + group.id)
        .set(auth(b.token))
        .expect(200)
    ).body;
    assert.doesNotMatch(JSON.stringify(shared), /phone|12025550123/);
    const agent = (
      await http
        .post(`/api/groups/${group.id}/agents`)
        .set(auth(a.token))
        .send({ name: "Helper" })
        .expect(201)
    ).body;
    const context = (
      await http.get("/api/v1/agent/context").set(auth(agent.key)).expect(200)
    ).body;
    assert.doesNotMatch(JSON.stringify(context), /phone|12025550123/);
    await http
      .post("/api/me/phone")
      .set(auth(agent.key))
      .send({ phone: "2025550124" })
      .expect(401);
    await http.get("/api/me").set(auth(agent.key)).expect(401);
  } finally {
    await db.close();
  }
});

test("concurrent normalized phone claims have one winner enforced by the database", async () => {
  const { db, http } = await setup();
  try {
    const people = await Promise.all(
      [1, 2, 3].map(() => http.post("/api/workspace").send({}).expect(201)),
    );
    const results = await Promise.all(
      people.map((p, i) =>
        http
          .post("/api/me/phone")
          .set(auth(p.body.token))
          .send({
            phone: ["2025550123", "+1 (202) 555-0123", "1-202-555-0123"][i],
          }),
      ),
    );
    assert.deepEqual(results.map((r) => r.status).sort(), [200, 409, 409]);
    const winner = results.find((r) => r.status === 200)!.body.id;
    assert.equal(
      (
        await db.query(
          "SELECT count(*)::int n FROM users WHERE phone_e164=$1",
          ["+12025550123"],
        )
      ).rows[0].n,
      1,
    );
    await assert.rejects(
      db.query("UPDATE users SET phone_e164=$1 WHERE id<>$2", [
        "+12025550123",
        winner,
      ]),
      (e: any) => e.code === "23505",
    );
    for (const person of people) {
      const current = (
        await http.get("/api/me").set(auth(person.body.token)).expect(200)
      ).body;
      assert.equal(current.id, person.body.user.id);
      assert.equal(
        current.phone_e164,
        current.id === winner ? "+12025550123" : null,
      );
    }
  } finally {
    await db.close();
  }
});

test("changing a phone resets verification and releases the old number without moving history", async () => {
  const { db, http } = await setup();
  try {
    const a = (await http.post("/api/workspace").send({})).body;
    const b = (await http.post("/api/workspace").send({})).body;
    await db.query(
      "UPDATE users SET phone_e164='+12025550123',phone_verified_at=now() WHERE id=$1",
      [a.user.id],
    );
    const group = (
      await http
        .post("/api/groups")
        .set(auth(a.token))
        .send({ name: "Original group", currency: "USD" })
        .expect(201)
    ).body;
    await http
      .post("/api/me/phone")
      .set(auth(a.token))
      .send({ phone: "2025550123" })
      .expect(200);
    assert.ok(
      (
        await db.query("SELECT phone_verified_at FROM users WHERE id=$1", [
          a.user.id,
        ])
      ).rows[0].phone_verified_at,
    );
    await http
      .post("/api/me/phone")
      .set(auth(a.token))
      .send({ phone: "2025550124" })
      .expect(200);
    assert.equal(
      (
        await db.query("SELECT phone_verified_at FROM users WHERE id=$1", [
          a.user.id,
        ])
      ).rows[0].phone_verified_at,
      null,
    );
    await http
      .post("/api/me/phone")
      .set(auth(b.token))
      .send({ phone: "2025550123" })
      .expect(200);
    await http.get(`/api/groups/${group.id}`).set(auth(a.token)).expect(200);
    await http.get(`/api/groups/${group.id}`).set(auth(b.token)).expect(404);
    await http.post("/api/workspace").send({ phone: "2025550124" }).expect(400);
  } finally {
    await db.close();
  }
});
