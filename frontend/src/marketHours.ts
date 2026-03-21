/**
 * Weekend lock disabled — trading allowed every day (UI + client guards).
 */
export function isWeekendForexClosedLocal(_date = new Date()): boolean {
  return false;
}
