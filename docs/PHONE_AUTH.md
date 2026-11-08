# Phone authentication

Phone sign-in uses Twilio Verify SMS. It stays disabled unless `PHONE_AUTH_ENABLED=true` and all three server credentials are configured: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_VERIFY_SERVICE_SID`. Email authentication remains available. No fixed codes, development bypass, or SMS simulation exists in production.

On a new device, enter an international phone number beginning with +, request a code, and verify it. A verified existing phone reuses the same account ID and groups. A new phone creates a new account; the optional name field only affects new accounts. An existing email user should sign in with email, open Account, and verify their phone there. Linking requires both the existing authenticated session and phone ownership, and fails if another account owns the number. Accounts are never merged by name or email resemblance.

Successful login uses the existing 30-day session: HttpOnly/Secure/SameSite=Strict cookie on production web, SecureStore on native. A valid saved session opens the app without another code; expiration or logout requires sign-in again. Invitations remain pending through either authentication method. SMS verification establishes current phone possession; recycled numbers and SIM swaps remain limitations of SMS authentication.

## Activation

1. Connect an authorized Twilio account and create/configure a Verify service. Trial accounts restrict recipients; use an account permitted to reach the intended recipients. No plan purchase is performed by this app or its setup.
2. Enable Verify Fraud Guard and appropriate geo-permissions in Twilio. Set `PHONE_AUTH_COUNTRY_CODES` to the corresponding calling codes (default `1`). Twilio's billing and verification charges are controlled by that account.
3. Set the three credentials as production server secrets in Vercel, then explicitly set `PHONE_AUTH_ENABLED=true` and redeploy. Never place credentials in source, client configuration, screenshots, or chat.
4. With an approved real recipient and authorized SMS spend, request a code once, complete verification, refresh/reopen the app, sign out, and confirm the old session no longer works. Until that check, actual SMS delivery is unverified.

Setting `PHONE_AUTH_ENABLED=false` disables sending and checking immediately on the next deployment while preserving email login and existing sessions. It does not remove linked phone numbers.

## Abuse controls and storage

Only normalized valid E.164 numbers are accepted. Starts are limited to one per phone per minute, three per phone per 15 minutes, ten per IP per 15 minutes, and twenty across the service per hour. Checks are limited to five per challenge, fifteen per phone per 15 minutes, and sixty per IP per 15 minutes. Limits use PostgreSQL atomic updates, including across serverless instances.

Challenge tokens are random and stored hashed. Twilio owns the OTP; Fairshare stores no code. Challenges expire in ten minutes, claims prevent parallel verification/replay, and only a matching provider-approved response creates a session. Challenges sharing a provider verification are consumed together. Expired challenges are purged opportunistically after one day. Provider failures expose generic errors, without upstream payloads or credentials. Account existence is not returned before verification. SMS requests are never automatically retried by the server after ambiguous timeouts.

Tests use an injected in-memory provider and in-memory PostgreSQL only. They cover failed/missing provider configuration, normalization, wrong/expired/replayed codes, concurrent checks, limits, account reuse, linking permissions/conflicts, email compatibility, invitation acceptance, and saved session expiry/logout. They do not send SMS or create live accounts.

## Official provider references

- [Start a verification](https://www.twilio.com/docs/verify/api/verification)
- [Check a verification](https://www.twilio.com/docs/verify/api/verification-check)
- [Validity and timeouts](https://www.twilio.com/docs/verify/api/rate-limits-and-timeouts)
- [Fraud Guard](https://www.twilio.com/docs/verify/preventing-toll-fraud/verify-fraud-guard)
