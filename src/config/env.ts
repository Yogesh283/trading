import path from "node:path";
import dotenv from "dotenv";
import { z } from "zod";

/** Project root `.env` — not `process.cwd()` (PM2 fork / systemd can use a different cwd). */
const envPath = path.resolve(__dirname, "..", "..", ".env");
dotenv.config({ path: envPath });

/**
 * Empty / whitespace → undefined (Zod `.default()` applies).
 * Strips quotes, BOM/zero-width chars, inner spaces (bad .env paste), fixes `Ox` typo.
 */
function normalizeEvmEnvValue(val: unknown): string | undefined {
  if (val === undefined || val === null) return undefined;
  let s = String(val).trim();
  s = s.replace(/[\u201C\u201D\u2018\u2019]/g, "");
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1).trim();
  }
  s = s.replace(/[\u200B-\u200D\uFEFF]/g, "").trim();
  s = s.replace(/\s+/g, "");
  if (s === "") return undefined;
  if (s.startsWith("Ox") || s.startsWith("0X")) {
    s = `0x${s.slice(2)}`;
  }
  return s;
}

/**
 * Valid `0x` + 40 hex → keep; empty → undefined (`.default()` applies).
 * **Invalid / truncated paste** → `undefined` so the app **does not crash** on bad `.env` (VPS PM2 restart loop);
 * production should still set a correct address when taking real USDT deposits.
 */
function preprocessEvmAddressToValidOrUnset(_field: string) {
  return (val: unknown) => {
    const n = normalizeEvmEnvValue(val);
    if (n === undefined) return undefined;
    if (!/^0x[a-fA-F0-9]{40}$/.test(n)) return undefined;
    return n;
  };
}

const evmAddress = (field: string, defaultHex: string) =>
  z.preprocess(
    preprocessEvmAddressToValidOrUnset(field),
    z
      .string()
      .regex(
        /^0x[a-fA-F0-9]{40}$/,
        `${field} must be exactly 0x + 40 hex characters. Leave unset for built-in default or fix .env.`
      )
      .default(defaultHex)
  );

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  LOG_LEVEL: z.string().default("info"),
  TRADERMADE_KEY: z.string().optional(),
  /** Set to 1 to force the old random-walk demo feed (no external APIs). */
  FOREX_SIMULATED_ONLY: z
    .string()
    .optional()
    .transform((s) => s === "1" || String(s).toLowerCase() === "true"),
  BINANCE_WS_URL: z.string().default("wss://stream.binance.com:9443/ws"),
  TELEGRAM_TOKEN: z.string().optional(),
  TELEGRAM_CHAT_ID: z.string().optional(),
  POSTGRES_URL: z.string().optional(),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  AUTH_SECRET: z.string().default("dev-auth-secret-change-me"),
  PORT: z.coerce.number().int().positive().default(3000),
  /** Admin USDT BEP20 receive address (BSC) — empty .env value uses default (change for production). */
  USDT_BEP20_DEPOSIT_ADDRESS: evmAddress(
    "USDT_BEP20_DEPOSIT_ADDRESS",
    "0x742d35cc6634c0532925a3b844bc9e7595f8be12"
  ),
  BSC_USDT_CONTRACT: evmAddress("BSC_USDT_CONTRACT", "0x55d398326f99059ff775485246999027b3197955"),
  BSC_CHAIN_ID: z.coerce.number().int().default(56),
  /** @deprecated Admin panel uses DB role=admin + JWT. Kept optional for old scripts. */
  ADMIN_DEPOSITS_SECRET: z.string().optional(),
  /** On server start: SET role='admin' for this user email (then remove from .env in production). */
  ADMIN_PROMOTE_EMAIL: z.string().optional(),
  /** XAMPP MySQL: set MYSQL_DATABASE (e.g. tradeing) to use MySQL instead of SQLite */
  MYSQL_HOST: z.string().default("127.0.0.1"),
  MYSQL_PORT: z.coerce.number().int().positive().default(3306),
  MYSQL_USER: z.string().default("root"),
  MYSQL_PASSWORD: z.string().default(""),
  MYSQL_DATABASE: z.string().optional(),
  /** Set to "0" or "false" to skip clearing server RAM accounts on new registration (keeps other users' open trades). */
  SKIP_CLEAR_CACHE_ON_REGISTER: z
    .string()
    .optional()
    .transform((s) => s === "0" || String(s).toLowerCase() === "false"),
  /** Dev only: create fixed user chrome-live@local.test for Chrome live editing */
  SEED_CHROME_USER: z
    .string()
    .optional()
    .transform((s) => s === "1" || String(s).toLowerCase() === "true"),
  /** Optional: POST /api/system/investment-yield with { "secret": "..." } or ?secret= */
  INVESTMENT_CRON_SECRET: z.string().optional(),
  /** Set to "0" to disable in-process daily investment yield cron (use npm run cron:investment). */
  INVESTMENT_CRON_IN_PROCESS: z
    .string()
    .optional()
    .transform((s) => s === "0" || String(s).toLowerCase() === "false"),
  /**
   * Absolute path (or path relative to repo root) to `UpDownFX.apk` for GET /api/system/android-apk, /api/android-app.apk, /downloads/UpDownFX.apk, /api/mobile-app.
   * If unset, server looks for releases/UpDownFX.apk, frontend/dist/downloads/UpDownFX.apk, frontend/public/downloads/UpDownFX.apk.
   */
  APK_FILE_PATH: z.string().optional()
});

const parsed = envSchema.parse(process.env);
export const env = {
  ...parsed,
  SKIP_CLEAR_CACHE_ON_REGISTER: Boolean(parsed.SKIP_CLEAR_CACHE_ON_REGISTER),
  SEED_CHROME_USER: Boolean(parsed.SEED_CHROME_USER),
  INVESTMENT_CRON_IN_PROCESS: !parsed.INVESTMENT_CRON_IN_PROCESS,
  FOREX_SIMULATED_ONLY: Boolean(parsed.FOREX_SIMULATED_ONLY)
};
