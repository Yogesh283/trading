import crypto from "node:crypto";
import { dbGet, dbRun, initAppDb, isMysqlMode } from "../db/appDb";
import { verifyWithdrawalTotpToken } from "./withdrawalTotpService";

const PIN_RE = /^\d{4}$/;

function hashTpin(pin: string, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(pin, salt, 64).toString("hex");
  return { salt, hash };
}

function assertPinFormat(pin: string, label: string) {
  const p = String(pin ?? "").trim();
  if (!PIN_RE.test(p)) {
    throw new Error(`${label} must be exactly 4 digits`);
  }
  return p;
}

export type WithdrawalTpinStatus = {
  /** True when a 4-digit TPIN has been saved (hashed). */
  pinSet: boolean;
};

export async function getWithdrawalTpinStatus(userId: string): Promise<WithdrawalTpinStatus> {
  await initAppDb();
  const uid = String(userId ?? "").trim();
  const row = await dbGet<{ withdrawal_tpin_hash: string | null }>(
    isMysqlMode()
      ? "SELECT withdrawal_tpin_hash FROM users WHERE id = ? LIMIT 1"
      : "SELECT withdrawal_tpin_hash FROM users WHERE id = ?",
    [uid]
  );
  const h = String(row?.withdrawal_tpin_hash ?? "").trim();
  return { pinSet: h.length > 0 };
}

/** First-time set only — fails if PIN already configured. */
export async function setWithdrawalTpin(userId: string, pin: string, confirmPin: string): Promise<void> {
  await initAppDb();
  const uid = String(userId ?? "").trim();
  const a = assertPinFormat(pin, "TPIN");
  const b = assertPinFormat(confirmPin, "Confirm TPIN");
  if (a !== b) {
    throw new Error("TPIN and confirmation do not match");
  }

  const existing = await dbGet<{ withdrawal_tpin_hash: string | null }>(
    isMysqlMode()
      ? "SELECT withdrawal_tpin_hash FROM users WHERE id = ? LIMIT 1"
      : "SELECT withdrawal_tpin_hash FROM users WHERE id = ?",
    [uid]
  );
  if (String(existing?.withdrawal_tpin_hash ?? "").trim()) {
    throw new Error("Withdrawal TPIN is already set — use change instead");
  }

  const { salt, hash } = hashTpin(a);
  await dbRun("UPDATE users SET withdrawal_tpin_salt = ?, withdrawal_tpin_hash = ? WHERE id = ?", [
    salt,
    hash,
    uid
  ]);
}

export async function changeWithdrawalTpin(
  userId: string,
  currentPin: string,
  pin: string,
  confirmPin: string
): Promise<void> {
  await initAppDb();
  const uid = String(userId ?? "").trim();
  const cur = assertPinFormat(currentPin, "Current TPIN");
  const a = assertPinFormat(pin, "New TPIN");
  const b = assertPinFormat(confirmPin, "Confirm new TPIN");
  if (a !== b) {
    throw new Error("New TPIN and confirmation do not match");
  }
  if (a === cur) {
    throw new Error("New TPIN must be different from the current one");
  }

  const row = await dbGet<{ withdrawal_tpin_hash: string | null; withdrawal_tpin_salt: string | null }>(
    isMysqlMode()
      ? "SELECT withdrawal_tpin_hash, withdrawal_tpin_salt FROM users WHERE id = ? LIMIT 1"
      : "SELECT withdrawal_tpin_hash, withdrawal_tpin_salt FROM users WHERE id = ?",
    [uid]
  );
  const storedHash = String(row?.withdrawal_tpin_hash ?? "").trim();
  const storedSalt = String(row?.withdrawal_tpin_salt ?? "").trim();
  if (!storedHash || !storedSalt) {
    throw new Error("Set a withdrawal TPIN first");
  }

  const { hash: curComputed } = hashTpin(cur, storedSalt);
  const storedBuf = Buffer.from(storedHash, "hex");
  const computedBuf = Buffer.from(curComputed, "hex");
  if (
    storedBuf.length !== computedBuf.length ||
    !crypto.timingSafeEqual(storedBuf, computedBuf)
  ) {
    throw new Error("Current TPIN is incorrect");
  }

  const { salt, hash } = hashTpin(a);
  await dbRun("UPDATE users SET withdrawal_tpin_salt = ?, withdrawal_tpin_hash = ? WHERE id = ?", [
    salt,
    hash,
    uid
  ]);
}

/**
 * Withdrawals require either a 4-digit TPIN (when set) or legacy 6-digit authenticator TOTP.
 */
export async function assertWithdrawalVerificationCode(userId: string, code: string | undefined): Promise<void> {
  await initAppDb();
  const uid = String(userId ?? "").trim();
  const raw = String(code ?? "").replace(/\s/g, "");

  const row = await dbGet<{
    withdrawal_tpin_hash: string | null;
    withdrawal_tpin_salt: string | null;
    withdrawal_totp_secret: string | null;
  }>(
    isMysqlMode()
      ? "SELECT withdrawal_tpin_hash, withdrawal_tpin_salt, withdrawal_totp_secret FROM users WHERE id = ? LIMIT 1"
      : "SELECT withdrawal_tpin_hash, withdrawal_tpin_salt, withdrawal_totp_secret FROM users WHERE id = ?",
    [uid]
  );

  const tpinHash = String(row?.withdrawal_tpin_hash ?? "").trim();
  const tpinSalt = String(row?.withdrawal_tpin_salt ?? "").trim();
  const totpSecret = String(row?.withdrawal_totp_secret ?? "").trim();

  if (tpinHash && tpinSalt) {
    if (!PIN_RE.test(raw)) {
      throw new Error("Enter your 4-digit withdrawal TPIN");
    }
    const { hash } = hashTpin(raw, tpinSalt);
    const storedBuf = Buffer.from(tpinHash, "hex");
    const computedBuf = Buffer.from(hash, "hex");
    if (
      storedBuf.length !== computedBuf.length ||
      !crypto.timingSafeEqual(storedBuf, computedBuf)
    ) {
      throw new Error("Invalid withdrawal TPIN");
    }
    return;
  }

  if (totpSecret) {
    if (!verifyWithdrawalTotpToken(totpSecret, raw)) {
      throw new Error("Invalid withdrawal TPN — use the current 6-digit code from your authenticator app");
    }
    return;
  }

  throw new Error(
    "Set a 4-digit withdrawal TPIN on the Withdraw page before requesting a withdrawal."
  );
}
