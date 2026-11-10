import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  createHmac,
} from "node:crypto";
export class BankError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = "",
  ) {
    super(message);
  }
}
export class BankVault {
  private key: Buffer;
  constructor(key: string) {
    this.key = Buffer.from(key, "base64");
    if (this.key.length !== 32 || this.key.toString("base64") !== key)
      throw new Error("Invalid bank encryption configuration");
  }
  seal(value: string, context: string) {
    const iv = randomBytes(12),
      cipher = createCipheriv("aes-256-gcm", this.key, iv);
    cipher.setAAD(Buffer.from(context));
    const data = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    return [
      "v1",
      iv.toString("base64"),
      cipher.getAuthTag().toString("base64"),
      data.toString("base64"),
    ].join(".");
  }
  open(value: string, context: string) {
    try {
      const [version, iv, tag, data] = value.split(".");
      if (version !== "v1") throw new Error();
      const cipher = createDecipheriv(
        "aes-256-gcm",
        this.key,
        Buffer.from(iv, "base64"),
      );
      cipher.setAAD(Buffer.from(context));
      cipher.setAuthTag(Buffer.from(tag, "base64"));
      return Buffer.concat([
        cipher.update(Buffer.from(data, "base64")),
        cipher.final(),
      ]).toString("utf8");
    } catch {
      throw new BankError(
        503,
        "Bank connection could not be opened. Contact the app owner.",
      );
    }
  }
  fingerprint(userId: string, transactionId: string) {
    return createHmac("sha256", this.key)
      .update(JSON.stringify(["bank-import", userId, transactionId]))
      .digest("hex");
  }
}
export interface Banking {
  environment: "sandbox" | "production";
  verifyLinkEvents?: boolean;
  vault: BankVault;
  webRedirect?: string;
  iosRedirect?: string;
  androidPackage?: string;
  call(path: string, body: Record<string, unknown>): Promise<any>;
}
export function configuredBanking(): Banking | null {
  const {
    PLAID_CLIENT_ID: client,
    PLAID_SECRET: secret,
    BANK_TOKEN_ENCRYPTION_KEY: key,
    PLAID_ENV: environment,
  } = process.env;
  if (
    !client ||
    !secret ||
    !key ||
    !["sandbox", "production"].includes(environment || "") ||
    (environment === "production" &&
      process.env.PLAID_LINK_EVENTS_ENABLED !== "true")
  )
    return null;
  let vault: BankVault;
  try {
    vault = new BankVault(key);
  } catch {
    return null;
  }
  return {
    environment: environment as Banking["environment"],
    verifyLinkEvents: process.env.PLAID_LINK_EVENTS_ENABLED === "true",
    vault,
    webRedirect: process.env.PLAID_WEB_REDIRECT_URI,
    iosRedirect: process.env.PLAID_IOS_REDIRECT_URI,
    androidPackage: process.env.PLAID_ANDROID_PACKAGE_NAME,
    async call(path, body) {
      try {
        const result = await fetch(`https://${environment}.plaid.com${path}`, {
          method: "POST",
          signal: AbortSignal.timeout(8000),
          headers: {
            "Content-Type": "application/json",
            "Plaid-Version": "2020-09-14",
          },
          body: JSON.stringify({ client_id: client, secret, ...body }),
        });
        const data = await result.json();
        if (!result.ok)
          throw new BankError(
            503,
            "The bank provider could not complete this request. Try again.",
            String(data.error_code || "PROVIDER_ERROR"),
          );
        return data;
      } catch (e) {
        if (e instanceof BankError) throw e;
        throw new BankError(
          503,
          "The bank provider is temporarily unavailable. Try again.",
        );
      }
    },
  };
}
