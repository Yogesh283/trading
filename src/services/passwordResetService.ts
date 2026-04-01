import crypto from "node:crypto";
import { env } from "../config/env";
import { logger } from "../utils/logger";
import { dbRun, dbGet, initAppDb, isMysqlMode } from "../db/appDb";
import {
  normalizePhoneCountryCode,
  normalizePhoneLocalDigits,
  setPasswordForPhoneUser
} from "./authService";

const OTP_TTL_MS = 10 * 60 * 1000;
const MIN_REQUEST_GAP_MS = 60_000;
const lastRequestAt = new Map<string, number>();

const MIN_NO_OTP_RESET_GAP_MS = 60_000;
const lastNoOtpResetAt = new Map<string, number>();

function phoneKey(cc: string, loc: string): string {
  return `${cc}:${loc}`;
}

function hashOtp(cc: string, loc: string, otp: string): string {
  return crypto.createHmac("sha256", env.AUTH_SECRET).update(`${cc}:${loc}:${otp}`).digest("hex");
}

function timingSafeEqualHex(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a, "hex");
    const bb = Buffer.from(b, "hex");
    if (ba.length !== bb.length) return false;
    return crypto.timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

/**
 * Mobile-only: send OTP for password reset (stored server-side; SMS not wired — use
 * `FORGOT_PASSWORD_DEBUG_OTP=1` in development to receive OTP in API response).
 */
export async function requestPasswordResetOtp(input: {
  countryCode: string;
  phone: string;
}): Promise<{ ok: true; debugOtp?: string }> {
  await initAppDb();
  const cc = normalizePhoneCountryCode(String(input.countryCode ?? "").trim());
  const loc = normalizePhoneLocalDigits(String(input.phone ?? "").trim());
  if (!cc || !loc) {
    throw new Error("Enter a valid country code and mobile number");
  }

  const key = phoneKey(cc, loc);
  const now = Date.now();
  const prev = lastRequestAt.get(key) ?? 0;
  if (now - prev < MIN_REQUEST_GAP_MS) {
    throw new Error("Please wait a minute before requesting another code.");
  }
  lastRequestAt.set(key, now);

  const user = await dbGet<{ id: string }>(
    isMysqlMode()
      ? "SELECT id FROM users WHERE phone_country_code = ? AND phone_local = ? LIMIT 1"
      : "SELECT id FROM users WHERE phone_country_code = ? AND phone_local = ?",
    [cc, loc]
  );

  if (!user) {
    return { ok: true };
  }

  await dbRun("DELETE FROM password_reset_otps WHERE phone_country_code = ? AND phone_local = ?", [cc, loc]);

  const otp = String(crypto.randomInt(100000, 1000000));
  const otpHash = hashOtp(cc, loc, otp);
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + OTP_TTL_MS).toISOString();

  await dbRun(
    `INSERT INTO password_reset_otps (id, phone_country_code, phone_local, otp_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    [id, cc, loc, otpHash, expiresAt, createdAt]
  );

  logger.info({ cc, locLen: loc.length }, "password_reset: OTP issued (SMS not configured — use debug flag in dev)");

  const out: { ok: true; debugOtp?: string } = { ok: true };
  if (env.FORGOT_PASSWORD_DEBUG_OTP) {
    out.debugOtp = otp;
  }
  return out;
}

export async function resetPasswordWithOtp(input: {
  countryCode: string;
  phone: string;
  otp: string;
  newPassword: string;
}): Promise<void> {
  await initAppDb();
  const cc = normalizePhoneCountryCode(String(input.countryCode ?? "").trim());
  const loc = normalizePhoneLocalDigits(String(input.phone ?? "").trim());
  const otp = String(input.otp ?? "").replace(/\D/g, "").trim();
  if (!cc || !loc) {
    throw new Error("Enter a valid country code and mobile number");
  }
  if (otp.length !== 6) {
    throw new Error("Enter the 6-digit code");
  }

  const row = await dbGet<{ otp_hash: string; expires_at: string }>(
    isMysqlMode()
      ? "SELECT otp_hash, expires_at FROM password_reset_otps WHERE phone_country_code = ? AND phone_local = ? ORDER BY created_at DESC LIMIT 1"
      : "SELECT otp_hash, expires_at FROM password_reset_otps WHERE phone_country_code = ? AND phone_local = ? ORDER BY created_at DESC LIMIT 1",
    [cc, loc]
  );

  if (!row) {
    throw new Error("Invalid or expired code. Request a new code.");
  }
  if (new Date(row.expires_at).getTime() < Date.now()) {
    await dbRun("DELETE FROM password_reset_otps WHERE phone_country_code = ? AND phone_local = ?", [cc, loc]);
    throw new Error("Code expired. Request a new code.");
  }

  const expected = hashOtp(cc, loc, otp);
  if (!timingSafeEqualHex(expected, row.otp_hash)) {
    throw new Error("Invalid code");
  }

  await setPasswordForPhoneUser(cc, loc, input.newPassword);
  await dbRun("DELETE FROM password_reset_otps WHERE phone_country_code = ? AND phone_local = ?", [cc, loc]);
}

/**
 * Reset password by mobile only — no OTP. Rate-limited per phone.
 * Anyone who knows the number can reset; use OTP flow in production if you need stronger checks.
 */
export async function resetPasswordByPhoneWithoutOtp(input: {
  countryCode: string;
  phone: string;
  newPassword: string;
}): Promise<void> {
  await initAppDb();
  const cc = normalizePhoneCountryCode(String(input.countryCode ?? "").trim());
  const loc = normalizePhoneLocalDigits(String(input.phone ?? "").trim());
  if (!cc || !loc) {
    throw new Error("Enter a valid country code and mobile number");
  }

  const key = phoneKey(cc, loc);
  const now = Date.now();
  const prev = lastNoOtpResetAt.get(key) ?? 0;
  if (now - prev < MIN_NO_OTP_RESET_GAP_MS) {
    throw new Error("Please wait a minute before trying again.");
  }
  lastNoOtpResetAt.set(key, now);

  await setPasswordForPhoneUser(cc, loc, input.newPassword);
  await dbRun("DELETE FROM password_reset_otps WHERE phone_country_code = ? AND phone_local = ?", [cc, loc]);
}
