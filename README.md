# Fairshare

[Open the live app](https://fairshare-five-chi.vercel.app) · [Deployment and verification](docs/DEPLOYMENT.md)

An Expo + TypeScript expense-sharing app for people and their agents. The web client and Node API deploy together on Vercel; production data lives in Neon PostgreSQL. The same React Native UI remains compatible with native Expo builds.

## Run locally

Requires Node.js 22+ and npm.

```sh
npm ci
npm run dev
```

Open the Expo web URL (usually http://localhost:8081). The API runs on http://localhost:3001. Without `DATABASE_URL`, a local PostgreSQL-compatible PGlite database is created under ignored `work/database/`. No account or cloud services are needed for local development. The app opens an empty private workspace automatically.

To preview the production web export instead:

```sh
npm run build
npm run preview
```

Then open http://localhost:3001. Stop the dev API first; only one process may open the local database at a time.

## What works

- Automatic private device workspaces, HTTP-only browser session cookies, native secure token storage, and group-level authorization. No sign-in or registration screen.
- Groups in USD, EUR, GBP, CAD, AUD, or EGP; named members without accounts; revocable invite codes for collaborators.
- Single-payer expenses, categories, dates, equal or exact splits, searchable history, soft removal of expenses.
- Integer-cent accounting, per-member balances, simplified repayment suggestions, recorded external payments.
- Receipt inbox, optional image attachment, editable review, approval or rejection; only approval changes balances.
- Revocable group-scoped agent credentials, provider-neutral REST API, OpenAPI document, and a tested MCP stdio adapter.
- Idempotent agent submissions and transactional receipt review, including concurrent requests.

## Deploy to Neon and Vercel

1. Create a free Neon PostgreSQL project. Copy its **pooled** connection string using the Neon console's Connect action. Store it as `DATABASE_URL` in your local `.env` and Vercel environment settings; do not commit it.
2. Apply the schema once against that database: `npm run db:migrate`. The SQL is in `server/schema.sql`. Migration is idempotent for this initial schema. Do not run schema setup per serverless request.
3. Import this repository into Vercel. Select **Other** as the framework. `vercel.json` sets `npm run build`, the `dist` output, and the `/api/*` rewrite to one Node function. Use Node.js 22 or newer.
4. Set Vercel's `DATABASE_URL` secret. Set `ALLOWED_ORIGINS` to the exact production URL (comma-separated if you intentionally support other web origins). Leave `EXPO_PUBLIC_API_URL` unset for same-origin hosted web.
5. Deploy with Vercel's connected repository workflow, or run `npx vercel login` followed by `npx vercel --prod`. Visit `/api/health` to verify database connectivity, then open the app to initialize a private workspace.
6. For preview deployments, use a separate Neon branch/database and run the schema there; avoid pointing untrusted previews at production data.

Vercel hosts the Expo **web export and API**, not iOS or Android binaries. For native development, set `EXPO_PUBLIC_API_URL` to your HTTPS backend (or LAN API address for a local device) before running `npx expo start`. Native distribution needs the usual Expo/EAS and Apple/Google accounts. No app-store build or publishing is included here.

## Invite people and split expenses

Open **Group settings → Copy invite link** or **Share invitation**. Send the link in your own text/email/chat app. The link opens an invitation landing screen, opens directly in a private workspace and survives reloads, and asks the recipient to join. A preview request never adds a member. Replacing the invitation link invalidates the previous link without removing existing members. Older raw codes still work in **Open invite link**.

Use **Add person by name** to track someone’s share without sending an invite or giving app access. Joining from a private workspace still creates a separate member; existing named entries are not automatically claimed or merged.

In **Add expense**, choose **Whole group** or **Selected people**, then **Equal** or **Exact**. The payer can be different from the people sharing the cost. Equal shares are previewed in cents; exact shares must add up to the total.

## Connect Claude, Grok, or another agent

Open a group → **Group settings → Agent connections → Set up an agent**. Create private access, choose MCP or HTTP setup, and follow the guide. Copy the key while it is shown. The app shows **Not connected yet** until an authenticated agent request reaches the server; **Check connection** reads that observed status. Give your agent the REST contract in [docs/AGENT_API.md](docs/AGENT_API.md), or run the MCP adapter with a compatible client. Provider-hosted chat products vary in whether they allow arbitrary tools; the REST API works with any agent runtime that can make HTTPS requests. No provider account or API key is required by Fairshare itself.

```sh
FAIRSHARE_URL=https://your-app.vercel.app FAIRSHARE_AGENT_KEY=your-private-key npm run mcp
```

Do not put secrets in a shell history. Prefer client secret configuration or environment injection for real keys. The command above illustrates variable names only. MCP has `get_group_context`, `submit_receipt`, and `get_receipt_status`. It is a local stdio bridge to the hosted API, not a publicly hosted MCP transport.

## Verify

```sh
npm run typecheck
npm test
npm run build
```

Tests cover cent rounding, zero-sum balances, invalid splits, authentication, cookie sessions, group isolation, collaborator permissions, receipt deduplication and conflict detection, concurrent approval, settlements, expense removal, key revocation, and a real MCP handshake/submission. Integration tests use an isolated in-memory PGlite engine. Production Neon connectivity must also be checked after provisioning.

## First-version boundaries

Agents provide extracted structured receipt fields; Fairshare does not call a vision model or perform OCR. Image attachments are limited to 1 MB and stored in PostgreSQL for a simple first version. Larger-scale storage should move to object storage. A group has one currency and one payer per expense; FX, recurring bills, percentages/shares, offline synchronization, payment processing, push notifications, and CSV export are not included. Managed named members and members joining by invitation remain separate; there is no claim/merge flow yet. There is no account recovery or cross-device sign-in. Device sessions are renewed for one year when the workspace opens; clearing storage, changing devices, or session expiration starts a separate empty workspace. Workspace/agent throttles are persisted in PostgreSQL; expired rate-limit rows and sessions should be pruned periodically in a larger deployment.

The product is an independent implementation. The bounded Splitwise/REA investigation, evidence, and limitations are documented in [docs/REVERSE_ENGINEERING.md](docs/REVERSE_ENGINEERING.md).

References: [Expo web deployment](https://docs.expo.dev/guides/publishing-websites/), [Vercel Node functions](https://vercel.com/docs/functions/runtimes/node-js), [Neon connection pooling](https://neon.com/docs/connect/connection-pooling).

## Everyday expense interface

Groups, Friends, Activity, and Workspace provide a compact list-based interface. Open a group to add expenses, inspect balances and totals, or record external payments. Group settings contains people/invitations and the optional receipt inbox and agent connections. The expense form's paid-by/split control opens Equal/Exact and Whole group/Selected people choices. Expense rows show your net share, and overall totals keep currencies separate. The visual reference and reconstruction limits are documented in `docs/REVERSE_ENGINEERING.md`.

## Private device workspaces

Opening the app automatically creates or resumes a private workspace. Existing valid sessions retain their original user ID, groups, and records. A fresh device receives a new empty identity and cannot access other groups without an invitation. Set a display name from Workspace at any time; it is not a registration step. See [workspace persistence](docs/WORKSPACES.md).

## Private bank transactions

Connect a US bank through Plaid, privately review transactions, and explicitly share selected purchases as expenses. Sandbox uses fake bank data. See [banking setup, privacy, APIs and native build requirements](docs/BANKING.md).
