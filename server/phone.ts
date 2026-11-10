import { parsePhoneNumberFromString } from "libphonenumber-js/max";

/** Canonical, validated identity attribute. This does not verify ownership. */
export function normalizePhone(input: string): string | null {
  if (input.length > 80 || !/^[+\d\s().-]+$/.test(input)) return null;
  const phone = parsePhoneNumberFromString(input.trim(), {
    defaultCountry: "US",
    extract: false,
  });
  return phone?.isValid() && !phone.ext ? phone.number : null;
}
