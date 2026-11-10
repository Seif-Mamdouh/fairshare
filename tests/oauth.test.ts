import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import request from "supertest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import { createApp } from "../server/app";
import { localDatabase } from "../server/db";
import { redirectMatches } from "../server/oauth";
import { hash } from "../server/auth";
const auth = (value: string) => ({ Authorization: `Bearer ${value}` });
const verifier = "test-verifier-with-more-than-forty-three-characters-12345";
const challenge = createHash("sha256").update(verifier).digest("base64url");
async function setup() {
  const db = await localDatabase();
  for (const sql of (await readFile("server/schema.sql", "utf8"))
    .split(";")
    .filter((s) => s.trim()))
    await db.query(sql);
  let app: ReturnType<typeof createApp>;
  const server = createServer((req, res) => app(req, res));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const issuer = `http://127.0.0.1:${(server.address() as any).port}`;
  app = createApp(db, { banking: null, oauthIssuer: issuer });
  const http = request(app),
    resource = issuer + "/api/mcp";
  async function user(name: string) {
    const result = (await http.post("/api/workspace").send({}).expect(201))
      .body;
    // Existing password-authenticated workspace fixture; password behavior has its own integration suite.
    await db.query(
      "INSERT INTO user_credentials(user_id,password_hash) VALUES($1,$2)",
      [result.user.id, "fixture-credential-not-for-login"],
    );
    const group = (
      await http
        .post("/api/groups")
        .set(auth(result.token))
        .send({ name, currency: "USD" })
        .expect(201)
    ).body;
    return { ...result, group };
  }
  const owner = await user("Owner group"),
    other = await user("Other private group");
  async function register(extra: any = {}) {
    return (
      await http
        .post("/api/oauth/register")
        .send({
          client_name: "QA agent",
          redirect_uris: ["http://127.0.0.1/callback"],
          token_endpoint_auth_method: "none",
          ...extra,
        })
        .expect(201)
    ).body;
  }
  const client = await register();
  const params = {
    client_id: client.client_id,
    redirect_uri: "http://127.0.0.1:54321/callback",
    response_type: "code",
    code_challenge: challenge,
    code_challenge_method: "S256",
    state: "opaque-state",
    resource,
    scope: "receipts offline_access",
  };
  async function start(extra: any = {}) {
    const r = await http
      .get("/api/oauth/authorize")
      .query({ ...params, ...extra })
      .expect(303);
    const id = new URLSearchParams(
      new URL(r.headers.location).hash.slice(1),
    ).get("oauth")!;
    const consent = (
      await http
        .get("/api/oauth/consent/" + id)
        .set(auth(owner.token))
        .expect(200)
    ).body;
    return { id, consent };
  }
  async function approve(extra: any = {}) {
    const s = await start(extra);
    const r = await http
      .post("/api/oauth/consent/" + s.id)
      .set(auth(owner.token))
      .send({ nonce: s.consent.nonce, approve: true, groupId: owner.group.id })
      .expect(200);
    return new URL(r.body.redirectUrl);
  }
  function exchange(code: string, extra: any = {}) {
    return http
      .post("/api/oauth/token")
      .type("form")
      .send({
        grant_type: "authorization_code",
        client_id: client.client_id,
        code,
        code_verifier: verifier,
        redirect_uri: params.redirect_uri,
        resource,
        ...extra,
      });
  }
  async function tokens() {
    return (
      await exchange((await approve()).searchParams.get("code")!).expect(200)
    ).body;
  }
  const refresh = (value: string, extra: any = {}) =>
    http
      .post("/api/oauth/token")
      .type("form")
      .send({
        grant_type: "refresh_token",
        client_id: client.client_id,
        refresh_token: value,
        resource,
        ...extra,
      });
  const mcp = (value: string, name = "get_group_context", args: object = {}) =>
    http
      .post("/api/mcp")
      .set(auth(value))
      .set("Accept", "application/json, text/event-stream")
      .send({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name, arguments: args },
      });
  const close = async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((e) => (e ? reject(e) : resolve())),
    );
    await db.close();
  };
  return {
    db,
    http,
    issuer,
    resource,
    owner,
    other,
    client,
    params,
    register,
    start,
    approve,
    exchange,
    tokens,
    refresh,
    mcp,
    close,
  };
}

test("OAuth discovery, strict dynamic registration and loopback callback matching", async () => {
  const s = await setup();
  try {
    const r = await s.http
      .get("/api/mcp")
      .set("Host", "untrusted.example")
      .expect(401);
    assert.ok(r.headers["www-authenticate"].includes(s.issuer));
    assert.ok(!r.headers["www-authenticate"].includes("untrusted.example"));
    const meta = await s.http
      .get("/.well-known/oauth-protected-resource/api/mcp")
      .set("Origin", "https://client.example")
      .expect(200);
    assert.equal(meta.body.resource, s.resource);
    assert.deepEqual(meta.body.scopes_supported, ["receipts"]);
    assert.equal(meta.headers["access-control-allow-origin"], "*");
    assert.equal(meta.headers["access-control-allow-credentials"], undefined);
    const server = (
      await s.http.get("/.well-known/oauth-authorization-server").expect(200)
    ).body;
    assert.deepEqual(server.code_challenge_methods_supported, ["S256"]);
    assert.equal(server.authorization_response_iss_parameter_supported, true);
    for (const uri of [
      "http://remote.example/cb",
      "https://user:pass@example.com/cb",
      "https://example.com/#fragment",
      "javascript:alert(1)",
      "https://example.com/cb?code=bad",
      "https://*.example.com/cb",
    ])
      await s.http
        .post("/api/oauth/register")
        .send({ redirect_uris: [uri] })
        .expect(400);
    assert.ok(
      redirectMatches(
        "http://127.0.0.1/callback",
        "http://127.0.0.1:1111/callback",
      ),
    );
    assert.ok(
      !redirectMatches(
        "http://127.0.0.1/callback",
        "http://localhost:1111/callback",
      ),
    );
    assert.ok(
      !redirectMatches(
        "http://127.0.0.1/callback",
        "http://127.0.0.1:1111/wrong",
      ),
    );
    assert.ok(
      !redirectMatches(
        "https://client.example/cb",
        "https://client.example:444/cb",
      ),
    );
    assert.equal(s.client.client_secret, undefined);
    await s.http.post("/api/oauth/token").expect(400);
  } finally {
    await s.close();
  }
});

test("OAuth approval is explicit, password-session bound, CSRF protected and owner scoped; denial round-trips state", async () => {
  const s = await setup();
  try {
    for (const extra of [
      { redirect_uri: "https://attacker.example/cb" },
      { code_challenge_method: "plain" },
      { resource: "https://other.example/mcp" },
      { scope: "bank:read" },
      { code_challenge: "short" },
    ])
      await s.http
        .get("/api/oauth/authorize")
        .query({ ...s.params, ...extra })
        .expect(400);
    const a = await s.start();
    assert.deepEqual(
      a.consent.groups.map((g: any) => g.id),
      [s.owner.group.id],
    );
    await s.http.get("/api/oauth/consent/" + a.id).expect(401);
    const guest = (await s.http.post("/api/workspace").send({}).expect(201))
      .body;
    await s.http
      .get("/api/oauth/consent/" + a.id)
      .set(auth(guest.token))
      .expect(403);
    await s.http
      .get("/api/oauth/consent/" + a.id)
      .set(auth(s.other.token))
      .expect(400);
    const post = (body: any) =>
      s.http
        .post("/api/oauth/consent/" + a.id)
        .set(auth(s.owner.token))
        .send(body);
    await post({
      approve: true,
      groupId: s.owner.group.id,
      nonce: "wrong",
    }).expect(400);
    await post({
      approve: true,
      groupId: s.other.group.id,
      nonce: a.consent.nonce,
    }).expect(403);
    await s.http
      .post("/api/oauth/consent/" + a.id)
      .set(auth(s.owner.token))
      .set("Origin", "https://attacker.example")
      .send({
        approve: true,
        groupId: s.owner.group.id,
        nonce: a.consent.nonce,
      })
      .expect(403);
    assert.equal(
      (await s.db.query("SELECT count(*)::int n FROM agents")).rows[0].n,
      0,
    );
    const denied = new URL(
      (await post({ approve: false, nonce: a.consent.nonce }).expect(200)).body
        .redirectUrl,
    );
    assert.equal(denied.searchParams.get("state"), "opaque-state");
    assert.equal(denied.searchParams.get("iss"), s.issuer);
    assert.equal(denied.searchParams.get("error"), "access_denied");
    await post({
      approve: true,
      groupId: s.owner.group.id,
      nonce: a.consent.nonce,
    }).expect(400);
    assert.equal(
      (await s.db.query("SELECT count(*)::int n FROM agents")).rows[0].n,
      0,
    );
    const expired = await s.start();
    await s.db.query(
      "UPDATE oauth_requests SET expires_at=now()-interval '1 second'",
    );
    await s.http
      .get("/api/oauth/consent/" + expired.id)
      .set(auth(s.owner.token))
      .expect(400);
  } finally {
    await s.close();
  }
});

test("OAuth code exchange requires exact client, callback, resource and PKCE; access stays inside MCP group scope", async () => {
  const s = await setup();
  try {
    const callback = await s.approve(),
      code = callback.searchParams.get("code")!;
    assert.equal(callback.searchParams.get("state"), "opaque-state");
    assert.equal(callback.searchParams.get("iss"), s.issuer);
    await s
      .exchange(code, {
        code_verifier: "wrong-verifier-with-over-forty-three-characters-12345",
      })
      .expect(400);
    await s
      .exchange(code, { client_id: (await s.register()).client_id })
      .expect(400);
    await s
      .exchange(code, { redirect_uri: "http://127.0.0.1:54322/callback" })
      .expect(400);
    await s
      .exchange(code, { resource: "https://attacker.example/mcp" })
      .expect(400);
    const t = (await s.exchange(code).expect(200)).body;
    assert.equal(t.expires_in, 1800);
    assert.ok(t.refresh_token);
    const context = JSON.parse(
      (await s.mcp(t.access_token).expect(200)).body.result.content[0].text,
    );
    assert.equal(context.group.id, s.owner.group.id);
    assert.deepEqual(Object.keys(context.members[0]).sort(), ["id", "name"]);
    assert.ok(!JSON.stringify(context).includes(s.other.group.id));
    const draft = JSON.parse(
      (
        await s
          .mcp(t.access_token, "submit_receipt", {
            sourceId: "oauth-submit-it",
            title: "Lunch",
            currency: "USD",
            amountMinor: 1200,
            paidBy: context.members[0].id,
            splits: [{ memberId: context.members[0].id, amountMinor: 1200 }],
            spentOn: "2026-11-10",
          })
          .expect(200)
      ).body.result.content[0].text,
    );
    const posted = (
      await s
        .mcp(t.access_token, "finalize_receipts", {
          receiptIds: [draft.id],
          userConfirmed: true,
        })
        .expect(200)
    ).body.result;
    assert.ok(!posted.isError, JSON.stringify(posted));
    assert.equal(
      JSON.parse(posted.content[0].text).receipts[0].status,
      "approved",
    );
    await s.http
      .get("/api/v1/agent/context")
      .set(auth(t.access_token))
      .expect(401);
    await s.http.get("/api/groups").set(auth(t.access_token)).expect(401);
    await s.mcp(t.refresh_token).expect(401);
    await s.mcp(s.owner.token).expect(401);
    const stored = JSON.stringify(
      (await s.db.query("SELECT * FROM oauth_access_tokens")).rows,
    );
    assert.ok(!stored.includes(t.access_token));
    assert.ok(stored.includes(hash(t.access_token)));
    await s.db.query(
      "UPDATE oauth_access_tokens SET expires_at=now()-interval '1 second'",
    );
    const expired = await s.mcp(t.access_token).expect(401);
    assert.ok(
      expired.headers["www-authenticate"].includes("resource_metadata"),
    );
  } finally {
    await s.close();
  }
});

test("OAuth refresh rotates tokens, replay revokes the family, and group revocation invalidates every token", async () => {
  const s = await setup();
  try {
    const first = await s.tokens();
    const rotated = (await s.refresh(first.refresh_token).expect(200)).body;
    assert.notEqual(rotated.refresh_token, first.refresh_token);
    await s.mcp(rotated.access_token).expect(200);
    await s.refresh(first.refresh_token).expect(400);
    await s.mcp(rotated.access_token).expect(401);
    await s.mcp(first.access_token).expect(401);
    await s.refresh(rotated.refresh_token).expect(400);
    const fresh = await s.tokens();
    const grant = (
      await s.db.query(
        "SELECT g.* FROM oauth_grants g JOIN oauth_access_tokens t ON t.grant_id=g.id WHERE t.token_hash=$1",
        [hash(fresh.access_token)],
      )
    ).rows[0];
    await s.http
      .delete(`/api/groups/${s.owner.group.id}/agents/${grant.agent_id}`)
      .set(auth(s.owner.token))
      .expect(200);
    await s.mcp(fresh.access_token).expect(401);
    await s.refresh(fresh.refresh_token).expect(400);
    const revoked = await s.tokens();
    await s.http
      .post("/api/oauth/revoke")
      .type("form")
      .send({ client_id: s.client.client_id, token: revoked.refresh_token })
      .expect(200);
    await s.mcp(revoked.access_token).expect(401);
    await s.http
      .post("/api/oauth/revoke")
      .type("form")
      .send({ client_id: s.client.client_id, token: "unknown-token" })
      .expect(200);
  } finally {
    await s.close();
  }
});

test("confidential OAuth clients authenticate with their registered method and code redemption is atomic", async () => {
  const s = await setup();
  try {
    const c = await s.register({
      token_endpoint_auth_method: "client_secret_basic",
    });
    const code = (await s.approve({ client_id: c.client_id })).searchParams.get(
      "code",
    )!;
    await s.exchange(code, { client_id: c.client_id }).expect(401);
    await s
      .exchange(code, {
        client_id: c.client_id,
        client_secret: c.client_secret,
      })
      .expect(401);
    const redeem = () =>
      s
        .exchange(code, { client_id: c.client_id })
        .set(
          "Authorization",
          "Basic " +
            Buffer.from(c.client_id + ":" + c.client_secret).toString("base64"),
        );
    const results = await Promise.all([redeem(), redeem()]);
    assert.deepEqual(results.map((r) => r.status).sort(), [200, 400]);
    const stored = (
      await s.db.query("SELECT * FROM oauth_clients WHERE id=$1", [c.client_id])
    ).rows[0];
    assert.equal(stored.secret_hash, hash(c.client_secret));
    const successful = results.find((r) => r.status === 200)!;
    await s.mcp(successful.body.access_token).expect(401);
    const expiring = (await s.approve()).searchParams.get("code")!;
    await s.db.query(
      "UPDATE oauth_codes SET expires_at=now()-interval '1 second'",
    );
    await s.exchange(expiring).expect(400);
  } finally {
    await s.close();
  }
});

test("official SDK discovers, registers, opens authorization, exchanges PKCE code and calls MCP without manual keys", async () => {
  const s = await setup();
  let client: Client | undefined;
  try {
    let info: any,
      tokens: any,
      savedVerifier = "",
      authorization: URL | undefined;
    const provider: OAuthClientProvider = {
      redirectUrl: "http://127.0.0.1:54321/callback",
      clientMetadata: {
        client_name: "SDK browser agent",
        redirect_uris: ["http://127.0.0.1:54321/callback"],
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        token_endpoint_auth_method: "none",
      },
      state: () => "sdk-state",
      clientInformation: () => info,
      saveClientInformation: (value) => {
        info = value;
      },
      tokens: () => tokens,
      saveTokens: (value) => {
        tokens = value;
      },
      redirectToAuthorization: (url) => {
        authorization = url;
      },
      saveCodeVerifier: (value) => {
        savedVerifier = value;
      },
      codeVerifier: () => savedVerifier,
    };
    const transport = new StreamableHTTPClientTransport(new URL(s.resource), {
      authProvider: provider,
    });
    client = new Client({ name: "oauth-test", version: "1" });
    await assert.rejects(() => client!.connect(transport));
    assert.ok(authorization);
    assert.ok(info.client_id);
    const redirect = await s.http
      .get(authorization!.pathname + authorization!.search)
      .expect(303);
    const id = new URLSearchParams(
      new URL(redirect.headers.location).hash.slice(1),
    ).get("oauth")!;
    const consent = (
      await s.http
        .get("/api/oauth/consent/" + id)
        .set(auth(s.owner.token))
        .expect(200)
    ).body;
    const approved = (
      await s.http
        .post("/api/oauth/consent/" + id)
        .set(auth(s.owner.token))
        .send({
          nonce: consent.nonce,
          approve: true,
          groupId: s.owner.group.id,
        })
        .expect(200)
    ).body;
    const callback = new URL(approved.redirectUrl);
    assert.equal(callback.searchParams.get("state"), "sdk-state");
    await transport.finishAuth(callback.searchParams.get("code")!);
    assert.ok(tokens.access_token);
    assert.ok(tokens.refresh_token);
    client = new Client({ name: "oauth-test", version: "1" });
    await client.connect(
      new StreamableHTTPClientTransport(new URL(s.resource), {
        authProvider: provider,
      }),
    );
    assert.equal((await client.listTools()).tools.length, 5);
    const context: any = await client.callTool({
      name: "get_group_context",
      arguments: {},
    });
    assert.equal(
      JSON.parse(context.content[0].text).group.id,
      s.owner.group.id,
    );
    const oldRefresh = tokens.refresh_token;
    await s.db.query(
      "UPDATE oauth_access_tokens SET expires_at=now()-interval '1 second'",
    );
    assert.equal((await client.listTools()).tools.length, 5);
    assert.notEqual(tokens.refresh_token, oldRefresh);
  } finally {
    await client?.close();
    await s.close();
  }
});
