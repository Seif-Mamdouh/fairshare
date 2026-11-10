import express, {
  type Express,
  type Request,
  type Response,
  type RequestHandler,
} from "express";
import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { z, ZodError } from "zod";
import type { Database } from "./db";
import { hash, token } from "./auth";

export const MCP_SCOPE = "receipts";
export const oauthPublicPaths = new Set([
  "/.well-known/oauth-protected-resource",
  "/.well-known/oauth-protected-resource/api/mcp",
  "/.well-known/oauth-authorization-server",
  "/api/oauth/register",
  "/api/oauth/token",
  "/api/oauth/revoke",
]);
export function oauthIssuer(
  value = process.env.OAUTH_ISSUER_URL ||
    "https://fairshare-five-chi.vercel.app",
) {
  const url = new URL(value);
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/" ||
    (url.protocol !== "https:" &&
      !(
        url.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
      ))
  )
    throw new Error(
      "OAUTH_ISSUER_URL must be an HTTPS origin (HTTP loopback is allowed locally)",
    );
  return url.origin;
}
export function validRedirect(value: string) {
  try {
    const url = new URL(value);
    return (
      !url.username &&
      !url.password &&
      !url.hash &&
      !value.includes("#") &&
      !/[\s\\*]/.test(value) &&
      !url.searchParams.has("code") &&
      !url.searchParams.has("state") &&
      !url.searchParams.has("iss") &&
      !url.searchParams.has("error") &&
      (url.protocol === "https:" ||
        (url.protocol === "http:" &&
          ["127.0.0.1", "[::1]", "localhost"].includes(url.hostname)))
    );
  } catch {
    return false;
  }
}
// RFC 8252 permits only the port to vary for literal loopback IP callbacks.
export function redirectMatches(registered: string, requested: string) {
  if (!validRedirect(requested)) return false;
  if (registered === requested) return true;
  const a = new URL(registered),
    b = new URL(requested);
  if (a.protocol !== "http:" || !["127.0.0.1", "[::1]"].includes(a.hostname))
    return false;
  a.port = "";
  b.port = "";
  return a.href === b.href;
}
class OAuthError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
const invalid = (code: string, message: string, status = 400): never => {
  throw new OAuthError(code, message, status);
};
const scopes = (input: string | undefined) => {
  const list = [...new Set((input || MCP_SCOPE).split(" ").filter(Boolean))];
  if (
    !list.includes(MCP_SCOPE) ||
    list.some((s) => ![MCP_SCOPE, "offline_access"].includes(s))
  )
    invalid(
      "invalid_scope",
      "Request receipts access, optionally with offline_access",
    );
  return list.join(" ");
};
const secureEqual = (a: string, b: string) =>
  timingSafeEqual(Buffer.from(hash(a)), Buffer.from(hash(b)));
const text = z.string().min(1).max(2048);
const identifier = z.string().min(1).max(200);
const registration = z.object({
  client_name: z.string().trim().min(1).max(80).default("MCP client"),
  redirect_uris: z
    .array(z.string().max(2048).refine(validRedirect))
    .min(1)
    .max(10),
  token_endpoint_auth_method: z
    .enum(["none", "client_secret_post", "client_secret_basic"])
    .default("none"),
  grant_types: z
    .array(z.enum(["authorization_code", "refresh_token"]))
    .min(1)
    .default(["authorization_code", "refresh_token"]),
  response_types: z.array(z.literal("code")).length(1).default(["code"]),
  scope: z.string().max(200).optional(),
});
type Dependencies = {
  db: Database;
  issuer: string;
  user(req: Request): Promise<{ id: string; name: string }>;
  credential(req: Request): string;
  limit(key: string, max?: number, seconds?: number): Promise<void>;
};
export function installOAuth(app: Express, d: Dependencies) {
  const { db, issuer } = d;
  const resource = issuer + "/api/mcp";
  const route =
    (fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler =>
    (req, res, next) => {
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Referrer-Policy", "no-referrer");
      res.setHeader("X-Frame-Options", "DENY");
      Promise.resolve(fn(req, res)).catch((error) => {
        if (error instanceof OAuthError)
          return res
            .status(error.status)
            .json({ error: error.code, error_description: error.message });
        if (error instanceof ZodError)
          return res
            .status(400)
            .json({
              error: "invalid_request",
              error_description: "Malformed OAuth parameters",
            });
        next(error);
      });
    };
  const metadata = {
    issuer,
    authorization_endpoint: issuer + "/api/oauth/authorize",
    token_endpoint: issuer + "/api/oauth/token",
    registration_endpoint: issuer + "/api/oauth/register",
    revocation_endpoint: issuer + "/api/oauth/revoke",
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    token_endpoint_auth_methods_supported: [
      "none",
      "client_secret_post",
      "client_secret_basic",
    ],
    revocation_endpoint_auth_methods_supported: [
      "none",
      "client_secret_post",
      "client_secret_basic",
    ],
    code_challenge_methods_supported: ["S256"],
    scopes_supported: [MCP_SCOPE, "offline_access"],
    authorization_response_iss_parameter_supported: true,
    client_id_metadata_document_supported: false,
  };
  app.get(
    "/.well-known/oauth-authorization-server",
    route(async (_req, res) => res.json(metadata)),
  );
  app.get(
    [
      "/.well-known/oauth-protected-resource",
      "/.well-known/oauth-protected-resource/api/mcp",
    ],
    route(async (_req, res) =>
      res.json({
        resource,
        authorization_servers: [issuer],
        scopes_supported: [MCP_SCOPE],
        bearer_methods_supported: ["header"],
        resource_name: "Fairshare receipts",
      }),
    ),
  );
  app.post(
    "/api/oauth/register",
    route(async (req, res) => {
      await d.limit("oauth-register:" + req.ip, 20);
      const data = registration.parse(req.body);
      if (!data.grant_types.includes("authorization_code"))
        invalid("invalid_client_metadata", "authorization_code is required");
      const scope = scopes(data.scope),
        id = token("fsc_"),
        secret =
          data.token_endpoint_auth_method === "none"
            ? undefined
            : token("fss_");
      await db.query(
        "INSERT INTO oauth_clients(id,name,redirect_uris,auth_method,secret_hash,grant_types) VALUES($1,$2,$3::jsonb,$4,$5,$6::jsonb)",
        [
          id,
          data.client_name,
          JSON.stringify(data.redirect_uris),
          data.token_endpoint_auth_method,
          secret ? hash(secret) : null,
          JSON.stringify(data.grant_types),
        ],
      );
      res
        .status(201)
        .json({
          ...data,
          scope,
          client_id: id,
          client_id_issued_at: Math.floor(Date.now() / 1000),
          ...(secret
            ? { client_secret: secret, client_secret_expires_at: 0 }
            : {}),
        });
    }),
  );
  app.get(
    "/api/oauth/authorize",
    route(async (req, res) => {
      await d.limit("oauth-authorize:" + req.ip, 60);
      const q = z
        .object({
          client_id: identifier,
          redirect_uri: text,
          response_type: z.literal("code"),
          code_challenge: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
          code_challenge_method: z.literal("S256"),
          state: z.string().max(2048).optional(),
          resource: z.literal(resource),
          scope: z.string().max(200).optional(),
        })
        .parse(req.query);
      const client = (
        await db.query("SELECT * FROM oauth_clients WHERE id=$1", [q.client_id])
      ).rows[0];
      if (
        !client ||
        !client.redirect_uris.some((uri: string) =>
          redirectMatches(uri, q.redirect_uri),
        )
      )
        invalid(
          "invalid_request",
          "Unknown client or unregistered redirect URI",
        );
      const scope = scopes(q.scope),
        request = token("oar_");
      await db.query(
        "INSERT INTO oauth_requests(id_hash,client_id,redirect_uri,challenge,state,scope,resource,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,now()+interval '10 minutes')",
        [
          hash(request),
          client.id,
          q.redirect_uri,
          q.code_challenge,
          q.state ?? null,
          scope,
          resource,
        ],
      );
      res.redirect(303, issuer + "/#oauth=" + request);
    }),
  );
  async function signedIn(req: Request) {
    const u = await d.user(req);
    if (
      !(
        await db.query(
          "SELECT user_id FROM user_credentials WHERE user_id=$1",
          [u.id],
        )
      ).rows.length
    )
      invalid(
        "access_denied",
        "Sign in or set a password before authorizing an agent",
        403,
      );
    return u;
  }
  app.get(
    "/api/oauth/consent/:request",
    route(async (req, res) => {
      const u = await signedIn(req),
        id = hash(identifier.parse(req.params.request));
      await d.limit("oauth-consent:" + u.id, 60);
      const nonce = token();
      const request = await db.transaction(async (tx) => {
        const r = (
          await tx.query(
            "SELECT r.*,c.name FROM oauth_requests r JOIN oauth_clients c ON c.id=r.client_id WHERE r.id_hash=$1 AND r.expires_at>now() AND r.consumed_at IS NULL FOR UPDATE OF r",
            [id],
          )
        ).rows[0];
        if (
          !r ||
          (r.session_hash && r.session_hash !== hash(d.credential(req)))
        )
          invalid(
            "invalid_request",
            "Authorization expired or belongs to a different sign-in. Restart from your agent.",
          );
        await tx.query(
          "UPDATE oauth_requests SET user_id=$1,session_hash=$2,consent_hash=$3 WHERE id_hash=$4",
          [u.id, hash(d.credential(req)), hash(nonce), id],
        );
        return r;
      });
      const groups = (
        await db.query(
          "SELECT id,name,currency FROM groups WHERE owner_id=$1 ORDER BY name",
          [u.id],
        )
      ).rows;
      const restart = new URL(issuer + "/api/oauth/authorize");
      for (const [key, value] of Object.entries({
        client_id: request.client_id,
        redirect_uri: request.redirect_uri,
        response_type: "code",
        code_challenge: request.challenge,
        code_challenge_method: "S256",
        resource: request.resource,
        scope: request.scope,
        ...(request.state !== null ? { state: request.state } : {}),
      }))
        restart.searchParams.set(key, String(value));
      res.json({
        clientName: request.name,
        redirectUri: request.redirect_uri,
        scope: request.scope,
        groups,
        nonce,
        restartUrl: restart.href,
      });
    }),
  );
  app.post(
    "/api/oauth/consent/:request",
    route(async (req, res) => {
      const u = await signedIn(req);
      const data = z
        .object({
          nonce: identifier,
          approve: z.boolean(),
          groupId: identifier.optional(),
        })
        .strict()
        .parse(req.body);
      const result = await db.transaction(async (tx) => {
        const r = (
          await tx.query(
            "SELECT r.*,c.name FROM oauth_requests r JOIN oauth_clients c ON c.id=r.client_id WHERE r.id_hash=$1 AND r.expires_at>now() AND r.consumed_at IS NULL FOR UPDATE OF r",
            [hash(identifier.parse(req.params.request))],
          )
        ).rows[0];
        if (
          !r ||
          r.user_id !== u.id ||
          r.session_hash !== hash(d.credential(req)) ||
          !r.consent_hash ||
          !secureEqual(hash(data.nonce), r.consent_hash)
        )
          invalid(
            "invalid_request",
            "Authorization expired or changed. Restart from your agent.",
          );
        const callback = new URL(r.redirect_uri);
        if (r.state !== null) callback.searchParams.set("state", r.state);
        callback.searchParams.set("iss", issuer);
        if (data.approve) {
          const g = (
            await tx.query(
              "SELECT id FROM groups WHERE id=$1 AND owner_id=$2 FOR UPDATE",
              [data.groupId || "", u.id],
            )
          ).rows[0];
          if (!g) invalid("access_denied", "Choose a group you own", 403);
          const agentId = randomUUID(),
            grantId = randomUUID(),
            code = token("fac_");
          await tx.query(
            "INSERT INTO agents(id,group_id,name,token_hash) VALUES($1,$2,$3,$4)",
            [agentId, g.id, r.name, hash(token())],
          );
          await tx.query(
            "INSERT INTO oauth_grants(id,client_id,user_id,agent_id,scope,resource,expires_at) VALUES($1,$2,$3,$4,$5,$6,now()+interval '30 days')",
            [grantId, r.client_id, u.id, agentId, r.scope, r.resource],
          );
          await tx.query(
            "INSERT INTO oauth_codes(code_hash,grant_id,redirect_uri,challenge,expires_at) VALUES($1,$2,$3,$4,now()+interval '60 seconds')",
            [hash(code), grantId, r.redirect_uri, r.challenge],
          );
          callback.searchParams.set("code", code);
        } else callback.searchParams.set("error", "access_denied");
        await tx.query(
          "UPDATE oauth_requests SET consumed_at=now() WHERE id_hash=$1",
          [r.id_hash],
        );
        return callback.href;
      });
      res.json({ redirectUrl: result });
    }),
  );
  const form = express.urlencoded({
    extended: false,
    limit: "16kb",
    parameterLimit: 20,
  });
  async function authenticateClient(req: Request) {
    if (!req.body || typeof req.body !== "object")
      invalid("invalid_request", "Form parameters are required");
    let id = req.body.client_id,
      secret = req.body.client_secret;
    const basic = req.headers.authorization;
    if (basic) {
      if (!basic.startsWith("Basic ") || secret)
        invalid("invalid_client", "Invalid client authentication", 401);
      const decoded = Buffer.from(basic.slice(6), "base64").toString("utf8"),
        colon = decoded.indexOf(":");
      if (colon < 0)
        invalid("invalid_client", "Invalid client authentication", 401);
      try {
        const basicId = decodeURIComponent(decoded.slice(0, colon));
        if (id && id !== basicId)
          invalid("invalid_client", "Invalid client authentication", 401);
        id = basicId;
        secret = decodeURIComponent(decoded.slice(colon + 1));
      } catch {
        invalid("invalid_client", "Invalid client authentication", 401);
      }
    }
    const client = (
      await db.query("SELECT * FROM oauth_clients WHERE id=$1", [
        identifier.parse(id),
      ])
    ).rows[0];
    if (
      !client ||
      (client.auth_method === "none"
        ? !!secret || !!basic
        : typeof secret !== "string" ||
          secret.length > 200 ||
          !secureEqual(hash(secret), client.secret_hash) ||
          (client.auth_method === "client_secret_basic") !== !!basic)
    )
      invalid("invalid_client", "Invalid client authentication", 401);
    return client;
  }
  async function grant(tx: Database, id: string, clientId: string) {
    return (
      await tx.query(
        "SELECT g.* FROM oauth_grants g JOIN agents a ON a.id=g.agent_id JOIN groups p ON p.id=a.group_id WHERE g.id=$1 AND g.client_id=$2 AND g.revoked_at IS NULL AND g.expires_at>now() AND a.revoked_at IS NULL AND p.owner_id=g.user_id FOR UPDATE OF g",
        [id, clientId],
      )
    ).rows[0];
  }
  async function issue(tx: Database, g: any, client: any) {
    const access = token("foa_"),
      refresh = client.grant_types.includes("refresh_token")
        ? token("for_")
        : undefined;
    await tx.query(
      "INSERT INTO oauth_access_tokens(token_hash,grant_id,expires_at) VALUES($1,$2,LEAST($3::timestamptz,now()+interval '30 minutes'))",
      [hash(access), g.id, g.expires_at],
    );
    if (refresh)
      await tx.query(
        "INSERT INTO oauth_refresh_tokens(token_hash,grant_id,expires_at) VALUES($1,$2,$3)",
        [hash(refresh), g.id, g.expires_at],
      );
    return {
      access_token: access,
      token_type: "Bearer",
      expires_in: Math.max(
        0,
        Math.min(
          1800,
          Math.floor((new Date(g.expires_at).getTime() - Date.now()) / 1000),
        ),
      ),
      scope: g.scope,
      ...(refresh ? { refresh_token: refresh } : {}),
    };
  }
  app.post(
    "/api/oauth/token",
    form,
    route(async (req, res) => {
      await d.limit("oauth-token:" + req.ip, 120);
      const client = await authenticateClient(req);
      if (req.body.resource !== resource)
        invalid(
          "invalid_target",
          "The resource must be this Fairshare MCP endpoint",
        );
      if (req.body.scope !== undefined)
        scopes(z.string().max(200).parse(req.body.scope));
      if (req.body.grant_type === "authorization_code") {
        const body = z
          .object({
            code: identifier,
            redirect_uri: text,
            code_verifier: z.string().regex(/^[A-Za-z0-9._~-]{43,128}$/),
          })
          .parse(req.body);
        const result = await db.transaction(async (tx) => {
          const c = (
            await tx.query(
              "SELECT * FROM oauth_codes WHERE code_hash=$1 AND expires_at>now() FOR UPDATE",
              [hash(body.code)],
            )
          ).rows[0];
          const g = c && (await grant(tx, c.grant_id, client.id));
          const challenge = createHash("sha256")
            .update(body.code_verifier)
            .digest("base64url");
          if (
            !c ||
            !g ||
            c.redirect_uri !== body.redirect_uri ||
            !secureEqual(challenge, c.challenge)
          )
            invalid(
              "invalid_grant",
              "Code is invalid, expired, or already used",
            );
          if (c.consumed_at) {
            await tx.query(
              "UPDATE oauth_grants SET revoked_at=now() WHERE id=$1",
              [g.id],
            );
            await tx.query("UPDATE agents SET revoked_at=now() WHERE id=$1", [
              g.agent_id,
            ]);
            return null;
          }
          if (req.body.scope && req.body.scope !== g.scope)
            invalid("invalid_scope", "Scope must match the approved grant");
          await tx.query(
            "UPDATE oauth_codes SET consumed_at=now() WHERE code_hash=$1",
            [hash(body.code)],
          );
          return issue(tx, g, client);
        });
        if (!result)
          invalid(
            "invalid_grant",
            "Authorization code reuse detected. Authorize again.",
          );
        return res.json(result);
      }
      if (req.body.grant_type !== "refresh_token")
        invalid(
          "unsupported_grant_type",
          "Use authorization_code or refresh_token",
        );
      if (!client.grant_types.includes("refresh_token"))
        invalid(
          "unauthorized_client",
          "Refresh is not registered for this client",
        );
      const refresh = identifier.parse(req.body.refresh_token);
      const result = await db.transaction(async (tx) => {
        const t = (
          await tx.query(
            "SELECT * FROM oauth_refresh_tokens WHERE token_hash=$1 AND expires_at>now() FOR UPDATE",
            [hash(refresh)],
          )
        ).rows[0];
        const g = t && (await grant(tx, t.grant_id, client.id));
        if (!g) invalid("invalid_grant", "Refresh token is invalid or expired");
        if (t.consumed_at) {
          // Commit revocation even when returning an error for a replayed refresh token.
          await tx.query(
            "UPDATE oauth_grants SET revoked_at=now() WHERE id=$1",
            [g.id],
          );
          await tx.query("UPDATE agents SET revoked_at=now() WHERE id=$1", [
            g.agent_id,
          ]);
          return null;
        }
        if (req.body.scope && req.body.scope !== g.scope)
          invalid("invalid_scope", "Scope must match the approved grant");
        await tx.query(
          "UPDATE oauth_refresh_tokens SET consumed_at=now() WHERE token_hash=$1",
          [hash(refresh)],
        );
        return issue(tx, g, client);
      });
      if (!result)
        invalid(
          "invalid_grant",
          "Refresh token reuse detected. Authorize again.",
        );
      res.json(result);
    }),
  );
  app.post(
    "/api/oauth/revoke",
    form,
    route(async (req, res) => {
      await d.limit("oauth-revoke:" + req.ip, 120);
      const client = await authenticateClient(req),
        value = hash(identifier.parse(req.body.token));
      await db.transaction(async (tx) => {
        const g = (
          await tx.query(
            "SELECT g.* FROM oauth_grants g WHERE g.client_id=$1 AND (g.id IN (SELECT grant_id FROM oauth_access_tokens WHERE token_hash=$2) OR g.id IN (SELECT grant_id FROM oauth_refresh_tokens WHERE token_hash=$2)) FOR UPDATE",
            [client.id, value],
          )
        ).rows[0];
        if (g) {
          await tx.query(
            "UPDATE oauth_grants SET revoked_at=now() WHERE id=$1",
            [g.id],
          );
          await tx.query("UPDATE agents SET revoked_at=now() WHERE id=$1", [
            g.agent_id,
          ]);
        }
      });
      res.status(200).json({});
    }),
  );
  return {
    challenge: `Bearer resource_metadata="${issuer}/.well-known/oauth-protected-resource/api/mcp", scope="${MCP_SCOPE}"`,
    async authenticate(value: string) {
      return (
        await db.query(
          "SELECT a.* FROM oauth_access_tokens t JOIN oauth_grants g ON g.id=t.grant_id JOIN agents a ON a.id=g.agent_id JOIN groups p ON p.id=a.group_id WHERE t.token_hash=$1 AND t.expires_at>now() AND g.expires_at>now() AND g.revoked_at IS NULL AND a.revoked_at IS NULL AND g.resource=$2 AND p.owner_id=g.user_id",
          [hash(value), resource],
        )
      ).rows[0];
    },
  };
}
