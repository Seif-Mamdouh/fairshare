import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import request from "supertest";
import { localDatabase } from "../server/db";
import { createApp } from "../server/app";
import {
  clerkAuthorizedParties,
  configuredClerk,
  verifiedClerkPhones,
  type ClerkProfile,
  type ClerkProfileLookup,
  type ClerkVerifier,
} from "../server/clerk";

const password = "a long test phrase 42!";
const auth = (token: string) => ({ Authorization: "Bearer " + token });
// Stands in for Clerk: "clerk:<id>" is a valid session token for that Clerk
// user, "broken" simulates a verifier failure, anything else is invalid.
const fakeClerk: ClerkVerifier = async (token) => {
  if (token === "broken") throw new Error("JWKS unavailable");
  return token.startsWith("clerk:") ? { userId: token.slice(6) } : null;
};
async function setup(
  options: {
    clerk?: ClerkVerifier | null;
    clerkProfile?: ClerkProfileLookup | null;
  } = { clerk: fakeClerk },
) {
  const db = await localDatabase();
  const schema = await readFile("server/schema.sql", "utf8");
  // Applied twice: the Clerk column must be an idempotent, additive migration.
  for (const pass of [1, 2])
    for (const sql of schema.split(";").filter((s) => s.trim()))
      await db.query(sql);
  return { db, http: request(createApp(db, options)) };
}
const exchange = (
  http: ReturnType<typeof request>,
  token: string,
  session?: string,
  extra: Record<string, unknown> = {},
) => {
  const call = http.post("/api/auth/clerk");
  if (session) call.set(auth(session));
  return call.send({ token, ...extra });
};

test("Clerk sign-in creates a new Fairshare user and a normal session", async () => {
  const { db, http } = await setup();
  try {
    const created = (
      await exchange(http, "clerk:user_new", undefined, { name: "Ada" }).expect(
        200,
      )
    ).body;
    assert.equal(created.outcome, "created");
    assert.equal(created.user.name, "Ada");
    assert.equal(created.user.clerk_linked, true);
    assert.equal(created.user.sign_in_enabled, false);
    assert.equal(created.user.clerk_user_id, undefined);
    assert.match(created.token, /^fs_/);
    assert.equal(
      (
        await db.query("SELECT clerk_user_id FROM users WHERE id=$1", [
          created.user.id,
        ])
      ).rows[0].clerk_user_id,
      "user_new",
    );
    // The issued session is an ordinary Fairshare session for existing routes.
    const me = (await http.get("/api/me").set(auth(created.token)).expect(200))
      .body;
    assert.deepEqual(me, created.user);
    await http
      .post("/api/groups")
      .set(auth(created.token))
      .send({ name: "Flat", currency: "USD" })
      .expect(201);
    assert.equal(
      (await http.post("/api/workspace").set(auth(created.token)).send({})).body
        .user.clerk_linked,
      true,
    );
  } finally {
    await db.close();
  }
});

test("browser exchanges receive an HttpOnly cookie instead of a token", async () => {
  const { db, http } = await setup();
  try {
    const response = await http
      .post("/api/auth/clerk")
      .set("Origin", "http://localhost:8081")
      .send({ token: "clerk:user_web" })
      .expect(200);
    assert.equal(response.body.token, undefined);
    const cookie = String(response.headers["set-cookie"]);
    assert.match(cookie, /fairshare_session=fs_/);
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Strict/);
    const me = await http
      .get("/api/me")
      .set("Cookie", cookie.split(";")[0])
      .expect(200);
    assert.equal(me.body.id, response.body.user.id);
  } finally {
    await db.close();
  }
});

test("a returning Clerk user signs into the same account from any device", async () => {
  const { db, http } = await setup();
  try {
    const first = (await exchange(http, "clerk:user_back").expect(200)).body;
    const group = (
      await http
        .post("/api/groups")
        .set(auth(first.token))
        .send({ name: "Trip", currency: "EUR" })
        .expect(201)
    ).body;
    // A second device arrives with its own, unrelated anonymous workspace.
    const device = (await http.post("/api/workspace").send({}).expect(201))
      .body;
    const again = (
      await exchange(http, "clerk:user_back", device.token).expect(200)
    ).body;
    assert.equal(again.outcome, "signed_in");
    assert.equal(again.user.id, first.user.id);
    assert.notEqual(again.token, first.token);
    assert.equal(
      (await http.get("/api/groups").set(auth(again.token)).expect(200)).body[0]
        .id,
      group.id,
    );
    // The first device stays signed in; the replaced anonymous session is gone
    // and its workspace was neither merged nor relinked.
    await http.get("/api/me").set(auth(first.token)).expect(200);
    await http.get("/api/me").set(auth(device.token)).expect(401);
    assert.equal(
      (
        await db.query("SELECT clerk_user_id FROM users WHERE id=$1", [
          device.user.id,
        ])
      ).rows[0].clerk_user_id,
      null,
    );
    assert.equal(
      Number((await db.query("SELECT count(*) AS n FROM users")).rows[0].n),
      2,
    );
  } finally {
    await db.close();
  }
});

test("first Clerk sign-in links the device workspace, keeps its data and revokes older sessions", async () => {
  const { db, http } = await setup();
  try {
    const workspace = (await http.post("/api/workspace").send({}).expect(201))
      .body;
    const group = (
      await http
        .post("/api/groups")
        .set(auth(workspace.token))
        .send({ name: "Existing history", currency: "USD" })
        .expect(201)
    ).body;
    // A phone number without a password is not a credential and does not block linking.
    await http
      .post("/api/me/phone")
      .set(auth(workspace.token))
      .send({ phone: "2025550150" })
      .expect(200);
    // Someone who prepared this workspace might hold another session for it.
    await db.query(
      "INSERT INTO sessions(token_hash,user_id,expires_at) SELECT 'planted',user_id,expires_at FROM sessions WHERE user_id=$1",
      [workspace.user.id],
    );
    const linked = (
      await exchange(http, "clerk:user_link", workspace.token).expect(200)
    ).body;
    assert.equal(linked.outcome, "linked");
    assert.equal(linked.user.id, workspace.user.id);
    assert.equal(linked.user.clerk_linked, true);
    assert.equal(linked.user.phone_e164, "+12025550150");
    assert.equal(
      (await http.get("/api/groups").set(auth(linked.token)).expect(200))
        .body[0].id,
      group.id,
    );
    await http.get("/api/me").set(auth(workspace.token)).expect(401);
    assert.deepEqual(
      (
        await db.query("SELECT token_hash FROM sessions WHERE user_id=$1", [
          workspace.user.id,
        ])
      ).rows.length,
      1,
    );
    assert.equal(
      Number((await db.query("SELECT count(*) AS n FROM users")).rows[0].n),
      1,
    );
    // From a fresh device the same Clerk identity now reaches the same data.
    const fresh = (await exchange(http, "clerk:user_link").expect(200)).body;
    assert.equal(fresh.outcome, "signed_in");
    assert.equal(fresh.user.id, workspace.user.id);
  } finally {
    await db.close();
  }
});

test("a user linked to one Clerk identity is never taken over by another", async () => {
  const { db, http } = await setup();
  try {
    const alice = (await exchange(http, "clerk:user_alice").expect(200)).body;
    await http
      .post("/api/groups")
      .set(auth(alice.token))
      .send({ name: "Alice only", currency: "USD" })
      .expect(201);
    // Bob signs in with Clerk while presenting Alice's Fairshare session.
    const bob = (
      await exchange(http, "clerk:user_bob", alice.token).expect(200)
    ).body;
    assert.equal(bob.outcome, "created");
    assert.notEqual(bob.user.id, alice.user.id);
    assert.deepEqual(
      (await http.get("/api/groups").set(auth(bob.token)).expect(200)).body,
      [],
    );
    assert.equal(
      (
        await db.query("SELECT clerk_user_id FROM users WHERE id=$1", [
          alice.user.id,
        ])
      ).rows[0].clerk_user_id,
      "user_alice",
    );
    // Alice still opens her own account, and the database refuses a duplicate link.
    const back = (await exchange(http, "clerk:user_alice").expect(200)).body;
    assert.equal(back.user.id, alice.user.id);
    await assert.rejects(
      db.query("UPDATE users SET clerk_user_id='user_alice' WHERE id=$1", [
        bob.user.id,
      ]),
    );
  } finally {
    await db.close();
  }
});

test("linking a password-protected account requires its current password", async () => {
  const { db, http } = await setup();
  try {
    const workspace = (await http.post("/api/workspace").send({}).expect(201))
      .body;
    const account = (
      await http
        .post("/api/auth/register")
        .set(auth(workspace.token))
        .send({ phone: "2025550151", password })
        .expect(200)
    ).body;
    const refused = await exchange(http, "clerk:user_thief", account.token);
    assert.equal(refused.status, 409);
    assert.match(refused.body.error, /password-protected/);
    assert.equal(refused.body.token, undefined);
    assert.equal(refused.headers["set-cookie"], undefined);
    await exchange(http, "clerk:user_thief", account.token, {
      currentPassword: "not the right password",
    }).expect(409);
    // Nothing changed: no link, no new user, and the session still works.
    assert.equal(
      Number(
        (
          await db.query(
            "SELECT count(*) AS n FROM users WHERE clerk_user_id IS NOT NULL",
          )
        ).rows[0].n,
      ),
      0,
    );
    assert.equal(
      Number((await db.query("SELECT count(*) AS n FROM users")).rows[0].n),
      1,
    );
    await http.get("/api/me").set(auth(account.token)).expect(200);
    const linked = (
      await exchange(http, "clerk:user_owner", account.token, {
        currentPassword: password,
      }).expect(200)
    ).body;
    assert.equal(linked.outcome, "linked");
    assert.equal(linked.user.id, account.user.id);
    assert.equal(linked.user.sign_in_enabled, true);
    assert.equal(linked.user.clerk_linked, true);
    // Phone and password sign-in keeps working beside Clerk.
    const viaPassword = (
      await http
        .post("/api/auth/login")
        .send({ phone: "2025550151", password })
        .expect(200)
    ).body;
    assert.equal(viaPassword.user.id, account.user.id);
  } finally {
    await db.close();
  }
});

test("invalid, expired or unverifiable Clerk tokens are rejected without side effects", async () => {
  const { db, http } = await setup();
  try {
    const workspace = (await http.post("/api/workspace").send({}).expect(201))
      .body;
    for (const token of ["expired-or-forged", "broken"]) {
      const response = await exchange(http, token, workspace.token);
      assert.equal(response.status, 401);
      assert.match(response.body.error, /could not be verified/);
      assert.equal(response.body.token, undefined);
      assert.equal(response.headers["set-cookie"], undefined);
    }
    await http.post("/api/auth/clerk").send({}).expect(400);
    await http.post("/api/auth/clerk").send({ token: "" }).expect(400);
    await http
      .post("/api/auth/clerk")
      .send({ token: "clerk:user_x", clerkUserId: "user_victim" })
      .expect(400);
    await http
      .post("/api/auth/clerk")
      .set("Origin", "https://evil.example")
      .send({ token: "clerk:user_x" })
      .expect(403);
    await http.get("/api/me").set(auth(workspace.token)).expect(200);
    assert.equal(
      Number((await db.query("SELECT count(*) AS n FROM users")).rows[0].n),
      1,
    );
    assert.equal(
      (await db.query("SELECT clerk_user_id FROM users")).rows[0].clerk_user_id,
      null,
    );
  } finally {
    await db.close();
  }
});

test("the Clerk endpoint is absent and profiles are unchanged when Clerk is not configured", async () => {
  const saved = process.env.CLERK_SECRET_KEY;
  delete process.env.CLERK_SECRET_KEY;
  try {
    assert.equal(configuredClerk(), null);
    // Both an explicit null and the environment default disable the endpoint.
    for (const options of [{ clerk: null }, {}]) {
      const { db, http } = await setup(options);
      try {
        const response = await exchange(http, "clerk:user_any");
        assert.equal(response.status, 404);
        assert.match(response.body.error, /not configured/);
        const workspace = (
          await http.post("/api/workspace").send({}).expect(201)
        ).body;
        assert.deepEqual(Object.keys(workspace.user).sort(), [
          "id",
          "name",
          "phone_e164",
          "sign_in_enabled",
        ]);
        assert.deepEqual(
          Object.keys(
            (await http.get("/api/me").set(auth(workspace.token)).expect(200))
              .body,
          ).sort(),
          ["id", "name", "phone_e164", "sign_in_enabled"],
        );
        assert.equal(
          Number((await db.query("SELECT count(*) AS n FROM users")).rows[0].n),
          1,
        );
      } finally {
        await db.close();
      }
    }
  } finally {
    if (saved !== undefined) process.env.CLERK_SECRET_KEY = saved;
  }
});

test("the configured verifier rejects tokens Clerk did not sign and scopes web origins", async () => {
  const verify = configuredClerk({
    CLERK_SECRET_KEY: "sk_test_not_a_real_key",
    // A syntactically valid but unrelated public key keeps this test offline.
    CLERK_JWT_KEY:
      "-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAu1SU1LfVLPHCozMxH2Mo\n4lgOEePzNm0tRgeLezV6ffAt0gunVTLw7onLRnrq0/IzW7yWR7QkrmBL7jTKEn5u\n+qKhbwKfBstIs+bMY2Zkp18gnTxKLxoS2tFczGkPLPgizskuemMghRniWaoLcyeh\nkd3qqGElvW/VDL5AaWTg0nLVkjRo9z+40RQzuVaE8AkAFmxZzow3x+VJYKdjykkJ\n0iT9wCS0DRTXu269V264Vf/3jvredZiKRkgwlL9xNAwxXFg0x/XFw005UWVRIkdg\ncKWTjpBP2dPwVZ4WWC+9aGVd+Gyn1o0CLelf4rEjGoXbAAEgAqeGUxrcIlbjXfbc\nmwIDAQAB\n-----END PUBLIC KEY-----",
  });
  assert.ok(verify);
  const warn = console.warn;
  console.warn = () => {};
  try {
    assert.equal(await verify("not-a-jwt"), null);
    const unsigned = [
      { alg: "RS256", typ: "JWT" },
      { sub: "user_forged", sid: "sess_1", exp: 4102444800, iat: 1, nbf: 1 },
    ]
      .map((part) => Buffer.from(JSON.stringify(part)).toString("base64url"))
      .concat("AAAA")
      .join(".");
    assert.equal(await verify(unsigned), null);
  } finally {
    console.warn = warn;
  }
  assert.deepEqual(
    clerkAuthorizedParties({
      ALLOWED_ORIGINS: "https://app.example/, http://localhost:8081",
      OAUTH_ISSUER_URL: "https://app.example",
    }),
    ["https://app.example", "http://localhost:8081"],
  );
  assert.deepEqual(
    clerkAuthorizedParties({
      CLERK_AUTHORIZED_PARTIES: "https://only.example",
      ALLOWED_ORIGINS: "https://app.example",
    }),
    ["https://only.example"],
  );
});

test("a Clerk-linked user can reach MCP OAuth consent; an anonymous workspace cannot", async () => {
  const { db, http } = await setup();
  try {
    const anonymous = (await http.post("/api/workspace").send({}).expect(201))
      .body;
    const clerkUser = (await exchange(http, "clerk:user_agent").expect(200))
      .body;
    const unknownRequest = "/api/oauth/consent/" + "A".repeat(43);
    const blocked = await http.get(unknownRequest).set(auth(anonymous.token));
    assert.equal(blocked.status, 403);
    assert.equal(blocked.body.error, "access_denied");
    // Past the sign-in gate, the only failure left is the unknown request id.
    const allowed = await http.get(unknownRequest).set(auth(clerkUser.token));
    assert.notEqual(allowed.status, 403);
    assert.notEqual(allowed.body.error, "access_denied");
  } finally {
    await db.close();
  }
});

// Stands in for Clerk's Backend API: the verified phones and name of each Clerk
// user. An unknown user has none; "down" makes every lookup fail.
function fakeDirectory(people: Record<string, ClerkProfile>) {
  const state = { calls: [] as string[], down: false };
  const clerkProfile: ClerkProfileLookup = async (userId) => {
    state.calls.push(userId);
    if (state.down) throw new Error("Clerk Backend API unavailable");
    return people[userId] || { phones: [] };
  };
  return { state, options: { clerk: fakeClerk, clerkProfile } };
}
const snapshot = async (db: Awaited<ReturnType<typeof localDatabase>>) =>
  JSON.stringify([
    (
      await db.query(
        "SELECT id,name,phone_e164,phone_verified_at,clerk_user_id FROM users ORDER BY id",
      )
    ).rows,
    (await db.query("SELECT token_hash,user_id FROM sessions ORDER BY 1")).rows,
    (
      await db.query(
        "SELECT user_id,password_hash FROM user_credentials ORDER BY 1",
      )
    ).rows,
  ]);
/** A phone + password account with one group, as an existing user has. */
async function phoneAccount(http: ReturnType<typeof request>, phone: string) {
  const workspace = (await http.post("/api/workspace").send({}).expect(201))
    .body;
  const account = (
    await http
      .post("/api/auth/register")
      .set(auth(workspace.token))
      .send({ phone, password })
      .expect(200)
  ).body;
  const group = (
    await http
      .post("/api/groups")
      .set(auth(account.token))
      .send({ name: "Before Clerk", currency: "USD" })
      .expect(201)
  ).body;
  return { ...account, group };
}

test("a Clerk-verified phone links the existing account with no session and no password", async () => {
  const directory = fakeDirectory({
    // Clerk's formatting differs from what the user typed into Fairshare.
    user_owner: { phones: ["+1 (202) 555-0160"], name: "owner_name" },
  });
  const { db, http } = await setup(directory.options);
  try {
    const account = await phoneAccount(http, "202-555-0160");
    // A second device of the same account, signed in with phone + password.
    const other = (
      await http
        .post("/api/auth/login")
        .send({ phone: "2025550160", password })
        .expect(200)
    ).body;
    const linked = (await exchange(http, "clerk:user_owner").expect(200)).body;
    assert.equal(linked.outcome, "linked");
    assert.equal(linked.user.id, account.user.id);
    assert.equal(linked.user.clerk_linked, true);
    assert.equal(linked.user.phone_e164, "+12025550160");
    // The existing name is kept; Clerk's is only used for brand-new users.
    assert.equal(linked.user.name, account.user.name);
    assert.equal(
      (await http.get("/api/groups").set(auth(linked.token)).expect(200))
        .body[0].id,
      account.group.id,
    );
    assert.equal(
      Number((await db.query("SELECT count(*) AS n FROM users")).rows[0].n),
      1,
    );
    assert.ok(
      (await db.query("SELECT phone_verified_at FROM users")).rows[0]
        .phone_verified_at,
    );
    // Everything that predates the proof of ownership stops working: the
    // number was never verified by Fairshare, so the password and the older
    // sessions may belong to someone who only typed the number in first.
    await http.get("/api/me").set(auth(account.token)).expect(401);
    await http.get("/api/me").set(auth(other.token)).expect(401);
    assert.equal(linked.user.sign_in_enabled, false);
    await http
      .post("/api/auth/login")
      .send({ phone: "2025550160", password })
      .expect(401);
    // The next sign-in is an ordinary returning one and asks Clerk nothing.
    const calls = directory.state.calls.length;
    directory.state.down = true;
    const again = (await exchange(http, "clerk:user_owner").expect(200)).body;
    assert.equal(again.outcome, "signed_in");
    assert.equal(again.user.id, account.user.id);
    assert.equal(directory.state.calls.length, calls);
    await http.get("/api/me").set(auth(linked.token)).expect(200);
  } finally {
    await db.close();
  }
});

test("a verified phone match wins over a different presented session", async () => {
  const directory = fakeDirectory({
    user_owner: { phones: ["+12025550161"] },
  });
  const { db, http } = await setup(directory.options);
  try {
    const account = await phoneAccount(http, "2025550161");
    const device = (await http.post("/api/workspace").send({}).expect(201))
      .body;
    const linked = (
      await exchange(http, "clerk:user_owner", device.token).expect(200)
    ).body;
    assert.equal(linked.outcome, "linked");
    assert.equal(linked.user.id, account.user.id);
    // The device's own workspace is left unlinked and is not merged.
    assert.equal(
      (
        await db.query("SELECT clerk_user_id FROM users WHERE id=$1", [
          device.user.id,
        ])
      ).rows[0].clerk_user_id,
      null,
    );
    await http.get("/api/me").set(auth(device.token)).expect(401);
    assert.equal(
      Number((await db.query("SELECT count(*) AS n FROM users")).rows[0].n),
      2,
    );
  } finally {
    await db.close();
  }
});

test("a phone match never takes over a user linked to another Clerk identity", async () => {
  const directory = fakeDirectory({
    user_first: { phones: ["+12025550162"] },
    user_second: { phones: ["+12025550162"], name: "second" },
  });
  const { db, http } = await setup(directory.options);
  try {
    const account = await phoneAccount(http, "2025550162");
    const first = (await exchange(http, "clerk:user_first").expect(200)).body;
    assert.equal(first.user.id, account.user.id);
    const second = (await exchange(http, "clerk:user_second").expect(200)).body;
    assert.equal(second.outcome, "created");
    assert.notEqual(second.user.id, account.user.id);
    // The number is already held, so the new user is created without it.
    assert.equal(second.user.phone_e164, null);
    assert.equal(second.user.name, "second");
    assert.deepEqual(
      (await http.get("/api/groups").set(auth(second.token)).expect(200)).body,
      [],
    );
    assert.equal(
      (
        await db.query("SELECT clerk_user_id FROM users WHERE id=$1", [
          account.user.id,
        ])
      ).rows[0].clerk_user_id,
      "user_first",
    );
    await http.get("/api/me").set(auth(first.token)).expect(200);
  } finally {
    await db.close();
  }
});

test("only phone numbers Clerk verified are used", async () => {
  // The Backend API shape: unverified, failed and missing verifications drop out.
  assert.deepEqual(
    verifiedClerkPhones({
      primaryPhoneNumberId: "idn_2",
      phoneNumbers: [
        {
          id: "idn_1",
          phoneNumber: "+12025550163",
          verification: { status: "unverified" },
        },
        { id: "idn_3", phoneNumber: "+12025550165", verification: null },
        {
          id: "idn_4",
          phoneNumber: "+12025550166",
          verification: { status: "verified" },
        },
        {
          id: "idn_2",
          phoneNumber: "+12025550164",
          verification: { status: "verified" },
        },
        {
          id: "idn_5",
          phoneNumber: "+12025550167",
          verification: { status: "expired" },
        },
      ],
    }),
    ["+12025550164", "+12025550166"],
  );
  assert.deepEqual(verifiedClerkPhones({}), []);
  // An exchange for a Clerk user whose only phone is unverified links nothing.
  const directory = fakeDirectory({
    user_claims: {
      phones: verifiedClerkPhones({
        phoneNumbers: [
          {
            id: "idn_1",
            phoneNumber: "+12025550163",
            verification: { status: "unverified" },
          },
        ],
      }),
    },
  });
  const { db, http } = await setup(directory.options);
  try {
    const account = await phoneAccount(http, "2025550163");
    const result = (await exchange(http, "clerk:user_claims").expect(200)).body;
    assert.equal(result.outcome, "created");
    assert.notEqual(result.user.id, account.user.id);
    assert.equal(result.user.phone_e164, null);
    await http.get("/api/me").set(auth(account.token)).expect(200);
    await http
      .post("/api/auth/login")
      .send({ phone: "2025550163", password })
      .expect(200);
  } finally {
    await db.close();
  }
});

test("a failed Clerk lookup is a retryable 503 that creates and changes nothing", async () => {
  const directory = fakeDirectory({
    user_owner: { phones: ["+12025550168"] },
  });
  const { db, http } = await setup(directory.options);
  try {
    const account = await phoneAccount(http, "2025550168");
    const device = (await http.post("/api/workspace").send({}).expect(201))
      .body;
    const before = await snapshot(db);
    directory.state.down = true;
    for (const session of [undefined, device.token, account.token]) {
      const response = await exchange(http, "clerk:user_owner", session);
      assert.equal(response.status, 503);
      assert.match(response.body.error, /try again/);
      assert.equal(response.body.token, undefined);
      assert.equal(response.headers["set-cookie"], undefined);
    }
    assert.equal(await snapshot(db), before);
    await http.get("/api/me").set(auth(device.token)).expect(200);
    // Once Clerk answers, the same request links the right account.
    directory.state.down = false;
    const linked = (await exchange(http, "clerk:user_owner").expect(200)).body;
    assert.equal(linked.outcome, "linked");
    assert.equal(linked.user.id, account.user.id);
  } finally {
    await db.close();
  }
});

test("a new Clerk user keeps the verified phone and Clerk name", async () => {
  const directory = fakeDirectory({
    user_fresh: { phones: ["+12025550169"], name: "fresh_username" },
    user_blank: { phones: [], name: "   " },
  });
  const { db, http } = await setup(directory.options);
  try {
    const created = (await exchange(http, "clerk:user_fresh").expect(200)).body;
    assert.equal(created.outcome, "created");
    assert.equal(created.user.phone_e164, "+12025550169");
    assert.equal(created.user.name, "fresh_username");
    assert.equal(created.user.sign_in_enabled, false);
    assert.ok(
      (
        await db.query("SELECT phone_verified_at FROM users WHERE id=$1", [
          created.user.id,
        ])
      ).rows[0].phone_verified_at,
    );
    // The number is now taken: the phone form cannot claim it for someone else.
    const squatter = (await http.post("/api/workspace").send({}).expect(201))
      .body;
    await http
      .post("/api/auth/register")
      .set(auth(squatter.token))
      .send({ phone: "2025550169", password })
      .expect(409);
    const blank = (await exchange(http, "clerk:user_blank").expect(200)).body;
    assert.match(blank.user.name, /^Guest /);
    assert.equal(blank.user.phone_e164, null);
    assert.deepEqual(directory.state.calls, ["user_fresh", "user_blank"]);
  } finally {
    await db.close();
  }
});
