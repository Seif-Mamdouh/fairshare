# Browser authorization for MCP

Fairshare supports OAuth authorization code + S256 PKCE at `https://fairshare-five-chi.vercel.app/api/mcp`. Add that URL to a compatible MCP client without a static Authorization header. Start Authenticate/Connect in the client; Fairshare opens in a browser, asks you to sign in with your existing phone/password, and lets you select one group you own. Only an explicit approval creates agent access. The browser returns an authorization code to the registered client callback; the client exchanges it and stores/refreshes its tokens. Fairshare does not receive a model-provider API key or account password.

In Codex CLI:

```sh
codex mcp add fairshare --url https://fairshare-five-chi.vercel.app/api/mcp
codex mcp login fairshare
```

If Fairshare is already configured with `bearer_token_env_var` or an Authorization header, remove that static credential setting before starting OAuth. Desktop/managed-client settings can differ.

In Claude Code:

```sh
claude mcp add --transport http fairshare https://fairshare-five-chi.vercel.app/api/mcp
```

Then use `/mcp` to authenticate. Claude custom connector interfaces can use the same URL when enabled for the account/plan. Other clients must support OAuth with dynamic registration and S256 PKCE. Adding a URL alone is not evidence of a completed account connection. The test suite exercises discovery through actual official MCP SDK client calls; vendor-account connections require the user's own approval.

## Scope and consent

`receipts` grants ten MCP tools: read group/member context; submit, read, list, edit, reject and post the agent’s own drafts; read, edit and void their linked expenses when the user asks. Edits use current record revisions and preserve IDs. Existing authorizations gain these own-record management capabilities when the client refreshes its tool list. Posting updates group balances; a draft alone does not. No bank data, phone/password data, other agents’ receipts, or payments are accessible. `offline_access` is accepted as an authorization-server scope for compatible clients; it is not advertised as a protected-resource requirement. Refresh tokens are issued when the client registers the refresh_token grant. Consent clearly describes the 30-day grant and refresh behavior.

Client names are self-declared, not verified provider identities. Consent displays the full registered callback address, requires an explicit group selection, and is shown on every authorization attempt. Only group owners can authorize or revoke agents. Use **Group settings → Agent connections → Revoke** to invalidate that connection's current access and refresh tokens immediately. Lost/revoked/expired connections must authorize again. Manual keys remain an advanced option for HTTP/stdio and backend agent runtimes.

## Endpoints and persistence

- `/.well-known/oauth-protected-resource/api/mcp` and root fallback: RFC 9728 metadata, referenced by every unauthorized MCP challenge.
- `/.well-known/oauth-authorization-server`: RFC 8414 metadata, S256, code and refresh grants, issuer-bound authorization responses.
- `POST /api/oauth/register`: bounded/rate-limited RFC 7591 dynamic registration. Public `none` and confidential `client_secret_post` / `client_secret_basic` authentication. The server returns its actual method explicitly.
- `GET /api/oauth/authorize`: validates client, redirect, scope, resource and S256, then redirects to the Fairshare consent UI. Invalid requests are rejected locally, never redirected to an unvalidated destination.
- `GET/POST /api/oauth/consent/:request`: existing password-enabled workspace session; one-time consent nonce bound to the exact session and request. POST chooses/validates the owner group or denies. State and issuer round-trip to the callback.
- `POST /api/oauth/token`: authorization-code redemption and rotating refresh, URL-encoded form input (JSON also accepted). The `resource` must equal the canonical MCP URL. Client, callback, PKCE and grant ownership are rechecked.
- `POST /api/oauth/revoke`: revokes the whole client-owned grant; unknown tokens return success without disclosing existence.

All state is in PostgreSQL, not process memory: clients, requests, grants, codes, access tokens and refresh-token families. Requests expire after 10 minutes, codes after 60 seconds, access tokens after 30 minutes, and grants/refresh tokens after 30 days without sliding extension. Codes, refresh tokens, access tokens and client secrets are stored only as hashes. Row locks make consent, code redemption and refresh single-use. Reusing a valid code or consumed refresh token revokes its grant and agent; wrong-client/PKCE attempts cannot revoke another client's grant.

Tokens are audience-bound to the MCP endpoint and cannot authenticate browser workspace or REST agent endpoints. Existing manual keys retain their REST/MCP behavior. Resource discovery, registration and token/revocation endpoints allow public CORS without credentials; browser workspace/consent and MCP origins retain existing restrictions. HTTP callback URLs are allowed only on loopback hosts; exact URI matching is enforced except the RFC 8252 port exception for literal loopback IPs. Client metadata URLs are not fetched: CIMD is not advertised; clients use DCR. This avoids a new arbitrary outbound-fetch surface.

## Deployment

Apply `npm run db:migrate` before deploying. `OAUTH_ISSUER_URL` is a canonical HTTPS origin, defaulting to the production Fairshare origin; local preview defaults to its localhost port. Discovery, callbacks and audience checks never use untrusted forwarded Host values. Vercel rewrites route the well-known documents to the API. Page framing is denied. No signing key is needed because tokens are opaque random credentials validated against the database. Expired request/code/token and unused registration records should be pruned periodically at larger scale; never delete consumed refresh records before their grant expires, because they detect replay.

References checked 2026-11-10: [MCP authorization](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization), [Codex MCP](https://learn.chatgpt.com/docs/extend/mcp), [Claude Code MCP](https://code.claude.com/docs/en/mcp).

## Vercel routing regression

Keep the exact `/api/mcp` rewrite before `/api/:path*`. Vercel compiles the catch-all into `/api?path=$1`; its Node request helper exposes that route capture in `req.query`. The MCP endpoint intentionally rejects query parameters, so using only the catch-all rejects authenticated initialization with HTTP 400 after OAuth succeeds. The exact rewrite adds no capture. `tests/mcp-http.test.ts` compiles the committed routing configuration with the official `@vercel/routing-utils` package and exercises initialization, notifications, tool discovery, method handling and continued rejection of client-supplied query parameters.
