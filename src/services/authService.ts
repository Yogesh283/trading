import crypto from "node:crypto";
import { DEFAULT_DEMO_BALANCE_INR } from "../config/demo";
import { env } from "../config/env";
import { logger } from "../utils/logger";
import { dbAll, dbGet, dbRun, getPool, initAppDb, isMysqlMode } from "../db/appDb";
import { DemoAccount } from "./demoAccount";
import {
  ensureWallet,
  getDemoBalanceFromDb,
  getWalletBalance
} from "./walletStore";
import { validateInviterReferralCode, allocateUniqueSelfReferralCode } from "./referralService";
import { getReferralLevelConfigPayload } from "./referralLevelConfigService";
import { listInvestmentRoiLevelRows } from "./investmentRoiLevelService";
import { LEVEL_INCOME_DEPTH } from "../config/referral";
import { formatAdminMobile } from "../utils/adminMobile";

/** Compare admin URL id vs DB id (spaces, BOM, BigInt vs string, leading zeros on digits). */
function normalizeAdminIdToken(v: unknown): string {
  return String(v ?? "")
    .replace(/^\uFEFF/, "")
    .replace(/[\s\u200B-\u200D\uFEFF]/g, "")
    .trim();
}

function adminIdsLooselyEqual(dbId: unknown, requested: string): boolean {
  const a = normalizeAdminIdToken(dbId);
  const b = normalizeAdminIdToken(requested);
  if (!b) {
    return false;
  }
  if (a === b) {
    return true;
  }
  if (/^\d+$/.test(a) && /^\d+$/.test(b)) {
    try {
      return BigInt(a) === BigInt(b);
    } catch {
      return false;
    }
  }
  return false;
}

function rawUserPkToString(id: string | number | bigint): string {
  if (typeof id === "bigint") {
    return id.toString();
  }
  return String(id).trim();
}

/**
 * Read only `users.id` — matches Edit URL even when `WHERE id = ?` binding is picky.
 */
async function findUserPrimaryKeyByIdScan(requested: string): Promise<string | null> {
  await ready;
  const want = normalizeAdminIdToken(requested);
  if (!want) {
    return null;
  }
  try {
    const rows = await dbAll<{ id: string | number | bigint }>("SELECT id FROM users");
    for (const r of rows) {
      if (adminIdsLooselyEqual(r.id, want)) {
        return rawUserPkToString(r.id);
      }
    }
  } catch (err) {
    logger.warn({ err }, "findUserPrimaryKeyByIdScan");
  }
  return null;
}

function rowToAuthUser(
  row: Pick<
    UserRow,
    | "id"
    | "name"
    | "email"
    | "created_at"
    | "self_referral_code"
    | "role"
    | "phone_country_code"
    | "phone_local"
  >
): AuthUser {
  const role = row.role === "admin" ? "admin" : "user";
  const cc = row.phone_country_code != null ? String(row.phone_country_code).trim() : "";
  const loc = row.phone_local != null ? String(row.phone_local).trim() : "";
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phoneCountryCode: cc || null,
    phoneLocal: loc || null,
    createdAt: row.created_at,
    selfReferralCode: String(row.self_referral_code ?? "").trim() || "—",
    role
  };
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  /** Set for mobile signups; null for legacy / admin email-only accounts. */
  phoneCountryCode: string | null;
  phoneLocal: string | null;
  createdAt: string;
  /** User's own code to share (generated at register). */
  selfReferralCode: string;
  /** `admin` = React-Admin + /api/admin/* + /api/deposits/admin-all */
  role: "user" | "admin";
}

interface UserRow {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  password_salt: string;
  created_at: string;
  self_referral_code: string | null;
  referral_code: string | null;
  phone_country_code: string | null;
  phone_local: string | null;
  role: string;
  /** 1 = blocked (login + API session denied). */
  is_blocked?: number | string | null;
  last_login_at?: string | null;
}

const GUEST_USER: AuthUser = {
  id: "guest",
  name: "Guest Demo",
  email: "guest@demo.local",
  phoneCountryCode: null,
  phoneLocal: null,
  createdAt: new Date(0).toISOString(),
  selfReferralCode: "",
  role: "user"
};

const demoAccounts = new Map<string, DemoAccount>();
const ready = initAppDb();

export function listAllAccounts() {
  return [...demoAccounts.values()];
}

function hashPassword(password: string, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return { salt, hash };
}

function createToken(userId: string) {
  const payload = JSON.stringify({
    sub: userId,
    iat: Date.now()
  });
  const encodedPayload = Buffer.from(payload).toString("base64url");
  const signature = crypto.createHmac("sha256", env.AUTH_SECRET).update(encodedPayload).digest("base64url");
  return `${encodedPayload}.${signature}`;
}

function verifyToken(token: string) {
  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) {
    return null;
  }

  const expected = crypto.createHmac("sha256", env.AUTH_SECRET).update(encodedPayload).digest("base64url");
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (signatureBuffer.length !== expectedBuffer.length) {
    return null;
  }

  if (!crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as {
      sub?: string;
    };

    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

export function extractBearerToken(authHeader?: string | null) {
  if (!authHeader) {
    return null;
  }

  const [scheme, value] = authHeader.split(" ");
  if (scheme !== "Bearer" || !value) {
    return null;
  }

  return value;
}

/** Unique 4-digit string id (0000–9999), collision-checked against users.id */
async function allocateUniqueFourDigitUserId(): Promise<string> {
  await ready;
  for (let attempt = 0; attempt < 2000; attempt++) {
    const id = crypto.randomInt(0, 10000).toString().padStart(4, "0");
    const taken = await dbGet<{ id: string }>(
      isMysqlMode() ? "SELECT id FROM users WHERE id = ? LIMIT 1" : "SELECT id FROM users WHERE id = ?",
      [id]
    );
    if (!taken) {
      return id;
    }
  }
  for (let n = 0; n < 10000; n++) {
    const id = n.toString().padStart(4, "0");
    const taken = await dbGet<{ id: string }>(
      isMysqlMode() ? "SELECT id FROM users WHERE id = ? LIMIT 1" : "SELECT id FROM users WHERE id = ?",
      [id]
    );
    if (!taken) {
      return id;
    }
  }
  throw new Error("No free 4-digit user id available");
}

/**
 * Clears in-memory trading accounts for everyone except guest (forces next request to load from DB).
 * Call after registration so no stale RAM state lingers for the new user id space.
 */
export function clearServerAccountCacheExceptGuest() {
  for (const key of [...demoAccounts.keys()]) {
    if (!key.startsWith(`${GUEST_USER.id}:`)) {
      demoAccounts.delete(key);
    }
  }
}

function isDuplicateUserIdError(err: unknown): boolean {
  const msg = String((err as Error).message ?? "");
  if (msg.toLowerCase().includes("email")) {
    return false;
  }
  const e = err as { code?: string; errno?: number };
  if (e.code === "ER_DUP_ENTRY" || e.errno === 1062) {
    return msg.includes("PRIMARY") || /for key ['"]PRIMARY['"]/i.test(msg);
  }
  return msg.includes("users.id") || (msg.includes("UNIQUE constraint failed") && !msg.includes("email"));
}

function isDuplicateEmailError(err: unknown): boolean {
  const msg = String((err as Error).message ?? "").toLowerCase();
  return msg.includes("email") && (msg.includes("duplicate") || msg.includes("unique") || msg.includes("constraint"));
}

function isDuplicatePhoneError(err: unknown): boolean {
  const msg = String((err as Error).message ?? "").toLowerCase();
  if (!msg.includes("duplicate") && !msg.includes("unique") && !msg.includes("constraint")) {
    return false;
  }
  return (
    msg.includes("phone") ||
    msg.includes("uk_users_phone") ||
    msg.includes("idx_users_phone_cc_local")
  );
}

/** Digits only, 1–4 (e.g. 91 India, 92 Pakistan). */
export function normalizePhoneCountryCode(raw: string): string | null {
  const d = String(raw ?? "").replace(/\D/g, "");
  if (d.length < 1 || d.length > 4) {
    return null;
  }
  return d;
}

/** National number: digits only, 6–15 length; strips leading zeros if still too long. */
export function normalizePhoneLocalDigits(raw: string): string | null {
  let d = String(raw ?? "").replace(/\D/g, "");
  while (d.startsWith("0") && d.length > 6) {
    d = d.slice(1);
  }
  if (d.length < 6 || d.length > 15) {
    return null;
  }
  return d;
}

/**
 * 1) INSERT user — committed immediately so the row always appears in `users`.
 * 2) INSERT wallet — if this fails, user still exists; ensureWallet fixes on next login/API.
 *
 * **Public app:** `phoneCountryCode` + `phoneLocal` required; internal email placeholder stored.
 * **Internal only** (e.g. dev Chrome user): pass `email` with `@` and omit phone → phone columns NULL.
 */
export async function registerUser(input: {
  name: string;
  password: string;
  /** Required for normal signup (not used when `email` is a real address for internal seed). */
  phoneCountryCode?: string;
  phoneLocal?: string;
  /** Internal: dev / tests only */
  email?: string;
  referralCode?: string;
  pass?: string;
}) {
  await ready;

  const requestedEmail = String(input.email ?? "")
    .trim()
    .toLowerCase();
  const internalEmailPath = Boolean(requestedEmail && requestedEmail.includes("@"));

  let phoneCc: string | null = null;
  let phoneLoc: string | null = null;
  if (internalEmailPath) {
    const existing = await dbGet<UserRow>("SELECT * FROM users WHERE email = ?", [requestedEmail]);
    if (existing) {
      throw new Error("Email already registered");
    }
  } else {
    phoneCc = normalizePhoneCountryCode(String(input.phoneCountryCode ?? ""));
    phoneLoc = normalizePhoneLocalDigits(String(input.phoneLocal ?? ""));
    if (!phoneCc || !phoneLoc) {
      throw new Error("Country code and valid mobile number are required");
    }
    const taken = await dbGet<UserRow>(
      "SELECT id FROM users WHERE phone_country_code = ? AND phone_local = ? LIMIT 1",
      [phoneCc, phoneLoc]
    );
    if (taken) {
      throw new Error("This mobile number is already registered");
    }
  }

  let usedReferral: string | null = null;
  try {
    usedReferral = await validateInviterReferralCode(input.referralCode);
  } catch (e) {
    if (e instanceof Error && e.message === "Invalid referral code") {
      throw e;
    }
    throw e;
  }

  const createdAt = new Date().toISOString();
  const { salt, hash } = hashPassword(input.password);
  const name = input.name.trim();
  const now = createdAt;
  const pass = input.password;
  for (let attempt = 0; attempt < 25; attempt++) {
    const id = await allocateUniqueFourDigitUserId();
    const email = internalEmailPath ? requestedEmail : `${id}@m.iqfxpro.local`;
    const selfCode = await allocateUniqueSelfReferralCode();
    try {
      if (isMysqlMode()) {
        try {
          await getPool().execute(
            `INSERT INTO users (id, name, email, password_hash, password_salt, created_at, self_referral_code, referral_code, phone_country_code, phone_local, role,pass)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'user',?)`,
            [id, name, email, hash, salt, createdAt, selfCode, usedReferral, phoneCc, phoneLoc,pass]
          );
        } catch (e) {
          if (isDuplicateEmailError(e)) {
            throw new Error("Email already registered");
          }
          if (isDuplicatePhoneError(e)) {
            throw new Error("This mobile number is already registered");
          }
          if (isDuplicateUserIdError(e) && attempt < 24) {
            continue;
          }
          throw e;
        }
      } else {
        try {
          await dbRun(
            `INSERT INTO users (id, name, email, password_hash, password_salt, created_at, self_referral_code, referral_code, phone_country_code, phone_local, role, pass) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'user', ?)`,
            [id, name, email, hash, salt, createdAt, selfCode, usedReferral, phoneCc, phoneLoc, pass]
          );
        } catch (e) {
          if (isDuplicateEmailError(e)) {
            throw new Error("Email already registered");
          }
          if (isDuplicatePhoneError(e)) {
            throw new Error("This mobile number is already registered");
          }
          if (isDuplicateUserIdError(e) && attempt < 24) {
            continue;
          }
          throw e;
        }
      }

      try {
        if (isMysqlMode()) {
          await getPool().execute(
            `INSERT INTO wallets (user_id, balance, demo_balance, updated_at) VALUES (?, 0, ?, ?)`,
            [id, DEFAULT_DEMO_BALANCE_INR, now]
          );
        } else {
          await dbRun(
            `INSERT INTO wallets (user_id, balance, demo_balance, updated_at) VALUES (?, 0, ?, ?)`,
            [id, DEFAULT_DEMO_BALANCE_INR, now]
          );
        }
      } catch {
        try {
          await ensureWallet(id);
        } catch {
          /* user row is still saved */
        }
      }

      evictInMemoryAccountsForUser(id);
      if (!env.SKIP_CLEAR_CACHE_ON_REGISTER) {
        clearServerAccountCacheExceptGuest();
      }

      const saved = await dbGet<UserRow>(
        "SELECT id, name, email, created_at, self_referral_code, role, phone_country_code, phone_local FROM users WHERE id = ?",
        [id]
      );
      if (!saved) {
        throw new Error("Registration failed: user not found after insert");
      }

      return {
        user: rowToAuthUser(saved),
        token: createToken(saved.id),
        wallet: {
          liveBalance: 0,
          demoBalance: DEFAULT_DEMO_BALANCE_INR
        }
      };
    } catch (e) {
      if (e instanceof Error && e.message === "Email already registered") {
        throw e;
      }
      if (e instanceof Error && e.message === "This mobile number is already registered") {
        throw e;
      }
      if (isDuplicateUserIdError(e) && attempt < 24) {
        continue;
      }
      throw e;
    }
  }

  throw new Error("Registration failed: could not assign a unique user id");
}

/** Fixed credentials for Chrome DevTools live editing (see docs/CHROME_LIVE_USER.md) */
export const CHROME_LIVE_USER_EMAIL = "chrome-live@local.test";
export const CHROME_LIVE_USER_PASSWORD = "LiveEdit1!";

/** Call on server start when SEED_CHROME_USER=1 and NODE_ENV=development */
export async function ensureDevChromeUser(): Promise<void> {
  if (env.NODE_ENV !== "development" || !env.SEED_CHROME_USER) {
    return;
  }
  await ready;
  try {
    await registerUser({
      name: "Chrome Live",
      email: CHROME_LIVE_USER_EMAIL,
      password: CHROME_LIVE_USER_PASSWORD
    });
    logger.info({ email: CHROME_LIVE_USER_EMAIL }, "Dev Chrome user created");
  } catch (e) {
    if (e instanceof Error && e.message.includes("Email already registered")) {
      return;
    }
    logger.warn({ err: e }, "Dev Chrome user seed failed");
  }
}

/**
 * App: `countryCode` + `phone` + `password`.
 * Admin panel: `email` + `password`.
 * Legacy: numeric `email` field = user id (accounts without phone).
 */
export async function loginUser(input: {
  email?: string;
  password: string;
  countryCode?: string;
  phone?: string;
}) {
  await ready;

  const emailRaw = String(input.email ?? "").trim();
  const loweredEmail = emailRaw.toLowerCase();
  const cc = normalizePhoneCountryCode(String(input.countryCode ?? "").trim());
  const local = normalizePhoneLocalDigits(String(input.phone ?? "").trim());

  const userSql =
    "SELECT id, name, email, password_hash, password_salt, created_at, self_referral_code, referral_code, role, phone_country_code, phone_local, COALESCE(is_blocked, 0) AS is_blocked FROM users WHERE ";

  let user: UserRow | undefined;
  if (loweredEmail.includes("@")) {
    user = await dbGet<UserRow>(`${userSql}LOWER(email) = ?`, [loweredEmail]);
  } else if (cc && local) {
    user = await dbGet<UserRow>(`${userSql}phone_country_code = ? AND phone_local = ?`, [cc, local]);
  } else if (/^\d+$/.test(emailRaw)) {
    user = await dbGet<UserRow>(`${userSql}id = ?`, [emailRaw]);
  }

  if (!user) {
    throw new Error("Invalid login or password");
  }

  if (Number(user.is_blocked ?? 0) === 1) {
    throw new Error("Account is blocked");
  }

  const { hash } = hashPassword(input.password, user.password_salt);
  const storedHash = Buffer.from(user.password_hash, "hex");
  const computedHash = Buffer.from(hash, "hex");

  if (
    storedHash.length !== computedHash.length ||
    !crypto.timingSafeEqual(storedHash, computedHash)
  ) {
    throw new Error("Invalid login or password");
  }

  try {
    await ensureWallet(user.id);
  } catch {
    /* wallet row next time deposit/live API runs */
  }

  const nowIso = new Date().toISOString();
  try {
    await dbRun("UPDATE users SET last_login_at = ? WHERE id = ?", [nowIso, user.id]);
  } catch {
    /* ignore — column missing only if DB never migrated */
  }

  return {
    user: rowToAuthUser(user),
    token: createToken(user.id)
  };
}

export async function getUserFromToken(token?: string | null) {
  if (!token) {
    return null;
  }

  const userId = verifyToken(token);
  if (!userId) {
    return null;
  }

  await ready;

  const user = await dbGet<UserRow>(
    isMysqlMode()
      ? "SELECT id, name, email, created_at, self_referral_code, role, phone_country_code, phone_local, COALESCE(is_blocked, 0) AS is_blocked FROM users WHERE id = ? LIMIT 1"
      : "SELECT id, name, email, created_at, self_referral_code, role, phone_country_code, phone_local, COALESCE(is_blocked, 0) AS is_blocked FROM users WHERE id = ?",
    [userId]
  );
  if (!user) {
    return null;
  }

  if (Number(user.is_blocked ?? 0) === 1) {
    return null;
  }

  return rowToAuthUser(user);
}

export async function resolveDemoUser(authHeader?: string | null) {
  const token = extractBearerToken(authHeader);
  const user = await getUserFromToken(token);
  return user ?? GUEST_USER;
}

export async function requireSession(authHeader?: string | null) {
  const token = extractBearerToken(authHeader);
  const user = await getUserFromToken(token);
  if (!user) {
    throw new Error("Unauthorized");
  }

  return user;
}

/** Bearer JWT + DB `users.role = 'admin'` (React-Admin, admin-all, /api/admin/ra). */
export async function requireAdminSession(authHeader?: string | null) {
  const bearer = extractBearerToken(authHeader);
  if (!bearer) {
    throw new Error("Unauthorized");
  }
  const userId = verifyToken(bearer);
  if (!userId) {
    throw new Error("Unauthorized");
  }
  await ready;
  const row = await dbGet<{ id: string; email: string; role: string; is_blocked?: number | string | null }>(
    isMysqlMode()
      ? "SELECT id, email, role, COALESCE(is_blocked, 0) AS is_blocked FROM users WHERE id = ? LIMIT 1"
      : "SELECT id, email, role, COALESCE(is_blocked, 0) AS is_blocked FROM users WHERE id = ?",
    [userId]
  );
  if (!row) {
    throw new Error("Unauthorized");
  }
  if (Number(row.is_blocked ?? 0) === 1) {
    throw new Error("Unauthorized");
  }
  if (row.role !== "admin") {
    throw new Error("Forbidden");
  }
  return { id: row.id, email: row.email };
}

/** One-time promote: set `.env` `ADMIN_PROMOTE_EMAIL=you@mail.com`, restart server, then remove line. */
export async function promoteAdminFromEnv() {
  const email = env.ADMIN_PROMOTE_EMAIL?.trim().toLowerCase();
  if (!email) {
    return;
  }
  await ready;
  const { affectedRows } = await dbRun("UPDATE users SET role = 'admin' WHERE LOWER(email) = ?", [email]);
  if (affectedRows > 0) {
    logger.info({ email }, "ADMIN_PROMOTE_EMAIL: promoted to admin");
  } else {
    logger.warn({ email }, "ADMIN_PROMOTE_EMAIL: no matching user — register first or fix email");
  }
}

export type WalletType = "demo" | "live";

/** Guest = demo-only (try before login). Logged-in = separate demo + real wallets. */
export function resolveWallet(userId: string, headerValue: string | undefined): WalletType {
  if (userId === GUEST_USER.id) {
    return "demo";
  }
  const raw = String(headerValue ?? "demo").toLowerCase();
  return raw === "live" ? "live" : "demo";
}

function walletStorageKey(userId: string, wallet: WalletType) {
  return `${userId}:${wallet}`;
}

/** Remove any in-memory trading state so the next request loads from DB only. */
export function evictInMemoryAccountsForUser(userId: string) {
  demoAccounts.delete(walletStorageKey(userId, "demo"));
  demoAccounts.delete(walletStorageKey(userId, "live"));
}

/** Load account state from DB before handling the request (no stale RAM after register). */
export async function prepareAccountForRequest(userId: string, wallet: WalletType) {
  if (userId === GUEST_USER.id) {
    return;
  }
  if (wallet === "live") {
    await hydrateLiveAccountFromWallet(userId);
    return;
  }
  const key = walletStorageKey(userId, "demo");
  if (demoAccounts.has(key)) {
    return;
  }
  const demoBal = await getDemoBalanceFromDb(userId);
  const acc = new DemoAccount(demoBal);
  demoAccounts.set(key, acc);
}

export function getAccountForWallet(userId: string, wallet: WalletType) {
  const key = walletStorageKey(userId, wallet);
  const existing = demoAccounts.get(key);
  if (existing) {
    return existing;
  }

  const startingBalance = wallet === "demo" ? DEFAULT_DEMO_BALANCE_INR : 0;
  const account = new DemoAccount(startingBalance);
  demoAccounts.set(key, account);
  return account;
}

/** @deprecated use getAccountForWallet */
export function getDemoAccountFor(userId: string) {
  return getAccountForWallet(userId, "demo");
}

export function getGuestUser() {
  return GUEST_USER;
}

/** Safe columns only — for React-Admin / admin API (no password hash/salt). */
export type AdminUserRow = {
  id: string;
  name: string;
  email: string;
  /** Plaintext password stored at signup when `users.pass` exists (MySQL path); null if never saved. */
  pass: string | null;
  created_at: string;
  self_referral_code: string | null;
  referral_code: string | null;
  role: string;
  phone_country_code: string | null;
  phone_local: string | null;
  last_login_at: string | null;
  /** Blocked users cannot log in or call user APIs; existing JWTs stop working. */
  is_blocked: boolean;
};

/** List + edit: wallet, upline (inviter), direct / total team size under this user. */
export type AdminUserListRow = AdminUserRow & {
  balance: number;
  demo_balance: number;
  inviter_id: string | null;
  inviter_name: string | null;
  inviter_email: string | null;
  direct_team_count: number;
  total_team_count: number;
  /** Sum of direct referrals’ live wallet balance (INR). */
  direct_team_live_balance_total: number;
  /** Sum of direct referrals’ credited deposits (USDT). */
  direct_team_deposits_usdt_total: number;
  withdrawal_totp_enabled: boolean;
  /** Country code + local digits for admin tables. */
  user_mobile: string;
};

export type AdminUserDetailRow = AdminUserListRow;

/** Row shape from `users` + computed `withdrawal_totp_enabled` (before mapRawAdminUserRow). */
type AdminUserDbBase = Omit<AdminUserRow, "is_blocked" | "last_login_at" | "pass"> & {
  pass?: string | null;
  last_login_at: string | null;
  is_blocked: number | string | null;
  withdrawal_totp_enabled?: number | string | null;
};

type ReferralGraphRow = { id: string; self_referral_code: string | null; referral_code: string | null };

function buildReferralChildrenMap(rows: ReferralGraphRow[]): Map<string, string[]> {
  const codeToId = new Map<string, string>();
  for (const r of rows) {
    const c = r.self_referral_code?.trim().toUpperCase();
    if (c) {
      codeToId.set(c, String(r.id));
    }
  }
  const childrenByParentId = new Map<string, string[]>();
  for (const r of rows) {
    const ref = r.referral_code?.trim().toUpperCase();
    if (!ref) {
      continue;
    }
    const pid = codeToId.get(ref);
    if (!pid) {
      continue;
    }
    if (!childrenByParentId.has(pid)) {
      childrenByParentId.set(pid, []);
    }
    childrenByParentId.get(pid)!.push(String(r.id));
  }
  return childrenByParentId;
}

/** All descendants (every level); cycle-safe. */
function countTotalDownline(userId: string, childrenByParentId: Map<string, string[]>): number {
  const stack = new Set<string>();
  function walk(uid: string): number {
    if (stack.has(uid)) {
      return 0;
    }
    stack.add(uid);
    const kids = childrenByParentId.get(uid) ?? [];
    let n = kids.length;
    for (const k of kids) {
      n += walk(k);
    }
    stack.delete(uid);
    return n;
  }
  return walk(userId);
}

export type ReferralTeamMemberPublic = {
  id: string;
  name: string;
  email: string;
  /** Display phone (country + local), same format as admin tables. */
  mobile: string;
  createdAt: string;
  selfReferralCode: string;
  /** Live trading wallet balance (INR). */
  liveWalletBalanceInr: number;
  /** Sum of credited on-chain deposits (USDT). */
  totalDepositedUsdt: number;
};

async function loadWalletBalancesForUserIds(userIds: string[]): Promise<Map<string, number>> {
  const m = new Map<string, number>();
  if (userIds.length === 0) return m;
  const ph = userIds.map(() => "?").join(", ");
  const rows = await dbAll<{ user_id: string | number; balance: number | string | null }>(
    `SELECT user_id, balance FROM wallets WHERE user_id IN (${ph})`,
    userIds
  );
  for (const r of rows) {
    m.set(String(r.user_id).trim(), Number(r.balance ?? 0));
  }
  return m;
}

async function loadCreditedDepositTotalsForUserIds(userIds: string[]): Promise<Map<string, number>> {
  const m = new Map<string, number>();
  if (userIds.length === 0) return m;
  const ph = userIds.map(() => "?").join(", ");
  const rows = await dbAll<{ user_id: string | number; t: number | string | null }>(
    `SELECT user_id, SUM(amount) AS t FROM deposits WHERE status = 'credited' AND user_id IN (${ph}) GROUP BY user_id`,
    userIds
  );
  for (const r of rows) {
    m.set(String(r.user_id).trim(), Number(r.t ?? 0));
  }
  return m;
}

/** `reference_id` suffix `-L1`…`-L5` from `applyLedger` upline splits. */
function parseReferralLevelFromReferenceId(ref: string | null | undefined): number | null {
  const m = String(ref ?? "").match(/-L(\d+)$/);
  if (!m) {
    return null;
  }
  const n = parseInt(m[1]!, 10);
  if (!Number.isFinite(n) || n < 1 || n > LEVEL_INCOME_DEPTH) {
    return null;
  }
  return n;
}

function formatFractionAsPercentLabel(fraction: number): string {
  const f = Number(fraction);
  if (!Number.isFinite(f) || f <= 0) {
    return "0%";
  }
  const pct = f * 100;
  const s = pct < 0.1 ? pct.toFixed(4) : pct.toFixed(3);
  return `${s.replace(/\.?0+$/, "")}%`;
}

/** Logged-in user: inviter, direct team, totals (for /api/referrals/summary). */
export async function getReferralDashboardForUser(userId: string): Promise<{
  selfReferralCode: string;
  inviter: { name: string; email: string; mobile: string } | null;
  directTeam: ReferralTeamMemberPublic[];
  directCount: number;
  totalTeamCount: number;
  /** Sum of live wallet (INR) across direct referrals only. */
  directTotalLiveBalanceInr: number;
  /** Sum of credited USDT deposits across direct referrals only. */
  directTeamTotalDepositsUsdt: number;
  /** Total referral commissions credited to your live wallet (betting + staking + investment ROI). */
  totalReferralCommissionInr: number;
  /** From team members’ live binary stakes (`level_income`). */
  bettingCommissionInr: number;
  /** From team members’ staking / investment deposits (`level_income_staking`). */
  stakingCommissionInr: number;
  /** From team members’ monthly investment ROI payouts (`level_income_roi`). */
  investmentRoiCommissionInr: number;
  referralProgramEnabled: boolean;
  /** Example stake used for “Income (example)” column on promotion page. */
  levelIncomeExampleStakeInr: number;
  /** Per-upline % of live binary stake and investment add stake (same schedule). */
  betStakeLevelSchedule: Array<{
    level: number;
    uplineLabel: string;
    fractionOfStake: number;
    percentLabel: string;
    paysOut: boolean;
    exampleIncomeInr: number;
    /** Live wallet total credited from this depth (binary + staking `level_income*`). */
    receivedInr: number;
  }>;
  /** Per-upline % of gross monthly investment ROI when yield is distributed. */
  monthlyRoiLevelSchedule: Array<{
    level: number;
    uplineLabel: string;
    fractionOfGrossYield: number;
    percentLabel: string;
    paysOut: boolean;
    /** Live wallet total credited from this depth (`level_income_roi`). */
    receivedInr: number;
  }>;
}> {
  await ready;
  const uid = String(userId ?? "").trim();
  const me = await dbGet<{
    id: string | number;
    self_referral_code: string | null;
    referral_code: string | null;
  }>(
    isMysqlMode()
      ? "SELECT id, self_referral_code, referral_code FROM users WHERE id = ? LIMIT 1"
      : "SELECT id, self_referral_code, referral_code FROM users WHERE id = ?",
    [uid]
  );
  if (!me) {
    throw new Error("User not found");
  }
  const myCode = String(me.self_referral_code ?? "").trim();

  const commissionRows = await dbAll<{ txn_type: string; total: number | string | null }>(
    `SELECT txn_type, COALESCE(SUM(amount),0) AS total FROM transactions WHERE user_id = ? AND txn_type IN ('level_income','level_income_staking','level_income_roi') GROUP BY txn_type`,
    [uid]
  );
  let bettingCommissionInr = 0;
  let stakingCommissionInr = 0;
  let investmentRoiCommissionInr = 0;
  for (const r of commissionRows) {
    const t = Number(r.total ?? 0);
    if (r.txn_type === "level_income") {
      bettingCommissionInr += t;
    } else if (r.txn_type === "level_income_staking") {
      stakingCommissionInr += t;
    } else if (r.txn_type === "level_income_roi") {
      investmentRoiCommissionInr += t;
    }
  }
  const totalReferralCommissionInr = Number(
    (bettingCommissionInr + stakingCommissionInr + investmentRoiCommissionInr).toFixed(4)
  );
  bettingCommissionInr = Number(bettingCommissionInr.toFixed(4));
  stakingCommissionInr = Number(stakingCommissionInr.toFixed(4));
  investmentRoiCommissionInr = Number(investmentRoiCommissionInr.toFixed(4));

  const levelIncomeRows = await dbAll<{
    txn_type: string;
    reference_id: string | null;
    amount: number | string | null;
  }>(
    `SELECT txn_type, reference_id, amount FROM transactions WHERE user_id = ? AND txn_type IN ('level_income','level_income_staking','level_income_roi')`,
    [uid]
  );
  const betRecvByLevel = new Map<number, number>();
  const stakeRecvByLevel = new Map<number, number>();
  const roiRecvByLevel = new Map<number, number>();
  for (const r of levelIncomeRows) {
    const lv = parseReferralLevelFromReferenceId(r.reference_id);
    if (lv == null) {
      continue;
    }
    const amt = Number(r.amount ?? 0);
    if (r.txn_type === "level_income") {
      betRecvByLevel.set(lv, (betRecvByLevel.get(lv) ?? 0) + amt);
    } else if (r.txn_type === "level_income_staking") {
      stakeRecvByLevel.set(lv, (stakeRecvByLevel.get(lv) ?? 0) + amt);
    } else if (r.txn_type === "level_income_roi") {
      roiRecvByLevel.set(lv, (roiRecvByLevel.get(lv) ?? 0) + amt);
    }
  }

  let inviter: { name: string; email: string; mobile: string } | null = null;
  const mySignupRef = String(me.referral_code ?? "").trim();
  if (mySignupRef) {
    const inv = await dbGet<{
      name: string;
      email: string;
      phone_country_code: string | null;
      phone_local: string | null;
    }>(
      isMysqlMode()
        ? "SELECT name, email, phone_country_code, phone_local FROM users WHERE UPPER(TRIM(self_referral_code)) = UPPER(?) LIMIT 1"
        : "SELECT name, email, phone_country_code, phone_local FROM users WHERE UPPER(TRIM(self_referral_code)) = UPPER(?)",
      [mySignupRef]
    );
    if (inv) {
      inviter = {
        name: inv.name,
        email: inv.email,
        mobile: formatAdminMobile(inv.phone_country_code, inv.phone_local)
      };
    }
  }

  let directTeam: ReferralTeamMemberPublic[] = [];
  if (myCode) {
    const directSql = isMysqlMode()
      ? `SELECT id, name, email, phone_country_code, phone_local, created_at, self_referral_code FROM users
         WHERE referral_code IS NOT NULL AND TRIM(referral_code) <> ''
         AND UPPER(TRIM(referral_code)) = UPPER(?)
         ORDER BY created_at DESC`
      : `SELECT id, name, email, phone_country_code, phone_local, created_at, self_referral_code FROM users
         WHERE referral_code IS NOT NULL AND TRIM(referral_code) <> ''
         AND UPPER(TRIM(referral_code)) = UPPER(?)
         ORDER BY created_at DESC`;
    const directRows = await dbAll<{
      id: string | number;
      name: string;
      email: string;
      phone_country_code: string | null;
      phone_local: string | null;
      created_at: string;
      self_referral_code: string | null;
    }>(directSql, [myCode]);
    directTeam = directRows.map((r) => ({
      id: String(r.id),
      name: r.name,
      email: r.email,
      mobile: formatAdminMobile(r.phone_country_code, r.phone_local),
      createdAt: r.created_at,
      selfReferralCode: String(r.self_referral_code ?? "").trim() || "—",
      liveWalletBalanceInr: 0,
      totalDepositedUsdt: 0
    }));
  }

  const graph = await dbAll<ReferralGraphRow>("SELECT id, self_referral_code, referral_code FROM users");
  const childrenByParentId = buildReferralChildrenMap(graph);
  const totalTeamCount = countTotalDownline(uid, childrenByParentId);

  const directIds = directTeam.map((m) => m.id);
  const walletByDirect = await loadWalletBalancesForUserIds(directIds);
  const depByDirect = await loadCreditedDepositTotalsForUserIds(directIds);
  let directTotalLiveBalanceInr = 0;
  let directTeamTotalDepositsUsdt = 0;
  directTeam = directTeam.map((m) => {
    const liveWalletBalanceInr = walletByDirect.get(m.id) ?? 0;
    const totalDepositedUsdt = depByDirect.get(m.id) ?? 0;
    directTotalLiveBalanceInr += liveWalletBalanceInr;
    directTeamTotalDepositsUsdt += totalDepositedUsdt;
    return { ...m, liveWalletBalanceInr, totalDepositedUsdt };
  });

  const LEVEL_INCOME_EXAMPLE_STAKE_INR = 1000;
  const [refCfg, roiLevelRows] = await Promise.all([
    getReferralLevelConfigPayload(),
    listInvestmentRoiLevelRows()
  ]);
  const programOn = refCfg.referralProgramEnabled;
  const betStakeLevelSchedule = refCfg.levels
    .slice()
    .sort((a, b) => a.level - b.level)
    .map((row) => {
      const frac = Number(row.percentOfStake);
      const fractionOfStake = Number.isFinite(frac) ? frac : 0;
      const paysOut = programOn && row.enabled && fractionOfStake > 0;
      const exampleIncomeInr = paysOut
        ? Number((LEVEL_INCOME_EXAMPLE_STAKE_INR * fractionOfStake).toFixed(2))
        : 0;
      const receivedInr = Number(
        ((betRecvByLevel.get(row.level) ?? 0) + (stakeRecvByLevel.get(row.level) ?? 0)).toFixed(4)
      );
      return {
        level: row.level,
        uplineLabel: row.level === 1 ? "Level 1 — direct inviter" : `Level ${row.level} upline`,
        fractionOfStake,
        percentLabel: formatFractionAsPercentLabel(fractionOfStake),
        paysOut,
        exampleIncomeInr,
        receivedInr
      };
    });

  const monthlyRoiLevelSchedule = roiLevelRows
    .slice()
    .sort((a, b) => a.level - b.level)
    .map((row) => {
      const frac = Number(row.percentOfGrossYield);
      const fractionOfGrossYield = Number.isFinite(frac) ? frac : 0;
      const paysOut = row.enabled && fractionOfGrossYield > 0;
      const receivedInr = Number((roiRecvByLevel.get(row.level) ?? 0).toFixed(4));
      return {
        level: row.level,
        uplineLabel: row.level === 1 ? "Level 1 — direct inviter" : `Level ${row.level} upline`,
        fractionOfGrossYield,
        percentLabel: formatFractionAsPercentLabel(fractionOfGrossYield),
        paysOut,
        receivedInr
      };
    });

  return {
    selfReferralCode: myCode || "—",
    inviter,
    directTeam,
    directCount: directTeam.length,
    totalTeamCount,
    directTotalLiveBalanceInr,
    directTeamTotalDepositsUsdt,
    totalReferralCommissionInr,
    bettingCommissionInr,
    stakingCommissionInr,
    investmentRoiCommissionInr,
    referralProgramEnabled: programOn,
    levelIncomeExampleStakeInr: LEVEL_INCOME_EXAMPLE_STAKE_INR,
    betStakeLevelSchedule,
    monthlyRoiLevelSchedule
  };
}

async function buildGlobalWalletAndDepositMaps(): Promise<{
  walletByUser: Map<string, number>;
  depositSumByUser: Map<string, number>;
}> {
  const wRows = await dbAll<{ user_id: string | number; balance: number | string | null }>(
    "SELECT user_id, balance FROM wallets"
  );
  const walletByUser = new Map<string, number>();
  for (const r of wRows) {
    walletByUser.set(String(r.user_id).trim(), Number(r.balance ?? 0));
  }
  const dRows = await dbAll<{ user_id: string | number; t: number | string | null }>(
    "SELECT user_id, SUM(amount) AS t FROM deposits WHERE status = 'credited' GROUP BY user_id"
  );
  const depositSumByUser = new Map<string, number>();
  for (const r of dRows) {
    depositSumByUser.set(String(r.user_id).trim(), Number(r.t ?? 0));
  }
  return { walletByUser, depositSumByUser };
}

const ADMIN_USER_SELECT = `
  u.id, u.name, u.email, COALESCE(u.\`pass\`, '') AS pass, u.created_at, u.self_referral_code, u.referral_code, u.role,
  u.phone_country_code, u.phone_local,
  u.last_login_at,
  COALESCE(u.is_blocked, 0) AS is_blocked,
  CASE
    WHEN u.withdrawal_totp_secret IS NOT NULL AND TRIM(COALESCE(u.withdrawal_totp_secret, '')) <> '' THEN 1
    ELSE 0
  END AS withdrawal_totp_enabled,
  COALESCE(w.balance, 0) AS balance,
  COALESCE(w.demo_balance, ${DEFAULT_DEMO_BALANCE_INR}) AS demo_balance,
  inv.id AS inviter_id,
  inv.name AS inviter_name,
  inv.email AS inviter_email
`;

const ADMIN_USER_JOINS = `
  FROM users u
  LEFT JOIN wallets w ON w.user_id = u.id
  LEFT JOIN users inv
    ON u.referral_code IS NOT NULL
   AND TRIM(u.referral_code) <> ''
   AND inv.self_referral_code IS NOT NULL
   AND UPPER(TRIM(inv.self_referral_code)) = UPPER(TRIM(u.referral_code))
`;

function mapRawAdminUserRow(
  row: Omit<AdminUserRow, "is_blocked" | "last_login_at" | "pass"> & {
    pass?: string | null;
    balance: number | string | null;
    demo_balance: number | string | null;
    inviter_id: string | null;
    inviter_name: string | null;
    inviter_email: string | null;
    withdrawal_totp_enabled?: number | string | null;
    phone_country_code?: string | null;
    phone_local?: string | null;
    last_login_at?: string | null;
    is_blocked?: number | string | null;
  },
  childrenByParentId: Map<string, string[]>,
  walletByUser: Map<string, number>,
  depositSumByUser: Map<string, number>
): AdminUserListRow {
  const myId = String(row.id ?? "").trim();
  const kids = childrenByParentId.get(myId) ?? [];
  let direct_team_live_balance_total = 0;
  let direct_team_deposits_usdt_total = 0;
  for (const k of kids) {
    const kk = String(k).trim();
    direct_team_live_balance_total += walletByUser.get(kk) ?? 0;
    direct_team_deposits_usdt_total += depositSumByUser.get(kk) ?? 0;
  }
  const passRaw = row.pass;
  const passTrimmed =
    passRaw != null && String(passRaw).trim() !== "" ? String(passRaw) : null;

  return {
    /** Always string for React-Admin URL + getOne (avoids number/BIGINT JSON mismatch). */
    id: myId,
    name: row.name,
    email: row.email,
    pass: passTrimmed,
    created_at: row.created_at,
    self_referral_code: row.self_referral_code,
    referral_code: row.referral_code,
    role: row.role,
    phone_country_code: row.phone_country_code ?? null,
    phone_local: row.phone_local ?? null,
    last_login_at: row.last_login_at ?? null,
    is_blocked: Number(row.is_blocked ?? 0) === 1,
    balance: Number(row.balance ?? 0),
    demo_balance: Number(row.demo_balance ?? DEFAULT_DEMO_BALANCE_INR),
    inviter_id: row.inviter_id != null ? String(row.inviter_id).trim() : null,
    inviter_name: row.inviter_name ?? null,
    inviter_email: row.inviter_email ?? null,
    direct_team_count: kids.length,
    total_team_count: countTotalDownline(myId, childrenByParentId),
    direct_team_live_balance_total,
    direct_team_deposits_usdt_total,
    withdrawal_totp_enabled: Number(row.withdrawal_totp_enabled ?? 0) === 1,
    user_mobile: formatAdminMobile(row.phone_country_code, row.phone_local)
  };
}

export async function listUsersForAdmin(): Promise<AdminUserListRow[]> {
  await ready;
  const graph = await dbAll<ReferralGraphRow>(
    "SELECT id, self_referral_code, referral_code FROM users"
  );
  const childrenByParentId = buildReferralChildrenMap(graph);
  const { walletByUser, depositSumByUser } = await buildGlobalWalletAndDepositMaps();

  const sql = isMysqlMode()
    ? `SELECT ${ADMIN_USER_SELECT} ${ADMIN_USER_JOINS} ORDER BY u.created_at DESC`
    : `SELECT ${ADMIN_USER_SELECT} ${ADMIN_USER_JOINS} ORDER BY u.created_at DESC`;

  const raw = await dbAll<
    Omit<AdminUserRow, "is_blocked" | "last_login_at" | "pass"> & {
      pass?: string | null;
      last_login_at?: string | null;
      is_blocked?: number | string | null;
      balance: number | string | null;
      demo_balance: number | string | null;
      inviter_id: string | null;
      inviter_name: string | null;
      inviter_email: string | null;
      withdrawal_totp_enabled?: number | string | null;
    }
  >(sql);

  return raw.map((r) => mapRawAdminUserRow(r, childrenByParentId, walletByUser, depositSumByUser));
}

/**
 * Canonical `users.id` for admin GET/PUT — handles string vs numeric binding (MySQL INT/BIGINT/VARCHAR).
 */
export async function resolveAdminUserPrimaryKey(raw: string): Promise<string | null> {
  await ready;
  const uid = String(raw ?? "").trim();
  if (!uid) {
    return null;
  }

  const idOnlySql = isMysqlMode()
    ? "SELECT id FROM users WHERE id = ? LIMIT 1"
    : "SELECT id FROM users WHERE id = ?";
  const looseSql = isMysqlMode()
    ? "SELECT id FROM users WHERE TRIM(CAST(id AS CHAR)) = TRIM(?) LIMIT 1"
    : "SELECT id FROM users WHERE TRIM(CAST(id AS TEXT)) = TRIM(?)";

  const attempts: unknown[] = [uid];
  if (/^\d+$/.test(uid)) {
    const n = Number(uid);
    if (Number.isSafeInteger(n)) {
      attempts.push(n);
    }
  }

  for (const p of attempts) {
    const hit = await dbGet<{ id: string | number }>(idOnlySql, [p]);
    if (hit) {
      return String(hit.id).trim();
    }
  }

  const loose = await dbGet<{ id: string | number }>(looseSql, [uid]);
  if (loose) {
    return String(loose.id).trim();
  }

  /** Legacy MySQL tables: numeric PK / mixed types — CONVERT compares as text. */
  if (isMysqlMode()) {
    const convSql =
      "SELECT id FROM users WHERE CONVERT(id, CHAR) = TRIM(?) OR CONVERT(id, CHAR) = ? LIMIT 1";
    const conv = await dbGet<{ id: string | number }>(convSql, [uid, uid]);
    if (conv) {
      return String(conv.id).trim();
    }
  }

  const scanned = await findUserPrimaryKeyByIdScan(uid);
  if (scanned) {
    return scanned;
  }

  try {
    const rows = await listUsersForAdmin();
    const hit = rows.find((u) => adminIdsLooselyEqual(u.id, uid));
    if (hit) {
      return String(hit.id).trim();
    }
  } catch {
    /* ignore */
  }

  return null;
}

export async function getUserForAdminById(userId: string): Promise<AdminUserDetailRow | null> {
  const target = String(userId ?? "").trim();
  if (!target) {
    return null;
  }

  const resolvedId = await resolveAdminUserPrimaryKey(target);

  const baseSql = isMysqlMode()
    ? `SELECT id, name, email, COALESCE(\`pass\`, '') AS pass, created_at, self_referral_code, referral_code, role,
        phone_country_code, phone_local, last_login_at, COALESCE(is_blocked, 0) AS is_blocked,
        CASE
          WHEN withdrawal_totp_secret IS NOT NULL AND TRIM(COALESCE(withdrawal_totp_secret, '')) <> '' THEN 1
          ELSE 0
        END AS withdrawal_totp_enabled
       FROM users WHERE id = ? LIMIT 1`
    : `SELECT id, name, email, COALESCE(pass, '') AS pass, created_at, self_referral_code, referral_code, role,
        phone_country_code, phone_local, last_login_at, COALESCE(is_blocked, 0) AS is_blocked,
        CASE
          WHEN withdrawal_totp_secret IS NOT NULL AND TRIM(COALESCE(withdrawal_totp_secret, '')) <> '' THEN 1
          ELSE 0
        END AS withdrawal_totp_enabled
       FROM users WHERE id = ?`;

  if (resolvedId) {
    const base = await dbGet<AdminUserDbBase>(baseSql, [resolvedId]);
    if (base) {
      return await assembleAdminUserDetailFromBase(base, resolvedId);
    }
  }

  const scannedPk = await findUserPrimaryKeyByIdScan(target);
  if (scannedPk) {
    const base = await dbGet<AdminUserDbBase>(baseSql, [scannedPk]);
    if (base) {
      return await assembleAdminUserDetailFromBase(base, scannedPk);
    }
  }

  const rows = await listUsersForAdmin();
  return rows.find((r) => adminIdsLooselyEqual(r.id, target)) ?? null;
}

async function assembleAdminUserDetailFromBase(
  base: AdminUserDbBase,
  resolvedId: string
): Promise<AdminUserDetailRow> {
  let wallet = await dbGet<{ balance: number | string | null; demo_balance: number | string | null }>(
    isMysqlMode()
      ? "SELECT balance, demo_balance FROM wallets WHERE user_id = ? LIMIT 1"
      : "SELECT balance, demo_balance FROM wallets WHERE user_id = ?",
    [resolvedId]
  );
  if (!wallet && isMysqlMode()) {
    wallet = await dbGet<{ balance: number | string | null; demo_balance: number | string | null }>(
      "SELECT balance, demo_balance FROM wallets WHERE TRIM(CAST(user_id AS CHAR)) = TRIM(?) LIMIT 1",
      [resolvedId]
    );
  }

  let inviter_id: string | null = null;
  let inviter_name: string | null = null;
  let inviter_email: string | null = null;
  const refCode = base.referral_code?.trim();
  if (refCode) {
    const invSql = isMysqlMode()
      ? "SELECT id, name, email FROM users WHERE UPPER(TRIM(self_referral_code)) = UPPER(?) LIMIT 1"
      : "SELECT id, name, email FROM users WHERE UPPER(TRIM(self_referral_code)) = UPPER(?)";
    const inv = await dbGet<{ id: string; name: string; email: string }>(invSql, [refCode]);
    if (inv) {
      inviter_id = String(inv.id).trim();
      inviter_name = inv.name;
      inviter_email = inv.email;
    }
  }

  const graph = await dbAll<ReferralGraphRow>(
    "SELECT id, self_referral_code, referral_code FROM users"
  );
  const childrenByParentId = buildReferralChildrenMap(graph);
  const { walletByUser, depositSumByUser } = await buildGlobalWalletAndDepositMaps();

  const raw: Omit<AdminUserRow, "is_blocked" | "last_login_at"> & {
    last_login_at?: string | null;
    is_blocked?: number | string | null;
    balance: number | string | null;
    demo_balance: number | string | null;
    inviter_id: string | null;
    inviter_name: string | null;
    inviter_email: string | null;
    withdrawal_totp_enabled?: number | string | null;
  } = {
    ...base,
    pass: base.pass ?? null,
    balance: wallet?.balance ?? 0,
    demo_balance: wallet?.demo_balance ?? DEFAULT_DEMO_BALANCE_INR,
    inviter_id,
    inviter_name,
    inviter_email,
    withdrawal_totp_enabled: base.withdrawal_totp_enabled
  };

  return mapRawAdminUserRow(raw, childrenByParentId, walletByUser, depositSumByUser);
}

export type AdminUserUpdatePayload = {
  name?: string;
  email?: string;
  role?: string;
  self_referral_code?: string | null;
  referral_code?: string | null;
  balance?: number;
  demo_balance?: number;
  /** Block login + invalidate session for this user. */
  is_blocked?: boolean;
  /** Plain text only for this request — never stored; updates hash in DB. */
  new_password?: string;
};

export async function updateUserFromAdmin(
  userId: string,
  body: AdminUserUpdatePayload
): Promise<AdminUserDetailRow> {
  await ready;
  const canonicalId = await resolveAdminUserPrimaryKey(String(userId ?? "").trim());
  if (!canonicalId) {
    throw new Error("User not found");
  }

  const existing = await dbGet<{ id: string; email: string }>(
    isMysqlMode() ? "SELECT id, email FROM users WHERE id = ? LIMIT 1" : "SELECT id, email FROM users WHERE id = ?",
    [canonicalId]
  );
  if (!existing) {
    throw new Error("User not found");
  }

  const emailIn =
    body.email !== undefined && body.email !== null
      ? String(body.email).trim().toLowerCase()
      : undefined;
  if (emailIn !== undefined) {
    if (!emailIn.includes("@")) {
      throw new Error("Invalid email");
    }
    if (emailIn !== existing.email.toLowerCase()) {
      const clash = await dbGet<{ id: string }>(
        isMysqlMode()
          ? "SELECT id FROM users WHERE LOWER(email) = ? AND id != ? LIMIT 1"
          : "SELECT id FROM users WHERE LOWER(email) = ? AND id != ?",
        [emailIn, canonicalId]
      );
      if (clash) {
        throw new Error("Email already in use");
      }
    }
  }

  const roleNorm =
    body.role === "admin" || body.role === "user"
      ? body.role
      : body.role !== undefined && body.role !== null
        ? null
        : undefined;
  if (roleNorm === null) {
    throw new Error("role must be user or admin");
  }

  const updates: string[] = [];
  const vals: unknown[] = [];
  if (body.name !== undefined && body.name !== null) {
    updates.push("name = ?");
    vals.push(String(body.name).trim());
  }
  if (emailIn !== undefined) {
    updates.push("email = ?");
    vals.push(emailIn);
  }
  if (roleNorm !== undefined) {
    updates.push("role = ?");
    vals.push(roleNorm);
  }
  if (body.self_referral_code !== undefined) {
    const code = body.self_referral_code ? String(body.self_referral_code).trim() : null;
    if (code) {
      const clash = await dbGet<{ id: string }>(
        isMysqlMode()
          ? "SELECT id FROM users WHERE self_referral_code = ? AND id != ? LIMIT 1"
          : "SELECT id FROM users WHERE self_referral_code = ? AND id != ?",
          [code, canonicalId]
      );
      if (clash) {
        throw new Error("Self referral code already in use");
      }
    }
    updates.push("self_referral_code = ?");
    vals.push(code);
  }
  if (body.referral_code !== undefined) {
    const ref = body.referral_code ? String(body.referral_code).trim() : null;
    updates.push("referral_code = ?");
    vals.push(ref);
  }
  if (body.is_blocked !== undefined) {
    updates.push("is_blocked = ?");
    vals.push(body.is_blocked ? 1 : 0);
  }

  if (updates.length > 0) {
    vals.push(canonicalId);
    await dbRun(`UPDATE users SET ${updates.join(", ")} WHERE id = ?`, vals);
  }

  if (body.balance !== undefined || body.demo_balance !== undefined) {
    await ensureWallet(canonicalId);
    const cur = await dbGet<{ balance: number; demo_balance: number }>(
      "SELECT balance, demo_balance FROM wallets WHERE user_id = ?",
      [canonicalId]
    );
    const newB =
      body.balance !== undefined ? Number(body.balance) : Number(cur?.balance ?? 0);
    const newD =
      body.demo_balance !== undefined ? Number(body.demo_balance) : Number(cur?.demo_balance ?? DEFAULT_DEMO_BALANCE_INR);
    if (!Number.isFinite(newB) || newB < 0) {
      throw new Error("Invalid live balance");
    }
    if (!Number.isFinite(newD) || newD < 0) {
      throw new Error("Invalid demo balance");
    }
    const now = new Date().toISOString();
    await dbRun(
      "UPDATE wallets SET balance = ?, demo_balance = ?, updated_at = ? WHERE user_id = ?",
      [newB, newD, now, canonicalId]
    );
  }

  if (body.new_password !== undefined && body.new_password !== null) {
    const pw = String(body.new_password).trim();
    if (pw.length > 0) {
      if (pw.length < 8) {
        throw new Error("New password must be at least 8 characters");
      }
      const { salt, hash } = hashPassword(pw);
      await dbRun(
        isMysqlMode()
          ? "UPDATE users SET password_salt = ?, password_hash = ?, `pass` = ? WHERE id = ?"
          : "UPDATE users SET password_salt = ?, password_hash = ?, pass = ? WHERE id = ?",
        [salt, hash, pw, canonicalId]
      );
    }
  }

  evictInMemoryAccountsForUser(canonicalId);

  const out = await getUserForAdminById(canonicalId);
  if (!out) {
    throw new Error("User not found after update");
  }
  return out;
}

/** Dashboard quick action — cannot block your own admin id. */
export async function setUserBlockedByAdmin(actorAdminId: string, targetUserIdRaw: string, blocked: boolean) {
  await ready;
  const actor = String(actorAdminId ?? "").trim();
  const target = await resolveAdminUserPrimaryKey(String(targetUserIdRaw ?? "").trim());
  if (!target) {
    throw new Error("User not found");
  }
  if (blocked && target === actor) {
    throw new Error("You cannot block your own account");
  }
  return updateUserFromAdmin(target, { is_blocked: blocked });
}

export async function hydrateLiveAccountFromWallet(userId: string) {
  if (userId === GUEST_USER.id) {
    return;
  }
  const b = await getWalletBalance(userId);
  getAccountForWallet(userId, "live").setBalance(b);
}

export function forEachWalletAccount(
  cb: (userId: string, wallet: WalletType, account: DemoAccount) => void
) {
  for (const [key, acc] of demoAccounts) {
    const i = key.lastIndexOf(":");
    cb(key.slice(0, i), key.slice(i + 1) as WalletType, acc);
  }
}
