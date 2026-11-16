# Clerk sign-in

Clerk is an optional sign-in method for web and native. It is off until both keys are set. With `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` unset the client never loads the Clerk SDK, and with `CLERK_SECRET_KEY` unset `POST /api/auth/clerk` answers 404. Phone number + password ([WORKSPACES.md](WORKSPACES.md)) keeps working either way.

## How it works

Clerk only proves who the person is. Fairshare still issues its own session.

1. The client signs the person in with Clerk (email + password, with an emailed code for new accounts and new devices).
2. The client sends the short-lived Clerk session token to `POST /api/auth/clerk` as `{ "token": "..." }`.
3. The server verifies the token with `@clerk/backend` (`verifyToken`), finds or creates the Fairshare user, and issues the normal Fairshare session: the HttpOnly `fairshare_session` cookie on web, a bearer token stored in SecureStore on native.

Group authorization, bank data, agent keys and MCP OAuth all keep using that Fairshare session. The only downstream change is that MCP OAuth consent accepts a Clerk-linked user as signed in, where it previously required a password credential.

The response is `{ user, outcome, token? }`. `outcome` is `signed_in`, `linked` or `created`. `user.clerk_linked` is `true` for linked users and absent for everyone else, so existing profiles are unchanged. The Clerk user id is stored in the nullable unique column `users.clerk_user_id` and is never returned by the API.

## Linking rules

On each exchange, in order:

1. **Already linked.** If a Fairshare user has this Clerk id, sign into it. A different workspace open on the device is left as it is; nothing is merged.
2. **Link this device's workspace.** Otherwise, if the request carries a valid Fairshare session whose user has no Clerk id, that user is linked, so the groups and data already on the device are kept. Every older session of that user is revoked and a fresh one is issued, so a session copy held by whoever prepared the workspace stops working.
3. **Create.** Otherwise a new user is created.

Guards:

- A user linked to one Clerk id is never reassigned. Signing in with a second Clerk account while the first one's session is present creates a separate user. The unique column also refuses a duplicate at the database level.
- A workspace with a phone + password credential is not linked from a session alone. The request must include `currentPassword`; without it the server answers 409 and changes nothing. This stops someone with brief access to a signed-in device from attaching their own Clerk account as a permanent way in. The app does not offer this path yet (see Limits).
- A phone number without a password is not a credential and does not block linking.
- The Clerk user id comes only from the verified token. The body cannot name a user.

## Setup

### Clerk dashboard

1. Create an application at [dashboard.clerk.com](https://dashboard.clerk.com).
2. **User & authentication**: enable **Email**, require it at sign-up, and verify with an **email verification code**. Enable **Password**. Leave username, phone and name fields not required: the in-app form collects only email and password.
3. For iOS/Android, make sure the **Native API** is enabled on the **Native applications** page.
4. Copy the **Publishable key** and **Secret key** from **API keys**.
5. For a production instance, add your domain as Clerk asks and use the `pk_live_` / `sk_live_` keys.

### Environment variables

| Variable | Where | Purpose |
| --- | --- | --- |
| `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` | client, build time | Turns the Clerk sign-in panel on. Public by design. |
| `CLERK_SECRET_KEY` | server only | Turns `POST /api/auth/clerk` on and verifies tokens. |
| `CLERK_JWT_KEY` | server only, optional | PEM public key from **API keys → JWT public key**. Verifies without fetching Clerk's JWKS. |
| `CLERK_AUTHORIZED_PARTIES` | server only, optional | Comma-separated web origins allowed in the token's `azp` claim. Defaults to `ALLOWED_ORIGINS` plus `OAUTH_ISSUER_URL`. |

Locally, add the two keys to `.env` and restart both processes. Expo inlines `EXPO_PUBLIC_*` values when bundling; if the panel does not appear after adding the key, restart with `npx expo start --clear`. The web origin you open the app from (`http://localhost:8081` for `npm run dev`) must be an authorized party, which the default `ALLOWED_ORIGINS` already covers. For `npm run preview` (`http://localhost:3001`), add that origin to `ALLOWED_ORIGINS` or `CLERK_AUTHORIZED_PARTIES`. A rejected token is logged on the server with Clerk's reason, never with the token.

On Vercel, add `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` to the project's environment variables, make sure `ALLOWED_ORIGINS` (or `CLERK_AUTHORIZED_PARTIES`) contains the exact production origin, run `npm run db:migrate` once against the production database to add `users.clerk_user_id`, and redeploy. The publishable key must be present at build time; the secret key must never use the `EXPO_PUBLIC_` prefix.

Native builds read the publishable key at bundle time too and need `EXPO_PUBLIC_API_URL`. The custom email flow needs no config plugin and runs in Expo Go.

## Sign-out

Signing out revokes the Fairshare session on the server, clears the stored native token, and ends the Clerk session on the device. If Clerk cannot be reached, the Fairshare sign-out still completes; the sign-in panel then shows “Continue” for the remembered Clerk account and never signs back in without a tap.

## Packages and compatibility

- Client: `@clerk/expo` 4.x (Clerk Core 3; the older `@clerk/clerk-expo` is deprecated). It supports Expo 54–58 and React Native 0.75+. `ClerkProvider` wraps the app in `client/ClerkAuth.tsx` with `tokenCache` from `@clerk/expo/token-cache`, which stores Clerk's client token in `expo-secure-store` on native and is unused on web.
- Server: `@clerk/backend` 3.x.
- Clerk's packages declare a React peer range of `~19.1.4`, while Expo 54 pins React 19.1.0, which React Native 0.81 requires exactly. npm installs with a peer warning. React is deliberately not bumped.
- On web, `@clerk/expo` loads Clerk's browser script at runtime from your Clerk Frontend API host. A content security policy or network filter must allow that host.
- The Clerk code is a separate lazily loaded web chunk, fetched only when the publishable key is set.

## Limits

- Email + password only. Social sign-in, passkeys, SMS, authenticator-app MFA and Clerk organizations are not wired up; an account that requires one of them gets a clear error. Password reset happens in Clerk, not in this app.
- A Fairshare session issued by the exchange lasts a year and is independent of the Clerk session. Revoking a session or deleting a user in Clerk does not end existing Fairshare sessions; it only stops new exchanges.
- A password-protected Fairshare account can be linked through the API with `currentPassword`, but the app has no screen for it. Those users keep signing in with phone + password.
- Linking keeps the workspace's existing group agent keys and MCP grants. They are group-scoped and visible in group settings.
- Accounts are not merged. A person who used Clerk on one device and phone + password on another has two Fairshare users.
- Clerk-only users have no Fairshare password, so the Workspace screen shows a sign-out button in place of password management.
- Tests inject a fake verifier through `createApp(db, { clerk })`. Until someone runs the flow with real keys, the Clerk-hosted steps (the sign-in form after Clerk loads, real token verification, native token cache) are unverified against a live Clerk instance.
