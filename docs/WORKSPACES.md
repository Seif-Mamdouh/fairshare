# Private device workspaces

Fairshare has no sign-in or sign-up flow. On startup the client calls `POST /api/workspace`. A valid existing cookie or native token resumes the same user ID and extends that session for one year. A missing, invalid, revoked, or expired token creates a new empty private identity with a random session token. No name, email, phone, password, or recovery code is required.

Web sessions use HttpOnly, Secure in production, SameSite=Strict cookies. Native clients keep the token in SecureStore. The client deduplicates bootstrap requests; browsers with Web Locks also serialize bootstrap across tabs. Tokens remain hashed in PostgreSQL. Creating fresh identities is limited to twenty per client IP per fifteen minutes. Existing valid sessions do not consume that quota. Identity and session creation are transactional.

Existing real users, groups, membership IDs, expenses, and agent keys are preserved. Historical email/password/phone columns remain unused in storage to avoid destructive migration; no login, registration, OTP, phone-linking, or account-recovery endpoint remains. No Twilio runtime or configuration dependency exists. The API still requires the private session for group operations and enforces membership and owner permissions. Agent keys remain separately scoped and revocable.

A new visitor opening an invite automatically receives a private workspace, previews the group, and chooses Join group. No authentication form intervenes. Invite preview does not grant access or join automatically. A display name can be changed later from Workspace; it updates only that user and their linked memberships, never unrelated named people or existing debt amounts.

Clearing browser/app storage, switching devices, or allowing the session to expire does not restore the old workspace. It starts a separate one. There is no automatic recovery or hidden shared administrator identity. Group invitations can grant a new device new membership but do not recover or merge its old identity. This limitation appears in Workspace settings. Existing valid sessions must be retained to keep direct access to historical private data.

`DELETE /api/workspace/session` revokes only the presented session for API consumers. It is not exposed as a casual logout button because the app cannot recover a lost private workspace. `POST /api/me/name` changes the authenticated display name. `/api/me` returns only identity and name, not historical authentication fields.
