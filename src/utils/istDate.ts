const IST = "Asia/Kolkata";
const MS_PER_IST_DAY = 24 * 60 * 60 * 1000;

/** Calendar date in Asia/Kolkata as `YYYY-MM-DD`. */
export function getIstDateKey(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: IST,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(now);
}

/** IST midnight → next midnight (matches app “aaj”). */
export function istCalendarDayBoundsIso(now = new Date()): {
  startIso: string;
  endIso: string;
  dateLabel: string;
} {
  const dateLabel = getIstDateKey(now);
  const start = new Date(`${dateLabel}T00:00:00+05:30`);
  const end = new Date(start.getTime() + MS_PER_IST_DAY);
  return { startIso: start.toISOString(), endIso: end.toISOString(), dateLabel };
}

/** IST calendar day `dayOffset` days before today (0 = today). */
export function istDayBoundsWithOffset(
  dayOffset: number,
  now = new Date()
): { startIso: string; endIso: string; label: string } {
  const todayStart = new Date(`${getIstDateKey(now)}T00:00:00+05:30`);
  const start = new Date(todayStart.getTime() - dayOffset * MS_PER_IST_DAY);
  const end = new Date(start.getTime() + MS_PER_IST_DAY);
  return {
    startIso: start.toISOString(),
    endIso: end.toISOString(),
    label: getIstDateKey(start)
  };
}
