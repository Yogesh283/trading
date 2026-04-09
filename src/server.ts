import cors from "cors";
import express from "express";
import helmet from "helmet";
import crypto from "node:crypto";
import http, { type IncomingMessage, type ServerResponse } from "node:http";
import fs from "node:fs";
import path from "node:path";
import { WebSocketServer, type WebSocket } from "ws";
import { DEFAULT_DEMO_BALANCE_INR } from "./config/demo";
import { env } from "./config/env";
import {
  AI_CHART_INSIGHT_FEE_INR,
  inrDebitForUsdtWithdraw,
  INR_PER_USDT,
  usdtToInrCredit
} from "./config/funds";
import { dbRun, getChartCandles, getDatabaseInfo, getMarketTicks, initAppDb, saveMarketTicks } from "./db/appDb";
import { seedChartCandlesFromAlphaVantageIfSparse } from "./services/chartAlphaVantageSeed";
import { seedChartCandlesFromTraderMadeIfSparse } from "./services/chartTraderMadeSeed";
import { explainSignalWithOpenAI } from "./services/signalExplainService";
import {
  createSupportTicket,
  listSupportTicketsForUser,
  normalizeAdminSupportTicketStatus,
  updateSupportTicketStatusAdmin
} from "./services/supportTicketService";
import { FOREX_PAIRS, FOREX_SYMBOLS } from "./config/symbols";
import { BINARY_WIN_PAYOUT_MULTIPLIER } from "./config/binary";
import { TRADE_TIMEFRAMES_SEC, binaryCandleExpiresAtMs } from "./config/timeframes";
import {
  forEachWalletAccount,
  getAccountForWallet,
  getGuestUser,
  getUserForAdminById,
  hydrateLiveAccountFromWallet,
  listUsersForAdmin,
  prepareAccountForRequest,
  loginUser,
  registerUser,
  getReferralDashboardForUser,
  getUserFromToken,
  promoteAdminFromEnv,
  requireAdminSession,
  requireSession,
  resolveDemoUser,
  resolveWalletForHttpRequest,
  type WalletType,
  updateUserFromAdmin,
  setUserBlockedByAdmin,
  resolveAdminUserPrimaryKey,
  evictInMemoryAccountsForUser
} from "./services/authService";
import {
  requestPasswordResetOtp,
  resetPasswordByPhoneWithoutOtp,
  resetPasswordWithOtp
} from "./services/passwordResetService";
import {
  createDepositIntent,
  getDepositById,
  listAllDeposits,
  listDepositsForUser,
  markDepositCreditedFromTxSent,
  markDepositCreditedIfPendingReview,
  markDepositTxSent
} from "./services/depositStore";
import { createWithdrawal, getWithdrawalById, listAllWithdrawals, listWithdrawalsForUser } from "./services/withdrawalStore";
import {
  applyLedger,
  ensureWallet,
  getBonusBalanceFromDb,
  getDemoBalanceFromDb,
  getLiveWalletBreakdown,
  getWalletChallengeMeta,
  getWalletBalance,
  listTransactionsForUser,
  redeemDemoChallengeReward,
  saveBonusBalanceToDb,
  saveDemoBalanceToDb,
  setWalletBalancesFromAdmin
} from "./services/walletStore";
import {
  DEMO_CHALLENGE_REWARD_INR,
  DEMO_CHALLENGE_TARGET_INR,
  DEMO_PRACTICE_RETRY_BELOW_INR,
  MIN_WITHDRAWAL_INR
} from "./config/demoChallenge";
import { DemoAccount, TradeSide } from "./services/demoAccount";
import { onForexTickForCandles, persistOpenBarBeforeCandlesRead } from "./services/chartCandlePersistence";
import { ForexFeed, ForexTick } from "./services/forexFeed";
import { logger } from "./utils/logger";
import { isXauUsdSymbol, isXauIstWeeklyLockWindow } from "./utils/xauIstWeekend";
import { warnDbOrThrottle } from "./utils/dbTransientErrorThrottle";
import { distributeBinaryBetLevelIncome } from "./services/referralService";
import {
  getAdminRaOne,
  listMarketTicksForAdmin,
  listSupportTicketsForAdmin,
  listTransactionsForAdmin,
  listWalletsForAdmin
} from "./services/adminTablesStore";
import {
  beginWithdrawalTotpSetup,
  confirmWithdrawalTotpSetup,
  getWithdrawalTotpStatus
} from "./services/withdrawalTotpService";
import {
  assertWithdrawalVerificationCode,
  changeWithdrawalTpin,
  getWithdrawalTpinStatus,
  setWithdrawalTpin
} from "./services/withdrawalTpinService";
import {
  getReferralLevelConfigPayload,
  updateReferralLevelConfigPayload
} from "./services/referralLevelConfigService";
import { getAdminUserInsights, searchUsersForAdmin } from "./services/adminUserInsightsService";
import { getAdminDashboardStats } from "./services/adminDashboardService";
import { getAdminTeamBusinessReport } from "./services/adminTeamBusinessService";

/** True when running via `tsx` from `src/` (not compiled `dist/`). */
const runningFromSourceTree = path.basename(path.normalize(__dirname)) === "src";

/** Repo root — not `process.cwd()` (PM2/systemd often use another cwd). */
const projectRoot = path.resolve(__dirname, "..");
const frontendDist = path.join(projectRoot, "frontend", "dist");

/**
 * Local dev without `npm run frontend:build`: if there is no `frontend/dist`, serve the UI with Vite
 * middleware (same as `npm run dev` from src). Safe for production: NODE_ENV=production + built dist.
 */
const useViteBecauseNoFrontendDist =
  env.NODE_ENV === "development" && !fs.existsSync(frontendDist);

/**
 * Dev: API + Vite on PORT. SEPARATE_FRONTEND=1 → API only + `npm run frontend:dev` on 5173.
 * Also: development + missing frontend/dist → Vite (e.g. `node dist/index.js` without frontend build).
 */
export const useUnifiedDevPort =
  (runningFromSourceTree || useViteBecauseNoFrontendDist) &&
  String(process.env.SEPARATE_FRONTEND ?? "").trim() !== "1";

const app = express();

/**
 * Bonus row must reflect `wallets.bonus_balance_inr` only (redeem + bonus-wallet P&L), never demo cash.
 * When there are no open bonus trades, force in-memory cash from DB so a mis-resolved wallet cannot stick.
 */
async function alignIdleBonusAccountCashWithDb(userId: string, wallet: WalletType, account: DemoAccount): Promise<void> {
  if (wallet !== "bonus" || userId === getGuestUser().id) {
    return;
  }
  const hasOpen = account.listTrades().some((t) => t.status === "open");
  if (hasOpen) {
    return;
  }
  account.setBalance(await getBonusBalanceFromDb(userId));
}

/** Android APK for landing “Download APK” — avoids 404 when file is not inside frontend build. */
function resolveAndroidApkPath(): string | null {
  const explicit = env.APK_FILE_PATH?.trim();
  if (explicit) {
    const abs = path.isAbsolute(explicit) ? explicit : path.join(projectRoot, explicit);
    if (fs.existsSync(abs)) {
      return abs;
    }
    logger.warn({ APK_FILE_PATH: explicit }, "APK_FILE_PATH set but file not found");
  }
  const candidates = [
    path.join(projectRoot, "releases", "Iqfxpro.apk"),
    path.join(frontendDist, "downloads", "Iqfxpro.apk"),
    path.join(projectRoot, "frontend", "public", "downloads", "Iqfxpro.apk"),
    path.join(projectRoot, "releases", "UpDownFX.apk"),
    path.join(frontendDist, "downloads", "UpDownFX.apk"),
    path.join(projectRoot, "frontend", "public", "downloads", "UpDownFX.apk")
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      return p;
    }
  }
  return null;
}

/**
 * Prefer `/api/system/android-apk` in the UI: same `/api/system/*` family as `GET /api/system/database`, so Nginx
 * “API proxy” rules usually include it. Paths like `/api/mobile-app` often miss the proxy and get SPA `index.html`
 * → Chrome offers to save `mobile-app.html` instead of an APK.
 */
const ANDROID_APK_PATHS = new Set([
  "/api/system/android-apk",
  "/api/mobile-app",
  "/api/android-app.apk",
  "/downloads/Iqfxpro.apk",
  "/downloads/UpDownFX.apk"
]);

const ANDROID_APK_MISSING_HTML = `<!DOCTYPE html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width"/></head><body style="font-family:system-ui;padding:1.5rem;max-width:36rem">
<h1>APK file missing on server</h1>
<p>Chrome shows &quot;File wasn&apos;t available on site&quot; when the APK is not on disk or the URL returns HTML/404.</p>
<p>Put <strong>Iqfxpro.apk</strong> here (pick one):</p>
<ul>
<li><strong>Best on VPS:</strong> <code>releases/Iqfxpro.apk</code> next to the app folder (same level as <code>package.json</code>), then <code>pm2 restart</code></li>
<li>Or <code>APK_FILE_PATH</code> in <code>.env</code> → full path to the APK</li>
<li>Or PC: <code>npm run copy-apk</code> then <code>npm run build:all</code> and deploy so <code>frontend/dist/downloads/Iqfxpro.apk</code> exists</li>
</ul>
<p>Working URLs (after file exists): <code>/api/system/android-apk</code> (recommended) · <code>/api/android-app.apk</code> · <code>/downloads/Iqfxpro.apk</code> · <code>/api/mobile-app</code></p>
<p>Check: <code>GET /api/health</code> → <code>apkReady: true</code></p>
<p>If you see Express &quot;Cannot GET&quot; (tiny 404): run <code>npm run build</code> on the server and <code>pm2 restart</code> — old <code>dist/server.js</code> won&apos;t have APK routes.</p>
</body></html>`;

/** Raw HTTP + Express (fallback) — same binary stream. */
function sendAndroidApkOr404(res: ServerResponse): void {
  const file = resolveAndroidApkPath();
  if (!file) {
    res.writeHead(404, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store"
    });
    res.end(ANDROID_APK_MISSING_HTML);
    return;
  }
  const resolved = path.resolve(file);
  res.writeHead(200, {
    "Content-Type": "application/vnd.android.package-archive",
    "Content-Disposition": 'attachment; filename="Iqfxpro.apk"',
    "Cache-Control": "no-store",
    "X-Served-By": "iqfxpro-raw"
  });
  const stream = fs.createReadStream(resolved);
  stream.on("error", (err) => {
    logger.error({ err, file: resolved }, "APK read stream failed");
    if (!res.headersSent) {
      res.writeHead(500).end();
    } else {
      res.destroy();
    }
  });
  stream.pipe(res);
}

/**
 * Served from the raw `http` handler (before Express/Vite) so dev unified port and proxies can’t swallow the route.
 */
function tryServeAndroidApkFromRaw(
  req: IncomingMessage,
  res: ServerResponse,
  pathOnly: string
): boolean {
  if (req.method !== "GET" || !ANDROID_APK_PATHS.has(pathOnly)) {
    return false;
  }
  sendAndroidApkOr404(res);
  return true;
}

function pathOnlyFromUrl(url: string | undefined): string {
  const u = url ?? "/";
  const q = u.indexOf("?");
  let p = q >= 0 ? u.slice(0, q) : u;
  if (p.startsWith("http://") || p.startsWith("https://")) {
    try {
      p = new URL(p).pathname || "/";
    } catch {
      /* keep p */
    }
  }
  if (!p.startsWith("/")) {
    p = `/${p}`;
  }
  p = p.replace(/\/{2,}/g, "/");
  if (p.length > 1 && p.endsWith("/")) {
    p = p.slice(0, -1);
  }
  return p;
}

app.use(
  useUnifiedDevPort
    ? helmet({ contentSecurityPolicy: false })
    : helmet({
        contentSecurityPolicy: false,
        crossOriginEmbedderPolicy: false
      })
);
app.use(cors());
app.use(express.json());

let viteDevServer: { close: () => Promise<void> } | null = null;
let tradingWsUpgradeListenerAttached = false;

/**
 * Handle liveness **outside** Express — if `/api/ping` still returns 500 HTML here, traffic is not reaching this
 * Node process (wrong port, proxy, or stale binary). Skip WebSocket upgrades (`GET` + `Upgrade` header).
 */
const server = http.createServer((req, res) => {
  /** WebSocket handshake — `ws` handles `server.on("upgrade", …)`; do not `res.end()` here. */
  if (req.headers.upgrade) {
    return;
  }
  const pathOnly = pathOnlyFromUrl(req.url);
  if (req.method === "GET" && pathOnly === "/api/ping") {
    res.writeHead(200, {
      "Content-Type": "text/plain; charset=utf-8",
      "X-Served-By": "iqfxpro-raw"
    });
    res.end("pong");
    return;
  }
  if (req.method === "GET" && pathOnly === "/api/health") {
    const body = JSON.stringify({
      ok: true,
      service: "iqfxpro",
      symbols: FOREX_SYMBOLS,
      forexPairs: FOREX_SYMBOLS.length,
      apkReady: Boolean(resolveAndroidApkPath()),
      androidAppVersionCode: env.ANDROID_APP_VERSION_CODE,
      androidAppVersionName: env.ANDROID_APP_VERSION_NAME,
      /** True when `OPENAI_API_KEY` is set (AI insight / explain-signal). No secret leaked. */
      openaiConfigured: Boolean(env.OPENAI_API_KEY?.trim())
    });
    res.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Served-By": "iqfxpro-raw"
    });
    res.end(body);
    return;
  }
  if (tryServeAndroidApkFromRaw(req, res, pathOnly)) {
    return;
  }
  app(req, res);
});
/**
 * Do NOT use `WebSocketServer({ server, path: "/ws" })`: that attaches a global `upgrade` listener
 * that **aborts** every non-`/ws` upgrade with HTTP 400. Vite HMR uses `/?token=…` on the same HTTP
 * server → HMR breaks and dev assets can misbehave. We use `noServer` and only upgrade `/ws`
 * (registered in `startServer` **after** Vite attaches its listener).
 */
const wsServer = new WebSocketServer({ noServer: true });
const forexFeed = new ForexFeed();

forexFeed.start();

/** Buffer ticks and flush to DB so chart has history after restart. */
const tickBuffer: ForexTick[] = [];
const TICK_FLUSH_MS = 2000;
setInterval(async () => {
  if (tickBuffer.length === 0) return;
  const batch = tickBuffer.splice(0, tickBuffer.length);
  try {
    await initAppDb();
    await saveMarketTicks(batch.map((t) => ({ symbol: t.symbol, price: t.price, timestamp: t.timestamp })));
  } catch (err) {
    warnDbOrThrottle(err, "Failed to save market ticks to DB", { count: batch.length });
  }
}, TICK_FLUSH_MS);

forexFeed.on("tick", (tick: ForexTick) => {
  tickBuffer.push(tick);
  onForexTickForCandles(tick.symbol, tick.price, tick.timestamp);
  /** WebSocket `LivePrice` — every forex tick (~4/s by default); same payload shape as legacy `tick`. */
  const payload = JSON.stringify({ type: "live_price", data: tick });

  for (const client of wsServer.clients) {
    if (client.readyState === client.OPEN) {
      client.send(payload);
    }
  }
});

app.get("/api/system/database", (_req, res) => {
  res.json(getDatabaseInfo());
});

/** JSON for in-app “Update APK” — compare `versionCode` to Capacitor `App.getInfo().build`. */
app.get("/api/system/android-app-info", (_req, res) => {
  res.json({
    versionCode: env.ANDROID_APP_VERSION_CODE,
    versionName: env.ANDROID_APP_VERSION_NAME,
    downloadUrl: "/api/system/android-apk",
    apkReady: Boolean(resolveAndroidApkPath())
  });
});

/** Mobile browsers sometimes open `/api/system` (truncated); send them to the real APK URL. */
app.get("/api/system", (_req, res) => {
  res.redirect(302, "/api/system/android-apk");
});

/** Fallback if raw layer is bypassed — use `sendFile` + `res.type` (avoid `writeHead` vs Helmet). */
function sendAndroidApkViaExpress(res: express.Response): void {
  const file = resolveAndroidApkPath();
  if (!file) {
    res.status(404).type("html").send(ANDROID_APK_MISSING_HTML);
    return;
  }
  const resolved = path.resolve(file);
  res.setHeader("Content-Disposition", 'attachment; filename="Iqfxpro.apk"');
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Served-By", "iqfxpro-express");
  res.type("application/vnd.android.package-archive");
  res.sendFile(resolved, (err) => {
    if (err) {
      logger.error({ err, file: resolved }, "Express sendFile APK failed");
      if (!res.headersSent) {
        res.status(500).end();
      }
    }
  });
}

for (const apkPath of ANDROID_APK_PATHS) {
  app.get(apkPath, (_req, res) => {
    sendAndroidApkViaExpress(res);
  });
}

app.post("/api/auth/register", async (req, res) => {
  try {
    await initAppDb();
    const name = String(req.body?.name ?? "").trim();
    const password = String(req.body?.password ?? "");
    const countryCode = String(req.body?.countryCode ?? req.body?.phoneCountryCode ?? "").trim();
    const phone = String(req.body?.phone ?? req.body?.phoneLocal ?? "").trim();
    const pass = String(req.body?.password ?? "").trim();
    if (name.length < 2) {
      return res.status(400).json({ message: "Name must be at least 2 characters" });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters" });
    }

    const referralCode = String(req.body?.referralCode ?? req.body?.referral_code ?? "").trim() || undefined;
    const result = await registerUser({
      name,
      password,
      phoneCountryCode: countryCode,
      phoneLocal: phone,
      referralCode,
      pass
    });
    const dbInfo = getDatabaseInfo();
    logger.info(
      {
        userId: result.user.id,
        phone: `${result.user.phoneCountryCode ?? ""}${result.user.phoneLocal ?? ""}`,
        database: dbInfo
      },
      "User registered — row committed to users table (check same DB in phpMyAdmin / admin Users)"
    );
    return res.status(201).json({ ...result, database: dbInfo });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Registration failed";
    const code =
      error && typeof error === "object" && "code" in error
        ? String((error as { code?: unknown }).code ?? "")
        : "";
    const transient =
      code === "ETIMEDOUT" ||
      code === "ECONNREFUSED" ||
      /ETIMEDOUT|ECONNREFUSED/i.test(message);
    if (transient) {
      logger.warn({ err: error }, "Register failed — database unreachable");
      return res.status(503).json({
        message:
          "Database unreachable. Start MySQL in XAMPP or remove MYSQL_* from .env to use local SQLite (data/app.db).",
        database: getDatabaseInfo()
      });
    }
    logger.warn({ err: error, countryCode: String(req.body?.countryCode ?? "") }, "Register failed");
    const hint =
      message.includes("wallet") || message.includes("FOREIGN")
        ? " Check MySQL wallets table and demo_balance column."
        : "";
    return res.status(400).json({ message: message + hint, database: getDatabaseInfo() });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    await initAppDb();
    const email = String(req.body?.email ?? "").trim();
    const countryCode = String(req.body?.countryCode ?? req.body?.phoneCountryCode ?? "").trim();
    const phone = String(req.body?.phone ?? req.body?.phoneLocal ?? "").trim();
    const password = String(req.body?.password ?? "");

    if (!password) {
      return res.status(400).json({ message: "Password is required" });
    }

    let result;
    if (email.includes("@")) {
      if (!email) {
        return res.status(400).json({ message: "Email and password are required" });
      }
      result = await loginUser({ email, password });
    } else if (countryCode && phone) {
      result = await loginUser({ countryCode, phone, password });
    } else if (/^\d+$/.test(email)) {
      result = await loginUser({ email, password });
    } else {
      return res.status(400).json({
        message: "Country code + mobile + password are required (or admin email + password)."
      });
    }
    return res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Login failed";
    const code =
      error && typeof error === "object" && "code" in error
        ? String((error as { code?: unknown }).code ?? "")
        : "";
    const transient =
      code === "ETIMEDOUT" ||
      code === "ECONNREFUSED" ||
      /ETIMEDOUT|ECONNREFUSED/i.test(message);
    if (transient) {
      return res.status(503).json({
        message:
          "Database unreachable. Start MySQL in XAMPP or remove MYSQL_* from .env to use local SQLite (data/app.db)."
      });
    }
    return res.status(400).json({ message });
  }
});

app.post("/api/auth/forgot-password", async (req, res) => {
  try {
    const countryCode = String(req.body?.countryCode ?? req.body?.phoneCountryCode ?? "").trim();
    const phone = String(req.body?.phone ?? req.body?.phoneLocal ?? "").trim();
    const result = await requestPasswordResetOtp({ countryCode, phone });
    return res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed";
    return res.status(400).json({ message });
  }
});

app.post("/api/auth/reset-password", async (req, res) => {
  try {
    const countryCode = String(req.body?.countryCode ?? req.body?.phoneCountryCode ?? "").trim();
    const phone = String(req.body?.phone ?? req.body?.phoneLocal ?? "").trim();
    const otp = String(req.body?.otp ?? "").trim();
    const newPassword = String(req.body?.newPassword ?? "");
    await resetPasswordWithOtp({ countryCode, phone, otp, newPassword });
    return res.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Reset failed";
    return res.status(400).json({ message });
  }
});

app.post("/api/auth/reset-password-by-phone", async (req, res) => {
  try {
    const countryCode = String(req.body?.countryCode ?? req.body?.phoneCountryCode ?? "").trim();
    const phone = String(req.body?.phone ?? req.body?.phoneLocal ?? "").trim();
    const newPassword = String(req.body?.newPassword ?? "");
    await resetPasswordByPhoneWithoutOtp({ countryCode, phone, newPassword });
    return res.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Reset failed";
    return res.status(400).json({ message });
  }
});

app.get("/api/auth/me", async (req, res) => {
  try {
    const user = await requireSession(req.headers.authorization);
    const totpSt = await getWithdrawalTotpStatus(user.id);
    const tpinSt = await getWithdrawalTpinStatus(user.id);
    return res.json({
      user: {
        ...user,
        withdrawalTotpEnabled: totpSt.enabled,
        withdrawalTotpSetupPending: totpSt.setupPending,
        withdrawalTpinSet: tpinSt.pinSet
      }
    });
  } catch {
    return res.status(401).json({ message: "Unauthorized" });
  }
});

app.get("/api/me/withdrawal-totp/status", (req, res) => {
  void (async () => {
    try {
      const user = await requireSession(req.headers.authorization);
      const st = await getWithdrawalTotpStatus(user.id);
      return res.json(st);
    } catch (e) {
      if (e instanceof Error && e.message === "Unauthorized") {
        return res.status(401).json({ message: "Unauthorized" });
      }
      logger.error({ e }, "withdrawal totp status");
      return res.status(500).json({ message: "Failed" });
    }
  })();
});

app.post("/api/me/withdrawal-totp/begin", (req, res) => {
  void (async () => {
    try {
      const user = await requireSession(req.headers.authorization);
      const out = await beginWithdrawalTotpSetup(user.id, user.email);
      return res.json(out);
    } catch (e) {
      if (e instanceof Error && e.message === "Unauthorized") {
        return res.status(401).json({ message: "Unauthorized" });
      }
      logger.error({ e }, "withdrawal totp begin");
      return res.status(500).json({ message: e instanceof Error ? e.message : "Failed" });
    }
  })();
});

app.post("/api/me/withdrawal-totp/confirm", (req, res) => {
  void (async () => {
    try {
      const user = await requireSession(req.headers.authorization);
      const code = String(req.body?.code ?? "");
      await confirmWithdrawalTotpSetup(user.id, code);
      return res.json({ ok: true });
    } catch (e) {
      if (e instanceof Error && e.message === "Unauthorized") {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const msg = e instanceof Error ? e.message : "Failed";
      return res.status(400).json({ message: msg });
    }
  })();
});

app.get("/api/me/withdrawal-tpin/status", (req, res) => {
  void (async () => {
    try {
      const user = await requireSession(req.headers.authorization);
      const st = await getWithdrawalTpinStatus(user.id);
      return res.json(st);
    } catch (e) {
      if (e instanceof Error && e.message === "Unauthorized") {
        return res.status(401).json({ message: "Unauthorized" });
      }
      logger.error({ e }, "withdrawal tpin status");
      return res.status(500).json({ message: "Failed" });
    }
  })();
});

app.post("/api/me/withdrawal-tpin/set", (req, res) => {
  void (async () => {
    try {
      const user = await requireSession(req.headers.authorization);
      const pin = String(req.body?.pin ?? "");
      const confirmPin = String(req.body?.confirmPin ?? "");
      await setWithdrawalTpin(user.id, pin, confirmPin);
      return res.json({ ok: true });
    } catch (e) {
      if (e instanceof Error && e.message === "Unauthorized") {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const msg = e instanceof Error ? e.message : "Failed";
      return res.status(400).json({ message: msg });
    }
  })();
});

app.post("/api/me/withdrawal-tpin/change", (req, res) => {
  void (async () => {
    try {
      const user = await requireSession(req.headers.authorization);
      const currentPin = String(req.body?.currentPin ?? "");
      const pin = String(req.body?.pin ?? "");
      const confirmPin = String(req.body?.confirmPin ?? "");
      await changeWithdrawalTpin(user.id, currentPin, pin, confirmPin);
      return res.json({ ok: true });
    } catch (e) {
      if (e instanceof Error && e.message === "Unauthorized") {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const msg = e instanceof Error ? e.message : "Failed";
      return res.status(400).json({ message: msg });
    }
  })();
});

/** Logged-in: add virtual INR to demo wallet (no payment). Omit `amount` to add one default tranche (`DEMO_ACCOUNT_DEFAULT_INR`). If demo ≤ 0, balance is set to that default; if demo > 0, that amount is credited on top (still capped). */
app.post("/api/me/demo/add-funds", (req, res) => {
  void (async () => {
    const MIN_ADD = 1;
    const MAX_ADD_PER_REQUEST = 5_000_000;
    const MAX_DEMO_BALANCE_TOTAL = 50_000_000;
    try {
      const user = await requireSession(req.headers.authorization);
      const raw = req.body?.amount;
      const useDefault = raw === undefined || raw === null || raw === "";
      const parsed = useDefault ? DEFAULT_DEMO_BALANCE_INR : Number(raw);
      if (!Number.isFinite(parsed)) {
        return res.status(400).json({ message: "Invalid amount" });
      }
      const requested = Math.round(parsed * 100) / 100;
      if (requested < MIN_ADD || requested > MAX_ADD_PER_REQUEST) {
        return res.status(400).json({
          message: `Amount must be between ${MIN_ADD} and ${MAX_ADD_PER_REQUEST.toLocaleString("en-IN")} INR`
        });
      }
      await ensureWallet(user.id);
      evictInMemoryAccountsForUser(user.id);
      await prepareAccountForRequest(user.id, "demo");
      let acc = getAccountForWallet(user.id, "demo");

      const room = Math.max(0, MAX_DEMO_BALANCE_TOTAL - acc.balance);
      let add = Math.min(requested, room);
      if (add < 0.01) {
        return res.status(400).json({
          message: `Demo balance is capped at ${MAX_DEMO_BALANCE_TOTAL.toLocaleString("en-IN")} INR`
        });
      }

      if (useDefault && acc.balance <= 0) {
        acc.setBalance(DEFAULT_DEMO_BALANCE_INR);
        add = DEFAULT_DEMO_BALANCE_INR;
      } else {
        acc.creditDeposit(add);
      }

      const savedDemo = await saveDemoBalanceToDb(user.id, acc.balance);
      if (Math.abs(savedDemo - acc.balance) > 0.01) {
        await prepareAccountForRequest(user.id, "demo");
        acc = getAccountForWallet(user.id, "demo");
      }
      return res.json({ ok: true, demo_balance: acc.balance, added: add });
    } catch (e) {
      if (e instanceof Error && e.message === "Unauthorized") {
        return res.status(401).json({ message: "Unauthorized" });
      }
      logger.error({ e }, "demo add-funds");
      return res.status(500).json({ message: e instanceof Error ? e.message : "Failed" });
    }
  })();
});

/** After demo hits the challenge target: move configured reward to bonus wallet and set demo to ₹0. */
app.post("/api/me/demo-challenge/redeem", (_req, res) => {
  void (async () => {
    try {
      const user = await requireSession(_req.headers.authorization);
      const out = await redeemDemoChallengeReward(user.id);
      return res.json({ ok: true, bonus_balance_inr: out.bonus_balance_inr, demo_balance: out.demo_balance });
    } catch (e) {
      if (e instanceof Error && e.message === "Unauthorized") {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const msg = e instanceof Error ? e.message : "Failed";
      const code =
        /no challenge reward/i.test(msg) || /bonus reward unlocks only/i.test(msg) ? 400 : 500;
      if (code === 500) {
        logger.error({ e }, "demo-challenge redeem");
      }
      return res.status(code).json({ message: msg });
    }
  })();
});

/** Unlimited practice: when demo balance is nearly zero, reset virtual balance to the default starting amount. */
app.post("/api/me/demo/claim-practice-reset", (req, res) => {
  void (async () => {
    try {
      const user = await requireSession(req.headers.authorization);
      await ensureWallet(user.id);
      const demo = await getDemoBalanceFromDb(user.id);
      if (demo > DEMO_PRACTICE_RETRY_BELOW_INR + 1e-9) {
        return res.status(400).json({
          message: `Practice reset is only when demo balance is at or below ₹${DEMO_PRACTICE_RETRY_BELOW_INR}. Current: ₹${demo.toFixed(2)}`
        });
      }
      await prepareAccountForRequest(user.id, "demo");
      const acc = getAccountForWallet(user.id, "demo");
      acc.setBalance(DEFAULT_DEMO_BALANCE_INR);
      await saveDemoBalanceToDb(user.id, DEFAULT_DEMO_BALANCE_INR);
      return res.json({ ok: true, demo_balance: DEFAULT_DEMO_BALANCE_INR });
    } catch (e) {
      if (e instanceof Error && e.message === "Unauthorized") {
        return res.status(401).json({ message: "Unauthorized" });
      }
      logger.error({ e }, "demo claim-practice-reset");
      return res.status(500).json({ message: e instanceof Error ? e.message : "Failed" });
    }
  })();
});

/** Public copy for marketing / UI — demo challenge parameters. */
app.get("/api/system/demo-challenge", (_req, res) => {
  const start = DEFAULT_DEMO_BALANCE_INR;
  res.json({
    target_inr: DEMO_CHALLENGE_TARGET_INR,
    reward_inr: DEMO_CHALLENGE_REWARD_INR,
    /** @deprecated use demo_account_default_inr */
    start_inr: start,
    demo_account_default_inr: start,
    practice_retry_below_inr: DEMO_PRACTICE_RETRY_BELOW_INR,
    min_withdrawal_inr: MIN_WITHDRAWAL_INR
  });
});

app.get("/api/referrals/summary", (req, res) => {
  void (async () => {
    try {
      const user = await requireSession(req.headers.authorization);
      const summary = await getReferralDashboardForUser(user.id);
      return res.json(summary);
    } catch (e) {
      if (e instanceof Error && e.message === "Unauthorized") {
        return res.status(401).json({ message: "Unauthorized" });
      }
      if (e instanceof Error && e.message === "User not found") {
        return res.status(404).json({ message: "User not found" });
      }
      logger.warn({ err: e }, "referrals summary");
      return res.status(500).json({ message: "Failed to load referrals" });
    }
  })();
});

/**
 * Optional AI: chart bias (OpenAI). Live wallet only; debits `AI_CHART_INSIGHT_FEE_INR` INR per request.
 * Requires OPENAI_API_KEY. `X-Account-Type: live` required (not demo).
 */
app.post("/api/ai/explain-signal", (req, res) => {
  void (async () => {
    let user;
    try {
      user = await requireSession(req.headers.authorization);
    } catch {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const wallet = resolveWalletForHttpRequest(user.id, req.headers["x-account-type"], req.query);
    if (wallet !== "live") {
      return res.status(403).json({
        message:
          "AI insight is only available on your live wallet. Switch to Live in the app and ensure you have a live balance."
      });
    }
    if (!env.OPENAI_API_KEY?.trim()) {
      return res.status(503).json({
        message: "AI explanation is not configured (set OPENAI_API_KEY on the server)."
      });
    }
    const raw = req.body?.signal ?? req.body;
    if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
      return res.status(400).json({
        message: "JSON body must be an object, e.g. { \"signal\": { \"bias\": \"up\", \"confidence\": 55 } }."
      });
    }
    const locale =
      typeof req.body?.locale === "string" ? req.body.locale : typeof req.body?.lang === "string" ? req.body.lang : undefined;

    const fee = AI_CHART_INSIGHT_FEE_INR;
    if (fee > 0) {
      try {
        await prepareAccountForRequest(user.id, "live");
        await applyLedger(user.id, -fee, "ai_chart_insight", null);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "";
        if (msg.includes("Insufficient")) {
          return res.status(400).json({
            message: `Insufficient live balance — need ₹${fee.toFixed(0)} for AI insight.`
          });
        }
        logger.warn({ err: e }, "explain-signal debit");
        return res.status(500).json({ message: "Could not process wallet debit" });
      }
    }

    try {
      const { explanation, direction } = await explainSignalWithOpenAI({ signal: raw, locale });
      await hydrateLiveAccountFromWallet(user.id);
      const balanceAfter = await getWalletBalance(user.id);
      return res.json({
        explanation,
        direction,
        feeInr: fee,
        balanceAfter
      });
    } catch (e) {
      if (fee > 0) {
        await applyLedger(user.id, fee, "ai_chart_insight_refund", null).catch((err) =>
          logger.error({ err }, "explain-signal refund failed")
        );
        await hydrateLiveAccountFromWallet(user.id).catch(() => {});
      }
      logger.warn({ err: e }, "explain-signal");
      return res.status(502).json({
        message: e instanceof Error ? e.message : "Failed to generate explanation"
      });
    }
  })();
});

app.post("/api/support/tickets", (req, res) => {
  void (async () => {
    try {
      const user = await requireSession(req.headers.authorization);
      const subject = String(req.body?.subject ?? "").trim();
      const body = String(req.body?.body ?? "").trim();
      if (!subject || subject.length > 200) {
        return res.status(400).json({ message: "Subject is required (max 200 characters)." });
      }
      if (!body || body.length > 8000) {
        return res.status(400).json({ message: "Message is required (max 8000 characters)." });
      }
      const ticket = await createSupportTicket(user.id, subject, body);
      return res.status(201).json({ ticket });
    } catch (e) {
      if (e instanceof Error && e.message === "Unauthorized") {
        return res.status(401).json({ message: "Unauthorized" });
      }
      logger.error({ e }, "support ticket create");
      return res.status(500).json({ message: "Failed to create ticket" });
    }
  })();
});

app.get("/api/support/tickets", (req, res) => {
  void (async () => {
    try {
      const user = await requireSession(req.headers.authorization);
      const tickets = await listSupportTicketsForUser(user.id);
      return res.json({ tickets });
    } catch (e) {
      if (e instanceof Error && e.message === "Unauthorized") {
        return res.status(401).json({ message: "Unauthorized" });
      }
      logger.error({ e }, "support tickets list");
      return res.status(500).json({ message: "Failed to load tickets" });
    }
  })();
});

app.get("/api/markets", (_req, res) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.json({
    symbols: FOREX_SYMBOLS,
    ticks: forexFeed.snapshot(),
    pairs: FOREX_PAIRS.map(({ symbol, name }) => ({ symbol, name }))
  });
});

app.get("/api/markets/history", (req, res) => {
  void (async () => {
    const symbol = typeof req.query.symbol === "string" ? req.query.symbol.trim().toUpperCase() : undefined;
    const limit = Math.min(50000, Math.max(1, Number(req.query.limit) || 2000));
    const memCap = Math.min(limit, 20000);
    const fromMemory = forexFeed.getHistory(symbol, memCap);
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    try {
      await initAppDb();
      const fromDb = await getMarketTicks(symbol, limit);
      const byKey = new Map<string, { symbol: string; price: number; timestamp: number }>();
      for (const t of fromDb) byKey.set(`${t.symbol}:${t.timestamp}`, t);
      for (const t of fromMemory) byKey.set(`${t.symbol}:${t.timestamp}`, { symbol: t.symbol, price: t.price, timestamp: t.timestamp });
      const merged = [...byKey.values()].sort((a, b) => a.timestamp - b.timestamp).slice(-limit);
      res.json({ ticks: merged });
    } catch (err) {
      warnDbOrThrottle(err, "Markets history failed");
      /** DB unreachable — still serve in-memory ticks so charts work without MySQL. */
      const merged = [...fromMemory].sort((a, b) => a.timestamp - b.timestamp).slice(-limit);
      res.json({ ticks: merged });
    }
  })().catch((err) => {
    warnDbOrThrottle(err, "Markets history failed");
    res.status(500).json({ ticks: [] });
  });
});

/** Closed OHLC from DB (aligned with TRADE_TIMEFRAMES_SEC); merge with WebSocket LivePrice ticks on the client. */
app.get("/api/markets/candles", (req, res) => {
  void (async () => {
    const symbol = typeof req.query.symbol === "string" ? req.query.symbol.trim().toUpperCase() : "";
    const timeframeSec = Number(req.query.timeframe);
    const limit = Math.min(2000, Math.max(1, Number(req.query.limit) || 500));
    if (!symbol || !Number.isFinite(timeframeSec) || !(TRADE_TIMEFRAMES_SEC as readonly number[]).includes(timeframeSec)) {
      return res.status(400).json({ message: "symbol and valid timeframe required" });
    }
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    try {
      await initAppDb();
      const tick = forexFeed.getTick(symbol);
      await persistOpenBarBeforeCandlesRead(symbol, timeframeSec, tick ?? undefined);
      const rows = await getChartCandles(symbol, timeframeSec, limit);
      /** mysql2 may return BIGINT DECIMAL columns as strings — client merge uses `t + tfMs`; must be finite numbers. */
      res.json({
        candles: rows.map((r) => ({
          t: Number(r.bucket_start_ms),
          o: Number(r.open_price),
          h: Number(r.high_price),
          l: Number(r.low_price),
          c: Number(r.close_price)
        }))
      });
    } catch (err) {
      warnDbOrThrottle(err, "Markets candles failed");
      /** DB unreachable — client builds candles from WebSocket ticks. */
      res.json({ candles: [] });
    }
  })().catch((err) => {
    warnDbOrThrottle(err, "Markets candles failed");
    res.status(500).json({ candles: [] });
  });
});

app.get("/api/account", (_req, res) => {
  void (async () => {
    const user = await resolveDemoUser(_req.headers.authorization);
    res.setHeader("Cache-Control", "no-store, private");
    res.setHeader("Vary", "Authorization, X-Account-Type");
    const wallet = resolveWalletForHttpRequest(user.id, _req.headers["x-account-type"], _req.query);
    await prepareAccountForRequest(user.id, wallet);
    let account = getAccountForWallet(user.id, wallet);
    await alignIdleBonusAccountCashWithDb(user.id, wallet, account);
    let snap = account.snapshot(forexFeed.snapshot());
    if (user.id !== getGuestUser().id && wallet === "demo") {
      const savedDemo = await saveDemoBalanceToDb(user.id, account.balance);
      if (Math.abs(savedDemo - account.balance) > 0.01) {
        await prepareAccountForRequest(user.id, "demo");
        account = getAccountForWallet(user.id, wallet);
        snap = account.snapshot(forexFeed.snapshot());
      }
    }
    /** Bonus must not mutate on read-only endpoints; bonus writes happen only on redeem/open/settle flows. */
    const challengeMeta =
      user.id !== getGuestUser().id ? await getWalletChallengeMeta(user.id) : undefined;
    if (user.id !== getGuestUser().id && wallet === "live") {
      const br = await getLiveWalletBreakdown(user.id);
      return res.json({
        ...snap,
        ...challengeMeta,
        locked_bonus_inr: br.locked_bonus_inr,
        withdrawable_inr: br.withdrawable_inr
      });
    }
    res.json(challengeMeta ? { ...snap, ...challengeMeta } : snap);
  })().catch((error) => {
    logger.error({ error }, "Unable to load account");
    res.status(500).json({ message: "Unable to load account" });
  });
});

app.get("/api/trades", (_req, res) => {
  void (async () => {
    const user = await resolveDemoUser(_req.headers.authorization);
    res.setHeader("Cache-Control", "no-store, private");
    res.setHeader("Vary", "Authorization, X-Account-Type");
    const wallet = resolveWalletForHttpRequest(user.id, _req.headers["x-account-type"], _req.query);
    await prepareAccountForRequest(user.id, wallet);
    let account = getAccountForWallet(user.id, wallet);
    await alignIdleBonusAccountCashWithDb(user.id, wallet, account);
    if (user.id !== getGuestUser().id && wallet === "demo") {
      const savedDemo = await saveDemoBalanceToDb(user.id, account.balance);
      if (Math.abs(savedDemo - account.balance) > 0.01) {
        await prepareAccountForRequest(user.id, "demo");
        account = getAccountForWallet(user.id, wallet);
      }
    }
    /** Bonus must not mutate on read-only endpoints; bonus writes happen only on redeem/open/settle flows. */
    res.json({ trades: account.listTrades() });
  })().catch((error) => {
    logger.error({ error }, "Unable to load trades");
    res.status(500).json({ message: "Unable to load trades" });
  });
});

const MIN_DEPOSIT_USDT = 1;
const MAX_DEPOSIT_USDT = 1_000_000;

/** No auth — UI can show where USDT must be sent (MetaMask shows token contract, not this address directly). */
app.get("/api/deposits/public-info", (_req, res) => {
  res.json({
    treasuryAddress: env.USDT_BEP20_DEPOSIT_ADDRESS,
    tokenContract: env.BSC_USDT_CONTRACT,
    chainId: env.BSC_CHAIN_ID,
    networkName: "BNB Smart Chain (BEP20)",
    inrPerUsdt: INR_PER_USDT
  });
});

app.post("/api/deposits/intent", (req, res) => {
  void (async () => {
    const user = await requireSession(req.headers.authorization);
    const amount = Number(req.body?.amount);
    const walletProvider = String(req.body?.walletProvider ?? "unknown").slice(0, 64);

    if (!Number.isFinite(amount) || amount < MIN_DEPOSIT_USDT || amount > MAX_DEPOSIT_USDT) {
      return res.status(400).json({
        message: `Amount must be between ${MIN_DEPOSIT_USDT} and ${MAX_DEPOSIT_USDT} USDT`
      });
    }

    const row = await createDepositIntent({
      userId: user.id,
      userEmail: user.email,
      amount,
      walletProvider,
      adminToAddress: env.USDT_BEP20_DEPOSIT_ADDRESS,
      tokenContract: env.BSC_USDT_CONTRACT,
      chainId: env.BSC_CHAIN_ID
    });

    return res.status(201).json({
      deposit: row,
      chainId: env.BSC_CHAIN_ID,
      chainIdHex: `0x${env.BSC_CHAIN_ID.toString(16)}`,
      tokenAddress: env.BSC_USDT_CONTRACT,
      toAddress: env.USDT_BEP20_DEPOSIT_ADDRESS,
      amount,
      decimals: 18,
      inrPerUsdt: INR_PER_USDT,
      walletCreditInr: usdtToInrCredit(amount)
    });
  })().catch((error) => {
    const message = error instanceof Error ? error.message : "Deposit intent failed";
    if (message === "Unauthorized") {
      return res.status(401).json({ message });
    }
    logger.error({ error }, "deposit intent");
    res.status(500).json({ message });
  });
});

app.post("/api/deposits/submit-tx", (req, res) => {
  void (async () => {
    const user = await requireSession(req.headers.authorization);
    const depositId = String(req.body?.depositId ?? "").trim();
    const txHash = String(req.body?.txHash ?? "").trim();
    const fromAddress = String(req.body?.fromAddress ?? "").trim();
    const rawAmt = req.body?.amountUsdt ?? req.body?.amount;
    let amountUsdt: number | undefined;
    if (rawAmt !== undefined && rawAmt !== null && rawAmt !== "") {
      amountUsdt = Number(rawAmt);
      if (!Number.isFinite(amountUsdt) || amountUsdt < MIN_DEPOSIT_USDT || amountUsdt > MAX_DEPOSIT_USDT) {
        return res.status(400).json({
          message: `amountUsdt must be between ${MIN_DEPOSIT_USDT} and ${MAX_DEPOSIT_USDT} USDT`
        });
      }
    }

    if (!depositId || !txHash.startsWith("0x") || txHash.length < 10) {
      return res.status(400).json({ message: "depositId and valid txHash required" });
    }
    if (!fromAddress.startsWith("0x") || fromAddress.length < 42) {
      return res.status(400).json({ message: "Valid fromAddress required" });
    }

    const updated = await markDepositTxSent({
      depositId,
      userId: user.id,
      txHash,
      fromAddress,
      amountUsdt
    });

    if (!updated) {
      return res.status(400).json({
        message: "Deposit not found, already submitted, or invalid"
      });
    }

    /* QR / external scan: admin approves after BscScan check. In-app Web3 send: credit INR wallet immediately. */
    if (updated.wallet_provider === "qr_scan") {
      if (updated.status !== "pending_review") {
        return res.status(400).json({ message: "Deposit not found, already submitted, or invalid" });
      }
      return res.json({
        ok: true,
        pendingReview: true,
        deposit: updated,
        message:
          "Transaction submitted. An admin will verify it on-chain; your INR wallet will be credited after approval."
      });
    }

    if (updated.status !== "tx_sent") {
      return res.status(400).json({ message: "Deposit not found, already submitted, or invalid" });
    }

    const creditedInr = usdtToInrCredit(updated.amount);
    await applyLedger(user.id, creditedInr, "deposit_credited", depositId);
    const marked = await markDepositCreditedFromTxSent(depositId, user.id);
    if (!marked) {
      logger.error({ depositId, userId: user.id }, "deposit submit-tx: ledger applied but status update failed");
      return res.status(500).json({ message: "Partial failure — check deposit and wallet manually" });
    }
    await hydrateLiveAccountFromWallet(user.id);

    return res.json({
      ok: true,
      pendingReview: false,
      deposit: { ...updated, status: "credited" as const },
      creditedUsdt: updated.amount,
      creditedInr,
      inrPerUsdt: INR_PER_USDT,
      message: `Credited ${creditedInr} INR to your trading wallet (${updated.amount} USDT).`
    });
  })().catch((error) => {
    const message = error instanceof Error ? error.message : "Submit failed";
    if (message === "Unauthorized") {
      return res.status(401).json({ message });
    }
    logger.error({ error }, "deposit submit-tx");
    res.status(500).json({ message });
  });
});

app.get("/api/deposits/my", (req, res) => {
  void (async () => {
    const user = await requireSession(req.headers.authorization);
    const rows = await listDepositsForUser(user.id);
    return res.json({ deposits: rows });
  })().catch((error) => {
    if (error instanceof Error && error.message === "Unauthorized") {
      return res.status(401).json({ message: "Unauthorized" });
    }
    logger.error({ error }, "deposits my");
    res.status(500).json({ message: "Failed to list deposits" });
  });
});

app.get("/api/deposits/admin-all", (req, res) => {
  void (async () => {
    try {
      await requireAdminSession(req.headers.authorization);
    } catch (e) {
      const m = e instanceof Error ? e.message : "";
      if (m === "Forbidden") {
        return res.status(403).json({ message: "Admin role required — users.role must be 'admin' in the database" });
      }
      return res.status(401).json({ message: "Unauthorized" });
    }
    const rows = await listAllDeposits();
    return res.json({ deposits: rows, total: rows.length });
  })().catch((error) => {
    logger.error({ error }, "deposits admin");
    res.status(500).json({ message: "Failed" });
  });
});

app.post("/api/deposits/admin-approve", (req, res) => {
  void (async () => {
    try {
      await requireAdminSession(req.headers.authorization);
    } catch (e) {
      const m = e instanceof Error ? e.message : "";
      if (m === "Forbidden") {
        return res.status(403).json({ message: "Admin role required" });
      }
      return res.status(401).json({ message: "Unauthorized" });
    }
    const depositId = String(req.body?.depositId ?? "").trim();
    if (!depositId) {
      return res.status(400).json({ message: "depositId required" });
    }
    const row = await getDepositById(depositId);
    if (!row || row.status !== "pending_review") {
      return res.status(400).json({ message: "Deposit not found or not awaiting approval" });
    }
    const creditedInr = usdtToInrCredit(row.amount);
    await applyLedger(row.user_id, creditedInr, "deposit_credited", depositId);
    const marked = await markDepositCreditedIfPendingReview(depositId);
    if (!marked) {
      logger.error({ depositId }, "deposit admin-approve: ledger applied but status update failed");
      return res.status(500).json({ message: "Partial failure — check deposit and wallet manually" });
    }
    await hydrateLiveAccountFromWallet(row.user_id);
    return res.json({
      ok: true,
      depositId,
      userId: row.user_id,
      creditedUsdt: row.amount,
      creditedInr,
      inrPerUsdt: INR_PER_USDT
    });
  })().catch((error) => {
    const message = error instanceof Error ? error.message : "Approve failed";
    if (message === "Unauthorized") {
      return res.status(401).json({ message });
    }
    logger.error({ error }, "deposit admin-approve");
    res.status(500).json({ message });
  });
});

app.post("/api/admin/withdrawals/approve", (req, res) => {
  void (async () => {
    try {
      await requireAdminSession(req.headers.authorization);
    } catch (e) {
      const m = e instanceof Error ? e.message : "";
      if (m === "Forbidden") {
        return res.status(403).json({ message: "Admin role required" });
      }
      return res.status(401).json({ message: "Unauthorized" });
    }
    const withdrawalId = String(req.body?.withdrawalId ?? "").trim();
    if (!withdrawalId) {
      return res.status(400).json({ message: "withdrawalId required" });
    }
    const row = await getWithdrawalById(withdrawalId);
    if (!row) {
      return res.status(404).json({ message: "Withdrawal not found" });
    }
    if (row.status === "completed") {
      return res.json({ ok: true, withdrawalId, idempotent: true });
    }
    if (row.status !== "pending" && row.status !== "processing") {
      return res.status(400).json({ message: "Withdrawal is not awaiting approval" });
    }
    const now = new Date().toISOString();
    const upd = await dbRun(
      `UPDATE withdrawals SET status = 'completed', updated_at = ? WHERE id = ? AND status IN ('pending', 'processing')`,
      [now, withdrawalId]
    );
    if (upd.affectedRows === 0) {
      return res.status(400).json({ message: "Withdrawal already finalized" });
    }
    await hydrateLiveAccountFromWallet(row.user_id);
    return res.json({ ok: true, withdrawalId, userId: row.user_id });
  })().catch((error) => {
    const message = error instanceof Error ? error.message : "Approve failed";
    if (message === "Unauthorized") {
      return res.status(401).json({ message });
    }
    logger.error({ error }, "withdrawal admin-approve");
    res.status(500).json({ message });
  });
});

app.post("/api/admin/withdrawals/reject", (req, res) => {
  void (async () => {
    try {
      await requireAdminSession(req.headers.authorization);
    } catch (e) {
      const m = e instanceof Error ? e.message : "";
      if (m === "Forbidden") {
        return res.status(403).json({ message: "Admin role required" });
      }
      return res.status(401).json({ message: "Unauthorized" });
    }
    const withdrawalId = String(req.body?.withdrawalId ?? "").trim();
    if (!withdrawalId) {
      return res.status(400).json({ message: "withdrawalId required" });
    }
    const row = await getWithdrawalById(withdrawalId);
    if (!row) {
      return res.status(404).json({ message: "Withdrawal not found" });
    }
    if (row.status === "rejected") {
      return res.json({ ok: true, withdrawalId, idempotent: true });
    }
    if (row.status === "completed") {
      return res.status(400).json({ message: "Cannot reject a completed withdrawal" });
    }
    if (row.status !== "pending" && row.status !== "processing") {
      return res.status(400).json({ message: "Withdrawal is not awaiting approval" });
    }
    const now = new Date().toISOString();
    const upd = await dbRun(
      `UPDATE withdrawals SET status = 'rejected', updated_at = ? WHERE id = ? AND status IN ('pending', 'processing')`,
      [now, withdrawalId]
    );
    if (upd.affectedRows === 0) {
      return res.status(400).json({ message: "Withdrawal already finalized" });
    }
    const refundInr = inrDebitForUsdtWithdraw(row.amount);
    try {
      await applyLedger(row.user_id, refundInr, "withdrawal_rejected_refund", withdrawalId);
    } catch (err) {
      const now2 = new Date().toISOString();
      await dbRun(
        `UPDATE withdrawals SET status = 'pending', updated_at = ? WHERE id = ? AND status = 'rejected'`,
        [now2, withdrawalId]
      ).catch(() => {});
      const msg = err instanceof Error ? err.message : "Refund failed";
      logger.error({ err, withdrawalId }, "withdrawal admin-reject: refund failed, status reverted to pending");
      return res.status(500).json({ message: msg });
    }
    await hydrateLiveAccountFromWallet(row.user_id);
    return res.json({ ok: true, withdrawalId, userId: row.user_id, refundedInr: refundInr });
  })().catch((error) => {
    const message = error instanceof Error ? error.message : "Reject failed";
    if (message === "Unauthorized") {
      return res.status(401).json({ message });
    }
    logger.error({ error }, "withdrawal admin-reject");
    res.status(500).json({ message });
  });
});

/** Set withdrawal status: `pending` | `processing` | `completed` | `rejected` (ledger rules for completed/rejected). */
app.post("/api/admin/withdrawals/set-status", (req, res) => {
  void (async () => {
    try {
      await requireAdminSession(req.headers.authorization);
    } catch (e) {
      const m = e instanceof Error ? e.message : "";
      if (m === "Forbidden") {
        return res.status(403).json({ message: "Admin role required" });
      }
      return res.status(401).json({ message: "Unauthorized" });
    }
    const withdrawalId = String(req.body?.withdrawalId ?? "").trim();
    const rawStatus = String(req.body?.status ?? "").trim().toLowerCase();
    if (!withdrawalId) {
      return res.status(400).json({ message: "withdrawalId required" });
    }
    const allowed = new Set(["pending", "processing", "completed", "rejected"]);
    if (!allowed.has(rawStatus)) {
      return res.status(400).json({ message: "Invalid status" });
    }
    const target = rawStatus as "pending" | "processing" | "completed" | "rejected";

    const row = await getWithdrawalById(withdrawalId);
    if (!row) {
      return res.status(404).json({ message: "Withdrawal not found" });
    }
    if (row.status === target) {
      await hydrateLiveAccountFromWallet(row.user_id);
      return res.json({ ok: true, withdrawalId, status: target, idempotent: true });
    }

    if (row.status === "completed" || row.status === "rejected") {
      return res.status(400).json({ message: "Cannot change a finalized withdrawal" });
    }

    if (target === "completed") {
      const now = new Date().toISOString();
      const upd = await dbRun(
        `UPDATE withdrawals SET status = 'completed', updated_at = ? WHERE id = ? AND status IN ('pending', 'processing')`,
        [now, withdrawalId]
      );
      if (upd.affectedRows === 0) {
        return res.status(400).json({ message: "Update failed" });
      }
      await hydrateLiveAccountFromWallet(row.user_id);
      return res.json({ ok: true, withdrawalId, userId: row.user_id, status: "completed" });
    }

    if (target === "rejected") {
      const now = new Date().toISOString();
      const upd = await dbRun(
        `UPDATE withdrawals SET status = 'rejected', updated_at = ? WHERE id = ? AND status IN ('pending', 'processing')`,
        [now, withdrawalId]
      );
      if (upd.affectedRows === 0) {
        return res.status(400).json({ message: "Update failed" });
      }
      const refundInr = inrDebitForUsdtWithdraw(row.amount);
      try {
        await applyLedger(row.user_id, refundInr, "withdrawal_rejected_refund", withdrawalId);
      } catch (err) {
        const now2 = new Date().toISOString();
        await dbRun(
          `UPDATE withdrawals SET status = 'pending', updated_at = ? WHERE id = ? AND status = 'rejected'`,
          [now2, withdrawalId]
        ).catch(() => {});
        const msg = err instanceof Error ? err.message : "Refund failed";
        logger.error({ err, withdrawalId }, "withdrawal set-status reject: refund failed");
        return res.status(500).json({ message: msg });
      }
      await hydrateLiveAccountFromWallet(row.user_id);
      return res.json({
        ok: true,
        withdrawalId,
        userId: row.user_id,
        status: "rejected",
        refundedInr: refundInr
      });
    }

    if (target === "processing" && row.status === "pending") {
      const now = new Date().toISOString();
      const upd = await dbRun(
        `UPDATE withdrawals SET status = 'processing', updated_at = ? WHERE id = ? AND status = 'pending'`,
        [now, withdrawalId]
      );
      if (upd.affectedRows === 0) {
        return res.status(400).json({ message: "Update failed" });
      }
      return res.json({ ok: true, withdrawalId, status: "processing" });
    }

    if (target === "pending" && row.status === "processing") {
      const now = new Date().toISOString();
      const upd = await dbRun(
        `UPDATE withdrawals SET status = 'pending', updated_at = ? WHERE id = ? AND status = 'processing'`,
        [now, withdrawalId]
      );
      if (upd.affectedRows === 0) {
        return res.status(400).json({ message: "Update failed" });
      }
      return res.json({ ok: true, withdrawalId, status: "pending" });
    }

    return res.status(400).json({
      message: `Cannot set status to ${target} from ${row.status}`
    });
  })().catch((error) => {
    const message = error instanceof Error ? error.message : "Failed";
    if (message === "Unauthorized") {
      return res.status(401).json({ message });
    }
    logger.error({ error }, "withdrawal admin set-status");
    res.status(500).json({ message });
  });
});

/**
 * ra-data-simple-rest v5 sends `sort` / `range` as JSON in query string.
 * Older dialect used `_start`, `_end`, `_sort`, `_order`.
 */
function parseReactAdminListQuery(q: express.Request["query"]): {
  start: number;
  endExclusive: number;
  sortField: string;
  order: "ASC" | "DESC";
} {
  let start = Math.max(0, Number(q._start) || 0);
  let endExclusive = Math.min(10_000, Math.max(start + 1, Number(q._end) || 1000));

  if (typeof q.range === "string") {
    try {
      const arr = JSON.parse(q.range) as unknown;
      if (Array.isArray(arr) && arr.length >= 2) {
        const lo = Number(arr[0]);
        const hi = Number(arr[1]);
        if (Number.isFinite(lo) && Number.isFinite(hi)) {
          start = Math.max(0, Math.floor(lo));
          // inclusive end from RA → slice end exclusive
          endExclusive = Math.min(10_000, Math.max(start + 1, Math.floor(hi) + 1));
        }
      }
    } catch {
      /* keep legacy _start/_end */
    }
  }

  let sortField = typeof q._sort === "string" ? q._sort : "created_at";
  let order: "ASC" | "DESC" =
    String(q._order ?? "DESC").toUpperCase() === "ASC" ? "ASC" : "DESC";

  if (typeof q.sort === "string") {
    try {
      const arr = JSON.parse(q.sort) as unknown;
      if (Array.isArray(arr) && typeof arr[0] === "string" && arr[0].length > 0) {
        sortField = arr[0];
        order = String(arr[1] ?? "DESC").toUpperCase() === "ASC" ? "ASC" : "DESC";
      }
    } catch {
      /* keep legacy */
    }
  }

  return { start, endExclusive, sortField, order };
}

/** React-Admin sends `filter` as JSON in query string; apply before sort + slice. */
function parseAdminListFilter(q: express.Request["query"]): Record<string, unknown> {
  const raw = q.filter;
  if (typeof raw !== "string" || raw.trim() === "") {
    return {};
  }
  try {
    const obj = JSON.parse(raw) as unknown;
    return typeof obj === "object" && obj !== null && !Array.isArray(obj) ? (obj as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function adminRowMatchesQuickSearch(r: Record<string, unknown>, needle: string): boolean {
  const n = needle.toLowerCase();
  for (const v of Object.values(r)) {
    if (v == null) continue;
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
      if (String(v).toLowerCase().includes(n)) {
        return true;
      }
    }
  }
  return false;
}

function applyAdminListRowFilter(
  resource: string,
  rows: Record<string, unknown>[],
  filter: Record<string, unknown>
): Record<string, unknown>[] {
  let out = rows;
  if (resource === "deposits" && typeof filter.status === "string" && filter.status.length > 0) {
    out = out.filter((r) => String(r.status ?? "") === filter.status);
  }
  if (resource === "withdrawals") {
    if (filter.status_pending_processing === true) {
      out = out.filter((r) => {
        const s = String(r.status ?? "");
        return s === "pending" || s === "processing";
      });
    } else if (typeof filter.status === "string" && filter.status.length > 0) {
      out = out.filter((r) => String(r.status ?? "") === filter.status);
    }
  }
  const q = typeof filter.q === "string" ? filter.q.trim() : "";
  if (q.length > 0) {
    out = out.filter((r) => adminRowMatchesQuickSearch(r, q));
  }
  return out;
}

function adminSafePathId(raw: unknown): string {
  const s = String(raw ?? "").trim();
  if (!s) {
    return "";
  }
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/** Literal list paths — Express 5 + static can mishandle a single `:resource` pattern for some names (e.g. `transactions`). */
const ADMIN_RA_LIST_RESOURCES = [
  "deposits",
  "withdrawals",
  "users",
  "wallets",
  "transactions",
  "support_tickets",
  "market_ticks"
] as const;

async function handleAdminReactAdminList(
  req: express.Request,
  res: express.Response,
  resourceRaw: string
): Promise<void> {
  try {
    await requireAdminSession(req.headers.authorization);
  } catch (e) {
    const m = e instanceof Error ? e.message : "";
    if (m === "Forbidden") {
      res.status(403).json({ message: "Admin role required" });
      return;
    }
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  const resource = String(resourceRaw ?? "")
    .toLowerCase()
    .replace(/-/g, "_");
  const allowed = new Set<string>([...ADMIN_RA_LIST_RESOURCES]);
  if (!allowed.has(resource)) {
    res.status(404).json({ message: "Unknown resource" });
    return;
  }

  const { start, endExclusive, sortField, order } = parseReactAdminListQuery(req.query);
  const listFilter = parseAdminListFilter(req.query);

  let rows: Record<string, unknown>[] = [];
  if (resource === "deposits") {
    rows = (await listAllDeposits()) as unknown as Record<string, unknown>[];
  } else if (resource === "withdrawals") {
    rows = (await listAllWithdrawals()) as unknown as Record<string, unknown>[];
  } else if (resource === "users") {
    rows = (await listUsersForAdmin()) as unknown as Record<string, unknown>[];
  } else if (resource === "wallets") {
    rows = await listWalletsForAdmin();
  } else if (resource === "transactions") {
    rows = await listTransactionsForAdmin();
  } else if (resource === "support_tickets") {
    rows = await listSupportTicketsForAdmin();
  } else {
    rows = await listMarketTicksForAdmin();
  }

  rows = applyAdminListRowFilter(resource, rows, listFilter);

  const mult = order === "ASC" ? 1 : -1;
  rows.sort((a, b) => {
    const va = a[sortField];
    const vb = b[sortField];
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    if (typeof va === "number" && typeof vb === "number") {
      return va < vb ? -mult : va > vb ? mult : 0;
    }
    const sa = String(va);
    const sb = String(vb);
    return sa < sb ? -mult : sa > sb ? mult : 0;
  });

  const total = rows.length;
  const slice = rows.slice(start, endExclusive);
  res.setHeader("X-Total-Count", String(total));
  let contentRange: string;
  if (total === 0) {
    contentRange = `${resource} */0`;
  } else {
    const first = Math.min(start, total - 1);
    const lastIdx = Math.min(endExclusive - 1, total - 1);
    contentRange = `${resource} ${first}-${lastIdx}/${total}`;
  }
  res.setHeader("Content-Range", contentRange);
  res.setHeader("Access-Control-Expose-Headers", "X-Total-Count, Content-Range");
  res.json(slice);
}

/**
 * Literal `/users/:id` — more reliable than `/:resource/:id` with Express 5 + Vite.
 * Must stay BEFORE `GET /api/admin/ra/:resource` (list).
 */
app.get("/api/admin/ra/users/:id", (req, res) => {
  void (async () => {
    try {
      await requireAdminSession(req.headers.authorization);
    } catch (e) {
      const m = e instanceof Error ? e.message : "";
      if (m === "Forbidden") {
        return res.status(403).json({ message: "Admin role required" });
      }
      return res.status(401).json({ message: "Unauthorized" });
    }

    const id = adminSafePathId(req.params.id);
    if (!id) {
      return res.status(400).json({ message: "Missing id" });
    }

    const row = await getUserForAdminById(id);
    if (!row) {
      logger.warn(
        { pathId: id },
        "Admin GET user — no row in DB (wrong database / stale server / id mismatch?)"
      );
      return res.status(404).json({ message: "Not found" });
    }
    return res.json(row);
  })().catch((error) => {
    logger.error({ error }, "admin ra getOne");
    res.status(500).json({ message: "Failed" });
  });
});

app.put("/api/admin/ra/users/:id", (req, res) => {
  void (async () => {
    let adminActor: { id: string; email: string };
    try {
      adminActor = await requireAdminSession(req.headers.authorization);
    } catch (e) {
      const m = e instanceof Error ? e.message : "";
      if (m === "Forbidden") {
        return res.status(403).json({ message: "Admin role required" });
      }
      return res.status(401).json({ message: "Unauthorized" });
    }

    const id = adminSafePathId(req.params.id);
    if (!id) {
      return res.status(400).json({ message: "Missing id" });
    }

    const body = req.body as Record<string, unknown>;
    try {
      if (body.is_blocked === true) {
        const targetPk = await resolveAdminUserPrimaryKey(id);
        if (targetPk && targetPk === String(adminActor.id).trim()) {
          return res.status(400).json({ message: "You cannot block your own account" });
        }
      }

      const payload: Parameters<typeof updateUserFromAdmin>[1] = {};
      if (typeof body.name === "string") {
        payload.name = body.name;
      }
      if (typeof body.email === "string") {
        payload.email = body.email;
      }
      if (typeof body.role === "string") {
        payload.role = body.role;
      }
      if (body.self_referral_code === null || typeof body.self_referral_code === "string") {
        payload.self_referral_code = body.self_referral_code as string | null;
      }
      if (body.referral_code === null || typeof body.referral_code === "string") {
        payload.referral_code = body.referral_code as string | null;
      }
      if (body.balance !== undefined && body.balance !== null) {
        payload.balance = Number(body.balance);
      }
      if (body.demo_balance !== undefined && body.demo_balance !== null) {
        payload.demo_balance = Number(body.demo_balance);
      }
      if (typeof body.new_password === "string") {
        payload.new_password = body.new_password;
      }
      if (typeof body.is_blocked === "boolean") {
        payload.is_blocked = body.is_blocked;
      }

      const row = await updateUserFromAdmin(id, payload);
      return res.json(row);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Update failed";
      if (msg === "User not found") {
        return res.status(404).json({ message: msg });
      }
      return res.status(400).json({ message: msg });
    }
  })().catch((error) => {
    logger.error({ error }, "admin ra put");
    res.status(500).json({ message: "Failed" });
  });
});

/** React-Admin wallet edit: PUT /api/admin/ra/wallets/:id (id = user_id) */
app.put("/api/admin/ra/wallets/:id", (req, res) => {
  void (async () => {
    try {
      await requireAdminSession(req.headers.authorization);
    } catch (e) {
      const m = e instanceof Error ? e.message : "";
      if (m === "Forbidden") {
        return res.status(403).json({ message: "Admin role required" });
      }
      return res.status(401).json({ message: "Unauthorized" });
    }

    const id = adminSafePathId(req.params.id);
    if (!id) {
      return res.status(400).json({ message: "Missing id" });
    }

    const body = req.body as Record<string, unknown>;
    try {
      const canonical = await resolveAdminUserPrimaryKey(id);
      if (!canonical) {
        return res.status(404).json({ message: "User not found" });
      }

      const payload: { balance?: number; demo_balance?: number; locked_bonus_inr?: number } = {};
      if (body.balance !== undefined && body.balance !== null) {
        payload.balance = Number(body.balance);
      }
      if (body.demo_balance !== undefined && body.demo_balance !== null) {
        payload.demo_balance = Number(body.demo_balance);
      }
      if (body.locked_bonus_inr !== undefined && body.locked_bonus_inr !== null) {
        payload.locked_bonus_inr = Number(body.locked_bonus_inr);
      }
      if (
        payload.balance === undefined &&
        payload.demo_balance === undefined &&
        payload.locked_bonus_inr === undefined
      ) {
        return res.status(400).json({ message: "Provide balance and/or demo_balance and/or locked_bonus_inr" });
      }

      await setWalletBalancesFromAdmin(canonical, payload);
      evictInMemoryAccountsForUser(canonical);
      await hydrateLiveAccountFromWallet(canonical);

      const row = await getAdminRaOne("wallets", canonical);
      if (!row) {
        return res.status(404).json({ message: "Wallet row not found" });
      }
      return res.json(row);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Update failed";
      return res.status(400).json({ message: msg });
    }
  })().catch((error) => {
    logger.error({ error }, "admin ra put wallets");
    res.status(500).json({ message: "Failed" });
  });
});

/** React-Admin support ticket: PUT /api/admin/ra/support_tickets/:id — status only */
app.put("/api/admin/ra/support_tickets/:id", (req, res) => {
  void (async () => {
    try {
      await requireAdminSession(req.headers.authorization);
    } catch (e) {
      const m = e instanceof Error ? e.message : "";
      if (m === "Forbidden") {
        return res.status(403).json({ message: "Admin role required" });
      }
      return res.status(401).json({ message: "Unauthorized" });
    }

    const id = adminSafePathId(req.params.id);
    if (!id) {
      return res.status(400).json({ message: "Missing id" });
    }

    const body = req.body as Record<string, unknown>;
    const rawStatus = body?.status;
    const normalized =
      typeof rawStatus === "string" ? normalizeAdminSupportTicketStatus(rawStatus) : null;
    if (!normalized) {
      return res.status(400).json({ message: "Valid status required (open, in_progress, closed)" });
    }

    try {
      const ok = await updateSupportTicketStatusAdmin(id, normalized);
      if (!ok) {
        return res.status(404).json({ message: "Ticket not found" });
      }
      const row = await getAdminRaOne("support_tickets", id);
      if (!row) {
        return res.status(404).json({ message: "Ticket not found" });
      }
      return res.json(row);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Update failed";
      return res.status(400).json({ message: msg });
    }
  })().catch((error) => {
    logger.error({ error }, "admin ra put support_tickets");
    res.status(500).json({ message: "Failed" });
  });
});

app.get("/api/admin/referral-level-settings", (req, res) => {
  void (async () => {
    try {
      await requireAdminSession(req.headers.authorization);
    } catch (e) {
      const m = e instanceof Error ? e.message : "";
      if (m === "Forbidden") {
        return res.status(403).json({ message: "Admin role required" });
      }
      return res.status(401).json({ message: "Unauthorized" });
    }
    try {
      const payload = await getReferralLevelConfigPayload();
      return res.json(payload);
    } catch (err) {
      logger.error({ err }, "admin referral-level-settings get");
      return res.status(500).json({ message: "Failed" });
    }
  })();
});

app.put("/api/admin/referral-level-settings", (req, res) => {
  void (async () => {
    try {
      await requireAdminSession(req.headers.authorization);
    } catch (e) {
      const m = e instanceof Error ? e.message : "";
      if (m === "Forbidden") {
        return res.status(403).json({ message: "Admin role required" });
      }
      return res.status(401).json({ message: "Unauthorized" });
    }
    try {
      const body = req.body as {
        referralProgramEnabled?: boolean;
        levels?: { level: number; percentOfStake: number; enabled: boolean }[];
      };
      await updateReferralLevelConfigPayload({
        referralProgramEnabled: Boolean(body.referralProgramEnabled),
        levels: Array.isArray(body.levels) ? body.levels : []
      });
      const payload = await getReferralLevelConfigPayload();
      return res.json(payload);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Update failed";
      return res.status(400).json({ message: msg });
    }
  })();
});

app.post("/api/admin/user-block", (req, res) => {
  void (async () => {
    let admin: { id: string; email: string };
    try {
      admin = await requireAdminSession(req.headers.authorization);
    } catch (e) {
      const m = e instanceof Error ? e.message : "";
      if (m === "Forbidden") {
        return res.status(403).json({ message: "Admin role required" });
      }
      return res.status(401).json({ message: "Unauthorized" });
    }
    const userId = String(req.body?.userId ?? req.body?.id ?? "").trim();
    if (!userId) {
      return res.status(400).json({ message: "userId is required" });
    }
    if (typeof req.body?.blocked !== "boolean") {
      return res.status(400).json({ message: "blocked (boolean) is required" });
    }
    try {
      const row = await setUserBlockedByAdmin(admin.id, userId, req.body.blocked);
      return res.json(row);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed";
      if (msg === "User not found") {
        return res.status(404).json({ message: msg });
      }
      return res.status(400).json({ message: msg });
    }
  })();
});

app.get("/api/admin/dashboard-stats", (req, res) => {
  void (async () => {
    try {
      await requireAdminSession(req.headers.authorization);
    } catch (e) {
      const m = e instanceof Error ? e.message : "";
      if (m === "Forbidden") {
        return res.status(403).json({ message: "Admin role required" });
      }
      return res.status(401).json({ message: "Unauthorized" });
    }
    try {
      const payload = await getAdminDashboardStats();
      return res.json({ ...payload, database: getDatabaseInfo() });
    } catch (err) {
      logger.error({ err }, "admin dashboard-stats");
      return res.status(500).json({ message: "Failed" });
    }
  })();
});

app.get("/api/admin/user-insights", (req, res) => {
  void (async () => {
    try {
      await requireAdminSession(req.headers.authorization);
    } catch (e) {
      const m = e instanceof Error ? e.message : "";
      if (m === "Forbidden") {
        return res.status(403).json({ message: "Admin role required" });
      }
      return res.status(401).json({ message: "Unauthorized" });
    }
    const userId = String(req.query.userId ?? "").trim();
    const search = String(req.query.search ?? "").trim();
    try {
      if (search.length >= 1) {
        const matches = await searchUsersForAdmin(search);
        return res.json({ matches });
      }
      if (!userId) {
        return res.status(400).json({ message: "Provide userId or search query" });
      }
      const insights = await getAdminUserInsights(userId);
      if (!insights) {
        return res.status(404).json({ message: "User not found" });
      }
      return res.json(insights);
    } catch (err) {
      logger.error({ err }, "admin user-insights");
      return res.status(500).json({ message: "Failed" });
    }
  })();
});

app.get("/api/admin/team-business-report", (req, res) => {
  void (async () => {
    try {
      await requireAdminSession(req.headers.authorization);
    } catch (e) {
      const m = e instanceof Error ? e.message : "";
      if (m === "Forbidden") {
        return res.status(403).json({ message: "Admin role required" });
      }
      return res.status(401).json({ message: "Unauthorized" });
    }
    try {
      const payload = await getAdminTeamBusinessReport();
      return res.json(payload);
    } catch (err) {
      logger.error({ err }, "admin team-business-report");
      return res.status(500).json({ message: "Failed" });
    }
  })();
});

/**
 * React-Admin `getOne` / internal fetches: GET /api/admin/ra/:resource/:id
 * Register before GET /api/admin/ra/:resource so `.../users/5` is not swallowed as list.
 */
app.get("/api/admin/ra/:resource/:id", (req, res) => {
  void (async () => {
    try {
      await requireAdminSession(req.headers.authorization);
    } catch (e) {
      const m = e instanceof Error ? e.message : "";
      if (m === "Forbidden") {
        return res.status(403).json({ message: "Admin role required" });
      }
      return res.status(401).json({ message: "Unauthorized" });
    }

    const resource = String(req.params.resource ?? "")
      .toLowerCase()
      .replace(/-/g, "_");
    const id = adminSafePathId(req.params.id);
    if (!resource || !id) {
      return res.status(400).json({ message: "Bad request" });
    }
    /** Express 5 may match this route first (`:resource` = users) — load here too. */
    if (resource === "users") {
      const row = await getUserForAdminById(id);
      if (!row) {
        logger.warn({ pathId: id }, "Admin GET user (generic route) — not found");
        return res.status(404).json({ message: "Not found" });
      }
      return res.json(row);
    }

    const allowedOne = new Set([
      "deposits",
      "withdrawals",
      "wallets",
      "transactions",
      "support_tickets",
      "market_ticks"
    ]);
    if (!allowedOne.has(resource)) {
      return res.status(404).json({ message: "Unknown resource" });
    }

    const row = await getAdminRaOne(resource, id);
    if (!row) {
      return res.status(404).json({ message: "Not found" });
    }
    return res.json(row);
  })().catch((error) => {
    logger.error({ error }, "admin ra getOne resource");
    res.status(500).json({ message: "Failed" });
  });
});

/** React-Admin getList — literal paths first (reliable with Express 5). */
for (const name of ADMIN_RA_LIST_RESOURCES) {
  app.get(`/api/admin/ra/${name}`, (req, res) => {
    void handleAdminReactAdminList(req, res, name).catch((error) => {
      logger.error({ error }, "admin ra");
      if (!res.headersSent) {
        res.status(500).json({ message: "Failed" });
      }
    });
  });
}

/** Fallback for hyphenated names etc. */
app.get("/api/admin/ra/:resource", (req, res) => {
  const resource = String(req.params.resource ?? "").toLowerCase().replace(/-/g, "_");
  void handleAdminReactAdminList(req, res, resource).catch((error) => {
    logger.error({ error }, "admin ra");
    if (!res.headersSent) {
      res.status(500).json({ message: "Failed" });
    }
  });
});

const MIN_WITHDRAWAL_USDT = Math.max(
  1e-8,
  MIN_WITHDRAWAL_INR / Math.max(1, INR_PER_USDT)
);
const MAX_WITHDRAWAL_USDT = 1_000_000;

app.post("/api/withdrawals", (req, res) => {
  void (async () => {
    const user = await requireSession(req.headers.authorization);
    const amount = Number(req.body?.amount);
    const toAddress = String(req.body?.toAddress ?? "").trim().toLowerCase();
    const tpn = String(
      req.body?.tpin ?? req.body?.tpn ?? req.body?.totp ?? req.body?.totpCode ?? ""
    ).trim();

    try {
      await assertWithdrawalVerificationCode(user.id, tpn);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "TPN required";
      return res.status(400).json({ message: msg });
    }

    if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_WITHDRAWAL_USDT) {
      return res.status(400).json({
        message: `Amount must be between a small positive value and ${MAX_WITHDRAWAL_USDT} USDT`
      });
    }
    const inrHold = inrDebitForUsdtWithdraw(amount);
    if (!Number.isFinite(amount) || amount < MIN_WITHDRAWAL_USDT - 1e-12 || inrHold + 1e-9 < MIN_WITHDRAWAL_INR) {
      return res.status(400).json({
        message: `Minimum withdrawal is ₹${MIN_WITHDRAWAL_INR.toLocaleString("en-IN")} (~${MIN_WITHDRAWAL_USDT.toFixed(4)} USDT at ₹${INR_PER_USDT}/USDT)`
      });
    }
    if (!toAddress.startsWith("0x") || toAddress.length < 42) {
      return res.status(400).json({ message: "Valid BEP20 (0x...) address required" });
    }

    const breakdown = await getLiveWalletBreakdown(user.id);
    if (breakdown.withdrawable_inr + 1e-9 < inrHold) {
      return res.status(400).json({
        message: `Only profit is withdrawable (challenge bonus is locked). Withdrawable: ₹${breakdown.withdrawable_inr.toFixed(2)}; need ₹${inrHold.toFixed(2)} for ${amount} USDT. Locked bonus: ₹${breakdown.locked_bonus_inr.toFixed(2)}.`
      });
    }
    try {
      await applyLedger(user.id, -inrHold, "withdrawal_pending", null);
    } catch {
      return res.status(400).json({
        message: `Insufficient balance — need ₹${inrHold.toFixed(2)} (${amount} USDT × ₹${INR_PER_USDT})`
      });
    }

    try {
      const withdrawal = await createWithdrawal({
        userId: user.id,
        userEmail: user.email,
        amount,
        toAddress
      });
      await hydrateLiveAccountFromWallet(user.id);
      return res.status(201).json({ withdrawal, inrDebited: inrHold, inrPerUsdt: INR_PER_USDT });
    } catch (err) {
      await applyLedger(user.id, inrHold, "withdrawal_create_failed_refund", null).catch(() => {});
      await hydrateLiveAccountFromWallet(user.id);
      throw err;
    }
  })().catch((error) => {
    const message = error instanceof Error ? error.message : "Withdrawal failed";
    if (message === "Unauthorized") {
      return res.status(401).json({ message });
    }
    logger.error({ error }, "withdrawal create");
    res.status(500).json({ message });
  });
});

app.get("/api/withdrawals/my", (req, res) => {
  void (async () => {
    const user = await requireSession(req.headers.authorization);
    const withdrawals = await listWithdrawalsForUser(user.id);
    return res.json({ withdrawals });
  })().catch((error) => {
    if (error instanceof Error && error.message === "Unauthorized") {
      return res.status(401).json({ message: "Unauthorized" });
    }
    logger.error({ error }, "withdrawals my");
    res.status(500).json({ message: "Failed to list withdrawals" });
  });
});

app.post("/api/demo/orders", (req, res) => {
  void (async () => {
    const symbol = String(req.body?.symbol ?? "").toUpperCase();
    const side = String(req.body?.side ?? "").toLowerCase() as TradeSide;
    const quantity = Number(req.body?.quantity ?? req.body?.amount ?? 0);
    const direction = (req.body?.direction as "up" | "down" | undefined)?.toLowerCase();
    const timeframeSec = Number(req.body?.timeframe);
    const user = await resolveDemoUser(req.headers.authorization);
    if (user.id === getGuestUser().id) {
      return res.status(403).json({
        message:
          "Demo trading needs an account. Log in or register, then use Demo in the app header — guest betting is disabled."
      });
    }
    await prepareAccountForRequest(user.id, "demo");
    const account = getAccountForWallet(user.id, "demo");

    if (!symbol || !(FOREX_SYMBOLS as readonly string[]).includes(symbol)) {
      return res.status(400).json({ message: "Unsupported symbol" });
    }
    if (isXauUsdSymbol(symbol) && isXauIstWeeklyLockWindow()) {
      return res.status(400).json({
        message: "XAU/USD is closed Saturday–Sunday (IST). Orders are not available."
      });
    }

    const isBinary = direction === "up" || direction === "down";
    if (isBinary) {
      if (
        !Number.isFinite(timeframeSec) ||
        !(TRADE_TIMEFRAMES_SEC as readonly number[]).includes(timeframeSec)
      ) {
        return res.status(400).json({
          message: "Timeframe must be one of: 5s, 10s, 30s, 1m, 3m, 5m"
        });
      }
      if (!Number.isFinite(quantity) || quantity <= 0) {
        return res.status(400).json({ message: "Amount must be greater than 0" });
      }
    } else {
      if (side !== "buy" && side !== "sell") {
        return res.status(400).json({ message: "Side must be buy or sell" });
      }
      if (!Number.isFinite(quantity) || quantity <= 0) {
        return res.status(400).json({ message: "Quantity must be greater than 0" });
      }
    }

    const tick = forexFeed.getTick(symbol);
    if (!tick) {
      return res.status(409).json({ message: "No live price available yet" });
    }

    const nowMs = Date.now();
    const expiryAt = isBinary ? binaryCandleExpiresAtMs(nowMs, timeframeSec) : undefined;
    const trade = isBinary
      ? account.openTrade({
          symbol,
          side: "buy",
          quantity,
          entryPrice: tick.price,
          direction: direction as "up" | "down",
          expiryAt,
          timeframeSeconds: timeframeSec
        })
      : account.openTrade({
          symbol,
          side,
          quantity,
          entryPrice: tick.price
        });

    if (!trade) {
      if (!isBinary && tick) {
        const need = quantity * tick.price;
        return res.status(400).json({
          message:
            account.balance <= 0
              ? "Balance is zero — deposit or use demo funds. No leverage: position needs cash ≥ quantity × price."
              : `Insufficient cash. No leverage — need at least ${need.toFixed(2)} (quantity × price). Balance: ${account.balance.toFixed(2)}.`
        });
      }
      return res.status(400).json({ message: "Insufficient balance for this amount" });
    }

    const savedDemo = await saveDemoBalanceToDb(user.id, account.balance);
    if (Math.abs(savedDemo - account.balance) > 0.01) {
      await prepareAccountForRequest(user.id, "demo");
    }

    logger.info({ trade, userId: user.id }, "Demo trade opened");

    return res.status(201).json({ trade });
  })().catch((error) => {
    logger.error({ error }, "Unable to open demo trade");
    res.status(500).json({ message: "Unable to open demo trade" });
  });
});

/** Binary trades from bonus wallet — stake from bonus; wins credit main wallet (`bonus_trade_win`). */
app.post("/api/bonus/orders", (req, res) => {
  void (async () => {
    const symbol = String(req.body?.symbol ?? "").toUpperCase();
    const quantity = Number(req.body?.quantity ?? req.body?.amount ?? 0);
    const direction = (req.body?.direction as "up" | "down" | undefined)?.toLowerCase();
    const timeframeSec = Number(req.body?.timeframe);
    const user = await requireSession(req.headers.authorization);

    if (!symbol || !(FOREX_SYMBOLS as readonly string[]).includes(symbol)) {
      return res.status(400).json({ message: "Unsupported symbol" });
    }
    if (direction !== "up" && direction !== "down") {
      return res.status(400).json({ message: "Direction must be up or down" });
    }
    if (
      !Number.isFinite(timeframeSec) ||
      !(TRADE_TIMEFRAMES_SEC as readonly number[]).includes(timeframeSec)
    ) {
      return res.status(400).json({
        message: "Timeframe must be one of: 5s, 10s, 30s, 1m, 3m, 5m"
      });
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return res.status(400).json({ message: "Amount must be greater than 0" });
    }
    if (isXauUsdSymbol(symbol) && isXauIstWeeklyLockWindow()) {
      return res.status(400).json({
        message: "XAU/USD is closed Saturday–Sunday (IST). Orders are not available."
      });
    }

    const tick = forexFeed.getTick(symbol);
    if (!tick) {
      return res.status(409).json({ message: "No live price available yet" });
    }

    await prepareAccountForRequest(user.id, "bonus");
    const account = getAccountForWallet(user.id, "bonus");

    const nowMs = Date.now();
    const expiryAt = binaryCandleExpiresAtMs(nowMs, timeframeSec);
    const trade = account.openTrade({
      symbol,
      side: "buy",
      quantity,
      entryPrice: tick.price,
      direction: direction as "up" | "down",
      expiryAt,
      timeframeSeconds: timeframeSec
    });

    if (!trade) {
      return res.status(400).json({ message: "Insufficient balance for this amount" });
    }

    const saved = await saveBonusBalanceToDb(user.id, account.balance);
    if (Math.abs(saved - account.balance) > 0.01) {
      await prepareAccountForRequest(user.id, "bonus");
    }

    logger.info({ trade, userId: user.id }, "Bonus wallet binary trade opened");
    return res.status(201).json({ trade });
  })().catch((error) => {
    if (error instanceof Error && error.message === "Unauthorized") {
      return res.status(401).json({ message: "Unauthorized" });
    }
    logger.error({ error }, "Unable to open bonus trade");
    res.status(500).json({ message: "Unable to open bonus trade" });
  });
});

app.post("/api/orders", (req, res) => {
  void (async () => {
    const user = await requireSession(req.headers.authorization);
    const symbol = String(req.body?.symbol ?? "").toUpperCase();
    const direction = (req.body?.direction as "up" | "down" | undefined)?.toLowerCase();
    const amount = Number(req.body?.amount ?? req.body?.quantity ?? 0);
    const timeframeSec = Number(req.body?.timeframe);

    if (!symbol || !(FOREX_SYMBOLS as readonly string[]).includes(symbol)) {
      return res.status(400).json({ message: "Unsupported symbol" });
    }
    if (direction !== "up" && direction !== "down") {
      return res.status(400).json({ message: "Direction must be up or down" });
    }
    if (
      !Number.isFinite(timeframeSec) ||
      !(TRADE_TIMEFRAMES_SEC as readonly number[]).includes(timeframeSec)
    ) {
      return res.status(400).json({
        message: "Timeframe must be one of: 5s, 10s, 30s, 1m, 3m, 5m"
      });
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ message: "Amount must be greater than 0" });
    }
    if (isXauUsdSymbol(symbol) && isXauIstWeeklyLockWindow()) {
      return res.status(400).json({
        message: "XAU/USD is closed Saturday–Sunday (IST). Orders are not available."
      });
    }

    const tick = forexFeed.getTick(symbol);
    if (!tick) {
      return res.status(409).json({ message: "No live price available yet" });
    }

    const liveBal = await getWalletBalance(user.id);
    if (liveBal + 1e-9 < amount) {
      return res.status(400).json({
        message: `Insufficient live balance — need at least ${amount.toFixed(2)} INR (stake). Current: ${liveBal.toFixed(2)} INR. Deposit or switch to Demo.`
      });
    }

    const account = getAccountForWallet(user.id, "live");
    const tradeId = `trade-${crypto.randomUUID()}`;
    try {
      await applyLedger(user.id, -amount, "binary_stake", tradeId);
    } catch {
      return res.status(400).json({ message: "Insufficient balance for this amount" });
    }
    const after = await getWalletBalance(user.id);
    account.setBalance(after);
    const expiryAt = binaryCandleExpiresAtMs(Date.now(), timeframeSec);
    const trade = account.openTrade({
      symbol,
      side: "buy",
      quantity: amount,
      entryPrice: tick.price,
      direction,
      expiryAt,
      timeframeSeconds: timeframeSec,
      skipBinaryStakeDebit: true,
      tradeId
    });

    if (!trade) {
      await applyLedger(user.id, amount, "binary_stake_reversal", tradeId).catch(() => {});
      await hydrateLiveAccountFromWallet(user.id);
      return res.status(400).json({ message: "Unable to open trade" });
    }

    logger.info({ trade, userId: user.id }, "Live binary trade opened");
    void distributeBinaryBetLevelIncome(user.id, amount, tradeId).catch((e) =>
      logger.warn({ e, userId: user.id, tradeId }, "Level income distribution failed")
    );
    return res.status(201).json({ trade });
  })().catch((error) => {
    logger.error({ error }, "Unable to open live trade");
    res.status(500).json({ message: "Unable to open live trade" });
  });
});

// Auto-settle expired binary trades every second (demo + live ledger)
let settlingTrades = false;
setInterval(() => {
  if (settlingTrades) {
    return;
  }
  settlingTrades = true;
  void (async () => {
    const now = Date.now();
    try {
      const liveTasks: Promise<void>[] = [];
      forEachWalletAccount((userId, wallet, account) => {
        const expired = account.getExpiredOpenTrades(now);
        for (const trade of expired) {
          const tick = forexFeed.getTick(trade.symbol);
          if (!tick) {
            continue;
          }
          if (wallet === "live" && userId !== getGuestUser().id) {
            liveTasks.push(
              (async () => {
                try {
                  const win =
                    trade.direction === "up"
                      ? tick.price > trade.entryPrice
                      : tick.price < trade.entryPrice;
                  if (win) {
                    await applyLedger(
                      userId,
                      trade.quantity * BINARY_WIN_PAYOUT_MULTIPLIER,
                      "binary_settle_win",
                      trade.id
                    );
                  } else {
                    await applyLedger(userId, 0, "binary_settle_loss", trade.id);
                  }
                  const acc = getAccountForWallet(userId, "live");
                  acc.setBalance(await getWalletBalance(userId));
                  const settled = acc.settleExpiredTradeRecordOnly(trade.id, tick.price);
                  if (settled) {
                    logger.info(
                      { tradeId: settled.id, symbol: settled.symbol, pnl: settled.pnl, wallet: "live" },
                      "Binary trade settled"
                    );
                  }
                } catch (e) {
                  logger.error({ e, tradeId: trade.id }, "Live binary settle failed");
                }
              })()
            );
          } else if (wallet === "bonus" && userId !== getGuestUser().id) {
            const win =
              trade.direction === "up"
                ? tick.price > trade.entryPrice
                : tick.price < trade.entryPrice;
            const settled = account.settleExpiredTradeRecordOnly(trade.id, tick.price);
            if (settled) {
              void (async () => {
                try {
                  if (win) {
                    await applyLedger(
                      userId,
                      trade.quantity * BINARY_WIN_PAYOUT_MULTIPLIER,
                      "bonus_trade_win",
                      trade.id
                    );
                  }
                  const savedB = await saveBonusBalanceToDb(userId, account.balance);
                  if (Math.abs(savedB - account.balance) > 0.01) {
                    await prepareAccountForRequest(userId, "bonus");
                  }
                } catch (e) {
                  logger.error({ e, tradeId: trade.id }, "Bonus binary settle failed");
                }
              })();
              logger.info(
                { tradeId: settled.id, symbol: settled.symbol, pnl: settled.pnl, wallet: "bonus" },
                "Binary trade settled"
              );
            }
          } else {
            const settled = account.settleExpiredTrade(trade.id, tick.price);
            if (settled) {
              if (wallet === "demo" && userId !== getGuestUser().id) {
                void (async () => {
                  try {
                    const savedDemo = await saveDemoBalanceToDb(userId, account.balance);
                    if (Math.abs(savedDemo - account.balance) > 0.01) {
                      await prepareAccountForRequest(userId, "demo");
                    }
                  } catch {
                    /* ignore */
                  }
                })();
              }
              logger.info(
                { tradeId: settled.id, symbol: settled.symbol, pnl: settled.pnl, wallet },
                "Binary trade settled"
              );
            }
          }
        }
      });
      await Promise.all(liveTasks);
    } catch (e) {
      logger.error({ e }, "Binary auto-settle tick failed");
    } finally {
      settlingTrades = false;
    }
  })().catch((e) => {
    logger.error({ e }, "Binary auto-settle loop unhandled");
    settlingTrades = false;
  });
}, 1000);

app.get("/api/wallet/transactions", (req, res) => {
  void (async () => {
    const user = await requireSession(req.headers.authorization);
    const rows = await listTransactionsForUser(user.id, 200);
    return res.json({ transactions: rows });
  })().catch((error) => {
    if (error instanceof Error && error.message === "Unauthorized") {
      return res.status(401).json({ message: "Unauthorized" });
    }
    logger.error({ error }, "wallet transactions");
    res.status(500).json({ message: "Failed to list transactions" });
  });
});

/**
 * Static + SPA AFTER all `/api` routes (Express 5: `express.static` before routes can prevent API handlers from running → 500 HTML).
 * Still skip `/api` in static if an unknown path falls through.
 */
if (!useUnifiedDevPort && fs.existsSync(frontendDist)) {
  const staticMw = express.static(frontendDist);
  app.use((req, res, next) => {
    if (req.path.startsWith("/api")) {
      return next();
    }
    staticMw(req, res, next);
  });
  app.use((req, res, next) => {
    if (req.path.startsWith("/api") || req.method !== "GET") {
      return next();
    }
    const adminHtml = path.join(frontendDist, "admin.html");
    if ((req.path === "/admin" || req.path === "/admin.html") && fs.existsSync(adminHtml)) {
      return res.sendFile(adminHtml, (err) => {
        if (err) {
          logger.error({ err, path: adminHtml }, "sendFile admin.html failed (check permissions / path)");
          next(err);
        }
      });
    }
    const indexHtml = path.join(frontendDist, "index.html");
    return res.sendFile(indexHtml, (err) => {
      if (err) {
        logger.error({ err, path: indexHtml }, "sendFile index.html failed (check permissions / path)");
        next(err);
      }
    });
  });
}

/** Log real cause of HTML/500 (shows in `pm2 logs` when sendFile or middleware fails). */
app.use((err: unknown, req: express.Request, res: express.Response, next: express.NextFunction) => {
  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;
  logger.error({ err: message, stack, path: req.path, method: req.method }, "express unhandled error");
  if (res.headersSent) {
    return next(err);
  }
  if (req.path.startsWith("/api")) {
    return res.status(500).json({ message: "Internal server error", error: env.NODE_ENV === "development" ? message : undefined });
  }
  res.status(500).type("html").send("<pre>Internal Server Error</pre>");
});

async function attachViteDevMiddleware(): Promise<void> {
  if (!useUnifiedDevPort) {
    return;
  }
  const frontendRoot = path.join(projectRoot, "frontend");
  const { createServer: createViteServer } = await import("vite");
  const vite = await createViteServer({
    root: frontendRoot,
    /**
     * After `tsx watch` restarts this process, pre-bundled dep hashes change. Without a fresh
     * optimize, the browser can keep requesting `echarts.js?v=…` and get `504 Outdated Optimize Dep`.
     */
    optimizeDeps: {
      /** Match `frontend/vite.config.ts` — stale echarts hashes caused 504 after switching to lightweight-charts. */
      include: ["lightweight-charts"],
      force: true
    },
    server: {
      middlewareMode: true,
      /**
       * Override `vite.config.ts` `server.port` (5173). If we only set `hmr.server`, the merged
       * config still advertises port 5173 to the client → WS fails when the browser uses PORT.
       */
      port: env.PORT,
      strictPort: false,
      hmr: {
        server,
        port: env.PORT,
        clientPort: env.PORT
      }
    },
    appType: "spa"
  });
  viteDevServer = vite;
  app.use(vite.middlewares);
  logger.info({ port: env.PORT }, "Vite dev middleware — open frontend on same port");
}

async function sendTradingWsSnapshot(socket: WebSocket, req: IncomingMessage) {
  const markets = forexFeed.snapshot();
  const rawUrl = req.url ?? "/ws";
  try {
    const u = new URL(rawUrl, "http://127.0.0.1");
    const qpToken = u.searchParams.get("token")?.trim();
    const wRaw = u.searchParams.get("wallet")?.trim().toLowerCase();
    const qpWallet: "demo" | "live" | "bonus" =
      wRaw === "live" ? "live" : wRaw === "bonus" ? "bonus" : "demo";
    if (qpToken) {
      const user = await getUserFromToken(qpToken);
      if (user) {
        await prepareAccountForRequest(user.id, qpWallet);
        const account = getAccountForWallet(user.id, qpWallet);
        await alignIdleBonusAccountCashWithDb(user.id, qpWallet, account);
        socket.send(
          JSON.stringify({
            type: "snapshot",
            data: {
              markets,
              account: account.snapshot(markets),
              trades: account.listTrades(),
              wallet: qpWallet
            }
          })
        );
        return;
      }
    }
  } catch (e) {
    logger.warn({ e }, "WS snapshot: token/wallet handling failed");
  }

  /** Anonymous: market feed only — demo/live account requires login (no guest betting). */
  socket.send(
    JSON.stringify({
      type: "snapshot",
      data: { markets }
    })
  );
}

wsServer.on("connection", (socket, req) => {
  void sendTradingWsSnapshot(socket, req);
});

export async function startServer(): Promise<http.Server> {
  await attachViteDevMiddleware();
  /** After Vite’s `upgrade` listener so HMR (`/?token=…`) is handled first; we only take `/ws`. */
  if (!tradingWsUpgradeListenerAttached) {
    tradingWsUpgradeListenerAttached = true;
    server.on("upgrade", (req, socket, head) => {
      if (pathOnlyFromUrl(req.url) !== "/ws") {
        return;
      }
      wsServer.handleUpgrade(req, socket, head, (ws) => {
        wsServer.emit("connection", ws, req);
      });
    });
  }
  return new Promise((resolve, reject) => {
    const onListenError = (err: NodeJS.ErrnoException) => {
      server.off("error", onListenError);
      if (err.code === "EADDRINUSE") {
        logger.error(
          { port: env.PORT },
          `Port ${env.PORT} is already in use. Close the other \`npm run dev\`, XAMPP/Apache on that port, or set PORT=3001 in .env`
        );
      }
      reject(err);
    };
    server.once("error", onListenError);
    server.listen(env.PORT, () => {
      server.off("error", onListenError);
      const apkPath = resolveAndroidApkPath();
      if (apkPath) {
        logger.info({ apkPath }, "Android APK download: file found (GET /api/system/android-apk)");
      } else {
        logger.warn(
          "Android APK missing — Download APK will fail until releases/Iqfxpro.apk or APK_FILE_PATH is set (see GET /api/health apkReady)"
        );
      }
      logger.info(
        {
          port: env.PORT,
          unified: useUnifiedDevPort,
          symbols: FOREX_SYMBOLS
        },
        useUnifiedDevPort
          ? `App + API → http://localhost:${env.PORT}`
          : "Trading backend listening"
      );
      void initAppDb()
        .then(async () => {
          const db = getDatabaseInfo();
          logger.info(db, "User/wallet storage — registrations persist here (open this DB in phpMyAdmin / Heidi)");
          if (db.kind === "sqlite" && env.NODE_ENV === "production") {
            logger.warn(
              "MYSQL_DATABASE / USE_MYSQL not configured — users are saved only to SQLite (data/app.db). Set USE_MYSQL=1 or MYSQL_DATABASE=tradeing in .env and restart."
            );
          }
          /**
           * OHLC seed uses HTTP APIs only — not the live quote feed. `FOREX_SIMULATED_ONLY` must NOT skip this:
           * otherwise production VPS often has empty `chart_candles` until many bucket rollovers.
           */
          if (env.TRADERMADE_KEY?.trim()) {
            await seedChartCandlesFromTraderMadeIfSparse(env.TRADERMADE_KEY.trim());
          }
          if (env.ALPHA_VANTAGE_API_KEY?.trim()) {
            await seedChartCandlesFromAlphaVantageIfSparse(env.ALPHA_VANTAGE_API_KEY.trim());
          }
        })
        .catch((e) => logger.warn({ e }, "chart_candles external seed skipped"));
      resolve(server);
    });
  });
}

export async function stopServer() {
  forexFeed.stop();
  wsServer.close();
  if (viteDevServer) {
    await viteDevServer.close().catch(() => {});
    viteDevServer = null;
  }
  server.close();
}
