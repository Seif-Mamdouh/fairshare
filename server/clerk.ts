import { verifyToken } from "@clerk/backend";

/** The Clerk identity proven by a session token. */
export type ClerkIdentity = { userId: string };
/**
 * Resolves the Clerk user a session token belongs to, or null when the token is
 * invalid, expired, issued for another origin, or not an active session.
 * Injected through createApp options so tests never contact Clerk.
 */
export type ClerkVerifier = (token: string) => Promise<ClerkIdentity | null>;

type Env = Record<string, string | undefined>;
const list = (value?: string) =>
  (value || "")
    .split(",")
    .map((s) => s.trim().replace(/\/$/, ""))
    .filter(Boolean);

/** Web origins whose Clerk session tokens are accepted (the token `azp` claim). */
export function clerkAuthorizedParties(env: Env = process.env) {
  const explicit = list(env.CLERK_AUTHORIZED_PARTIES);
  if (explicit.length) return explicit;
  return [
    ...new Set([
      ...list(env.ALLOWED_ORIGINS || "http://localhost:8081"),
      ...list(env.OAUTH_ISSUER_URL),
    ]),
  ];
}

/** Clerk sign-in is off unless the server has a secret key. */
export function configuredClerk(env: Env = process.env): ClerkVerifier | null {
  const secretKey = env.CLERK_SECRET_KEY;
  if (!secretKey) return null;
  // Optional PEM public key: verifies without fetching Clerk's JWKS.
  const jwtKey = env.CLERK_JWT_KEY || undefined;
  const authorizedParties = clerkAuthorizedParties(env);
  return async (token) => {
    try {
      const claims = await verifyToken(token, {
        secretKey,
        jwtKey,
        authorizedParties,
      });
      // Only a real, active user session counts: templates and machine tokens
      // carry no session id, and a pending session has unfinished sign-in tasks.
      if (
        typeof claims.sub !== "string" ||
        !claims.sub.startsWith("user_") ||
        typeof claims.sid !== "string" ||
        (claims as { sts?: string }).sts === "pending"
      )
        return null;
      return { userId: claims.sub };
    } catch (e) {
      // The reason helps an operator fix keys or origins; the token is never logged.
      console.warn(
        "Clerk token rejected:",
        (e as { reason?: string }).reason || (e as Error).message,
      );
      return null;
    }
  };
}
