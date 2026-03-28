import { generateSecret, generateURI, verifySync } from "otplib";
import { dbGet, dbRun, initAppDb, isMysqlMode } from "../db/appDb";

const APP_ISSUER = "UpDownFX";

export type WithdrawalTotpStatus = {
  enabled: boolean;
  /** User started setup but not confirmed with a code yet. */
  setupPending: boolean;
};

export async function getWithdrawalTotpStatus(userId: string): Promise<WithdrawalTotpStatus> {
  await initAppDb();
  const uid = String(userId ?? "").trim();
  const row = await dbGet<{
    withdrawal_totp_secret: string | null;
    withdrawal_totp_pending: string | null;
  }>(
    isMysqlMode()
      ? "SELECT withdrawal_totp_secret, withdrawal_totp_pending FROM users WHERE id = ? LIMIT 1"
      : "SELECT withdrawal_totp_secret, withdrawal_totp_pending FROM users WHERE id = ?",
    [uid]
  );
  const sec = String(row?.withdrawal_totp_secret ?? "").trim();
  const pend = String(row?.withdrawal_totp_pending ?? "").trim();
  return {
    enabled: sec.length > 0,
    setupPending: !sec && pend.length > 0
  };
}

/** Start TOTP setup — returns secret + otpauth URI (add to Google Authenticator etc.). */
export async function beginWithdrawalTotpSetup(
  userId: string,
  userEmail: string
): Promise<{ secret: string; otpauthUrl: string }> {
  await initAppDb();
  const uid = String(userId ?? "").trim();
  const secret = generateSecret();
  await dbRun("UPDATE users SET withdrawal_totp_pending = ? WHERE id = ?", [secret, uid]);
  const otpauthUrl = generateURI({
    issuer: APP_ISSUER,
    label: userEmail || uid,
    secret
  });
  return { secret, otpauthUrl };
}

function totpValid(secret: string, token: string): boolean {
  const r = verifySync({
    secret,
    token,
    epochTolerance: 1
  });
  return r.valid === true;
}

/** Exported for withdrawal TPIN service (legacy 6-digit authenticator path). */
export function verifyWithdrawalTotpToken(secret: string, token: string): boolean {
  const t = String(token ?? "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(t)) {
    return false;
  }
  return totpValid(secret, t);
}

/** Confirm pending secret with a valid 6-digit code; activates withdrawal TOTP. */
export async function confirmWithdrawalTotpSetup(userId: string, code: string): Promise<void> {
  await initAppDb();
  const uid = String(userId ?? "").trim();
  const token = String(code ?? "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(token)) {
    throw new Error("Enter the 6-digit code from your authenticator app");
  }

  const row = await dbGet<{ withdrawal_totp_pending: string | null }>(
    isMysqlMode()
      ? "SELECT withdrawal_totp_pending FROM users WHERE id = ? LIMIT 1"
      : "SELECT withdrawal_totp_pending FROM users WHERE id = ?",
    [uid]
  );
  const pending = String(row?.withdrawal_totp_pending ?? "").trim();
  if (!pending) {
    throw new Error("Start setup first — tap Generate authenticator link");
  }

  if (!verifyWithdrawalTotpToken(pending, token)) {
    throw new Error("Invalid code — check the time on your phone or wait for the next code");
  }

  await dbRun(
    "UPDATE users SET withdrawal_totp_secret = ?, withdrawal_totp_pending = NULL WHERE id = ?",
    [pending, uid]
  );
}

