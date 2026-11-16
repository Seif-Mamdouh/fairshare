# Clerk sign-in

Clerk is an optional sign-in method for web and native. It is off until both keys are set. With `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` unset the client never loads the Clerk SDK, and with `CLERK_SECRET_KEY` unset `POST /api/auth/clerk` answers 404. Phone number + password ([WORKSPACES.md](WORKSPACES.md)) keeps working either way.

## How it works

Clerk only proves who the person is. Fairshare still issues its own session.

1. The client signs the person in with Clerk. Sign-in is email + password, with an emailed code on a new device. Sign-up collects email and password, then whatever else the Clerk application requires out of username and phone number, and completes each outstanding verification (emailed code, then texted code).
2. The client sends the short-lived Clerk session token to `POST /api/auth/clerk` as `{ "token": "..." }`.
3. The server verifies the token with `@clerk/backend` (`verifyToken`). For a Clerk id it has not seen before it also reads that user's verified phone numbers and username from Clerk's Backend API (`users.getUser`). It then finds, links or creates the Fairshare user and issues the normal Fairshare session: the HttpOnly `fairshare_session` cookie on web, a bearer token stored in SecureStore on native.

Group authorization, bank data, agent keys and MCP OAuth all keep using that Fairshare session. The only downstream change is that MCP OAuth consent accepts a Clerk-linked user as signed in, where it previously required a password credential.

The response is `{ user, outcome, token? }`. `outcome` is `signed_in`, `linked` or `created`. `user.clerk_linked` is `true` for linked users and absent for everyone else, so existing profiles are unchanged. The Clerk user id is stored in the nullable unique column `users.clerk_user_id` and is never returned by the API.

## Linking rules

On each exchange, in order:

1. **Already linked.** If a Fairshare user has this Clerk id, sign into it. A different workspace open on the device is left as it is; nothing is merged. This path makes no Clerk API call.
2. **Link by verified phone.** Otherwise, if a phone number Clerk has verified for this Clerk user equals the `phone_e164` of a Fairshare user that has no Clerk id, that user is linked and signed in. No Fairshare session and no Fairshare password are needed, so an existing phone + password user can sign up with Clerk on any device and land in their account. A phone match wins over whatever session the device presents. With several verified numbers, the primary one is tried first.
3. **Link this device's workspace.** Otherwise, if the request carries a valid Fairshare session whose user has no Clerk id, that user is linked, so the groups and data already on the device are kept. Every older session of that user is revoked and a fresh one is issued, so a session copy held by whoever prepared the workspace stops working.
4. **Create.** Otherwise a new user is created. It is named after the Clerk username (or first name) when there is one, and it stores a verified Clerk phone that no Fairshare user holds, so the number stays unique and the phone form cannot later claim it for someone else.

Guards:

- A user linked to one Clerk id is never reassigned, by phone or by session. A second Clerk account with the same verified phone, or one that signs in while the first one's session is present, gets a separate user. The unique column also refuses a duplicate at the database level.
- Only numbers whose Clerk verification status is `verified` are used. Both sides are compared in the canonical E.164 form of `server/phone.ts`.
- If the Backend API lookup fails or takes longer than 8 seconds for a Clerk id that is not linked yet, the exchange answers 503 and creates or links nothing; the app shows the message and the person retries. Creating a user at that point would bind the Clerk id to the wrong account for good.
- A workspace with a phone + password credential is not linked from a session alone (rule 3). The request must include `currentPassword`; without it the server answers 409 and changes nothing. This stops someone with brief access to a signed-in device from attaching their own Clerk account as a permanent way in. The app does not offer this path; rule 2 is how password users connect.
- A phone number without a password is not a credential and does not block linking.
- The Clerk user id comes only from the verified token. The body cannot name a user.

### What a phone link trusts, and what it closes

Fairshare itself never verifies phone numbers: anyone can type any free number into the phone form and set a password on it. Clerk does verify them, with a texted code. Rule 2 therefore treats Clerk's verification as the proof of ownership and treats everything that was attached to the Fairshare account before it as unproven. On a phone link the server:

- deletes **all existing sessions** of that user (every other signed-in device must sign in again, with Clerk);
- deletes the **Fairshare password**. Phone + password sign-in stops working for that account; Clerk is its sign-in from then on. Without this, someone who registered another person's number first would keep a working password to the account its real owner now uses;
- sets `phone_verified_at`.

Group agent keys and MCP grants are kept, as for rule 3. They are group-scoped and visible in group settings; a person who links into an account they did not set up should review them, along with the groups already in it.

The assumption this rests on: every verified phone on a Clerk user was proven by an SMS code to the person signing in. That holds for self-service sign-up on a **production** Clerk instance with phone verification on. It does not hold for a number an administrator adds as verified through the Clerk dashboard or Backend API, so treat write access to the Clerk instance as write access to Fairshare accounts. It also does not hold on a **development** instance, which accepts fictional numbers of the form `+1 XXX 555-01XX` with the fixed code `424242` and sends no SMS (and `+clerk_test` emails likewise). Those numbers cannot belong to real people, but never point a server holding real user data at a development instance's keys.

## Setup

### Clerk dashboard

1. Create an application at [dashboard.clerk.com](https://dashboard.clerk.com).
2. **User & authentication**: enable **Email**, require it at sign-up, and verify with an **email verification code**. Enable **Password**. To let existing phone + password users reach their accounts (linking rule 2), enable **Phone number**, require it at sign-up and turn on **Verify at sign-up** with an **SMS verification code**; without a verified phone, a Clerk sign-up always creates a new Fairshare user. **Username** may be required or off. The in-app form collects email, password, username and phone number and nothing else: leave first/last name and any legal-consent requirement off, or sign-up stops with an error naming the field. Production SMS needs the destination countries enabled under Clerk's SMS settings.
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

- Sign-in is email + password only. Social sign-in, passkeys, SMS sign-in or second factors, authenticator-app MFA and Clerk organizations are not wired up; an account that requires one of them gets a clear error. Password reset happens in Clerk, not in this app.
- A sign-up interrupted by a reload starts again from email and password.
- The phone link runs only on the first exchange of a Clerk id. A phone added or changed in Clerk later does not link or update anything, and a workspace linked through its session (rule 3) does not take on the Clerk phone.
- A Fairshare session issued by the exchange lasts a year and is independent of the Clerk session. Revoking a session or deleting a user in Clerk does not end existing Fairshare sessions; it only stops new exchanges.
- A password-protected Fairshare account whose phone is not on the Clerk user can only be linked through the API with `currentPassword`; the app has no screen for it.
- After a phone link the account has no Fairshare password and the app offers no way to set a new one.
- Linking keeps the workspace's existing group agent keys and MCP grants. They are group-scoped and visible in group settings.
- Accounts are not merged. A person who signed up with Clerk before their phone was on the Clerk user, and used phone + password elsewhere, has two Fairshare users.
- Clerk-only users have no Fairshare password, so the Workspace screen shows a sign-out button in place of password management.
- Tests inject a fake verifier and a fake user lookup through `createApp(db, { clerk, clerkProfile })`, so the server rules are covered without Clerk. The Clerk-hosted steps (the username/phone and SMS-code sign-up steps, real token verification, the Backend API lookup, native token cache) have not been run end to end against a live Clerk instance. To do so on a development instance: create a phone + password account with a `555-01XX` number and a group, sign out, sign up with Clerk using a `+clerk_test` email and the same number (both codes are `424242`), and check the group is still there.
