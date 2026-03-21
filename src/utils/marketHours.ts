/**
 * Weekend lock disabled — orders allowed every day (UTC calendar not enforced).
 */
export function isWeekendForexClosedUtc(_date = new Date()): boolean {
  return false;
}
