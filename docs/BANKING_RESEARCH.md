# US bank transactions: implementation research

Checked 2026-11-10 against Plaid's official documentation and SDK repository. These notes distinguish provider facts from Fairshare implementation recommendations. No provider account, paid plan, or real bank was opened for this research.

## Scope and provider lifecycle

Use only Transactions with US institutions; omit Auth, Transfer, Identity, and payment products. The server issues a short-lived Link token, the user authorizes in Plaid/bank UI, and the server exchanges the public token. The resulting access token identifies the Item and must remain on the server. Disconnect calls `/item/remove`; deleting a local record alone does not revoke access or end Transactions subscription billing. [Items API](https://plaid.com/docs/api/items/)

The app should not promise instant banking data: `/transactions/sync` returns cached additions, modifications, and removals; new Items can initially return empty results. Plaid typically checks institutions one to four times daily. A user-facing “Sync” button can retrieve available updates without calling the separately enabled `/transactions/refresh` product. Initial history can be limited through `transactions.days_requested` when creating Link. [Transactions API](https://plaid.com/docs/api/products/transactions/)

## Server calls and Link binding

The following are request shapes, not credentials. Send `PLAID-CLIENT-ID` and `PLAID-SECRET` headers only from the server to the configured Sandbox or Production host.

```js
// POST /link/token/create
{
  user: { client_user_id: privateWorkspaceUserId },
  client_name: "Fairshare",
  products: ["transactions"],
  transactions: { days_requested: 90 },
  country_codes: ["US"],
  language: "en",
  // redirect_uri: registeredWebOrIOSCallback,
  // OR android_package_name: "app.fairshare.mobile"
}
// response: { link_token, expiration, request_id }

// POST /link/token/get
{ link_token: serverStoredLinkToken }
// response result token paths:
// link_sessions[].results.item_add_results[].public_token
// Legacy only: link_sessions[].on_success.public_token

// POST /item/public_token/exchange
{ public_token: verifiedPublicToken }
// response: { access_token, item_id, request_id }

// POST /item/remove
{ access_token: decryptedServerToken }
```

Use an opaque application user ID, not email/phone, for `client_user_id`. **Important activation prerequisite:** `/link/token/get` supplies complete session events by default for Hosted Link only. Standard web/native SDK sessions require Link events enablement from Plaid support/account manager. Once enabled, verify the submitted public token against the stored Link token's server result. If results are missing, fail closed and allow retry; do not silently accept unverified metadata. The result can contain multiple Item adds. [Link API](https://plaid.com/docs/api/link/#linktokenget)

Fairshare recommendation: persist a single-use Link attempt bound to the authenticated workspace user, with expiry; never let callers choose its owner. A client-supplied session ID or nonce alone does not prove a public token came from that Plaid session. Provider verification plus ownership checks closes this gap. Enforce uniqueness/replay behavior transactionally. Treat Link events enablement as an explicit setup requirement if using this binding method.

## Web Link and OAuth

Load the Link script directly from `https://cdn.plaid.com/link/v2/stable/link-initialize.js`, or use `react-plaid-link`. Do not bundle or self-host that script. `Plaid.create({token, onSuccess, onExit})` creates a handler; `handler.open()` presents Link; `handler.destroy()` cleans it up. The web success callback receives `public_token` and metadata. [Web SDK](https://plaid.com/docs/link/web/)

US bank coverage requires OAuth. For web redirect flows, preserve the original Link token and reinitialize with that same token plus `receivedRedirectUri: window.location.href`. Pass the exact callback URL supplied by Plaid, without adding fragments or query parameters. Register HTTPS redirect URLs in the Plaid Dashboard. For iOS, use a registered Universal Link with an Apple App Site Association file and associated-domain entitlement; the existing custom `fairshare://` scheme alone is insufficient. Android native Link uses a registered package name in `android_package_name` and must omit `redirect_uri`. [OAuth guide](https://plaid.com/docs/link/oauth/)

## React Native and Expo

The current major SDK is 13. Expo 54 / React Native 0.81 satisfy its Expo 52+ / RN 0.76+ requirements. Install `react-native-plaid-link-sdk`; native dependencies autolink. Rebuild a custom development/production app. **Expo Go cannot run Plaid Link.** Native requirements: iOS 15.1+, Xcode 16.1+; Android minimum API 25, compile SDK 36, Kotlin 1.9.25+. CocoaPods installs iOS dependencies. [React Native SDK](https://plaid.com/docs/link/react-native/)

```ts
import { createPlaidLinkSession } from "react-native-plaid-link-sdk";
const session = await createPlaidLinkSession({
  token: linkTokenFromAuthenticatedServer,
  onSuccess: (result) => completeOnServer(result.publicToken),
  onExit: (result) => showSafeExitMessage(result.error?.displayMessage),
});
await session.open();
```

Version 13 replaces the old global `create/open` API with session objects. `publicToken`, `linkSessionId`, and `metadataJson` use camelCase; do not copy v11/v12 examples. [Official v13 migration guide](https://github.com/plaid/react-native-plaid-link-sdk/blob/master/V13_MIGRATION_GUIDE.md)

The current package manifest is version 13.4.1 and ships an Expo native module configuration, **not an Expo config plugin**. Do not add `react-native-plaid-link-sdk` to `expo.plugins`. Its native module autolinks after installation and a native rebuild. [SDK package manifest](https://github.com/plaid/react-native-plaid-link-sdk/blob/master/package.json), [Expo module registration](https://github.com/plaid/react-native-plaid-link-sdk/blob/master/expo-module.config.json)

For managed prebuild, use the SDK-compatible `expo-build-properties` package to set native minimums. Preserve newer Expo defaults, including Kotlin, rather than downgrading to Plaid's minimum. This configuration is illustrative; use the app's actual registered package and callback domain:

```js
{
  expo: {
    ios: { associatedDomains: ["applinks:YOUR_CALLBACK_HOST"] },
    android: { package: "YOUR_REGISTERED_ANDROID_PACKAGE" },
    plugins: [["expo-build-properties", {
      ios: { deploymentTarget: "15.1" },
      android: { minSdkVersion: 25, compileSdkVersion: 36 }
    }]]
  }
}
```

These property names are supported by Expo SDK 54's plugin; install its compatible version with `npx expo install expo-build-properties`. [Expo build properties](https://docs.expo.dev/versions/latest/sdk/build-properties/), [SDK 54 property schema](https://github.com/expo/expo/blob/sdk-54/packages/expo-build-properties/src/pluginConfig.ts)

Recommendation: keep `.web.ts` and `.native.ts` launch adapters. Load the native module lazily and show a precise custom-build requirement when unavailable. Successful JavaScript exports do not verify a native build or OAuth return. Do not route native tokens through an ordinary web page or silently create a different browser workspace. Native activation must await correct signing, Universal Links/package registration, and real-device OAuth verification.

## Transaction synchronization and review

```js
// POST /transactions/sync
{ access_token: decryptedServerToken, cursor: savedCursor, count: 500 }
// response: { added, modified, removed, next_cursor, has_more, ... }
```

Omit `cursor` for initial history. Keep the original cursor before the first page. Fetch every page before committing transaction mutations and the final cursor atomically. On `TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION`, discard the partial batch and restart from the original cursor, with bounded retries. Do not persist each page independently. [Sync migration guide](https://plaid.com/docs/transactions/sync-migration/)

Posting can remove a pending ID and add a different posted ID, possibly on separate pages of one update. The posted row's `pending_transaction_id` references its predecessor when Plaid can match them. Amount/title may change, and even posted transactions can later be modified or removed. Apply all three change sets. [Transaction states](https://plaid.com/docs/transactions/transactions-data/)

Fairshare recommendations: import only posted, positive purchases in a supported currency. Keep raw transactions private to their owner. Explicitly review title, date, group, payer, participants, and equal/exact shares before saving one expense. Use a unique provider transaction reference scoped to its owner/Item and a transactionally locked import record. Preserve the already-approved expense if a bank transaction later changes or is removed; never silently rewrite shared history. Disconnect should erase bank secrets and unnecessary raw transaction data while preserving approved expenses and the minimal duplicate-import record.

Linking the same bank again can create a new Item and repeated data. Plaid suggests comparing institution plus account name/mask before exchanging a duplicate, while warning that masks are not unique and institution-only blocking can reject legitimate separate logins. Prefer update mode to repairing access by creating duplicates. [Duplicate Items](https://plaid.com/docs/link/duplicate-items/)

For expired credentials/consent (`ITEM_LOGIN_REQUIRED`), create a Link token with the existing `access_token` for update mode; do not exchange the update-mode result as a new Item. Existing access-token ownership remains unchanged. User input may be needed to repair consent; show a reconnect state instead of repeated failing sync attempts. [Update mode](https://plaid.com/docs/link/update-mode/)

Update-mode token creation omits `products` and Transactions-specific options. The callback still fires `onSuccess`, but its public token is not needed: the existing access token remains valid. Do not make update completion depend on a nonempty public token. [Update-mode request and callback examples](https://plaid.com/docs/link/update-mode/#using-update-mode)

Research limitation: `/link/token/get` documents no general `item_update_results` or session `status`; `finished_at` alone is not proof of success. The `SESSION_FINISHED` webhook does carry `status: "success" | "exited"`, but requires the same Link events activation for standard SDK sessions. [Link session API and webhook](https://plaid.com/docs/api/link/)

Implementation recommendation: after the update callback, recheck `/item/get` on the server using the already-owned Item token; only clear the reconnect state when Plaid reports no Item error, then resume synchronization. Do not trust a frontend success claim to create or reassign an Item. This avoids requiring undocumented update-result shapes. Disconnect-and-link is a fallback with duplicate-history risk, not equivalent to repairing the same Item.

## Production activation and handoff

Plaid's dashboard Launch Center is the current setup guide; the old launch checklist is no longer maintained. Production access, app/company details, security requirements, and OAuth availability must be confirmed in the actual account. [Launch checklist / Launch Center pointer](https://plaid.com/docs/launch-checklist/)

Plaid currently describes a Trial plan with up to ten Production Items; removing an Item does not restore that quota. A paid Production application asks for business/ownership details and a plan, and submitting it cannot be reverted to Trial. Therefore account creation, declarations, paid-plan selection, and production enablement must remain the user's provider handoff. Do not claim all users need a paid plan, or that Sandbox enables real banks. [Official production-plan guidance](https://support.plaid.com/hc/en-us/articles/39917307426967-How-do-I-upgrade-from-the-Trial-plan-to-a-paid-Production-plan)

Configure server-only client ID, environment-specific secret, independent encryption key, appropriate OAuth redirects, and native identifiers through the deployment secret manager. Never ask for bank passwords or provider secrets in chat. The user must personally authorize the bank's read-only consent screen. Loss of the guest device session does not recover the bank workspace; disclose this before linking and offer disconnect while the session remains available.
