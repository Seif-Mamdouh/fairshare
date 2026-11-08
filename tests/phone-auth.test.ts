import { URL } from "node:url";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomInt } from "node:crypto";
import { readFile } from "node:fs/promises";
import request from "supertest";
import { localDatabase } from "../server/db";
import { createApp } from "../server/app";
import { hash } from "../server/auth";
import {
  configuredPhoneProvider,
  normalizePhone,
  type PhoneProvider,
} from "../server/phone-provider";
class TestProvider implements PhoneProvider {
  calls = 0;
  checks = 0;
  entries = new Map<string, { phone: string; code: string }>();
  async start(phone: string) {
    this.calls++;
    const id = "VE" + String(this.calls).padStart(32, "0");
    this.entries.set(id, { phone, code: String(randomInt(100000, 999999)) });
    return id;
  }
  async check(id: string, phone: string, code: string) {
    this.checks++;
    return (
      this.entries.get(id)?.phone === phone &&
      this.entries.get(id)?.code === code
    );
  }
  code() {
    return [...this.entries.values()].at(-1)!.code;
  }
}
const one = "+12025550121",
  two = "+12025550122",
  three = "+12025550123";
async function setup(provider: PhoneProvider | null = new TestProvider()) {
  const db = await localDatabase();
  for (const sql of (
    await readFile(new URL("../server/schema.sql", import.meta.url), "utf8")
  )
    .split(";")
    .filter((s) => s.trim()))
    await db.query(sql);
  const http = request(createApp(db, { phoneProvider: provider }));
  return { db, http, provider: provider as TestProvider };
}
const auth = (token: string) => ({ Authorization: "Bearer " + token });
test("phone numbers normalize without assuming a country or accepting extensions", () => {
  assert.equal(normalizePhone("+1 (202) 555-0121"), one);
  for (const invalid of [
    "2025550121",
    "+1 12",
    "+12025550121 ext 3",
    "+12025550121x3",
    "+1abc2025550121",
  ])
    assert.throws(() => normalizePhone(invalid));
});
test("phone authentication fails closed with no provider and preserves email login", async () => {
  const { http, db } = await setup(null);
  try {
    assert.deepEqual((await http.get("/api/auth/methods")).body, {
      phone: false,
      email: true,
    });
    await http.post("/api/auth/phone/start").send({ phone: one }).expect(503);
    await http.post("/api/auth/phone/check").send({}).expect(503);
    const account = (
      await http
        .post("/api/auth/register")
        .send({
          name: "Existing",
          email: "existing@example.test",
          password: "a-strong-test-password",
        })
        .expect(201)
    ).body;
    const login = await http
      .post("/api/auth/login")
      .send({
        email: "existing@example.test",
        password: "a-strong-test-password",
      })
      .expect(200);
    assert.equal(login.body.user.id, account.user.id);
    assert.equal(
      (await db.query("SELECT count(*)::int n FROM phone_challenges")).rows[0]
        .n,
      0,
    );
  } finally {
    await db.close();
  }
});
test("verified phone sign-in reuses its account, persists sessions, accepts invitations, and logs out", async () => {
  const { http, db, provider } = await setup();
  try {
    const start = (
      await http
        .post("/api/auth/phone/start")
        .send({ phone: "+1 (202) 555-0121" })
        .expect(202)
    ).body;
    assert.deepEqual(Object.keys(start).sort(), [
      "challenge",
      "expiresIn",
      "message",
      "resendAfter",
    ]);
    assert.equal(
      (await db.query("SELECT count(*)::int n FROM users")).rows[0].n,
      0,
    );
    await http
      .post("/api/auth/phone/check")
      .send({ challenge: start.challenge, code: "000000" })
      .expect(400);
    const verified = await http
      .post("/api/auth/phone/check")
      .send({
        challenge: start.challenge,
        code: provider.code(),
        name: "Person",
      })
      .expect(200);
    const u = verified.body;
    assert.equal(u.user.phone_e164, one);
    assert.equal(u.user.email, null);
    const cookie = verified.headers["set-cookie"][0];
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /Max-Age=2592000/);
    assert.match(cookie, /SameSite=Strict/);
    assert.equal(
      (await http.get("/api/me").set("Cookie", cookie).expect(200)).body.id,
      u.user.id,
    );
    await http
      .post("/api/auth/phone/check")
      .send({ challenge: start.challenge, code: provider.code() })
      .expect(400);
    const owner = (
      await http
        .post("/api/auth/register")
        .send({
          name: "Owner",
          email: "owner@example.test",
          password: "a-strong-test-password",
        })
    ).body;
    const group = (
      await http
        .post("/api/groups")
        .set(auth(owner.token))
        .send({ name: "People", currency: "USD" })
    ).body;
    const detail = (
      await http.get("/api/groups/" + group.id).set(auth(owner.token))
    ).body;
    await http
      .post("/api/groups/join")
      .set(auth(u.token))
      .send({ inviteToken: detail.invite_token })
      .expect(200);
    await db.query("DELETE FROM rate_limits");
    const again = (
      await http.post("/api/auth/phone/start").send({ phone: one }).expect(202)
    ).body;
    const next = (
      await http
        .post("/api/auth/phone/check")
        .send({
          challenge: again.challenge,
          code: provider.code(),
          name: "Ignored rename",
        })
        .expect(200)
    ).body;
    assert.equal(next.user.id, u.user.id);
    assert.equal(next.user.name, "Person");
    assert.equal(
      (await http.get("/api/groups").set(auth(next.token))).body[0].id,
      group.id,
    );
    await http.post("/api/auth/logout").set(auth(next.token)).expect(200);
    await http.get("/api/me").set(auth(next.token)).expect(401);
    await db.query(
      "UPDATE sessions SET expires_at=now()-interval '1 second' WHERE token_hash=$1",
      [hash(u.token)],
    );
    await http.get("/api/me").set(auth(u.token)).expect(401);
  } finally {
    await db.close();
  }
});
test("phone linking requires the same authenticated owner plus verification and never merges accounts", async () => {
  const { http, db, provider } = await setup();
  try {
    const register = async (name: string) =>
      (
        await http
          .post("/api/auth/register")
          .send({
            name,
            email: name + "@example.test",
            password: "a-strong-test-password",
          })
      ).body;
    const a = await register("Same"),
      b = await register("Different");
    await http
      .post("/api/auth/phone/start")
      .send({ phone: one, purpose: "link" })
      .expect(401);
    const start = (
      await http
        .post("/api/auth/phone/start")
        .set(auth(a.token))
        .send({ phone: one, purpose: "link" })
        .expect(202)
    ).body;
    const body = { challenge: start.challenge, code: provider.code() };
    await http.post("/api/auth/phone/check").send(body).expect(401);
    await http
      .post("/api/auth/phone/check")
      .set(auth(b.token))
      .send(body)
      .expect(403);
    const linked = (
      await http
        .post("/api/auth/phone/check")
        .set(auth(a.token))
        .send(body)
        .expect(200)
    ).body;
    assert.equal(linked.user.id, a.user.id);
    assert.equal(linked.user.email, a.user.email);
    await db.query("DELETE FROM rate_limits");
    const conflict = (
      await http
        .post("/api/auth/phone/start")
        .set(auth(b.token))
        .send({ phone: one, purpose: "link" })
    ).body;
    await http
      .post("/api/auth/phone/check")
      .set(auth(b.token))
      .send({ challenge: conflict.challenge, code: provider.code() })
      .expect(409);
    const rows = (
      await db.query("SELECT id,phone_e164 FROM users ORDER BY name")
    ).rows;
    assert.equal(rows.length, 2);
    assert.equal(rows.find((r) => r.id === a.user.id).phone_e164, one);
    assert.equal(rows.find((r) => r.id === b.user.id).phone_e164, null);
    const login = (
      await http
        .post("/api/auth/login")
        .send({ email: a.user.email, password: "a-strong-test-password" })
        .expect(200)
    ).body;
    assert.equal(login.user.phone_e164, one);
  } finally {
    await db.close();
  }
});
test("phone attempts, expiry, resend throttling, and concurrent checks are enforced", async () => {
  const { http, db, provider } = await setup();
  try {
    const first = (
      await http.post("/api/auth/phone/start").send({ phone: one }).expect(202)
    ).body;
    await http.post("/api/auth/phone/start").send({ phone: one }).expect(429);
    assert.equal(provider.calls, 1);
    for (let i = 0; i < 5; i++)
      await http
        .post("/api/auth/phone/check")
        .send({ challenge: first.challenge, code: "000000" })
        .expect(400);
    await http
      .post("/api/auth/phone/check")
      .send({ challenge: first.challenge, code: provider.code() })
      .expect(400);
    assert.equal(provider.checks, 5);
    const expired = (
      await http.post("/api/auth/phone/start").send({ phone: two })
    ).body;
    await db.query(
      "UPDATE phone_challenges SET expires_at=now()-interval '1 second' WHERE token_hash=$1",
      [hash(expired.challenge)],
    );
    await http
      .post("/api/auth/phone/check")
      .send({ challenge: expired.challenge, code: provider.code() })
      .expect(400);
    const fresh = (
      await http.post("/api/auth/phone/start").send({ phone: three })
    ).body;
    const code = provider.code();
    const results = await Promise.all(
      [1, 2].map(() =>
        http
          .post("/api/auth/phone/check")
          .send({ challenge: fresh.challenge, code }),
      ),
    );
    assert.deepEqual(results.map((r) => r.status).sort(), [200, 400]);
    assert.equal(
      (await db.query("SELECT count(*)::int n FROM users")).rows[0].n,
      1,
    );
    assert.equal(
      (await db.query("SELECT count(*)::int n FROM sessions")).rows[0].n,
      1,
    );
  } finally {
    await db.close();
  }
});
test("Twilio adapter uses server credentials and only accepts matching approved verification", async () => {
  const env = {
    PHONE_AUTH_ENABLED: "true",
    TWILIO_ACCOUNT_SID: "AC" + "a".repeat(32),
    TWILIO_AUTH_TOKEN: "server-secret",
    TWILIO_VERIFY_SERVICE_SID: "VA" + "b".repeat(32),
  };
  assert.equal(
    configuredPhoneProvider({ ...env, PHONE_AUTH_ENABLED: "false" }),
    null,
  );
  assert.equal(
    configuredPhoneProvider({ ...env, TWILIO_AUTH_TOKEN: "" }),
    null,
  );
  const sid = "VE" + "c".repeat(32);
  let captured: any;
  let answer = { sid, to: one, status: "pending", valid: false };
  const transport = (async (url: any, init: any) => {
    captured = { url, init };
    return new Response(JSON.stringify(answer), { status: 200 });
  }) as typeof fetch;
  const p = configuredPhoneProvider(env, transport)!;
  assert.equal(await p.start(one), sid);
  assert.match(captured.url, /\/Verifications$/);
  assert.equal(captured.init.body.get("Channel"), "sms");
  assert.ok(captured.init.headers.Authorization.startsWith("Basic "));
  answer = { sid, to: one, status: "approved", valid: true };
  assert.equal(await p.check(sid, one, "123456"), true);
  assert.equal(captured.init.body.get("VerificationSid"), sid);
  answer = { ...answer, to: two };
  assert.equal(await p.check(sid, one, "123456"), false);
  const failed = configuredPhoneProvider(
    env,
    (async () =>
      new Response("secret upstream error", { status: 500 })) as typeof fetch,
  )!;
  await assert.rejects(
    failed.start(one),
    (e) => !String(e).includes("secret upstream"),
  );
});
