import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
// OWASP scrypt option: N=2^15, r=8, p=3 (32 MiB), asynchronous to avoid blocking requests.
const derive = (password: string, salt: string) =>
  new Promise<Buffer>((resolve, reject) =>
    scrypt(
      password,
      salt,
      64,
      { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 },
      (error, key) => (error ? reject(error) : resolve(key)),
    ),
  );
export async function passwordHash(password: string) {
  const salt = randomBytes(16).toString("hex");
  return `scrypt-v1:${salt}:${(await derive(password, salt)).toString("hex")}`;
}
export async function verifyPassword(password: string, stored?: string | null) {
  const parts = stored?.split(":");
  const valid =
    parts?.length === 3 &&
    parts[0] === "scrypt-v1" &&
    /^[a-f0-9]{32}$/.test(parts[1]) &&
    /^[a-f0-9]{128}$/.test(parts[2]);
  const actual = await derive(
    password,
    valid ? parts![1] : "00000000000000000000000000000000",
  );
  const expected = valid ? Buffer.from(parts![2], "hex") : Buffer.alloc(64);
  return timingSafeEqual(actual, expected) && !!valid;
}
