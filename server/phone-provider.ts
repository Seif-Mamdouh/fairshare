import { parsePhoneNumberFromString } from "libphonenumber-js/min";
export interface PhoneProvider {
  start(phone: string): Promise<string>;
  check(verificationId: string, phone: string, code: string): Promise<boolean>;
}
export function normalizePhone(input: string) {
  const raw = input.trim();
  if (!raw.startsWith("+") || !/^[+\d\s().-]+$/.test(raw))
    throw Object.assign(
      new Error(
        "Enter your phone number with its country code, starting with +.",
      ),
      { status: 400 },
    );
  const phone = parsePhoneNumberFromString(raw);
  if (!phone?.isValid() || phone.ext)
    throw Object.assign(
      new Error("Enter a valid phone number with its country code."),
      { status: 400 },
    );
  return phone.number;
}
export function configuredPhoneProvider(
  env: Record<string, string | undefined> = process.env,
  transport: typeof fetch = fetch,
): PhoneProvider | null {
  const {
    TWILIO_ACCOUNT_SID: account,
    TWILIO_AUTH_TOKEN: secret,
    TWILIO_VERIFY_SERVICE_SID: service,
  } = env;
  if (
    env.PHONE_AUTH_ENABLED !== "true" ||
    !/^AC[0-9a-fA-F]{32}$/.test(account || "") ||
    !secret ||
    !/^VA[0-9a-fA-F]{32}$/.test(service || "")
  )
    return null;
  const allowed = (env.PHONE_AUTH_COUNTRY_CODES || "1")
    .split(",")
    .map((s) => s.trim());
  const unavailable = () =>
    Object.assign(
      new Error(
        "Phone verification is unavailable. Please try later or sign in with email.",
      ),
      { status: 503 },
    );
  async function post(path: string, body: Record<string, string>) {
    try {
      const response = await transport(
        `https://verify.twilio.com/v2/Services/${service}/${path}`,
        {
          method: "POST",
          headers: {
            Authorization:
              "Basic " + Buffer.from(`${account}:${secret}`).toString("base64"),
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams(body),
          signal: AbortSignal.timeout(10000),
        },
      );
      if (
        path === "VerificationCheck" &&
        [400, 404, 429].includes(response.status)
      )
        return null;
      if (!response.ok) throw unavailable();
      return await response.json();
    } catch {
      throw unavailable();
    }
  }
  return {
    async start(phone) {
      if (
        !allowed.includes(parsePhoneNumberFromString(phone)!.countryCallingCode)
      )
        throw Object.assign(
          new Error(
            "Phone sign-in is not available for this country yet. Use email for now.",
          ),
          { status: 400 },
        );
      const result = await post("Verifications", { To: phone, Channel: "sms" });
      if (
        result?.status !== "pending" ||
        result.to !== phone ||
        !/^VE[0-9a-fA-F]{32}$/.test(result.sid)
      )
        throw unavailable();
      return result.sid;
    },
    async check(verificationId, phone, code) {
      const result = await post("VerificationCheck", {
        VerificationSid: verificationId,
        Code: code,
      });
      return (
        result?.status === "approved" &&
        result?.valid === true &&
        result?.to === phone &&
        result?.sid === verificationId
      );
    },
  };
}
