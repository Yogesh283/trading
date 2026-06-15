const IST = "Asia/Kolkata";

/** Calendar date in Asia/Kolkata as `YYYY-MM-DD`. */
export function getIstDateKey(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: IST,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(now);
}
