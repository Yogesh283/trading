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
  /**
   * Alpha Vantage API key (https://www.alphavantage.co/support/#api-key) — optional chart history seed via FX_DAILY.
   * Free tier has a strict daily request limit; keep key secret and do not commit it.
   */
  ALPHA_VANTAGE_API_KEY: z.string().optional(),
  /**
   * TraderMade live `/api/v1/live` poll interval (ms). Default 5000 — more frequent anchors for short TFs.
   * Ignored without TRADERMADE_KEY.
   */
  TRADERMADE_LIVE_POLL_MS: z.coerce.number().int().positive().default(5000),
  /**
   * Extra synthetic ticks between live polls (ms). Lower = denser 5s/10s OHLC. Default 250 (aligns with sim feed).
   * Ignored without TRADERMADE_KEY.
   */
  TRADERMADE_STREAM_PULSE_MS: z.coerce.number().int().positive().default(250),
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
    "0x8777E891031Fd954E72A96E541E956E28C658520"
  ),
  BSC_USDT_CONTRACT: evmAddress("BSC_USDT_CONTRACT", "0x55d398326f99059ff775485246999027b3197955"),
  BSC_CHAIN_ID: z.coerce.number().int().default(56),
  /** @deprecated Admin panel uses DB role=admin + JWT. Kept optional for old scripts. */
  ADMIN_DEPOSITS_SECRET: z.string().optional(),
  /** On server start: SET role='admin' for this user email (then remove from .env in production). */
  ADMIN_PROMOTE_EMAIL: z.string().optional(),
  /**
   * Set to 1 to use MySQL when `MYSQL_DATABASE` is omitted — defaults database name to `tradeing`
   * (same as `npm run init-mysql`). Without this and without `MYSQL_DATABASE`, the app uses SQLite `data/app.db`
   * (registrations will not appear in phpMyAdmin).
   */
  USE_MYSQL: z
    .string()
    .optional()
    .transform((s) => s === "1" || String(s ?? "").toLowerCase() === "true"),
  /** XAMPP MySQL: e.g. tradeing — or leave unset and set USE_MYSQL=1 to default to tradeing */
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
   * Absolute path (or path relative to repo root) to `Iqfxpro.apk` for GET /api/system/android-apk, /api/android-app.apk, /downloads/Iqfxpro.apk, /api/mobile-app.
   * If unset, server looks for releases/Iqfxpro.apk, frontend/dist/downloads/Iqfxpro.apk, frontend/public/downloads/Iqfxpro.apk.
   */
  APK_FILE_PATH: z.string().optional(),
  /**
   * Declared latest Android build — must match `versionCode` in `mobile-apk/android/app/build.gradle` after each release.
   * Clients in the APK compare this to `App.getInfo().build` to show “Update available” (GET /api/system/android-app-info).
   */
  ANDROID_APP_VERSION_CODE: z.string().optional(),
  ANDROID_APP_VERSION_NAME: z.string().optional(),
  /**
   * Development / staging: `POST /api/auth/forgot-password` includes `debugOtp` in JSON so you can reset without SMS.
   * Never enable in production.
   */
  FORGOT_PASSWORD_DEBUG_OTP: z
    .string()
    .optional()
    .transform((s) => s === "1" || String(s ?? "").toLowerCase() === "true")
});

const parsed = envSchema.parse(process.env);

const mysqlDatabaseEffective =
  parsed.MYSQL_DATABASE?.trim() || (parsed.USE_MYSQL ? "tradeing" : undefined);

const androidVersionCodeParsed = (() => {
  const s = parsed.ANDROID_APP_VERSION_CODE?.trim();
  if (!s) return 1;
  const n = parseInt(s, 10);
  return Number.isFinite(n) && n >= 1 ? n : 1;
})();

export const env = {
  ...parsed,
  /** Resolved DB name: explicit `MYSQL_DATABASE`, or `tradeing` when `USE_MYSQL=1`, else undefined (SQLite). */
  MYSQL_DATABASE: mysqlDatabaseEffective,
  USE_MYSQL: Boolean(parsed.USE_MYSQL),
  SKIP_CLEAR_CACHE_ON_REGISTER: Boolean(parsed.SKIP_CLEAR_CACHE_ON_REGISTER),
  SEED_CHROME_USER: Boolean(parsed.SEED_CHROME_USER),
  INVESTMENT_CRON_IN_PROCESS: !parsed.INVESTMENT_CRON_IN_PROCESS,
  FOREX_SIMULATED_ONLY: Boolean(parsed.FOREX_SIMULATED_ONLY),
  ANDROID_APP_VERSION_CODE: androidVersionCodeParsed,
  ANDROID_APP_VERSION_NAME: parsed.ANDROID_APP_VERSION_NAME?.trim() || "1.0",
  FORGOT_PASSWORD_DEBUG_OTP: Boolean(parsed.FORGOT_PASSWORD_DEBUG_OTP)
};
