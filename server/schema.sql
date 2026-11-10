CREATE TABLE IF NOT EXISTS users (id text PRIMARY KEY, name text NOT NULL, email text UNIQUE NOT NULL, password_hash text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS sessions (token_hash text PRIMARY KEY, user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS groups (id text PRIMARY KEY, name text NOT NULL, currency text NOT NULL CHECK(currency IN ('USD','EUR','GBP','CAD','AUD','EGP')), owner_id text NOT NULL REFERENCES users(id), invite_token text UNIQUE NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS members (id text PRIMARY KEY, group_id text NOT NULL REFERENCES groups(id), name text NOT NULL, user_id text REFERENCES users(id), UNIQUE(group_id,user_id));
CREATE TABLE IF NOT EXISTS agents (id text PRIMARY KEY, group_id text NOT NULL REFERENCES groups(id), name text NOT NULL, token_hash text UNIQUE NOT NULL, revoked_at timestamptz, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS expenses (id text PRIMARY KEY, group_id text NOT NULL REFERENCES groups(id), title text NOT NULL, amount_minor integer NOT NULL CHECK(amount_minor>0), paid_by text NOT NULL REFERENCES members(id), splits jsonb NOT NULL, category text NOT NULL, spent_on date NOT NULL, created_by text NOT NULL REFERENCES users(id), voided_at timestamptz, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS settlements (id text PRIMARY KEY, group_id text NOT NULL REFERENCES groups(id), from_member text NOT NULL REFERENCES members(id), to_member text NOT NULL REFERENCES members(id), amount_minor integer NOT NULL CHECK(amount_minor>0), note text NOT NULL DEFAULT '', created_by text NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(), CHECK(from_member<>to_member));
CREATE TABLE IF NOT EXISTS receipts (id text PRIMARY KEY, group_id text NOT NULL REFERENCES groups(id), agent_id text REFERENCES agents(id), submitted_by text REFERENCES users(id), source_id text NOT NULL, payload jsonb NOT NULL, image_data text, status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')), expense_id text UNIQUE REFERENCES expenses(id), created_at timestamptz NOT NULL DEFAULT now(), reviewed_at timestamptz, UNIQUE(agent_id,source_id));
CREATE TABLE IF NOT EXISTS rate_limits (key text PRIMARY KEY, hits integer NOT NULL, reset_at timestamptz NOT NULL);
CREATE INDEX IF NOT EXISTS members_user_idx ON members(user_id);
CREATE INDEX IF NOT EXISTS expenses_group_idx ON expenses(group_id,created_at);
CREATE INDEX IF NOT EXISTS receipts_group_idx ON receipts(group_id,created_at);
CREATE INDEX IF NOT EXISTS settlements_group_idx ON settlements(group_id);

ALTER TABLE agents ADD COLUMN IF NOT EXISTS last_used_at timestamptz;
UPDATE agents SET last_used_at=(SELECT MAX(created_at) FROM receipts WHERE agent_id=agents.id) WHERE last_used_at IS NULL AND EXISTS(SELECT 1 FROM receipts WHERE agent_id=agents.id);

ALTER TABLE users ALTER COLUMN email DROP NOT NULL;
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_e164 text UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_verified_at timestamptz;
CREATE TABLE IF NOT EXISTS phone_challenges (token_hash text PRIMARY KEY, phone_e164 text NOT NULL, purpose text NOT NULL CHECK(purpose IN ('login','link')), user_id text REFERENCES users(id) ON DELETE CASCADE, verification_id text, attempts integer NOT NULL DEFAULT 0, checking boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL DEFAULT now()+interval '10 minutes', consumed_at timestamptz);
CREATE INDEX IF NOT EXISTS phone_challenges_phone_idx ON phone_challenges(phone_e164,created_at);

CREATE TABLE IF NOT EXISTS bank_links (id text PRIMARY KEY, user_id text NOT NULL REFERENCES users(id), provider_item_id text UNIQUE, token_ciphertext text, environment text NOT NULL, status text NOT NULL DEFAULT 'connected', cursor text, last_synced_at timestamptz, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS bank_links_user_idx ON bank_links(user_id);
CREATE TABLE IF NOT EXISTS bank_link_sessions (id text PRIMARY KEY, user_id text NOT NULL REFERENCES users(id), token_ciphertext text, expires_at timestamptz NOT NULL, link_id text REFERENCES bank_links(id), created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS bank_accounts (id text PRIMARY KEY, link_id text NOT NULL REFERENCES bank_links(id) ON DELETE CASCADE, provider_account_id text NOT NULL, name text NOT NULL, mask text, type text NOT NULL, subtype text, UNIQUE(link_id,provider_account_id));
CREATE TABLE IF NOT EXISTS bank_transactions (id text PRIMARY KEY, link_id text NOT NULL REFERENCES bank_links(id) ON DELETE CASCADE, account_id text NOT NULL REFERENCES bank_accounts(id) ON DELETE CASCADE, provider_transaction_id text NOT NULL, name text NOT NULL, amount_minor bigint NOT NULL, currency text, spent_on text NOT NULL, pending boolean NOT NULL, removed boolean NOT NULL DEFAULT false, revision integer NOT NULL DEFAULT 1, source_key text NOT NULL, UNIQUE(link_id,provider_transaction_id));
CREATE INDEX IF NOT EXISTS bank_transactions_link_idx ON bank_transactions(link_id,spent_on);
CREATE TABLE IF NOT EXISTS bank_imports (user_id text NOT NULL REFERENCES users(id), source_key text NOT NULL, expense_id text NOT NULL REFERENCES expenses(id), PRIMARY KEY(user_id,source_key));

CREATE TABLE IF NOT EXISTS user_credentials (user_id text PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, password_hash text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());

ALTER TABLE expenses ADD COLUMN IF NOT EXISTS itemization jsonb;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS conversion jsonb;
CREATE TABLE IF NOT EXISTS split_defaults (user_id text NOT NULL REFERENCES users(id), group_id text NOT NULL REFERENCES groups(id), preference jsonb NOT NULL, PRIMARY KEY(user_id,group_id));

CREATE TABLE IF NOT EXISTS oauth_clients (id text PRIMARY KEY, name text NOT NULL, redirect_uris jsonb NOT NULL, auth_method text NOT NULL, secret_hash text, grant_types jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS oauth_requests (id_hash text PRIMARY KEY, client_id text NOT NULL REFERENCES oauth_clients(id), redirect_uri text NOT NULL, challenge text NOT NULL, state text, scope text NOT NULL, resource text NOT NULL, user_id text REFERENCES users(id), session_hash text, consent_hash text, expires_at timestamptz NOT NULL, consumed_at timestamptz);
CREATE TABLE IF NOT EXISTS oauth_grants (id text PRIMARY KEY, client_id text NOT NULL REFERENCES oauth_clients(id), user_id text NOT NULL REFERENCES users(id), agent_id text UNIQUE NOT NULL REFERENCES agents(id), scope text NOT NULL, resource text NOT NULL, expires_at timestamptz NOT NULL, revoked_at timestamptz);
CREATE TABLE IF NOT EXISTS oauth_codes (code_hash text PRIMARY KEY, grant_id text NOT NULL REFERENCES oauth_grants(id), redirect_uri text NOT NULL, challenge text NOT NULL, expires_at timestamptz NOT NULL, consumed_at timestamptz);
CREATE TABLE IF NOT EXISTS oauth_access_tokens (token_hash text PRIMARY KEY, grant_id text NOT NULL REFERENCES oauth_grants(id), expires_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS oauth_refresh_tokens (token_hash text PRIMARY KEY, grant_id text NOT NULL REFERENCES oauth_grants(id), expires_at timestamptz NOT NULL, consumed_at timestamptz);
CREATE INDEX IF NOT EXISTS oauth_access_grant_idx ON oauth_access_tokens(grant_id);
CREATE INDEX IF NOT EXISTS oauth_refresh_grant_idx ON oauth_refresh_tokens(grant_id);
