/** How many digits the access code has; it follows the code length set in Supabase. */
export const OTP_LENGTH = 6;

/** What is left of what the person typed or pasted: digits only, at most `length` of them. */
export function normalizeCode(raw: string, length: number = OTP_LENGTH): string {
  return raw.replace(/\D/g, "").slice(0, length);
}
