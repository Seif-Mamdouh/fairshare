# Accounts and cross-device sign-in

Fairshare supports phone number + password sign-in with no SMS provider or verification code. A number is a unique sign-in name, not verified proof of phone ownership. Passwords are salted and hashed using asynchronous scrypt (`N=32768, r=8, p=3`, 64-byte output); plaintext passwords and hashes never appear in API responses. Legacy unused password fields are not reactivated.

## Existing accounts

Open Fairshare on the browser or device that already has your account session. The setup screen recognizes your stored number and asks you to set a password once. This adds a credential to the existing user ID: groups, memberships, expenses, agent keys and private bank connections remain unchanged. A new device cannot set a password merely by entering an already-associated phone number. If all existing sessions were lost before password setup, there is no automatic recovery through an unverified number.

After setup, sign in on any device using the same phone and password. US input defaults to +1; international numbers must include + and country code. Numbers are validated and normalized to E.164 using libphonenumber, and database uniqueness resolves concurrent registrations. Phone numbers remain excluded from group and agent responses.

## Sessions and changes

The client bootstraps or resumes a private workspace before showing sign-in/setup. A valid existing cookie/native session preserves the user ID and renews for one year. A fresh anonymous workspace cannot access existing accounts without the password; successful sign-in replaces its current session and loads the authenticated user's groups. It does not merge or delete identities. Pending group invitations remain available after sign-in.

Web sessions use HttpOnly cookies, Secure in production and SameSite=Strict. Browser responses omit the raw session token. Native clients receive the bearer token and store it in SecureStore. Only token hashes are stored in PostgreSQL. Sign-out revokes the presented session; other signed-in devices remain active. Password changes require the current password, rotate the current session and revoke every previous session. Changing a sign-in phone number also requires the current password. No SMS reset or forgotten-password recovery is implemented; keep your password in a password manager.

Registration, login, password changes and phone changes are throttled. Login failures use the same message for an unknown number and a wrong password and perform a password derivation even when the account is missing. Login rechecks credential/number state while holding the account lock so a concurrent password or number change cannot establish an obsolete session. Origin restrictions apply to auth routes as well as other API routes.

## API

- `POST /api/workspace` — resume a session or create an empty private workspace; profile includes `sign_in_enabled`.
- `POST /api/auth/register` — authenticated workspace session plus `{phone,password}`; enables sign-in on that same user once. Minimum password length 12, maximum 128 characters.
- `POST /api/auth/login` — `{phone,password}`; creates a new session for the matching account.
- `POST /api/me/password` — authenticated `{currentPassword,password}`; changes password and revokes old sessions.
- `POST /api/me/phone` — authenticated `{phone,currentPassword}` after sign-in setup; before setup, only `{phone}` is needed to associate a number with the current workspace.
- `POST /api/me/name` — changes the display name without changing identity.
- `DELETE /api/workspace/session` — signs out the current device.
- `GET /api/me` — own ID, name, phone and sign-in-enabled flag only.

Apply the additive `user_credentials` table migration before deployment. No new provider credentials or environment variables are required. Existing workspace/agent authorization and bank-token encryption continue to use the stable user ID.

References: [Node crypto scrypt](https://nodejs.org/api/crypto.html#cryptoscryptpassword-salt-keylen-options-callback), [OWASP password storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html).
