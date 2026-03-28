/** Single-line mobile for admin tables (country code + local digits). */
export function formatAdminMobile(
  phoneCountryCode: string | null | undefined,
  phoneLocal: string | null | undefined
): string {
  const c = String(phoneCountryCode ?? "").trim();
  const l = String(phoneLocal ?? "").trim();
  if (!c && !l) {
    return "—";
  }
  const prefix = c ? (c.startsWith("+") ? c : `+${c}`) : "";
  return [prefix, l].filter(Boolean).join(" ").trim() || "—";
}
