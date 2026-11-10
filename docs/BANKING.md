# Private bank transactions

Workspace → Banks & private transactions connects US checking, savings, and credit-card accounts through Plaid Transactions. Connecting does not post expenses. Press Sync transactions, choose a posted purchase, review the group, payer, participants and equal/exact splits, then explicitly share it as an expense. Credits, pending transactions, currency mismatches and duplicate imports cannot be shared. Sync does not modify an expense already imported.

Bank links, accounts and transactions belong to the current private workspace. Group collaborators and agent credentials cannot read them. Only the reviewed expense is shared. Account numbers, routing numbers, balances and raw provider responses are not stored or returned. No payment or money movement APIs are used. A phone number is a sign-in name, not proof of account ownership; password-authenticated sessions remain required.

## Server configuration

Apply the additive `server/schema.sql` migration before deploying. Set these server-only variables in the Vercel **Production** environment (the hosting environment is independent of Plaid's environment):

- `PLAID_ENV=sandbox` for fake test institutions and transactions.
- `PLAID_CLIENT_ID` and `PLAID_SECRET`: the dashboard's Sandbox credentials.
- `BANK_TOKEN_ENCRYPTION_KEY`: an independently generated 32-byte key, base64 encoded. Generate once using Node's `crypto.randomBytes(32).toString('base64')` and store securely. Never include secrets in `EXPO_PUBLIC_*` or source control.
- `PLAID_WEB_REDIRECT_URI=https://fairshare-five-chi.vercel.app/`: register this exact URI under Plaid Dashboard → Build → API → Allowed redirect URIs.
- `PLAID_LINK_EVENTS_ENABLED=false` for the initial Sandbox setup. Sandbox accepts the official SDK's public-token callback, but still requires an unexpired server-created Link session owned by the caller. All exchange traffic goes to Plaid's Sandbox endpoint.

Redeploy after changing environment variables. Sandbox is labeled in the UI and cannot connect real accounts. Standard Plaid test credentials are `user_good` / `pass_good` where the selected test institution asks for them; other Sandbox institutions simulate OAuth. Follow the test institution's screens.

For real banks, obtain Production access and credentials, arrange enablement of Link events with Plaid, and verify `/link/token/get` returns completed Link sessions/public tokens before setting `PLAID_LINK_EVENTS_ENABLED=true` and `PLAID_ENV=production`. Production always verifies public tokens against the caller's server-held Link token. Without this capability, production banking stays disabled. Disconnect Sandbox items before switching environments; connections cannot be decrypted/exchanged across environments. Do not simply replace the encryption key: token ciphertext and duplicate-import fingerprints depend on it. Rotation needs a deliberate re-encryption/fingerprint migration and a secure backup of the original key.

## Native apps

Web uses `react-plaid-link`; native uses the official `react-native-plaid-link-sdk` 13 session API, loaded lazily. Expo Go cannot run Plaid Link. Build a development client or signed release with Expo/EAS. The SDK autolinks; it is not an Expo config plugin. The project sets iOS deployment target 15.1 and Android minimum 25 / compile SDK 36 using `expo-build-properties`.

For Android, register `app.fairshare.mobile` under Plaid's Allowed Android package names and set `PLAID_ANDROID_PACKAGE_NAME` on the API. Android Link requests pass the package instead of a redirect URI.

For iOS, register `https://fairshare-five-chi.vercel.app/bank-oauth`, set `PLAID_IOS_REDIRECT_URI`, set the real `APPLE_TEAM_ID` on the API and `BANK_IOS_CALLBACK_HOST=fairshare-five-chi.vercel.app` in the native build environment. `app.config.ts` then declares the associated domain; `/.well-known/apple-app-site-association` serves the team/app mapping. Without a valid Apple team ID it returns 404. Complete signed-device Universal Link/OAuth testing before enabling the iOS platform. JavaScript exports do not verify native linking, signing or bank OAuth.

## Ownership and lifecycle

Access and short-lived Link tokens are AES-256-GCM encrypted with owner/type/record context. A browser may temporarily store its short-lived Link token for OAuth continuation; access tokens remain on the server. API responses allowlist private display fields. Transaction sync consumes a cursor, handles all pages atomically, restarts on pagination mutation, deduplicates provider IDs, and removes pending versions when posted replacements arrive. Import verifies current revision/amount and group membership inside a transaction. Throttles bound linking, exchanging, syncing and disconnecting.

Disconnect revokes the Plaid Item, erases private accounts/transactions and credentials, and preserves reviewed expenses plus a minimal HMAC duplicate-import ledger. If Plaid cannot confirm revocation, the connection is marked disconnecting and further sync/import is blocked until retry succeeds. Reconnect-required items show an attention state; disconnect and reconnect through Plaid. There is no automatic update-mode repair or background/webhook sync in this version. Sync reads data already available from Plaid rather than requesting paid refreshes; initial data can take time to appear.

Set a password on your original device before clearing its session. Then sign in with your phone number and password on any device to access the same private bank connections. A number alone cannot recover access; forgotten-password reset is not implemented.

## Workspace API

All routes except iOS association require the existing workspace cookie or native bearer session. Agent keys are not accepted.

| Method | Path                                | Purpose                                                                |
| ------ | ----------------------------------- | ---------------------------------------------------------------------- |
| GET    | `/api/bank`                         | Own configuration, links and accounts                                  |
| POST   | `/api/bank/link-token`              | `{platform, consent:true}` → owned Link session and short-lived token  |
| POST   | `/api/bank/link/:id/complete`       | `{publicToken}` → owned encrypted connection; completion is idempotent |
| POST   | `/api/bank/links/:id/sync`          | Atomically sync available transactions                                 |
| GET    | `/api/bank/transactions?offset=0`   | Own transactions, 100 per page, with `nextOffset`                      |
| POST   | `/api/bank/transactions/:id/import` | `{groupId,revision,expense}` → reviewed expense                        |
| DELETE | `/api/bank/links/:id`               | Revoke access and erase private bank data                              |
| GET    | `/api/bank/ios-association`         | Public Apple association metadata, when configured                     |

Tests use isolated databases and a mock provider; the opt-in Sandbox check uses only fake Plaid data. Never seed or run disposable integration tests against Production Neon.

References: [Plaid Transactions sync](https://plaid.com/docs/transactions/sync-migration/), [Link API and Link events](https://plaid.com/docs/api/link/), [React Native](https://plaid.com/docs/link/react-native/), [OAuth](https://plaid.com/docs/link/oauth/), [Sandbox](https://plaid.com/docs/sandbox/).
