import { logger } from "./logger";

const TRANSIENT_CODES = new Set([
  "ETIMEDOUT",
  "ECONNREFUSED",
  "ECONNRESET",
  "PROTOCOL_CONNECTION_LOST"
]);

const THROTTLE_MS = 60_000;
let lastTransientLog = 0;

function errCode(err: unknown): string {
  if (err && typeof err === "object" && "code" in err) {
    return String((err as { code?: unknown }).code ?? "");
  }
  return "";
}

/**
 * When MySQL is down or unreachable, many paths log the same error every tick.
 * Throttle transient TCP/pool errors to once per minute; always log other failures.
 */
export function warnDbOrThrottle(err: unknown, msg: string, extra?: Record<string, unknown>): void {
  const code = errCode(err);
  const transient = TRANSIENT_CODES.has(code);
  const now = Date.now();
  if (transient) {
    if (now - lastTransientLog < THROTTLE_MS) {
      return;
    }
    lastTransientLog = now;
  }
  logger.warn({ err, ...extra }, msg);
}
