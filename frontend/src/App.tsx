import {
  type Dispatch,
  type SetStateAction,
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import {
  buildCandles,
  candleBucketStartMs,
  candlePeriodEndMs,
  clampChartCandleBar,
  extendClosedCandlesToNow,
  fillCandleTimeGaps,
  mergeDbClosedWithLiveCandles,
  overlayLivePriceOnFormingCandle,
  type CandlePoint
} from "./chartCandles";
import { CHART_ZOOM_STEP_COUNT, defaultZoomIndexForTimeframe } from "./chartBarSpacing";
import { lastTickMove } from "./tickDirection";
import {
  CHART_GRAPH_OPTIONS,
  LightweightTradingChart,
  type ChartGraphType,
  type ChartTradeEntryLine,
  type ChartTradeMarker
} from "./LightweightTradingChart";
import {
  AccountSnapshot,
  AuthUser,
  TIMEFRAME_OPTIONS,
  type ChartTimeframeSec,
  coerceTradeTimeframeSec,
  addDemoFunds,
  createDemoOrder,
  createLiveOrder,
  loadAccount,
  loadMarketCandles,
  loadMarkets,
  loadMarketsHistory,
  loadSession,
  loadTrades,
  loadWalletTransactions,
  loginUser,
  MarketTick,
  registerUser,
  Trade,
  type WalletLedgerRow
} from "./api";
import { isXauIstWeeklyLockWindow, isXauUsdSymbol, shouldShowXauMarketLock } from "./xauChartLock";
import { getBackendWsUrl } from "./backendOrigin";
import { clearCachesAfterRegistration } from "./clearRegistrationCache";
import { shouldOpenDepositScreenFromUrl } from "./depositStorage";
import DepositPage from "./DepositPage";
import LandingPage from "./LandingPage";
import SplashScreen from "./SplashScreen";
import WithdrawalPage from "./WithdrawalPage";
import InvestmentPage from "./InvestmentPage";
import ReferralPage from "./ReferralPage";
import AboutPage from "./AboutPage";
import HelpTicketPage from "./HelpTicketPage";
import { APP_NAME, APK_DOWNLOAD_URL, SESSION_STORAGE_KEY, USER_ACCOUNT_WALLET_STORAGE_KEY } from "./appBrand";
import { PHONE_COUNTRY_OPTIONS } from "./phoneCountryCodes";
import { BrandLogo } from "./BrandLogo";
import GlobalRefreshButton from "./GlobalRefreshButton";
import { DEFAULT_DEMO_BALANCE_INR, formatInr } from "./fundsConfig";
import {
  DockIconDeposit,
  DockIconMarkets,
  DockIconReferral,
  DockIconTradeBars,
  DockIconWithdraw,
  DrawerIconAbout,
  DrawerIconDeposit,
  DrawerIconDownload,
  DrawerIconHelp,
  DrawerIconHistory,
  DrawerIconInvestment,
  DrawerIconMarkets,
  DrawerIconPromotion,
  DrawerIconRefresh,
  DrawerIconTrading,
  DrawerIconWalletActivity,
  DrawerIconWithdraw
} from "./MobileDockIcons";

/** Logged-in session only — guest / no-login demo trading is disabled (server + UI). */
type SessionState = {
  mode: "user";
  token: string;
  user: AuthUser;
};

function formatAuthUserContact(u: AuthUser): string {
  if (u.phoneCountryCode && u.phoneLocal) {
    return `+${u.phoneCountryCode} ${u.phoneLocal}`;
  }
  const em = u.email ?? "";
  if (em && !em.endsWith("@m.updownfx.local")) {
    return em;
  }
  return `User ID ${u.id}`;
}

type AuthView = "login" | "register";

type PublicScreen = "landing" | "auth" | "about";

type DashboardSection = "trading" | "deposit" | "withdrawal" | "investment" | "referral" | "about" | "help";

const SPLASH_MS = 2000;

/** Fallback until /api/markets loads (matches server FOREX_SYMBOLS). */
const FOREX_SYMBOLS_DEFAULT = [
  "EURUSD",
  "GBPUSD",
  "USDJPY",
  "USDCHF",
  "AUDUSD",
  "USDCAD",
  "NZDUSD",
  "EURJPY",
  "GBPJPY",
  "EURGBP",
  "AUDJPY",
  "EURCHF",
  "GBPCAD",
  "AUDNZD",
  "USDSGD",
  "USDSEK",
  "USDNOK",
  "USDTRY",
  "USDMXN",
  "USDZAR",
  "XAUUSD"
] as const;

/** Per-symbol DB+memory merge; ~2 ticks/s → enough buckets for long TFs (e.g. 5m). */
const CHART_HISTORY_TICKS = 35_000;
/** Closed bars from `chart_candles` — larger window after login so chart isn’t empty. */
const CHART_DB_CANDLES_LIMIT = 1500;

/** v2: default + persist candlestick as primary chart (ignore legacy line/area from old key). */
const CHART_GRAPH_TYPE_STORAGE_KEY = "tradeing.chartGraphType.v2";
const CHART_GRAPH_TYPE_LEGACY_KEY = "tradeing.chartGraphType";

const FX_BASE_ICON: Record<string, string> = {
  XAU: "Au",
  EUR: "€",
  GBP: "£",
  USD: "$",
  JPY: "¥",
  CHF: "Fr",
  AUD: "A$",
  CAD: "C$",
  NZD: "NZ$",
  SEK: "kr",
  NOK: "kr",
  TRY: "₺",
  MXN: "MX$",
  ZAR: "R",
  SGD: "S$"
};

function formatForexPair(sym: string) {
  return /^[A-Z]{6}$/.test(sym) ? `${sym.slice(0, 3)}/${sym.slice(3)}` : sym;
}

function formatFxPrice(_sym: string, p: number) {
  if (p >= 50) return p.toFixed(3);
  if (p >= 5) return p.toFixed(4);
  return p.toFixed(5);
}

function getAssetIcon(sym: string) {
  return FX_BASE_ICON[sym.slice(0, 3)] ?? sym.slice(0, 2);
}

function getAssetName(sym: string, pairNames: Record<string, string>) {
  return pairNames[sym] ?? formatForexPair(sym);
}

function tfLabel(sec: number): string {
  const o = TIMEFRAME_OPTIONS.find((t) => t.value === sec);
  return o?.label ?? `${sec}s`;
}

/** UI label: Up = buy, Down = sell (matches API direction / legacy side). */
function formatTradeDirectionLabel(direction?: string | null, side?: string | null): string {
  const d = String(direction ?? "").toLowerCase();
  if (d === "up") return "Up";
  if (d === "down") return "Down";
  const s = String(side ?? "").toLowerCase();
  if (s === "buy") return "Up";
  if (s === "sell") return "Down";
  return String(direction ?? side ?? "—");
}

/** One letter on chart markers (U / D). */
function formatTradeDirectionShort(direction?: string | null, side?: string | null): string {
  const full = formatTradeDirectionLabel(direction, side);
  if (full === "Up") return "U";
  if (full === "Down") return "D";
  return full.slice(0, 1).toUpperCase();
}

/** MM:SS until expiry (uses live Date.now — parent should re-render every second). */
function countdownToExpiry(expiryAt: number | undefined): string {
  if (expiryAt == null) return "—";
  const s = Math.max(0, Math.ceil((expiryAt - Date.now()) / 1000));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

/**
 * Binary settle: `pnl` from API is profit-only on win (e.g. 0.8× stake with 1.8× payout), full −stake on loss.
 * Show user-facing total: win → profit + stake (full payout); loss → pnl (already −stake).
 */
function formatBinarySettledAmountDisplay(trade: Trade, fmt: (n: number) => string): string {
  if (trade.status !== "closed" || trade.pnl == null) return "—";
  const isBinary = trade.direction === "up" || trade.direction === "down";
  if (!isBinary) {
    const p = trade.pnl;
    return p >= 0 ? `+${fmt(p)}` : fmt(p);
  }
  const q = Number(trade.quantity);
  const p = trade.pnl;
  if (!Number.isFinite(q)) {
    return p >= 0 ? `+${fmt(p)}` : fmt(p);
  }
  if (p >= 0) {
    return `+${fmt(Number((p + q).toFixed(2)))}`;
  }
  return fmt(p);
}

/** Live ledger: binary win line is already full payout; loss line is ₹ 0 (stake debited at open). */
function walletLedgerAmountPrimary(tx: WalletLedgerRow): string {
  if (tx.txn_type === "binary_settle_loss") {
    return "—";
  }
  const a = Number(tx.amount);
  if (a >= 0) return `+${formatInr(a)}`;
  return formatInr(a);
}

function walletLedgerAmountHint(tx: WalletLedgerRow): string | null {
  if (tx.txn_type === "binary_settle_win") {
    return "Total credited (trading amount + profit)";
  }
  if (tx.txn_type === "binary_settle_loss") {
    return "Loss — amount was debited when the order opened";
  }
  return null;
}

function formatTradeCloseCell(trade: Trade): string {
  if (trade.status !== "closed") return "—";
  if (typeof trade.closePrice === "number" && Number.isFinite(trade.closePrice)) {
    return formatFxPrice(trade.symbol, trade.closePrice);
  }
  return "—";
}

export default function App() {
  const [markets, setMarkets] = useState<MarketTick[]>([]);
  const [account, setAccount] = useState<AccountSnapshot | null>(null);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [history, setHistory] = useState<Record<string, MarketTick[]>>({});
  /** Server `chart_candles` (closed bars) keyed `${symbol}:${timeframeSec}` — merged with WebSocket LivePrice ticks. */
  const [dbClosedCandles, setDbClosedCandles] = useState<Record<string, CandlePoint[]>>({});
  const [status, setStatus] = useState("Connecting...");
  const [symbol, setSymbol] = useState("XAUUSD");
  const [pairNames, setPairNames] = useState<Record<string, string>>({});
  const [forexSymbolList, setForexSymbolList] = useState<string[]>([...FOREX_SYMBOLS_DEFAULT]);
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [quantity, setQuantity] = useState("1");
  /** Chart + trade candle period: 5s … 5m (see TIMEFRAME_OPTIONS). */
  /** Default chart TF: 5s (see TIMEFRAME_OPTIONS). Binary default stays 5s unless user syncs TFs. */
  const [chartTimeframe, setChartTimeframe] = useState<ChartTimeframeSec>(() => coerceTradeTimeframeSec(5));
  const [binaryTimeframe, setBinaryTimeframe] = useState<ChartTimeframeSec>(() => coerceTradeTimeframeSec(5));
  const [mobileTfMenuOpen, setMobileTfMenuOpen] = useState(false);
  const [mobileChartTypeMenuOpen, setMobileChartTypeMenuOpen] = useState(false);
  const [chartGraphType, setChartGraphType] = useState<ChartGraphType>(() => {
    try {
      const v = window.localStorage.getItem(CHART_GRAPH_TYPE_STORAGE_KEY);
      if (v === "candles" || v === "line" || v === "area") {
        return v;
      }
      const legacy = window.localStorage.getItem(CHART_GRAPH_TYPE_LEGACY_KEY);
      if (legacy === "candles") {
        return "candles";
      }
    } catch {
      /* ignore */
    }
    return "candles";
  });

  const onChartTimeframeChange = (sec: number) => {
    const tf = coerceTradeTimeframeSec(sec);
    setChartTimeframe(tf);
    setBinaryTimeframe(tf);
  };
  const [message, setMessage] = useState("");
  const [authView, setAuthView] = useState<AuthView>("login");
  const [session, setSession] = useState<SessionState | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [authMessage, setAuthMessage] = useState("");
  const [booting, setBooting] = useState(true);
  const [splashReady, setSplashReady] = useState(false);
  const [publicScreen, setPublicScreen] = useState<PublicScreen>("landing");
  const [loginForm, setLoginForm] = useState({ countryCode: "91", phone: "", password: "" });
  const [registerForm, setRegisterForm] = useState({
    name: "",
    countryCode: "91",
    phone: "",
    password: "",
    referralCode: ""
  });
  const [dashboardSection, setDashboardSection] = useState<DashboardSection>("trading");
  const [assetPickerOpen, setAssetPickerOpen] = useState(false);
  const [mainNavOpen, setMainNavOpen] = useState(false);
  const [isPhone, setIsPhone] = useState(false);
  /** XAU/USD: match chart — no new trades Sat–Sun IST. */
  const xauWeekendOrdersBlocked = isXauUsdSymbol(symbol) && isXauIstWeeklyLockWindow();
  const [mobileSide, setMobileSide] = useState<"buy" | "sell">("buy");
  const [mobileMultiplier] = useState(1); /* multiplier UI hidden — stake = amount */
  const [walletActivityOpen, setWalletActivityOpen] = useState(false);
  const [walletTxs, setWalletTxs] = useState<WalletLedgerRow[]>([]);
  const [walletTxLoading, setWalletTxLoading] = useState(false);
  /** Logged-in: whether trading UI uses virtual demo wallet or live wallet. */
  const [userAccountWallet, setUserAccountWallet] = useState<"demo" | "live">(() => {
    try {
      const v = window.localStorage.getItem(USER_ACCOUNT_WALLET_STORAGE_KEY);
      if (v === "demo" || v === "live") return v;
    } catch {
      /* ignore */
    }
    return "demo";
  });
  const [timerTick, setTimerTick] = useState(0);
  /** Logged-in: both wallets’ balances for header (always load demo + live so DB migration applies). */
  const [dualBalances, setDualBalances] = useState<{ demo: number | null; live: number | null }>({
    demo: null,
    live: null
  });
  const symbolRef = useRef(symbol);
  symbolRef.current = symbol;
  const chartTimeframeRef = useRef(chartTimeframe);
  chartTimeframeRef.current = chartTimeframe;
  /** Brief “Up · Created” / “Down · Created” on direction buttons after order success. */
  const [binaryCreatedFlash, setBinaryCreatedFlash] = useState<null | "up" | "down">(null);
  const binaryCreatedTimerRef = useRef<number | null>(null);
  /** Ignore stale `refresh()` results so an older in-flight request cannot overwrite trades after a new order. */
  const refreshSeqRef = useRef(0);
  /** While true, live prices come from WebSocket — avoid polling `/api/markets` every 10s. */
  const wsMarketLiveRef = useRef(false);
  /** Count 10s ticks for slower HTTP sync (account / trades / chart history) when WS is up. */
  const wsHttpSyncCounterRef = useRef(0);
  const mobileTfWrapRef = useRef<HTMLDivElement>(null);
  /** Scroll target for “clock” control in mobile trade bar (expiry / open trades). */
  const mobileBinaryExpiryRef = useRef<HTMLDivElement>(null);
  const mobileChartTypeWrapRef = useRef<HTMLDivElement>(null);
  const tradingPageWalletWrapRef = useRef<HTMLDivElement>(null);
  const [tradingPageWalletMenuOpen, setTradingPageWalletMenuOpen] = useState(false);
  const [demoTopUpBusy, setDemoTopUpBusy] = useState(false);
  const [demoFundsSuccessPopup, setDemoFundsSuccessPopup] = useState<null | { added: number; balance: number }>(null);
  const demoFundsPopupTimeoutRef = useRef<number | null>(null);
  /** After binary timeout — win/loss popup for demo and live (same modal shell). */
  const [binarySettlePopup, setBinarySettlePopup] = useState<
    null | { text: string; amountHighlight: string; pnl: number }
  >(null);
  const binarySettlePopupTimeoutRef = useRef<number | null>(null);
  const prevOpenBinaryIdsRef = useRef<Set<string>>(new Set());
  const binaryTradesSnapInitializedRef = useRef(false);

  /** Drop removed TFs (e.g. old 1s) so countdown + `/api/markets/candles` stay in sync. */
  useEffect(() => {
    setChartTimeframe((t) => coerceTradeTimeframeSec(t));
    setBinaryTimeframe((t) => coerceTradeTimeframeSec(t));
  }, []);

  const dismissDemoFundsSuccessPopup = useCallback(() => {
    if (demoFundsPopupTimeoutRef.current != null) {
      window.clearTimeout(demoFundsPopupTimeoutRef.current);
      demoFundsPopupTimeoutRef.current = null;
    }
    setDemoFundsSuccessPopup(null);
  }, []);

  const dismissBinarySettlePopup = useCallback(() => {
    if (binarySettlePopupTimeoutRef.current != null) {
      window.clearTimeout(binarySettlePopupTimeoutRef.current);
      binarySettlePopupTimeoutRef.current = null;
    }
    setBinarySettlePopup(null);
  }, []);

  useEffect(() => {
    return () => {
      if (demoFundsPopupTimeoutRef.current != null) {
        window.clearTimeout(demoFundsPopupTimeoutRef.current);
      }
      if (binaryCreatedTimerRef.current != null) {
        window.clearTimeout(binaryCreatedTimerRef.current);
      }
      if (binarySettlePopupTimeoutRef.current != null) {
        window.clearTimeout(binarySettlePopupTimeoutRef.current);
      }
    };
  }, []);

  const flashBinaryCreated = useCallback((direction: "up" | "down") => {
    if (binaryCreatedTimerRef.current != null) {
      window.clearTimeout(binaryCreatedTimerRef.current);
    }
    setBinaryCreatedFlash(direction);
    binaryCreatedTimerRef.current = window.setTimeout(() => {
      setBinaryCreatedFlash(null);
      binaryCreatedTimerRef.current = null;
    }, 4500);
  }, []);

  useEffect(() => {
    if (!demoFundsSuccessPopup) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismissDemoFundsSuccessPopup();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [demoFundsSuccessPopup, dismissDemoFundsSuccessPopup]);

  useEffect(() => {
    if (!binarySettlePopup) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismissBinarySettlePopup();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [binarySettlePopup, dismissBinarySettlePopup]);

  useEffect(() => {
    if (!session) return;
    const id = window.setInterval(() => setTimerTick((n) => n + 1), 1000);
    const syncNow = () => {
      if (document.visibilityState === "visible") {
        setTimerTick((n) => n + 1);
      }
    };
    document.addEventListener("visibilitychange", syncNow);
    window.addEventListener("pageshow", syncNow);
    window.addEventListener("focus", syncNow);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", syncNow);
      window.removeEventListener("pageshow", syncNow);
      window.removeEventListener("focus", syncNow);
    };
  }, [session]);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    const apply = () => setIsPhone(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    if (!assetPickerOpen && !mainNavOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setAssetPickerOpen(false);
        setMainNavOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [assetPickerOpen, mainNavOpen]);

  useEffect(() => {
    if (assetPickerOpen) {
      setMobileTfMenuOpen(false);
      setMobileChartTypeMenuOpen(false);
    }
  }, [assetPickerOpen]);

  useEffect(() => {
    try {
      window.localStorage.setItem(CHART_GRAPH_TYPE_STORAGE_KEY, chartGraphType);
    } catch {
      /* ignore */
    }
  }, [chartGraphType]);

  useEffect(() => {
    if (!mobileTfMenuOpen) {
      return;
    }
    const onDown = (e: MouseEvent) => {
      if (mobileTfWrapRef.current?.contains(e.target as Node)) {
        return;
      }
      setMobileTfMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMobileTfMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [mobileTfMenuOpen]);

  useEffect(() => {
    if (!mobileChartTypeMenuOpen) {
      return;
    }
    const onDown = (e: MouseEvent) => {
      if (mobileChartTypeWrapRef.current?.contains(e.target as Node)) {
        return;
      }
      setMobileChartTypeMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMobileChartTypeMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [mobileChartTypeMenuOpen]);

  useEffect(() => {
    if (!tradingPageWalletMenuOpen) {
      return;
    }
    const onDown = (e: MouseEvent) => {
      if (tradingPageWalletWrapRef.current?.contains(e.target as Node)) {
        return;
      }
      setTradingPageWalletMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setTradingPageWalletMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [tradingPageWalletMenuOpen]);

  useEffect(() => {
    if (!mainNavOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mainNavOpen]);

  useEffect(() => {
    const id = window.setTimeout(() => setSplashReady(true), SPLASH_MS);
    return () => window.clearTimeout(id);
  }, []);

  /** Wallet in-app browser: ?depositAmount= or #depositAmount= — open Deposit tab. */
  useEffect(() => {
    if (!session) return;
    try {
      if (shouldOpenDepositScreenFromUrl()) {
        setDashboardSection("deposit");
      }
    } catch {
      /* ignore */
    }
  }, [session]);

  const sessionToken = session?.token;
  const accountWallet: "demo" | "live" = session ? userAccountWallet : "demo";
  /** Re-run chart history when user logs in (deps were only booting+symbol before). */
  const chartSessionKey = session == null ? "" : `u:${session.user.id}`;

  useEffect(() => {
    const saved = window.localStorage.getItem(SESSION_STORAGE_KEY);
    if (!saved) {
      setBooting(false);
      return;
    }

    void (async () => {
      try {
        const parsed = JSON.parse(saved) as { mode?: string; token?: string };
        if (parsed.mode !== "user" || !parsed.token) {
          window.localStorage.removeItem(SESSION_STORAGE_KEY);
          return;
        }

        const me = await loadSession(parsed.token);
        setSession({
          mode: "user",
          token: parsed.token,
          user: me.user
        });
      } catch {
        window.localStorage.removeItem(SESSION_STORAGE_KEY);
      } finally {
        setBooting(false);
      }
    })();
  }, []);

  /**
   * Referral invite: `/?ref=CODE` → after splash + boot, open **Register** directly with code prefilled.
   * Skip when already logged in (`session != null`).
   */
  useEffect(() => {
    if (!splashReady || booting || session != null) return;
    const ref = new URLSearchParams(window.location.search).get("ref");
    if (!ref?.trim()) return;
    const code = ref.trim().toUpperCase();
    setRegisterForm((c) => ({ ...c, referralCode: code }));
    setAuthView("register");
    setPublicScreen("auth");
  }, [splashReady, booting, session]);

  useEffect(() => {
    if (booting) {
      return;
    }

    if (!session) {
      window.localStorage.removeItem(SESSION_STORAGE_KEY);
      return;
    }

    window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  }, [booting, session]);

  /** Deep history per symbol; only after we have a session so login/guest triggers a fresh load. */
  useEffect(() => {
    if (booting || !chartSessionKey) {
      return;
    }
    let cancelled = false;
    const loadChartHistory = () => {
      const sym = symbolRef.current;
      void loadMarketsHistory(sym, CHART_HISTORY_TICKS)
        .then(({ ticks: historyTicks }) => {
          if (cancelled || historyTicks.length === 0) {
            return;
          }
          setHistory((current) => mergeHistoryTicks(current, historyTicks));
        })
        .catch(() => undefined);
    };
    loadChartHistory();
    const interval = window.setInterval(loadChartHistory, 45_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [booting, symbol, chartSessionKey]);

  /** After screen lock / tab background, timers are throttled — refresh ticks + DB candles when the user returns. */
  useEffect(() => {
    if (booting || !chartSessionKey) {
      return;
    }
    let debounce: number | null = null;
    const run = () => {
      if (document.visibilityState !== "visible") {
        return;
      }
      const sym = symbolRef.current;
      const tf = chartTimeframeRef.current;
      void loadMarketsHistory(sym, CHART_HISTORY_TICKS)
        .then(({ ticks: historyTicks }) => {
          if (historyTicks.length > 0) {
            setHistory((current) => mergeHistoryTicks(current, historyTicks));
          }
        })
        .catch(() => undefined);
      const k = `${sym}:${tf}`;
      void loadMarketCandles(sym, tf, CHART_DB_CANDLES_LIMIT)
        .then((rows) => {
          setDbClosedCandles((prev) => ({ ...prev, [k]: rows }));
        })
        .catch(() => undefined);
    };
    const schedule = () => {
      if (debounce != null) {
        window.clearTimeout(debounce);
      }
      debounce = window.setTimeout(() => {
        debounce = null;
        run();
      }, 200);
    };
    const onVis = () => schedule();
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pageshow", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pageshow", onVis);
      if (debounce != null) {
        window.clearTimeout(debounce);
      }
    };
  }, [booting, chartSessionKey]);

  /** Bootstrap closed OHLC from DB — retries after login/register so `chart_candles` isn’t missed on slow networks. */
  useEffect(() => {
    if (booting || !chartSessionKey) {
      return;
    }
    let cancelled = false;
    const sym = symbol;
    const tf = chartTimeframe;
    const k = `${sym}:${tf}`;
    const pull = () => {
      void loadMarketCandles(sym, tf, CHART_DB_CANDLES_LIMIT)
        .then((rows) => {
          if (!cancelled) {
            setDbClosedCandles((prev) => ({ ...prev, [k]: rows }));
          }
        })
        .catch(() => {
          /** Don’t wipe existing rows on transient failure — avoids “empty” chart flash. */
        });
    };
    pull();
    const t1 = window.setTimeout(pull, 900);
    const t2 = window.setTimeout(pull, 2800);
    const t3 = window.setTimeout(pull, 6500);
    const interval = window.setInterval(pull, 55_000);
    return () => {
      cancelled = true;
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
      window.clearInterval(interval);
    };
  }, [booting, symbol, chartTimeframe, chartSessionKey]);

  const refresh = async (walletOverride?: "demo" | "live", options?: { skipMarketTicks?: boolean }) => {
    const mySeq = ++refreshSeqRef.current;
    const wallet = walletOverride ?? accountWallet;
    const skipMarketTicks = Boolean(options?.skipMarketTicks);
    try {
      if (!skipMarketTicks) {
        const marketData = await loadMarkets();
        if (mySeq !== refreshSeqRef.current) {
          return;
        }

        setMarkets(marketData.ticks);

        if (marketData.symbols?.length) {
          setForexSymbolList([...marketData.symbols]);
        }
        if (marketData.pairs?.length) {
          setPairNames(Object.fromEntries(marketData.pairs.map((p) => [p.symbol, p.name])));
        }
        setHistory((current) => mergeSnapshot(current, marketData.ticks));
      }

      if (!sessionToken) {
        setAccount(null);
        setTrades([]);
        setDualBalances({ demo: null, live: null });
      } else {
        const [demoAcc, liveAcc, tradeData] = await Promise.all([
          loadAccount(sessionToken, "demo"),
          loadAccount(sessionToken, "live"),
          loadTrades(sessionToken, wallet)
        ]);
        if (mySeq !== refreshSeqRef.current) {
          return;
        }
        const accountData = wallet === "demo" ? demoAcc : liveAcc;
        setAccount(accountData);
        setTrades(tradeData.trades);
        setDualBalances({
          demo: demoAcc.balance,
          live: liveAcc.balance
        });
      }

      if (mySeq !== refreshSeqRef.current) {
        return;
      }
      try {
        const { ticks: hist } = await loadMarketsHistory(symbolRef.current, CHART_HISTORY_TICKS);
        if (mySeq !== refreshSeqRef.current) {
          return;
        }
        if (hist.length > 0) {
          setHistory((current) => mergeHistoryTicks(current, hist));
        }
      } catch {
        // chart still updates from WS
      }

      const ck = `${symbolRef.current}:${chartTimeframeRef.current}`;
      try {
        const rows = await loadMarketCandles(symbolRef.current, chartTimeframeRef.current, CHART_DB_CANDLES_LIMIT);
        if (mySeq !== refreshSeqRef.current) {
          return;
        }
        setDbClosedCandles((prev) => ({ ...prev, [ck]: rows }));
      } catch {
        /* optional */
      }
    } catch (e) {
      if (mySeq !== refreshSeqRef.current) {
        return;
      }
      throw e;
    }
  };

  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  const handleGlobalRefresh = useCallback(() => {
    void refreshRef.current().catch(() => undefined);
    setMessage("Data refreshed.");
  }, []);

  const handleAddDemoFunds = useCallback(async () => {
    if (!session?.token) {
      return;
    }
    setDemoTopUpBusy(true);
    setMessage("");
    try {
      const out = await addDemoFunds(session.token);
      await refreshRef.current(accountWallet, { skipMarketTicks: true });
      if (demoFundsPopupTimeoutRef.current != null) {
        window.clearTimeout(demoFundsPopupTimeoutRef.current);
      }
      setDemoFundsSuccessPopup({ added: out.added, balance: out.demo_balance });
      demoFundsPopupTimeoutRef.current = window.setTimeout(() => {
        setDemoFundsSuccessPopup(null);
        demoFundsPopupTimeoutRef.current = null;
      }, 5000);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not add demo funds.");
    } finally {
      setDemoTopUpBusy(false);
    }
  }, [session, accountWallet]);

  useEffect(() => {
    if (!walletActivityOpen || !session) {
      return;
    }
    setWalletTxLoading(true);
    void loadWalletTransactions(session.token)
      .then((r) => setWalletTxs(r.transactions))
      .catch(() => setWalletTxs([]))
      .finally(() => setWalletTxLoading(false));
  }, [walletActivityOpen, session]);

  useEffect(() => {
    void refresh().catch((error) => setMessage(error instanceof Error ? error.message : "Load failed"));

    const wsUrl = getBackendWsUrl(session ? { token: session.token, wallet: accountWallet } : undefined);

    let cancelled = false;
    const ws = new WebSocket(wsUrl);

    const onOpen = () => {
      if (cancelled) {
        ws.close();
        return;
      }
      wsMarketLiveRef.current = true;
      wsHttpSyncCounterRef.current = 0;
      setStatus("Live");
    };
    const onClose = () => {
      wsMarketLiveRef.current = false;
      wsHttpSyncCounterRef.current = 0;
      setStatus("Disconnected");
    };
    const onError = () => {
      wsMarketLiveRef.current = false;
      setStatus("Connection error");
    };
    const onMessage = (event: MessageEvent) => {
      const payload = JSON.parse(event.data as string) as
        | {
            type: "snapshot";
            data: {
              markets: MarketTick[];
              account: AccountSnapshot;
              trades?: Trade[];
            };
          }
        | { type: "tick"; data: MarketTick }
        | { type: "live_price"; data: MarketTick };

      if (payload.type === "snapshot") {
        setMarkets(payload.data.markets);
        const snapWallet = (payload.data as { wallet?: "demo" | "live" }).wallet;
        const isPersonalSnap = snapWallet === "demo" || snapWallet === "live";
        const accountSnap = payload.data.account;
        if (session != null && isPersonalSnap && accountSnap && snapWallet) {
          if (snapWallet === accountWallet) {
            setAccount(accountSnap);
            if (Array.isArray(payload.data.trades)) {
              setTrades(payload.data.trades);
            }
          }
          setDualBalances((prev) => ({
            ...prev,
            [snapWallet]: accountSnap.balance
          }));
          const otherWallet: "demo" | "live" = snapWallet === "demo" ? "live" : "demo";
          void loadAccount(session.token, otherWallet)
            .then((acc) => {
              setDualBalances((prev) => ({ ...prev, [otherWallet]: acc.balance }));
            })
            .catch(() => undefined);
        }
        setHistory((current) => mergeSnapshot(current, payload.data.markets));
        return;
      }

      if (payload.type !== "tick" && payload.type !== "live_price") {
        return;
      }

      setMarkets((current) => {
        const bySymbol = new Map(current.map((t) => [t.symbol, t]));
        bySymbol.set(payload.data.symbol, payload.data);
        return [...bySymbol.values()].sort((a, b) => a.symbol.localeCompare(b.symbol));
      });

      setHistory((current) => appendPoint(current, payload.data));
    };

    ws.addEventListener("open", onOpen);
    ws.addEventListener("close", onClose);
    ws.addEventListener("error", onError);
    ws.addEventListener("message", onMessage);

    /**
     * Disconnected: full HTTP refresh every 10s (prices + account).
     * Connected: prices from WS only; light HTTP every ~60s for balances, trades, DB chart history.
     */
    const interval = window.setInterval(() => {
      if (wsMarketLiveRef.current) {
        wsHttpSyncCounterRef.current += 1;
        if (wsHttpSyncCounterRef.current < 6) {
          return;
        }
        wsHttpSyncCounterRef.current = 0;
        void refresh(undefined, { skipMarketTicks: true }).catch(() => undefined);
        return;
      }
      void refresh().catch(() => undefined);
    }, 10_000);

    return () => {
      cancelled = true;
      wsMarketLiveRef.current = false;
      wsHttpSyncCounterRef.current = 0;
      ws.removeEventListener("open", onOpen);
      ws.removeEventListener("close", onClose);
      ws.removeEventListener("error", onError);
      ws.removeEventListener("message", onMessage);
      window.clearInterval(interval);
      /* Avoid closing while CONNECTING — React Strict Mode double-mount; `onOpen` closes stray sockets. */
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    };
  }, [session, sessionToken, accountWallet]);

  const chartSeries = history[symbol] ?? [];
  const spotTickMove = lastTickMove(chartSeries);
  const selectedTick = markets.find((tick) => tick.symbol === symbol) ?? null;
  const symbolTrades = trades.filter((trade) => trade.symbol === symbol);
  const openBinaryTrades = trades.filter(
    (t) => t.status === "open" && typeof t.expiryAt === "number"
  );

  const openBinaryPollKey = useMemo(() => {
    const rows = trades.filter((t) => t.status === "open" && typeof t.expiryAt === "number");
    if (rows.length === 0) {
      return "";
    }
    const expiries = rows.map((r) => r.expiryAt).filter((x): x is number => typeof x === "number");
    return `${rows
      .map((r) => r.id)
      .sort()
      .join(",")}|${Math.min(...expiries)}`;
  }, [trades]);

  useEffect(() => {
    binaryTradesSnapInitializedRef.current = false;
    prevOpenBinaryIdsRef.current = new Set();
    setBinarySettlePopup(null);
    if (binarySettlePopupTimeoutRef.current != null) {
      window.clearTimeout(binarySettlePopupTimeoutRef.current);
      binarySettlePopupTimeoutRef.current = null;
    }
  }, [sessionToken, accountWallet]);

  /** While any binary is open, sync trades + balance every 1s (server settles on the same cadence). */
  useEffect(() => {
    if (!sessionToken || openBinaryPollKey === "") {
      return;
    }
    const sync = () => {
      void refreshRef.current(undefined, { skipMarketTicks: true }).catch(() => undefined);
    };
    sync();
    const id = window.setInterval(sync, 1000);
    return () => window.clearInterval(id);
  }, [sessionToken, openBinaryPollKey, accountWallet]);

  useEffect(() => {
    if (!sessionToken) {
      return;
    }
    const nowOpen = new Set(
      trades
        .filter(
          (t) =>
            t.status === "open" &&
            typeof t.expiryAt === "number" &&
            (t.direction === "up" || t.direction === "down")
        )
        .map((t) => t.id)
    );
    if (!binaryTradesSnapInitializedRef.current) {
      binaryTradesSnapInitializedRef.current = true;
      prevOpenBinaryIdsRef.current = nowOpen;
      return;
    }
    const newlySettled: Trade[] = [];
    for (const id of prevOpenBinaryIdsRef.current) {
      if (nowOpen.has(id)) {
        continue;
      }
      const closed = trades.find((t) => t.id === id);
      if (
        closed?.status === "closed" &&
        typeof closed.pnl === "number" &&
        (closed.direction === "up" || closed.direction === "down")
      ) {
        newlySettled.push(closed);
      }
    }
    if (newlySettled.length > 0) {
      if (binarySettlePopupTimeoutRef.current != null) {
        window.clearTimeout(binarySettlePopupTimeoutRef.current);
      }
      const settledWithPnl = newlySettled.filter((t): t is Trade & { pnl: number } => typeof t.pnl === "number");
      let text: string;
      let amountHighlight: string;
      if (settledWithPnl.length === 1) {
        const t = settledWithPnl[0]!;
        text = `${formatForexPair(t.symbol)} · Timeout · ${t.pnl >= 0 ? "Win" : "Loss"}`;
        amountHighlight = formatBinarySettledAmountDisplay(t, formatInr);
      } else {
        const netDisplay = settledWithPnl.reduce((s, tr) => {
          const q = Number(tr.quantity);
          if (tr.pnl >= 0 && Number.isFinite(q)) return s + tr.pnl + q;
          return s + tr.pnl;
        }, 0);
        text = `${settledWithPnl.length} trades · Timeout · net`;
        amountHighlight = `${netDisplay >= 0 ? "+" : ""}${formatInr(Number(netDisplay.toFixed(2)))}`;
      }
      const totalPnl = settledWithPnl.reduce((s, tr) => s + tr.pnl, 0);
      setBinarySettlePopup({ text, amountHighlight, pnl: totalPnl });
      binarySettlePopupTimeoutRef.current = window.setTimeout(() => {
        setBinarySettlePopup(null);
        binarySettlePopupTimeoutRef.current = null;
      }, 7000);
    }
    prevOpenBinaryIdsRef.current = nowOpen;
  }, [sessionToken, trades, accountWallet]);

  const handleBinaryOrder = async (
    direction: "up" | "down",
    opts?: { stake?: number }
  ) => {
    setMessage("");
    if (!session) {
      setMessage("Log in to place trades.");
      return;
    }
    if (accountWallet !== "demo") return;
    const base = Number(quantity);
    const amount = opts?.stake ?? base;
    if (!Number.isFinite(amount) || amount <= 0) {
      setMessage("Enter a valid amount.");
      return;
    }
    if (xauWeekendOrdersBlocked) {
      setMessage("XAU/USD is closed Saturday–Sunday (IST). You cannot place orders.");
      return;
    }
    try {
      const { trade } = await createDemoOrder(
        {
          symbol,
          direction,
          amount,
          timeframe: binaryTimeframe
        },
        session.token,
        "demo"
      );
      setTrades((current) => [trade, ...current]);
      flashBinaryCreated(direction);
      setMessage(
        `${direction === "up" ? "↑ Up" : "↓ Down"} · ${formatForexPair(symbol)} · ${formatInr(amount)} — trade placed`
      );
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Order failed");
    }
  };

  const handleLiveBinaryOrder = async (
    direction: "up" | "down",
    opts?: { stake?: number }
  ) => {
    setMessage("");
    if (!session || accountWallet !== "live") return;
    const base = Number(quantity);
    const amount = opts?.stake ?? base;
    if (!Number.isFinite(amount) || amount <= 0) {
      setMessage("Enter a valid amount.");
      return;
    }
    if (xauWeekendOrdersBlocked) {
      setMessage("XAU/USD is closed Saturday–Sunday (IST). You cannot place orders.");
      return;
    }
    try {
      const { trade } = await createLiveOrder(
        {
          symbol,
          direction,
          amount,
          timeframe: binaryTimeframe
        },
        session.token
      );
      setTrades((current) => [trade, ...current]);
      flashBinaryCreated(direction);
      setMessage(
        `${direction === "up" ? "↑ Up" : "↓ Down"} · ${formatForexPair(symbol)} · ${formatInr(amount)} — trade placed`
      );
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Order failed");
    }
  };

  /** Mobile dock: large Up/Down — stake from `quantity`, timeframe `binaryTimeframe`. */
  const placeMobileBinary = (direction: "up" | "down") => {
    const base = Number(quantity);
    if (!Number.isFinite(base) || base <= 0) {
      setMessage("Enter amount.");
      return;
    }
    const stake = Math.max(1, Math.floor(base * mobileMultiplier));
    setMobileSide(direction === "up" ? "buy" : "sell");
    if (accountWallet === "live") {
      void handleLiveBinaryOrder(direction, { stake });
      return;
    }
    void handleBinaryOrder(direction, { stake });
  };

  const bumpMobileStake = (delta: number) => {
    const cur = Math.max(1, Math.floor(Number(quantity) || 0));
    setQuantity(String(Math.max(1, cur + delta)));
  };

  /**
   * Multiply current **amount field** by 2 / 3 / 5 / 10 (e.g. 1 → 5x → 5; 100 → 2x → 200).
   * Capped by wallet balance when known.
   */
  const applyStakeMultiplier = useCallback(
    (mult: number) => {
      const parsed = Number(String(quantity).trim());
      const base =
        Number.isFinite(parsed) && parsed >= 1 ? Math.max(1, Math.floor(parsed)) : 1;
      const raw = base * mult;
      const bal = accountWallet === "demo" ? dualBalances.demo : dualBalances.live;
      if (bal != null && Number.isFinite(bal) && bal > 0) {
        const cap = Math.max(1, Math.floor(bal));
        setQuantity(String(Math.min(Math.max(1, raw), cap)));
      } else {
        setQuantity(String(Math.max(1, raw)));
      }
      setMessage("");
    },
    [quantity, accountWallet, dualBalances.demo, dualBalances.live]
  );

  const handleAuth = async (event: FormEvent) => {
    event.preventDefault();
    setAuthBusy(true);
    setAuthMessage("");

    try {
      if (authView === "login") {
        const response = await loginUser({
          countryCode: loginForm.countryCode,
          phone: loginForm.phone,
          password: loginForm.password
        });
        setSession({
          mode: "user",
          token: response.token,
          user: response.user
        });
        setAuthMessage(`Welcome back, ${response.user.name}`);
        return;
      }

      const response = await registerUser({
        name: registerForm.name,
        countryCode: registerForm.countryCode,
        phone: registerForm.phone,
        password: registerForm.password,
        referralCode: registerForm.referralCode.trim() || undefined
      });
      setTrades([]);
      setAccount(null);
      await clearCachesAfterRegistration();
      setSession({
        mode: "user",
        token: response.token,
        user: response.user
      });
      const dbHint =
        response.database?.kind === "mysql"
          ? ` Data saved in MySQL database “${response.database.database ?? "?"}” (open this DB in phpMyAdmin).`
          : response.database?.kind === "sqlite"
            ? ` Data saved in SQLite file: ${response.database.file ?? "data/app.db"} (not visible in phpMyAdmin unless you import that file).`
            : "";
      setAuthMessage(
        `Account created — User ID ${response.user.id}. Log in with +${registerForm.countryCode} ${registerForm.phone} and your password.${dbHint}`
      );
    } catch (error) {
      setAuthMessage(error instanceof Error ? error.message : "Authentication failed");
    } finally {
      setAuthBusy(false);
    }
  };

  /** Demo trading only after login — open auth with hint (no guest session). */
  const openAuthForDemo = () => {
    setAuthView("login");
    setPublicScreen("auth");
    setAuthMessage("Log in or register, then use the Demo / Live toggle in the app to practice with virtual funds.");
  };

  const logout = () => {
    setSession(null);
    setDualBalances({ demo: null, live: null });
    setTrades([]);
    setAccount(null);
    setHistory({});
    setMessage("");
    setAuthMessage("");
    setPublicScreen("landing");
  };

  const apkDownloadHref = useMemo(() => {
    const u = APK_DOWNLOAD_URL.trim();
    if (/^https?:\/\//i.test(u)) return u;
    try {
      return new URL(u, window.location.origin).href;
    } catch {
      return u;
    }
  }, []);

  if (!splashReady || booting) {
    return <SplashScreen />;
  }

  if (!session) {
    if (publicScreen === "landing") {
      return (
        <LandingPage
          onTryDemo={openAuthForDemo}
          onAbout={() => setPublicScreen("about")}
          onLogin={() => {
            setAuthView("login");
            setPublicScreen("auth");
          }}
          onRegister={() => {
            setAuthView("register");
            setPublicScreen("auth");
          }}
        />
      );
    }

    if (publicScreen === "about") {
      return (
        <AboutPage
          onLogin={() => {
            setAuthView("login");
            setPublicScreen("auth");
          }}
          onRegister={() => {
            setAuthView("register");
            setPublicScreen("auth");
          }}
          onTryDemo={openAuthForDemo}
        />
      );
    }

    return (
      <AuthScreen
        authBusy={authBusy}
        authMessage={authMessage}
        authView={authView}
        account={account}
        loginForm={loginForm}
        markets={markets}
        onAuthSubmit={handleAuth}
        onBackToLanding={() => setPublicScreen("landing")}
        onNavigateToAbout={() => setPublicScreen("about")}
        onDemoAccess={openAuthForDemo}
        onLoginFormChange={setLoginForm}
        onRegisterFormChange={setRegisterForm}
        onViewChange={setAuthView}
        registerForm={registerForm}
        status={status}
      />
    );
  }

  const tradingAsDemo = accountWallet === "demo";
  /** Demo + live: stake and wallet shown in INR (same numeric units as server demo/live wallets). */
  const fmtWallet = (n: number) => formatInr(n);
  const fmtHeaderWallet = (n: number | null) => (n == null ? "—" : fmtWallet(n));

  return (
    <div
      className={`app-shell${session && isPhone ? " app-mobile-trade" : ""}${session && !isPhone ? " app-guest-desktop-dock" : ""}`}
      data-dock={session && isPhone ? "theme" : undefined}
      data-account-wallet={session && isPhone ? accountWallet : undefined}
      data-dashboard-section={session && isPhone ? dashboardSection : undefined}
    >
      {!(session && isPhone) ? (
      <header className={`app-main-nav${mainNavOpen ? " app-main-nav--drawer-open" : ""}`}>
        <div className="app-main-nav-row">
          {isPhone ? (
            <button
              type="button"
              className="app-nav-icon-btn"
              aria-label="Open menu"
              aria-expanded={mainNavOpen}
              onClick={() => setMainNavOpen(true)}
            >
              <span className="app-nav-burger" aria-hidden />
            </button>
          ) : null}
          <div className="app-nav-brand-block">
            <span className="app-nav-brand" aria-label={APP_NAME}>
              <span className="app-nav-brand-up">Up</span>
              <span className="app-nav-brand-down">Down</span>
              <span className="app-nav-brand-fx"> FX</span>
            </span>
            {!isPhone ? (
              <span className={`app-nav-mode-pill ${tradingAsDemo ? "demo" : "live"}`}>
                {tradingAsDemo ? "Demo" : "Live"}
              </span>
            ) : null}
            {!isPhone ? (
              <div className="app-nav-account-toggle" role="group" aria-label="Trading account">
                <button
                  type="button"
                  className={accountWallet === "demo" ? "on demo-on" : ""}
                  onClick={() => {
                    setUserAccountWallet("demo");
                    void refresh("demo").catch(() => undefined);
                  }}
                >
                  Demo
                </button>
                <button
                  type="button"
                  className={accountWallet === "live" ? "on live-on" : ""}
                  onClick={() => {
                    setUserAccountWallet("live");
                    void refresh("live").catch(() => undefined);
                  }}
                >
                  Live
                </button>
              </div>
            ) : null}
          </div>
          {!isPhone ? (
            <nav className="app-main-nav-desktop" aria-label="Main navigation">
              <button
                type="button"
                className={dashboardSection === "trading" ? "active" : ""}
                onClick={() => {
                  setDashboardSection("trading");
                  window.requestAnimationFrame(() =>
                    document.getElementById("app-chart-anchor")?.scrollIntoView({ behavior: "smooth", block: "start" })
                  );
                }}
              >
                Trading
              </button>
              <button type="button" onClick={() => setAssetPickerOpen(true)}>
                Markets
              </button>
              <button
                type="button"
                className={dashboardSection === "deposit" ? "active" : ""}
                onClick={() => setDashboardSection("deposit")}
              >
                Deposit
              </button>
              <button
                type="button"
                className={dashboardSection === "withdrawal" ? "active" : ""}
                onClick={() => setDashboardSection("withdrawal")}
              >
                Withdraw
              </button>
              <button
                type="button"
                className={dashboardSection === "investment" ? "active" : ""}
                onClick={() => setDashboardSection("investment")}
              >
                Investment
              </button>
              <button
                type="button"
                className={dashboardSection === "referral" ? "active" : ""}
                onClick={() => setDashboardSection("referral")}
              >
                Promotion
              </button>
              <button
                type="button"
                onClick={() =>
                  document.getElementById("app-trade-history")?.scrollIntoView({ behavior: "smooth", block: "start" })
                }
              >
                History
              </button>
              <button
                type="button"
                onClick={() =>
                  document.getElementById("app-account-summary")?.scrollIntoView({ behavior: "smooth", block: "start" })
                }
              >
                Account
              </button>
              <button
                type="button"
                onClick={() => {
                  setWalletActivityOpen(true);
                }}
              >
                Wallet log
              </button>
              <button
                type="button"
                className={dashboardSection === "help" ? "active" : ""}
                onClick={() => setDashboardSection("help")}
              >
                Help
              </button>
              <button
                type="button"
                className={dashboardSection === "about" ? "active" : ""}
                onClick={() => setDashboardSection("about")}
              >
                About
              </button>
              <a className="app-nav-desktop-apk" href={apkDownloadHref} download>
                Download APK
              </a>
            </nav>
          ) : null}
          <div className="app-nav-right">
            <GlobalRefreshButton title="Refresh data" onClick={handleGlobalRefresh} />
            <div className="app-nav-dual-balances" role="group" aria-label="Demo and live wallet balances">
              <button
                type="button"
                className={`app-nav-balance-col app-nav-balance-col--demo${accountWallet === "demo" ? " is-active" : ""}`}
                title="Demo — virtual funds. Tap to trade on demo."
                onClick={() => {
                  setUserAccountWallet("demo");
                  void refresh("demo").catch(() => undefined);
                }}
              >
                <span className="app-nav-balance-col-label">Demo</span>
                <span className="app-nav-balance-col-amt">{fmtHeaderWallet(dualBalances.demo)}</span>
              </button>
              <button
                type="button"
                className={`app-nav-balance-col app-nav-balance-col--live${accountWallet === "live" ? " is-active" : ""}`}
                title="Live — funded wallet. Tap to trade live."
                onClick={() => {
                  setUserAccountWallet("live");
                  void refresh("live").catch(() => undefined);
                }}
              >
                <span className="app-nav-balance-col-label">Live</span>
                <span className="app-nav-balance-col-amt">{fmtHeaderWallet(dualBalances.live)}</span>
              </button>
            </div>
            {!isPhone ? (
              <button type="button" className="app-nav-text-btn" onClick={logout}>
                Logout
              </button>
            ) : null}
          </div>
        </div>
        {!isPhone ? (
          <p className="app-main-nav-sub">
            {accountWallet === "demo" ? (
              <>
                Demo — virtual funds ·{" "}
                <button
                  type="button"
                  className="app-nav-inline-link"
                  disabled={demoTopUpBusy}
                  onClick={() => void handleAddDemoFunds()}
                >
                  Add demo funds
                </button>
                {" · "}switch to Live for your funded balance
              </>
            ) : (
              formatAuthUserContact(session.user)
            )}
          </p>
        ) : null}
      </header>
      ) : null}

      {/*
        Drawer must NOT live inside <header>: .app-main-nav uses backdrop-filter, which creates a containing
        block so position:fixed only covers the short header — menu links render “below” and look empty.
      */}
      {mainNavOpen ? (
        <div
          className="app-nav-drawer-backdrop"
          role="presentation"
          onClick={() => setMainNavOpen(false)}
        >
          <nav
            className="app-nav-drawer"
            role="dialog"
            aria-label="Menu"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="app-nav-drawer-head">
              <div className="app-nav-drawer-head-left">
                <BrandLogo size={26} className="app-nav-drawer-logo" />
                <span className="app-nav-drawer-title">Menu</span>
              </div>
              <button
                type="button"
                className="app-nav-drawer-close"
                aria-label="Close menu"
                onClick={() => setMainNavOpen(false)}
              >
                ×
              </button>
            </div>
            <div className="app-nav-drawer-user">
              <strong>{session.user.name}</strong>
              <span>{formatAuthUserContact(session.user)}</span>
            </div>
            <div className="app-nav-drawer-wallet-row">
              <span className="app-nav-drawer-wallet-label">Trading</span>
              <div className="app-nav-account-toggle app-nav-account-toggle--drawer" role="group" aria-label="Trading account">
                <button
                  type="button"
                  className={accountWallet === "demo" ? "on demo-on" : ""}
                  onClick={() => {
                    setUserAccountWallet("demo");
                    void refresh("demo").catch(() => undefined);
                    setMainNavOpen(false);
                  }}
                >
                  Demo
                </button>
                <button
                  type="button"
                  className={accountWallet === "live" ? "on live-on" : ""}
                  onClick={() => {
                    setUserAccountWallet("live");
                    void refresh("live").catch(() => undefined);
                    setMainNavOpen(false);
                  }}
                >
                  Live
                </button>
              </div>
            </div>
            <div className="app-nav-drawer-demo-topup">
              <button
                type="button"
                className="app-nav-drawer-demo-topup-btn"
                disabled={demoTopUpBusy}
                onClick={() => {
                  setMainNavOpen(false);
                  void handleAddDemoFunds();
                }}
              >
                Add demo funds (+{formatInr(DEFAULT_DEMO_BALANCE_INR)} default)
              </button>
            </div>
            <div className="app-nav-drawer-links">
              <button
                type="button"
                onClick={() => {
                  setDashboardSection("trading");
                  setMainNavOpen(false);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
              >
                <DrawerIconTrading />
                <span>Trading</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setMainNavOpen(false);
                  setAssetPickerOpen(true);
                }}
              >
                <DrawerIconMarkets />
                <span>Markets (pairs)</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setDashboardSection("deposit");
                  setMainNavOpen(false);
                }}
              >
                <DrawerIconDeposit />
                <span>Deposit USDT</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setDashboardSection("withdrawal");
                  setMainNavOpen(false);
                }}
              >
                <DrawerIconWithdraw />
                <span>Withdraw USDT</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setDashboardSection("investment");
                  setMainNavOpen(false);
                }}
              >
                <DrawerIconInvestment />
                <span>Investment</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setDashboardSection("referral");
                  setMainNavOpen(false);
                }}
              >
                <DrawerIconPromotion />
                <span>Promotion</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setMainNavOpen(false);
                  if (isPhone) {
                    window.requestAnimationFrame(() =>
                      document.getElementById("app-mobile-history")?.scrollIntoView({ behavior: "smooth" })
                    );
                  } else {
                    document.getElementById("app-trade-history")?.scrollIntoView({ behavior: "smooth" });
                  }
                }}
              >
                <DrawerIconHistory />
                <span>Trade history</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setMainNavOpen(false);
                  setWalletActivityOpen(true);
                }}
              >
                <DrawerIconWalletActivity />
                <span>Wallet activity</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setDashboardSection("help");
                  setMainNavOpen(false);
                }}
              >
                <DrawerIconHelp />
                <span>Help</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setDashboardSection("about");
                  setMainNavOpen(false);
                }}
              >
                <DrawerIconAbout />
                <span>About</span>
              </button>
              <a
                className="app-nav-drawer-link"
                href={apkDownloadHref}
                download
                onClick={() => setMainNavOpen(false)}
              >
                <DrawerIconDownload />
                <span>Download APK</span>
              </a>
              <button
                type="button"
                onClick={() => {
                  setMainNavOpen(false);
                  void refresh().catch(() => undefined);
                  setMessage("Data refreshed.");
                }}
              >
                <DrawerIconRefresh />
                <span>Refresh data</span>
              </button>
              <button type="button" className="app-nav-drawer-danger" onClick={() => { setMainNavOpen(false); logout(); }}>
                Log out
              </button>
            </div>
          </nav>
        </div>
      ) : null}

      {session && isPhone ? (
        <div className="mobile-wallet-nav-wrap">
          <div className="mobile-trading-page-nav" aria-label="Wallet and account">
            <button
              type="button"
              className="mobile-tpn-profile"
              aria-label="Open menu"
              onClick={() => setMainNavOpen(true)}
            >
              <span className="mobile-tpn-profile-ring" aria-hidden>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="12" cy="9" r="3.5" stroke="currentColor" strokeWidth="1.6" />
                  <path
                    d="M6 19.5c0-3 2.5-5 6-5s6 2 6 5"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                  />
                </svg>
              </span>
              <span className="mobile-tpn-profile-dot" aria-hidden />
            </button>
            <div className="mobile-tpn-center-wrap" ref={tradingPageWalletWrapRef}>
              <button
                type="button"
                className="mobile-tpn-center"
                aria-expanded={tradingPageWalletMenuOpen}
                aria-haspopup="menu"
                onClick={() => setTradingPageWalletMenuOpen((o) => !o)}
              >
                <span className="mobile-tpn-balance">
                  {fmtHeaderWallet(accountWallet === "demo" ? dualBalances.demo : dualBalances.live)}
                </span>
                <span
                  className={`mobile-tpn-account-line${
                    accountWallet === "demo" ? " mobile-tpn-account-line--demo" : " mobile-tpn-account-line--live"
                  }`}
                >
                  {accountWallet === "demo" ? "Demo account" : "Live account"}
                  <span className="mobile-tpn-chevron" aria-hidden>
                    ▾
                  </span>
                </span>
              </button>
              {tradingPageWalletMenuOpen ? (
                <div className="mobile-tpn-dropdown" role="menu" aria-label="Switch trading account">
                  <button
                    type="button"
                    role="menuitem"
                    className={accountWallet === "demo" ? "active" : ""}
                    onClick={() => {
                      setUserAccountWallet("demo");
                      void refresh("demo").catch(() => undefined);
                      setTradingPageWalletMenuOpen(false);
                    }}
                  >
                    <span>Demo</span>
                    <span className="mobile-tpn-dd-amt">{fmtHeaderWallet(dualBalances.demo)}</span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className={accountWallet === "live" ? "active" : ""}
                    onClick={() => {
                      setUserAccountWallet("live");
                      void refresh("live").catch(() => undefined);
                      setTradingPageWalletMenuOpen(false);
                    }}
                  >
                    <span>Live</span>
                    <span className="mobile-tpn-dd-amt">{fmtHeaderWallet(dualBalances.live)}</span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="mobile-tpn-dd-add-demo"
                    disabled={demoTopUpBusy}
                    onClick={() => {
                      setTradingPageWalletMenuOpen(false);
                      void handleAddDemoFunds();
                    }}
                  >
                    <span>Add demo funds</span>
                    <span className="mobile-tpn-dd-add-hint">
                      +{formatInr(DEFAULT_DEMO_BALANCE_INR)} default
                    </span>
                  </button>
                </div>
              ) : null}
            </div>
            <GlobalRefreshButton
              className="global-refresh-fab--sm"
              title="Refresh data"
              onClick={handleGlobalRefresh}
            />
            <button
              type="button"
              className="mobile-tpn-wallet-fab"
              aria-label={accountWallet === "demo" ? "Switch to live account" : "Switch to demo account"}
              title={accountWallet === "demo" ? "Switch to live" : "Switch to demo"}
              onClick={() => {
                const next = accountWallet === "demo" ? "live" : "demo";
                setUserAccountWallet(next);
                void refresh(next).catch(() => undefined);
                setTradingPageWalletMenuOpen(false);
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
                <path
                  d="M4 8a2 2 0 012-2h12a2 2 0 012 2v8a2 2 0 01-2 2H6a2 2 0 01-2-2V8z"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinejoin="round"
                />
                <path d="M4 10h16" stroke="currentColor" strokeWidth="1.6" />
                <path
                  d="M8 6V5a2 2 0 012-2h4a2 2 0 012 2v1"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
        </div>
      ) : null}

      {dashboardSection === "about" ? (
        <AboutPage embeddedInApp />
      ) : dashboardSection === "deposit" ? (
        <DepositPage
          token={session.token}
          onSuccess={() => void refresh()}
        />
      ) : dashboardSection === "withdrawal" ? (
        <WithdrawalPage
          token={session.token}
          balance={dualBalances.live ?? 0}
          onSuccess={() => void refresh()}
        />
      ) : dashboardSection === "investment" ? (
        <InvestmentPage
          token={session.token}
          onSuccess={() => void refresh()}
        />
      ) : dashboardSection === "referral" ? (
        <ReferralPage token={session.token} />
      ) : dashboardSection === "help" ? (
        <HelpTicketPage token={session.token} />
      ) : (
      <>
      {session && isPhone ? (
        <main className="mobile-trade-root">
          <section className="panel wide mobile-chart-wrap" id="app-chart-anchor">
            <header className="mobile-chart-topbar mobile-chart-topbar--trading mobile-chart-topbar--in-card">
              <button
                type="button"
                className="mobile-asset-pill"
                title={
                  pairNames[symbol]
                    ? `${formatForexPair(symbol)} — ${pairNames[symbol]}`
                    : formatForexPair(symbol)
                }
                onClick={() => setAssetPickerOpen(true)}
              >
                <span className="mobile-asset-pill-icon">{getAssetIcon(symbol)}</span>
                <span className="mobile-asset-pill-text">{getAssetName(symbol, pairNames)}</span>
                <span className="mobile-chevron" aria-hidden>
                  ▾
                </span>
              </button>
              <div className="mobile-tf-wrap" ref={mobileTfWrapRef}>
                <button
                  type="button"
                  className="mobile-tf-pill mobile-tf-pill-trigger"
                  aria-expanded={mobileTfMenuOpen}
                  aria-haspopup="listbox"
                  aria-label="Candle timeframe"
                  onClick={() => {
                    setMobileChartTypeMenuOpen(false);
                    setMobileTfMenuOpen((o) => !o);
                  }}
                >
                  {tfLabel(chartTimeframe)}
                  <span className="mobile-chevron" aria-hidden>
                    ▾
                  </span>
                </button>
                {mobileTfMenuOpen ? (
                  <ul className="mobile-tf-dropdown" role="listbox">
                    {TIMEFRAME_OPTIONS.map(({ value: tf, label: lb }) => (
                      <li key={tf} role="presentation">
                        <button
                          type="button"
                          role="option"
                          aria-selected={chartTimeframe === tf}
                          className={chartTimeframe === tf ? "active" : ""}
                          onClick={() => {
                            onChartTimeframeChange(tf);
                            setMobileTfMenuOpen(false);
                          }}
                        >
                          {lb}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
              <div className="mobile-chart-type-wrap" ref={mobileChartTypeWrapRef}>
                <button
                  type="button"
                  className="mobile-chart-type-pill mobile-tf-pill-trigger"
                  aria-expanded={mobileChartTypeMenuOpen}
                  aria-haspopup="listbox"
                  aria-label="Chart style"
                  title="Chart style: candles, line, or area"
                  onClick={() => {
                    setMobileTfMenuOpen(false);
                    setMobileChartTypeMenuOpen((o) => !o);
                  }}
                >
                  <span className="mobile-chart-type-pill-label">
                    {chartGraphType === "candles"
                      ? "Candl…"
                      : CHART_GRAPH_OPTIONS.find((o) => o.value === chartGraphType)?.label ?? "Chart"}
                  </span>
                  <span className="mobile-chevron" aria-hidden>
                    ▾
                  </span>
                </button>
                {mobileChartTypeMenuOpen ? (
                  <ul className="mobile-tf-dropdown mobile-chart-type-dropdown" role="listbox">
                    {CHART_GRAPH_OPTIONS.map(({ value: v, label: lb }) => (
                      <li key={v} role="presentation">
                        <button
                          type="button"
                          role="option"
                          aria-selected={chartGraphType === v}
                          className={chartGraphType === v ? "active" : ""}
                          onClick={() => {
                            setChartGraphType(v);
                            setMobileChartTypeMenuOpen(false);
                          }}
                        >
                          {lb}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
              <span className="mobile-live-badge">
                <span className="live-dot" />
                Live
              </span>
            </header>
            <LiveChart
              points={chartSeries}
              closedCandlesFromDb={dbClosedCandles[`${symbol}:${chartTimeframe}`] ?? []}
              symbol={symbol}
              trades={symbolTrades}
              timeframeSec={chartTimeframe}
              onTimeframeChange={onChartTimeframeChange}
              graphType={chartGraphType}
              onGraphTypeChange={setChartGraphType}
              hideSideToolbar
              isMobileChart
              tickDirection={spotTickMove}
              expectBackendCandles
              livePrice={selectedTick?.price ?? null}
            />
          </section>

          <div className="mobile-trade-dock">
            <div className="mobile-trade-steppers">
              <div className="mobile-stepper-pill" role="group" aria-label="Trade candle duration">
                <button
                  type="button"
                  className="mobile-stepper-nudge"
                  aria-label="Shorter timeframe"
                  onClick={() => {
                    const opts = TIMEFRAME_OPTIONS;
                    const i = opts.findIndex((o) => o.value === binaryTimeframe);
                    setBinaryTimeframe(opts[(i - 1 + opts.length) % opts.length]!.value);
                  }}
                >
                  −
                </button>
                <span className="mobile-stepper-mid">{tfLabel(binaryTimeframe)}</span>
                <button
                  type="button"
                  className="mobile-stepper-nudge"
                  aria-label="Longer timeframe"
                  onClick={() => {
                    const opts = TIMEFRAME_OPTIONS;
                    const i = opts.findIndex((o) => o.value === binaryTimeframe);
                    setBinaryTimeframe(opts[(i + 1) % opts.length]!.value);
                  }}
                >
                  +
                </button>
              </div>
              <div
                className="mobile-stepper-pill mobile-stepper-pill--amount"
                role="group"
                aria-label="Trading amount"
              >
                <button
                  type="button"
                  className="mobile-stepper-nudge"
                  aria-label="Decrease trading amount"
                  onClick={() => bumpMobileStake(-1)}
                >
                  −
                </button>
                <label className="mobile-stepper-mid mobile-stepper-mid--inr mobile-stepper-inr-wrap">
                  <input
                    id="mob-trading-amount-inr"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    step={1}
                    className="mobile-stepper-inr-input"
                    value={quantity}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === "") {
                        setQuantity("");
                        return;
                      }
                      const n = Number(v);
                      if (Number.isFinite(n) && n >= 0) {
                        setQuantity(String(Math.floor(n)));
                      }
                    }}
                    onBlur={() => {
                      const n = Math.max(1, Math.floor(Number(quantity) || 0));
                      setQuantity(String(n));
                    }}
                    aria-label="Trading amount in INR"
                  />
                  <span className="mobile-stepper-inr-suffix" aria-hidden>
                    
                  </span>
                </label>
                <button
                  type="button"
                  className="mobile-stepper-nudge"
                  aria-label="Increase trading amount"
                  onClick={() => bumpMobileStake(1)}
                >
                  +
                </button>
              </div>
            </div>

            <div
              className="mobile-stake-pct-row"
              role="group"
              aria-label="Multiply entered amount: 2x, 3x, 5x, 10x"
            >
              {([2, 3, 5, 10] as const).map((mult) => (
                <button
                  key={mult}
                  type="button"
                  className="mobile-stake-pct-btn"
                  onClick={() => applyStakeMultiplier(mult)}
                >
                  {mult}x
                </button>
              ))}
            </div>

            <div className="mobile-trade-updown" role="group" aria-label="Place binary trade">
              <button
                type="button"
                className={`mobile-trade-dir mobile-trade-dir--down${
                  binaryCreatedFlash === "down" ? " binary-created-flash" : ""
                }`}
                disabled={xauWeekendOrdersBlocked}
                title={
                  xauWeekendOrdersBlocked
                    ? "XAU/USD is closed Sat–Sun (IST) — no new orders"
                    : undefined
                }
                onClick={() => placeMobileBinary("down")}
              >
                <span className="mobile-trade-dir-label">
                  {binaryCreatedFlash === "down" ? "Down · OK" : "Down"}
                </span>
                <span className="mobile-trade-dir-arrow" aria-hidden>
                  ↓
                </span>
              </button>
              <button
                type="button"
                className="mobile-trade-expiry-btn"
                aria-label="Jump to countdown and open trades"
                onClick={() =>
                  mobileBinaryExpiryRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" })
                }
              >
                <svg className="mobile-trade-expiry-ico" viewBox="0 0 24 24" width="22" height="22" aria-hidden>
                  <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.75" />
                  <path
                    d="M12 7v5l3 2"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
              <button
                type="button"
                className={`mobile-trade-dir mobile-trade-dir--up${
                  binaryCreatedFlash === "up" ? " binary-created-flash" : ""
                }`}
                disabled={xauWeekendOrdersBlocked}
                title={
                  xauWeekendOrdersBlocked
                    ? "XAU/USD is closed Sat–Sun (IST) — no new orders"
                    : undefined
                }
                onClick={() => placeMobileBinary("up")}
              >
                <span className="mobile-trade-dir-label">
                  {binaryCreatedFlash === "up" ? "Up · OK" : "Up"}
                </span>
                <span className="mobile-trade-dir-arrow" aria-hidden>
                  ↑
                </span>
              </button>
            </div>

            <div className="mobile-timeout-strip" ref={mobileBinaryExpiryRef} data-tick={timerTick}>
              <div className="mobile-timeout-line">
                <span className="mobile-timeout-strong">Timeout {tfLabel(binaryTimeframe)}</span>
                <span className="mobile-timeout-sub">Auto cut · win/loss by price</span>
              </div>
              {openBinaryTrades.length > 0 ? (
                <div className="mobile-open-timers">
                  {openBinaryTrades.map((t) => (
                    <div key={t.id} className="mobile-open-timer-row">
                      <span>
                        {formatForexPair(t.symbol)} {t.direction === "up" ? "↑" : "↓"} ·{" "}
                        {fmtWallet(t.quantity)} @ {formatFxPrice(t.symbol, t.entryPrice)}
                      </span>
                      <span className="countdown-badge">{countdownToExpiry(t.expiryAt)}</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            {message ? <p className="message mobile-trade-msg">{message}</p> : null}
          </div>

          <section className="mobile-more-panel mobile-account-history-panel" id="app-mobile-account">
            <h2 className="mobile-account-history-heading">Account &amp; history</h2>
            <p className="mobile-account-history-hint muted">
              Latest trades stay here while open and after they settle.
            </p>
            <div className="mobile-mini-stats">
              <span>Bal {fmtWallet(account?.balance ?? 0)}</span>
              <span>Eq {fmtWallet(account?.equity ?? 0)}</span>
            </div>
            <div className="mobile-history-compact" id="app-mobile-history">
              {trades.length > 0 ? (
                <div className="mobile-hist-table-wrap">
                  <table className="mobile-hist-table" aria-label="Trade history">
                    <thead>
                      <tr>
                        <th scope="col">Pair</th>
                        <th scope="col">Up / Down</th>
                        <th scope="col">Status</th>
                        <th scope="col">Entry</th>
                        <th scope="col">Close</th>
                      </tr>
                    </thead>
                    <tbody>
                      {trades.slice(0, 20).map((trade) => {
                        const dir = formatTradeDirectionLabel(trade.direction, trade.side);
                        const isBinary = trade.direction === "up" || trade.direction === "down";
                        const closeDetailTitle =
                          isBinary && trade.status === "closed" && trade.closePrice != null
                            ? `Close ${formatFxPrice(trade.symbol, trade.closePrice)} · Entry ${formatFxPrice(
                                trade.symbol,
                                trade.entryPrice
                              )}${trade.timeframeSeconds != null ? ` · ${trade.timeframeSeconds}s` : ""}`
                            : isBinary && trade.status === "open"
                              ? `${trade.direction === "up" ? "Up" : "Down"} @ ${formatFxPrice(
                                  trade.symbol,
                                  trade.entryPrice
                                )}${trade.timeframeSeconds != null ? ` · ${trade.timeframeSeconds}s` : ""}`
                              : trade.status === "closed" && typeof trade.closePrice === "number"
                                ? `Settlement: ${formatFxPrice(trade.symbol, trade.closePrice)}`
                                : undefined;
                        return (
                          <tr key={trade.id} className="mobile-hist-tr-main">
                            <td title={trade.symbol}>{formatForexPair(trade.symbol)}</td>
                            <td
                              className={isBinary ? (trade.direction === "up" ? "dir-up" : "dir-down") : ""}
                              title={
                                isBinary
                                  ? `Direction: ${dir} · Stake ${fmtWallet(trade.quantity)}`
                                  : `Stake ${fmtWallet(trade.quantity)}`
                              }
                            >
                              {isBinary ? (trade.direction === "up" ? "↑ Up" : "↓ Down") : dir}
                            </td>
                            <td
                              className={
                                typeof trade.pnl === "number"
                                  ? trade.pnl >= 0
                                    ? "pnl-win"
                                    : "pnl-loss"
                                  : ""
                              }
                              title={
                                isBinary && trade.status === "closed" && trade.pnl != null
                                  ? trade.pnl >= 0
                                    ? "Total credited (profit + trading amount)"
                                    : "Trading amount lost"
                                  : trade.status === "closed" && trade.closePrice != null
                                    ? `Entry ${formatFxPrice(trade.symbol, trade.entryPrice)} → close ${formatFxPrice(trade.symbol, trade.closePrice)}`
                                    : undefined
                              }
                            >
                              {trade.status === "closed" && trade.pnl != null
                                ? formatBinarySettledAmountDisplay(trade, fmtWallet)
                                : trade.status === "open"
                                  ? "Open"
                                  : trade.status}
                            </td>
                            <td title="Price when order was placed (execution / entry)">
                              {formatFxPrice(trade.symbol, trade.entryPrice)}
                            </td>
                            <td
                              className="mobile-hist-close"
                              title={
                                closeDetailTitle ??
                                (trade.status === "closed"
                                  ? typeof trade.closePrice === "number"
                                    ? `Settlement / close price: ${formatFxPrice(trade.symbol, trade.closePrice)}`
                                    : "Close price not recorded"
                                  : "Shows close price after trade settles")
                              }
                            >
                              {formatTradeCloseCell(trade)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="muted">No trades yet.</p>
              )}
            </div>
          </section>
        </main>
      ) : (
      <>
      <main className="grid">
        <section className="panel" id="app-account-summary">
          <h2>Trading account</h2>
          <div className="stats">
            <Stat label="Balance" value={fmtWallet(account?.balance ?? 0)} />
            <Stat label="Equity" value={fmtWallet(account?.equity ?? 0)} />
            <Stat label="Realized P&L" value={fmtWallet(account?.realizedPnl ?? 0)} />
            <Stat label="Unrealized P&L" value={fmtWallet(account?.unrealizedPnl ?? 0)} />
          </div>
          {session.user.selfReferralCode ? (
            <div className="referral-box muted" style={{ marginTop: "0.75rem" }}>
              <strong>Your promotion code</strong>{" "}
              <code className="referral-code-pill">{session.user.selfReferralCode}</code>{" "}
              <button
                type="button"
                className="link-inline"
                onClick={() => {
                  void navigator.clipboard.writeText(session.user.selfReferralCode);
                  setMessage("Promotion code copied.");
                }}
              >
                Copy
              </button>
              <p style={{ margin: "0.35rem 0 0", fontSize: "0.95rem" }}>
                Share link: add <code>?ref={session.user.selfReferralCode}</code> to the site URL. When your team
                places live binary bets, you earn <strong>0.1%</strong> of trading amount per level up to{" "}
                <strong>5 levels</strong> (wallet credit: level income).
              </p>
            </div>
          ) : null}
        </section>

        <section className="panel panel-asset-select">
          <h2>Trade — Select asset</h2>
          <p className="muted">Choose from the list or tap a tile — chart updates instantly</p>
          <label className="asset-select-label">
            <span className="asset-select-label-text">Asset list</span>
            <select
              className="asset-select-native"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              aria-label="Select forex pair"
            >
              {forexSymbolList.map((s) => (
                <option key={s} value={s}>
                  {formatForexPair(s)} — {getAssetName(s, pairNames)}
                </option>
              ))}
            </select>
          </label>
          <p className="muted asset-select-or">Or pick from the list</p>
          <div className="asset-grid-scroll">
            <ul className="asset-picker-list" role="list">
              {forexSymbolList.map((s) => {
                const tick = markets.find((t) => t.symbol === s);
                const tileMove = lastTickMove(history[s]);
                return (
                  <li key={s} className="asset-picker-list-item">
                    <button
                      type="button"
                      className={`asset-tile asset-tile--row ${s === symbol ? "active" : ""}`}
                      onClick={() => setSymbol(s)}
                    >
                      <span className="asset-tile-icon" aria-hidden>
                        {getAssetIcon(s)}
                      </span>
                      <span className="asset-tile-row-text">
                        <span className="asset-tile-name">{getAssetName(s, pairNames)}</span>
                        <span className="asset-tile-pair">{formatForexPair(s)}</span>
                      </span>
                      {tick ? (
                        <span className={`asset-tile-price${tileMove ? ` ${tileMove}` : ""}`}>
                          {tileMove === "up" ? "↑ " : tileMove === "down" ? "↓ " : ""}
                          {formatFxPrice(s, tick.price)}
                        </span>
                      ) : (
                        <span className="asset-tile-price muted">—</span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        <section className="panel wide" id="app-chart-anchor">
          <div className="chart-header chart-header-with-logo">
            <div>
              <button
                type="button"
                className="chart-symbol-logo chart-symbol-logo-btn"
                aria-label="Open asset list"
                onClick={() => setAssetPickerOpen(true)}
              >
                {getAssetIcon(symbol)}
              </button>
              <h2 className="chart-title-row">
                <span className="chart-title-static">Live Candle Chart · </span>
                <button
                  type="button"
                  className="chart-pair-button"
                  onClick={() => setAssetPickerOpen(true)}
                  aria-expanded={assetPickerOpen}
                  aria-haspopup="dialog"
                >
                  {formatForexPair(symbol)}
                </button>
              </h2>
              <p className="muted">Top 20 forex · same chart for every period (5s–5m)</p>
            </div>
            <div className="chart-badges">
              <span className={`badge chart-spot-price${spotTickMove ? ` ${spotTickMove}` : ""}`}>
                {spotTickMove === "up" ? "↑ " : spotTickMove === "down" ? "↓ " : ""}
                {selectedTick ? formatFxPrice(symbol, selectedTick.price) : "—"}
              </span>
            </div>
          </div>
          <LiveChart
            points={chartSeries}
            closedCandlesFromDb={dbClosedCandles[`${symbol}:${chartTimeframe}`] ?? []}
            symbol={symbol}
            trades={tradingAsDemo ? symbolTrades : []}
            timeframeSec={chartTimeframe}
            onTimeframeChange={onChartTimeframeChange}
            graphType={chartGraphType}
            onGraphTypeChange={setChartGraphType}
            tickDirection={spotTickMove}
            expectBackendCandles
            livePrice={selectedTick?.price ?? null}
          />
        </section>

        {tradingAsDemo ? (
          <section className="panel panel-demo-summary">
            <h2>Demo trading</h2>
            <p className="muted">
              <strong>{formatForexPair(symbol)}</strong> — open new trades from the{" "}
              <strong>bar at the bottom</strong> (Up / Down, amount).
            </p>
            <div className="trade-timeout-banner" data-tick={timerTick}>
              <span className="trade-timeout-label">Timeout</span>
              <strong>{tfLabel(binaryTimeframe)}</strong>
              <span className="trade-timeout-mid">·</span>
              <span>
                Auto cut when timer hits 00:00 — win/loss by price vs entry
              </span>
            </div>
            <p className="muted" style={{ fontSize: "0.98rem", marginTop: "0.35rem" }}>
              Win: wallet gets <strong>1.8×</strong> trading amount (e.g. {formatInr(100)} → {formatInr(180)}). Loss: full
              trading amount already taken.
            </p>
            <div className="trade-form binary-trade-form binary-trade-form-inline">
              <label>
                Timeframe (also in bottom bar)
                <select
                  value={binaryTimeframe}
                  onChange={(e) => setBinaryTimeframe(coerceTradeTimeframeSec(Number(e.target.value)))}
                >
                  {TIMEFRAME_OPTIONS.map(({ value, label }) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </label>
              <div className="binary-buttons binary-buttons-compact">
                <button
                  type="button"
                  className={`btn-buy-up${binaryCreatedFlash === "up" ? " binary-created-flash" : ""}`}
                  disabled={xauWeekendOrdersBlocked}
                  title={
                    xauWeekendOrdersBlocked
                      ? "XAU/USD is closed Sat–Sun (IST) — no new orders"
                      : undefined
                  }
                  onClick={() => void handleBinaryOrder("up")}
                >
                  {binaryCreatedFlash === "up" ? "Up · Created" : "Up"}
                </button>
                <button
                  type="button"
                  className={`btn-buy-down${binaryCreatedFlash === "down" ? " binary-created-flash" : ""}`}
                  disabled={xauWeekendOrdersBlocked}
                  title={
                    xauWeekendOrdersBlocked
                      ? "XAU/USD is closed Sat–Sun (IST) — no new orders"
                      : undefined
                  }
                  onClick={() => void handleBinaryOrder("down")}
                >
                  {binaryCreatedFlash === "down" ? "Down · Created" : "Down"}
                </button>
              </div>
            </div>
            {openBinaryTrades.length > 0 ? (
              <div className="active-trades-timers" data-tick={timerTick}>
                <p className="active-trades-title">Open — auto cut countdown</p>
                <ul className="active-trades-list">
                  {openBinaryTrades.map((t) => (
                    <li key={t.id}>
                      <span>
                        {formatForexPair(t.symbol)} · {t.direction === "up" ? "Up" : "Down"} · trading amount{" "}
                        {formatInr(t.quantity)} · open {formatFxPrice(t.symbol, t.entryPrice)}
                      </span>
                      <span className="countdown-badge" aria-live="polite">
                        {countdownToExpiry(t.expiryAt)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>
        ) : (
          <section className="panel">
            <h2>Trading</h2>
            <p className="muted">
              You are on <strong>Live</strong>. Select a <strong>timing</strong>, then Up/Down. When time is out,
              it auto cuts in <strong>profit</strong> or <strong>loss</strong> based on price vs entry.
            </p>
            <div className="trade-timeout-banner" data-tick={timerTick}>
              <span className="trade-timeout-label">Timeout</span>
              <strong>{tfLabel(binaryTimeframe)}</strong>
              <span className="trade-timeout-mid">·</span>
              <span>Auto cut at 00:00</span>
            </div>
            <p className="muted" style={{ fontSize: "0.98rem", marginTop: "0.35rem" }}>
              Win: <strong>1.8×</strong> trading amount back (e.g. {formatInr(100)} → {formatInr(180)}). Loss: full
              trading amount.
            </p>
            <p className="muted">
              Use the <strong>bottom bar</strong> to place trades (amount, Up/Down). To practice with virtual funds
              without touching your live balance, switch to <strong>Demo</strong> in the header or menu (
              <strong>Trading → Demo</strong> on phone).
            </p>
          </section>
        )}

        <section className="panel">
          <h2>Symbol Snapshot</h2>
          <div className="stats">
            <Stat label="Selected Symbol" value={symbol} />
            <Stat
              label="Live Price"
              value={selectedTick ? formatFxPrice(symbol, selectedTick.price) : "Waiting..."}
            />
            <Stat label="Open Trades" value={String(symbolTrades.filter((trade) => trade.status === "open").length)} />
            <Stat label="Total Trades" value={String(symbolTrades.length)} />
          </div>
        </section>

        <section className="panel wide" id="app-trade-history">
          <h2>Trade History</h2>
          <div className="table-scroll">
          <div className="table">
            <div className="table-head">
              <span>Symbol</span>
              <span>Up / Down</span>
              <span>Trading amount</span>
              <span>Entry @ price</span>
              <span>Close @ price</span>
              <span>Status</span>
              <span>Cut in</span>
              <span>P&L</span>
            </div>
            {trades.length === 0 ? (
              <p className="muted">No trades yet.</p>
            ) : (
              trades.map((trade) => (
                <div key={trade.id} className="table-row" data-tick={timerTick}>
                  <span>{trade.symbol}</span>
                  <span
                    title={
                      trade.direction === "up" || trade.direction === "down"
                        ? `Binary: ${trade.direction === "up" ? "Up" : "Down"} @ ${formatFxPrice(trade.symbol, trade.entryPrice)}`
                        : undefined
                    }
                  >
                    {trade.direction === "up" || trade.direction === "down"
                      ? `${trade.direction === "up" ? "↑ Up" : "↓ Down"}${trade.timeframeSeconds ? ` · ${trade.timeframeSeconds}s` : ""}`
                      : `${formatTradeDirectionLabel(trade.direction, trade.side)}${trade.timeframeSeconds ? ` ${trade.timeframeSeconds}s` : ""}`}
                  </span>
                  <span title="Trading amount (₹) at order time">
                    {fmtWallet(trade.quantity)}
                  </span>
                  <span title="Execution / entry price when order was placed">
                    {formatFxPrice(trade.symbol, trade.entryPrice)}
                  </span>
                  <span
                    className="table-close-price"
                    title={
                      trade.status === "closed" && trade.closePrice != null
                        ? `Settlement price: ${formatFxPrice(trade.symbol, trade.closePrice)}`
                        : undefined
                    }
                  >
                    {formatTradeCloseCell(trade)}
                  </span>
                  <span>{trade.status}</span>
                  <span className="table-cut-in">
                    {trade.status === "open" && trade.expiryAt != null
                      ? countdownToExpiry(trade.expiryAt)
                      : "—"}
                  </span>
                  <span
                    className={typeof trade.pnl === "number" ? (trade.pnl >= 0 ? "pnl-win" : "pnl-loss") : ""}
                    title={
                      trade.direction === "up" || trade.direction === "down"
                        ? trade.status === "closed" && trade.pnl != null
                          ? trade.pnl >= 0
                            ? "Total credited (trading amount + profit)"
                            : "Trading amount lost"
                          : undefined
                        : trade.status === "closed" && trade.closePrice != null
                          ? `Settlement price: ${formatFxPrice(trade.symbol, trade.closePrice)}`
                          : undefined
                    }
                  >
                    {trade.status === "closed" && typeof trade.pnl === "number"
                      ? formatBinarySettledAmountDisplay(trade, fmtWallet)
                      : "—"}
                  </span>
                </div>
              ))
            )}
          </div>
          </div>
        </section>
      </main>
      {session && !isPhone ? (
        <div className="desktop-demo-trade-bar" data-tick={timerTick}>
          <div className="desktop-demo-trade-inner">
            <div className="desktop-demo-block desktop-demo-pair-block">
              <span className="desktop-demo-label">Pair</span>
              <button
                type="button"
                className="desktop-demo-pair-btn"
                onClick={() => setAssetPickerOpen(true)}
              >
                {getAssetIcon(symbol)}{" "}
                {formatForexPair(symbol)}
              </button>
            </div>
            <label className="desktop-demo-block">
              <span className="desktop-demo-label">Timeout</span>
              <select
                value={binaryTimeframe}
                onChange={(e) => setBinaryTimeframe(coerceTradeTimeframeSec(Number(e.target.value)))}
                aria-label="Trade timeout"
              >
                {TIMEFRAME_OPTIONS.map(({ value, label: lb }) => (
                  <option key={value} value={value}>
                    {lb}
                  </option>
                ))}
              </select>
            </label>
            <label className="desktop-demo-block">
              <span className="desktop-demo-label">Amount (₹)</span>
              <div className="desktop-demo-amt-wrap">
                <input
                  type="number"
                  min={1}
                  step={1}
                  className="desktop-demo-amt"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  aria-label="Trading amount"
                />
                <span className="desktop-demo-amt-suffix" aria-hidden>
                  x
                </span>
              </div>
            </label>
            <div className="desktop-demo-block desktop-demo-mult-block">
              <span className="desktop-demo-label">× amount</span>
              <div className="desktop-stake-mult-row" role="group" aria-label="Multiply amount by 2, 3, 5, or 10">
                {([2, 3, 5, 10] as const).map((mult) => (
                  <button
                    key={mult}
                    type="button"
                    className="desktop-stake-mult-btn"
                    onClick={() => applyStakeMultiplier(mult)}
                  >
                    {mult}x
                  </button>
                ))}
              </div>
            </div>
            <div className="desktop-demo-block desktop-demo-bs-block">
              <span className="desktop-demo-label">Direction</span>
              <div className="desktop-demo-bs-row">
                <button
                  type="button"
                  className={`desktop-demo-bs-btn buy ${mobileSide === "buy" ? "on" : ""}${binaryCreatedFlash === "up" ? " binary-created-flash" : ""}`}
                  disabled={xauWeekendOrdersBlocked}
                  title={
                    xauWeekendOrdersBlocked
                      ? "XAU/USD is closed Sat–Sun (IST) — no new orders"
                      : undefined
                  }
                  onClick={() => setMobileSide("buy")}
                >
                  {binaryCreatedFlash === "up" ? "Up · Created" : "Up"}
                </button>
                <button
                  type="button"
                  className={`desktop-demo-bs-btn sell ${mobileSide === "sell" ? "on" : ""}${binaryCreatedFlash === "down" ? " binary-created-flash" : ""}`}
                  disabled={xauWeekendOrdersBlocked}
                  title={
                    xauWeekendOrdersBlocked
                      ? "XAU/USD is closed Sat–Sun (IST) — no new orders"
                      : undefined
                  }
                  onClick={() => setMobileSide("sell")}
                >
                  {binaryCreatedFlash === "down" ? "Down · Created" : "Down"}
                </button>
              </div>
            </div>
            <button
              type="button"
              className={`desktop-demo-cta ${mobileSide === "buy" ? "cta-buy" : "cta-sell"}${
                binaryCreatedFlash === (mobileSide === "buy" ? "up" : "down")
                  ? " desktop-demo-cta--created binary-created-flash"
                  : ""
              }`}
              disabled={xauWeekendOrdersBlocked}
              title={
                xauWeekendOrdersBlocked
                  ? "XAU/USD is closed Sat–Sun (IST) — no new orders"
                  : undefined
              }
              onClick={() => {
                const base = Number(quantity);
                if (!Number.isFinite(base) || base <= 0) {
                  setMessage("Enter amount.");
                  return;
                }
                const stake = Math.max(1, Math.floor(base * mobileMultiplier));
                if (accountWallet === "live") {
                  void handleLiveBinaryOrder(mobileSide === "buy" ? "up" : "down", { stake });
                  return;
                }
                void handleBinaryOrder(mobileSide === "buy" ? "up" : "down", { stake });
              }}
            >
              <span>
                <strong>
                  {binaryCreatedFlash === (mobileSide === "buy" ? "up" : "down")
                    ? mobileSide === "buy"
                      ? "Up · Created"
                      : "Down · Created"
                    : mobileSide === "buy"
                      ? "Place Up"
                      : "Place Down"}
                </strong>
                <small>
                  {" "}
                  trading amount{" "}
                  {Number.isFinite(Number(quantity)) && Number(quantity) > 0
                    ? fmtWallet(Math.max(1, Math.floor(Number(quantity) * mobileMultiplier)))
                    : "—"}{" "}
                  · {selectedTick ? formatFxPrice(symbol, selectedTick.price) : "—"}
                </small>
              </span>
            </button>
          </div>
          {openBinaryTrades.length > 0 ? (
            <div className="desktop-demo-open-strip">
              {openBinaryTrades.map((t) => (
                <span key={t.id} className="desktop-demo-open-pill">
                  {formatForexPair(t.symbol)} {t.direction === "up" ? "↑" : "↓"} ·{" "}
                  {fmtWallet(t.quantity)} @ {formatFxPrice(t.symbol, t.entryPrice)} · cut in{" "}
                  <strong>{countdownToExpiry(t.expiryAt)}</strong>
                </span>
              ))}
            </div>
          ) : null}
          {message ? <p className="desktop-demo-bar-msg">{message}</p> : null}
        </div>
      ) : null}
      </>
      )}
      {assetPickerOpen ? (
        <div
          className="asset-picker-backdrop"
          role="presentation"
          onClick={() => setAssetPickerOpen(false)}
        >
          <div
            className="asset-picker-modal"
            role="dialog"
            aria-labelledby="asset-picker-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="asset-picker-head">
              <div className="modal-head-titles">
                <BrandLogo size={28} className="modal-head-logo" />
                <h2 id="asset-picker-title">Trade — Select asset</h2>
              </div>
              <button
                type="button"
                className="asset-picker-close"
                onClick={() => setAssetPickerOpen(false)}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <p className="muted asset-picker-sub">All pairs · tap a row to open chart</p>
            <ul className="asset-picker-list asset-picker-list--modal" role="list">
              {forexSymbolList.map((s) => {
                const tick = markets.find((t) => t.symbol === s);
                const tileMove = lastTickMove(history[s]);
                return (
                  <li key={s} className="asset-picker-list-item">
                    <button
                      type="button"
                      className={`asset-tile asset-tile--row ${s === symbol ? "active" : ""}`}
                      onClick={() => {
                        setSymbol(s);
                        setAssetPickerOpen(false);
                      }}
                    >
                      <span className="asset-tile-icon" aria-hidden>
                        {getAssetIcon(s)}
                      </span>
                      <span className="asset-tile-row-text">
                        <span className="asset-tile-name">{getAssetName(s, pairNames)}</span>
                        <span className="asset-tile-pair">{formatForexPair(s)}</span>
                      </span>
                      {tick ? (
                        <span className={`asset-tile-price${tileMove ? ` ${tileMove}` : ""}`}>
                          {tileMove === "up" ? "↑ " : tileMove === "down" ? "↓ " : ""}
                          {formatFxPrice(s, tick.price)}
                        </span>
                      ) : (
                        <span className="asset-tile-price muted">—</span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      ) : null}
      </>
      )}
      {session && isPhone ? (
        <div className="mobile-bottom-dock-stack">
          <div className="mobile-dock-apk-row">
            <a
              className="mobile-dock-apk-link"
              href={apkDownloadHref}
              download={/^https?:\/\//i.test(APK_DOWNLOAD_URL.trim()) ? undefined : "UpDownFX.apk"}
            >
              Download APK
            </a>
          </div>
          <nav
            className="mobile-bottom-dock mobile-bottom-dock--theme"
            aria-label="Bottom menu"
          >
            <button
              type="button"
              className={`mobile-dock-item mobile-dock-cell ${dashboardSection === "deposit" ? "active" : ""}`}
              onClick={() => setDashboardSection("deposit")}
              aria-current={dashboardSection === "deposit" ? "page" : undefined}
            >
              <span className="mobile-dock-icon-slot" aria-hidden>
                <DockIconDeposit />
              </span>
              <span className="mobile-dock-label">Deposit</span>
            </button>
            <button
              type="button"
              className={`mobile-dock-item mobile-dock-cell ${dashboardSection === "withdrawal" ? "active" : ""}`}
              onClick={() => setDashboardSection("withdrawal")}
              aria-current={dashboardSection === "withdrawal" ? "page" : undefined}
            >
              <span className="mobile-dock-icon-slot" aria-hidden>
                <DockIconWithdraw />
              </span>
              <span className="mobile-dock-label">Withdraw</span>
            </button>

            <button
              type="button"
              className={`mobile-dock-trade mobile-dock-cell ${dashboardSection === "trading" ? "is-active" : ""}`}
              onClick={() => {
                setDashboardSection("trading");
                window.requestAnimationFrame(() =>
                  document.getElementById("app-chart-anchor")?.scrollIntoView({ behavior: "smooth", block: "start" })
                );
              }}
              aria-current={dashboardSection === "trading" ? "page" : undefined}
            >
              <span className="mobile-dock-trade-inner">
                <DockIconTradeBars />
              </span>
              <span className="mobile-dock-trade-text">Trade</span>
            </button>

            <button
              type="button"
              className={`mobile-dock-item mobile-dock-cell mobile-dock-markets${assetPickerOpen ? " active" : ""}`}
              onClick={() => setAssetPickerOpen(true)}
              aria-current={assetPickerOpen ? "page" : undefined}
            >
              <span className="mobile-dock-icon-slot" aria-hidden>
                <DockIconMarkets />
              </span>
              <span className="mobile-dock-label">Markets</span>
            </button>
            <button
              type="button"
              className={`mobile-dock-item mobile-dock-cell mobile-dock-referral${dashboardSection === "referral" ? " active" : ""}`}
              onClick={() => {
                setMainNavOpen(false);
                setDashboardSection("referral");
              }}
              aria-current={dashboardSection === "referral" ? "page" : undefined}
              aria-label="Promotion"
            >
              <span className="mobile-dock-icon-slot" aria-hidden>
                <DockIconReferral />
              </span>
              <span className="mobile-dock-label">Promotion</span>
            </button>
          </nav>
        </div>
      ) : null}
      {walletActivityOpen && session ? (
        <div
          className="wallet-tx-backdrop"
          role="presentation"
          onClick={() => setWalletActivityOpen(false)}
        >
          <div
            className="wallet-tx-modal"
            role="dialog"
            aria-labelledby="wallet-tx-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="wallet-tx-head">
              <div className="modal-head-titles">
                <BrandLogo size={28} className="modal-head-logo" />
                <h2 id="wallet-tx-title">Wallet activity (live · INR)</h2>
              </div>
              <button
                type="button"
                className="wallet-tx-close"
                aria-label="Close"
                onClick={() => setWalletActivityOpen(false)}
              >
                ×
              </button>
            </div>
            {walletTxLoading ? (
              <p className="muted wallet-tx-empty">Loading…</p>
            ) : walletTxs.length === 0 ? (
              <p className="muted wallet-tx-empty">No ledger entries yet. Deposit or trade on live.</p>
            ) : (
              <div className="wallet-tx-list">
                {walletTxs.map((tx) => {
                  const hint = walletLedgerAmountHint(tx);
                  const lossRow = tx.txn_type === "binary_settle_loss";
                  const pos = !lossRow && tx.amount >= 0;
                  return (
                    <div key={tx.id} className="wallet-tx-row">
                      <div className="wallet-tx-row-main">
                        <strong>{tx.txn_type.replace(/_/g, " ")}</strong>
                        <span
                          className={lossRow ? "wallet-tx-muted" : pos ? "wallet-tx-pos" : "wallet-tx-neg"}
                          title={hint ?? undefined}
                        >
                          {walletLedgerAmountPrimary(tx)}
                        </span>
                      </div>
                      <div className="wallet-tx-row-sub muted">
                        {hint ? <span className="wallet-tx-hint">{hint}</span> : null}
                        {hint ? <span className="wallet-tx-hint-sep"> · </span> : null}
                        Bal {formatInr(Number(tx.before_balance))} → {formatInr(Number(tx.after_balance))} ·{" "}
                        {new Date(tx.created_at).toLocaleString()}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ) : null}
      {binarySettlePopup ? (
        <div
          className={`order-placed-backdrop${
            binarySettlePopup.pnl >= 0 ? " order-placed-backdrop--celebrate-win" : ""
          }`}
          role="presentation"
          onClick={dismissBinarySettlePopup}
        >
          <div
            className={`order-placed-modal order-placed-modal--${
              binarySettlePopup.pnl >= 0 ? "up" : "down"
            }${binarySettlePopup.pnl >= 0 ? " order-placed-modal--celebrate" : ""}`}
            role="alertdialog"
            aria-labelledby="binary-settle-title"
            aria-describedby="binary-settle-desc"
            onClick={(e) => e.stopPropagation()}
          >
            {binarySettlePopup.pnl >= 0 ? (
              <>
                <div className="order-placed-celebrate-confetti" aria-hidden>
                  {Array.from({ length: 22 }, (_, i) => (
                    <span key={i} className="order-placed-confetti-piece" />
                  ))}
                </div>
                <div className="order-placed-celebrate-ribbon" aria-hidden>
                  Winner
                </div>
              </>
            ) : null}
            <div className="order-placed-modal-inner">
              <div className="order-placed-icon" aria-hidden>
                {binarySettlePopup.pnl >= 0 ? "✓" : "−"}
              </div>
              <p
                className={`order-placed-direction order-placed-direction--${
                  binarySettlePopup.pnl >= 0 ? "up" : "down"
                }`}
              >
                {binarySettlePopup.pnl >= 0 ? "Win" : "Loss"}
              </p>
              <h2 id="binary-settle-title" className="order-placed-title">
                {binarySettlePopup.pnl >= 0 ? "You won!" : "Trade closed — loss"}
              </h2>
              {binarySettlePopup.pnl >= 0 ? (
                <p className="order-placed-celebrate-sub">Trade settled in your favour</p>
              ) : null}
              <p id="binary-settle-desc" className="order-placed-summary">
                <span className="order-placed-summary-text">{binarySettlePopup.text}</span>
                <span className="order-placed-amount-highlight" aria-label="Settlement amount">
                  {binarySettlePopup.amountHighlight}
                </span>
              </p>
              <button
                type="button"
                className={`order-placed-ok${binarySettlePopup.pnl < 0 ? " order-placed-ok--loss" : ""}`}
                onClick={dismissBinarySettlePopup}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {demoFundsSuccessPopup ? (
        <div
          className="order-placed-backdrop"
          role="presentation"
          onClick={dismissDemoFundsSuccessPopup}
        >
          <div
            className="order-placed-modal order-placed-modal--up order-placed-modal--demo-funds"
            role="alertdialog"
            aria-labelledby="demo-funds-success-title"
            aria-describedby="demo-funds-success-desc"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="order-placed-icon" aria-hidden>
              ✓
            </div>
            <p className="order-placed-direction order-placed-direction--up">Balance updated</p>
            <h2 id="demo-funds-success-title" className="order-placed-title">
              Good — funds added
            </h2>
            <p id="demo-funds-success-desc" className="order-placed-summary">
              {formatInr(demoFundsSuccessPopup.added)} added · New balance {formatInr(demoFundsSuccessPopup.balance)}
            </p>
            <button type="button" className="order-placed-ok" onClick={dismissDemoFundsSuccessPopup}>
              OK
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function AuthScreen({
  authBusy,
  authMessage,
  authView,
  account,
  loginForm,
  markets,
  onAuthSubmit,
  onBackToLanding,
  onNavigateToAbout,
  onDemoAccess,
  onLoginFormChange,
  onRegisterFormChange,
  onViewChange,
  registerForm,
  status
}: {
  authBusy: boolean;
  authMessage: string;
  authView: AuthView;
  account: AccountSnapshot | null;
  loginForm: { countryCode: string; phone: string; password: string };
  markets: MarketTick[];
  onAuthSubmit: (event: FormEvent) => void;
  onBackToLanding: () => void;
  onNavigateToAbout: () => void;
  onDemoAccess: () => void;
  onLoginFormChange: Dispatch<SetStateAction<{ countryCode: string; phone: string; password: string }>>;
  onRegisterFormChange: Dispatch<
    SetStateAction<{ name: string; countryCode: string; phone: string; password: string; referralCode: string }>
  >;
  onViewChange: Dispatch<SetStateAction<AuthView>>;
  registerForm: { name: string; countryCode: string; phone: string; password: string; referralCode: string };
  status: string;
}) {
  const [authMenuOpen, setAuthMenuOpen] = useState(false);
  const [showAuthPassword, setShowAuthPassword] = useState(false);

  useEffect(() => {
    setShowAuthPassword(false);
  }, [authView]);

  useEffect(() => {
    const ref = new URLSearchParams(window.location.search).get("ref");
    if (ref?.trim()) {
      onRegisterFormChange((c) => ({ ...c, referralCode: ref.trim().toUpperCase() }));
    }
  }, []);

  useEffect(() => {
    if (!authMenuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAuthMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [authMenuOpen]);

  const demoMetrics = [
    { label: "Demo balance", value: formatInr(account?.balance ?? 0) },
    { label: "Demo equity", value: formatInr(account?.equity ?? 0) },
    { label: "Market feed", value: status }
  ];

  return (
    <div className="auth-page-wrap">
      <header className={`auth-sticky-nav${authMenuOpen ? " auth-drawer-open" : ""}`}>
        <div className="auth-sticky-inner">
          <span className="auth-nav-brand">
            <BrandLogo className="auth-nav-brand-logo" />
            {APP_NAME}
          </span>
          <div className="auth-nav-trailing">
            <GlobalRefreshButton
              className="global-refresh-fab--sm"
              title="Reload page"
              aria-label="Refresh page"
              onClick={() => window.location.reload()}
            />
            <nav className="auth-nav-links-desktop" aria-label="Auth menu">
              <button type="button" className="auth-nav-link" onClick={onNavigateToAbout}>
                About
              </button>
              <button type="button" className="auth-nav-link" onClick={() => onViewChange("login")}>
                Log in
              </button>
              <button type="button" className="auth-nav-link" onClick={() => onViewChange("register")}>
                Register
              </button>
              <button type="button" className="auth-nav-link primary" onClick={onDemoAccess}>
                Demo after sign-in
              </button>
            </nav>
            <button
              type="button"
              className="auth-nav-menu-btn"
              aria-label="Open menu"
              onClick={() => setAuthMenuOpen(true)}
            >
              <span className="auth-nav-menu-burger" aria-hidden />
            </button>
          </div>
        </div>
        {authMenuOpen ? (
          <div
            className="landing-drawer-backdrop"
            role="presentation"
            onClick={() => setAuthMenuOpen(false)}
          >
            <nav
              className="landing-drawer"
              role="dialog"
              aria-label="Menu"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="landing-drawer-head">
                <div className="landing-drawer-head-left">
                  <BrandLogo size={28} className="landing-drawer-logo" />
                  <span className="landing-drawer-title">Menu</span>
                </div>
                <button
                  type="button"
                  className="landing-drawer-close"
                  aria-label="Close"
                  onClick={() => setAuthMenuOpen(false)}
                >
                  ×
                </button>
              </div>
              <div className="landing-drawer-links">
                <button type="button" onClick={() => { setAuthMenuOpen(false); onBackToLanding(); }}>
                  Home
                </button>
                <button type="button" onClick={() => { setAuthMenuOpen(false); onNavigateToAbout(); }}>
                  About
                </button>
                <button type="button" onClick={() => { setAuthMenuOpen(false); onViewChange("login"); }}>
                  Log in
                </button>
                <button type="button" onClick={() => { setAuthMenuOpen(false); onViewChange("register"); }}>
                  Register
                </button>
                <button type="button" onClick={() => { setAuthMenuOpen(false); onDemoAccess(); }}>
                  Demo after sign-in
                </button>
              </div>
            </nav>
          </div>
        ) : null}
      </header>
    <div className="auth-shell">
      <section className="auth-hero">
        <div className="auth-hero-brand">
          <BrandLogo size={44} className="auth-hero-logo" />
          <div>
            <p className="eyebrow">Demo first · Live when you fund</p>
            <p className="auth-hero-brand-name">{APP_NAME}</p>
          </div>
        </div>
        <h1>Sign in to trade — Demo or Live</h1>
        <p className="subtext">
          <strong>Demo practice</strong> is only for logged-in users. After{" "}
          <strong>log in or register</strong>, use the <strong>Demo / Live</strong> toggle in the app header to switch
          between your personal virtual wallet and your funded live wallet.
        </p>

        <div className="auth-metrics">
          {demoMetrics.map((item) => (
            <div key={item.label} className="auth-metric">
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </div>
          ))}
        </div>

        <div className="auth-demo">
          <div>
            <strong>Try Demo after sign-in</strong>
            <p className="muted">
              Log in or register first. Then open the app and choose <strong>Demo</strong> next to Live for virtual
              funds — no guest betting.
            </p>
          </div>
          <button className="secondary-button" type="button" onClick={onDemoAccess}>
            Log in for Demo
          </button>
        </div>

        <div className="auth-market-list">
          {markets.slice(0, 4).map((tick) => (
            <div key={tick.symbol} className="price-row">
              <div className="price-row-left">
                <span className="price-row-icon" aria-hidden>
                  {getAssetIcon(tick.symbol)}
                </span>
                <strong>{formatForexPair(tick.symbol)}</strong>
              </div>
              <span className="price-row-value">{formatFxPrice(tick.symbol, tick.price)}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="auth-card" aria-labelledby="auth-card-title">
        <div className="auth-card-head">
          <div className="auth-card-logo-ring" aria-hidden>
            <BrandLogo size={76} className="auth-card-logo" />
          </div>
          <h2 id="auth-card-title" className="auth-card-heading">
            {authView === "login" ? "Welcome back" : "Create account"}
          </h2>
          <p className="auth-card-tagline">
            {authView === "login"
              ? `Sign in to continue on ${APP_NAME}`
              : `Join ${APP_NAME} — demo & live trading`}
          </p>
        </div>

        <div className="auth-tabs" role="tablist" aria-label="Login or register">
          <button
            type="button"
            role="tab"
            aria-selected={authView === "login"}
            className={authView === "login" ? "tab active" : "tab"}
            onClick={() => onViewChange("login")}
          >
            Log in
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={authView === "register"}
            className={authView === "register" ? "tab active" : "tab"}
            onClick={() => onViewChange("register")}
          >
            Register
          </button>
        </div>

        <form className="auth-form" onSubmit={onAuthSubmit}>
          {authView === "register" ? (
            <label>
              Full name
              <input
                type="text"
                value={registerForm.name}
                onChange={(event) =>
                  onRegisterFormChange((current) => ({
                    ...current,
                    name: event.target.value
                  }))
                }
                placeholder="Your name"
                autoComplete="name"
              />
            </label>
          ) : null}

          <div className="auth-phone-combo" role="group" aria-label="Phone number">
            <div className="auth-phone-combo-labels">
              <span>Country code</span>
              <span>Mobile number</span>
            </div>
            <div className="auth-phone-combo-inner">
              <input
                className="auth-phone-cc-input"
                type="text"
                inputMode="numeric"
                maxLength={4}
                value={authView === "login" ? loginForm.countryCode : registerForm.countryCode}
                onChange={(event) => {
                  const v = event.target.value.replace(/\D/g, "").slice(0, 4);
                  if (authView === "login") {
                    onLoginFormChange((c) => ({ ...c, countryCode: v }));
                  } else {
                    onRegisterFormChange((c) => ({ ...c, countryCode: v }));
                  }
                }}
                placeholder="91"
                autoComplete="tel-country-code"
                aria-label="Country calling code e.g. 91 India, 92 Pakistan"
              />
              <span className="auth-phone-combo-divider" aria-hidden />
              <input
                className="auth-phone-num-input"
                type="tel"
                inputMode="numeric"
                value={authView === "login" ? loginForm.phone : registerForm.phone}
                onChange={(event) => {
                  const v = event.target.value.replace(/\D/g, "").slice(0, 15);
                  if (authView === "login") {
                    onLoginFormChange((c) => ({ ...c, phone: v }));
                  } else {
                    onRegisterFormChange((c) => ({ ...c, phone: v }));
                  }
                }}
                placeholder="9876543210"
                autoComplete="tel-national"
                aria-label="Mobile number without country code"
              />
            </div>
          </div>

          <label className="auth-field-password">
            Password
            <div className="auth-password-field">
              <input
                className="auth-password-input"
                type={showAuthPassword ? "text" : "password"}
                value={authView === "login" ? loginForm.password : registerForm.password}
                onChange={(event) => {
                  const value = event.target.value;
                  if (authView === "login") {
                    onLoginFormChange((current) => ({ ...current, password: value }));
                    return;
                  }

                  onRegisterFormChange((current) => ({ ...current, password: value }));
                }}
                placeholder="Enter your password"
                autoComplete={authView === "login" ? "current-password" : "new-password"}
              />
              <button
                type="button"
                className="auth-password-eye"
                onClick={() => setShowAuthPassword((v) => !v)}
                aria-pressed={showAuthPassword}
                aria-label={showAuthPassword ? "Hide password" : "Show password"}
                title={showAuthPassword ? "Hide password" : "Show password"}
              >
                {showAuthPassword ? (
                  <svg
                    viewBox="0 0 24 24"
                    width="22"
                    height="22"
                    aria-hidden
                    className="auth-password-eye-svg"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0 -11 -8 -11 -8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                ) : (
                  <svg
                    viewBox="0 0 24 24"
                    width="22"
                    height="22"
                    aria-hidden
                    className="auth-password-eye-svg"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M1 12s4 8 11 8 11-8 11-8-4-8-11-8-11 8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
          </label>

          {authView === "register" ? (
            <label>
              Promotion code <span className="muted">(optional)</span>
              <input
                type="text"
                value={registerForm.referralCode}
                onChange={(event) =>
                  onRegisterFormChange((current) => ({
                    ...current,
                    referralCode: event.target.value.toUpperCase()
                  }))
                }
                placeholder="Friend's code"
                autoComplete="off"
              />
            </label>
          ) : null}

          <button type="submit" disabled={authBusy}>
            {authBusy ? "Please wait..." : authView === "login" ? "Login" : "Create account"}
          </button>
        </form>

        {authMessage ? (
          <p className="auth-form-message" role="alert">
            {authMessage}
          </p>
        ) : null}
        <p className="auth-footer">
          {authView === "login" ? "New here?" : "Already have an account?"}{" "}
          <button type="button" className="link-inline" onClick={() => onViewChange(authView === "login" ? "register" : "login")}>
            {authView === "login" ? "Register" : "Login"}
          </button>
        </p>
      </section>
    </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

/** Zoom = slot width in px (larger = fewer candles = more zoomed in). −/+ steps are clearly visible. */

function LiveChart({
  points,
  closedCandlesFromDb = [],
  symbol,
  trades,
  timeframeSec,
  onTimeframeChange,
  graphType,
  onGraphTypeChange,
  hideSideToolbar = false,
  isMobileChart = false,
  tickDirection = null,
  expectBackendCandles = false,
  livePrice = null
}: {
  points: MarketTick[];
  /** Closed OHLC from `/api/markets/candles` (DB); live leg from WebSocket `live_price` ticks. */
  closedCandlesFromDb?: CandlePoint[];
  symbol: string;
  trades: Trade[];
  timeframeSec: number;
  onTimeframeChange: (sec: number) => void;
  graphType: ChartGraphType;
  onGraphTypeChange: (t: ChartGraphType) => void;
  hideSideToolbar?: boolean;
  /** Wider default zoom + reset on TF change (Olymp / TV-style mobile chart). */
  isMobileChart?: boolean;
  tickDirection?: "up" | "down" | null;
  /** After login, show DB-oriented loading text until `chart_candles` merge appears. */
  expectBackendCandles?: boolean;
  /** Latest quote so the forming candle updates even when tick history is sparse. */
  livePrice?: number | null;
}) {
  const [, setTick] = useState(0);
  const [zoomIndex, setZoomIndex] = useState(() => defaultZoomIndexForTimeframe(timeframeSec, isMobileChart));
  /** Touch/tap on timer badge zooms the time text (mobile). */
  const [timerTextZoomed, setTimerTextZoomed] = useState(false);
  const chartWrapRef = useRef<HTMLDivElement>(null);
  /** XAU locked: freeze candle “wall clock” at first lock frame so new ticks don’t open new buckets. */
  const xauFreezeWallMsRef = useRef<number | null>(null);
  const prevChartSymbolRef = useRef(symbol);
  const pinchRef = useRef<{ initialDistance: number; initialZoomIndex: number } | null>(null);
  const zoomIndexRef = useRef(zoomIndex);
  zoomIndexRef.current = zoomIndex;

  const chartTradeMarkers = useMemo((): ChartTradeMarker[] => {
    const fmt = (p: number) =>
      p >= 1000 ? p.toFixed(2) : p >= 1 ? p.toFixed(4) : p.toFixed(6);
    const list: ChartTradeMarker[] = [];
    for (const t of trades) {
      if (
        t.status !== "open" ||
        t.symbol !== symbol ||
        (t.direction !== "up" && t.direction !== "down")
      ) {
        continue;
      }
      const ms = Date.parse(t.openedAt);
      if (!Number.isFinite(ms)) {
        continue;
      }
      const bucketStart = candleBucketStartMs(ms, timeframeSec);
      const time = Math.floor(bucketStart / 1000);
      const up = t.direction === "up";
      list.push({
        time,
        position: up ? "belowBar" : "aboveBar",
        color: up ? "#0ecb81" : "#f6465d",
        shape: up ? "arrowUp" : "arrowDown",
        text: `${up ? "UP" : "DOWN"} trade @ ${fmt(t.entryPrice)}`,
        id: t.id
      });
    }
    list.sort((a, b) => Number(a.time) - Number(b.time));
    return list;
  }, [trades, symbol, timeframeSec]);

  const chartTradeEntryLines = useMemo((): ChartTradeEntryLine[] => {
    const out: ChartTradeEntryLine[] = [];
    for (const t of trades) {
      if (
        t.status !== "open" ||
        t.symbol !== symbol ||
        (t.direction !== "up" && t.direction !== "down")
      ) {
        continue;
      }
      const ep = Number(t.entryPrice);
      if (!Number.isFinite(ep)) {
        continue;
      }
      out.push({ tradeId: t.id, price: ep, direction: t.direction });
    }
    return out;
  }, [trades, symbol]);

  /** 1 Hz tick: countdown + current candle stay aligned with selected timeframe (same buckets as `buildCandles`). */
  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 1000);
    const syncNow = () => {
      if (document.visibilityState === "visible") {
        setTick((n) => n + 1);
      }
    };
    document.addEventListener("visibilitychange", syncNow);
    window.addEventListener("pageshow", syncNow);
    window.addEventListener("focus", syncNow);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", syncNow);
      window.removeEventListener("pageshow", syncNow);
      window.removeEventListener("focus", syncNow);
    };
  }, []);

  useEffect(() => {
    setZoomIndex(defaultZoomIndexForTimeframe(timeframeSec, isMobileChart));
  }, [symbol, timeframeSec, isMobileChart]);

  useEffect(() => {
    if (!isMobileChart) return;
    const el = chartWrapRef.current;
    if (!el) return;

    const getDistance = (e: TouchEvent) => {
      if (e.touches.length < 2) return 0;
      const a = e.touches[0];
      const b = e.touches[1];
      return Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
    };

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        pinchRef.current = {
          initialDistance: getDistance(e),
          initialZoomIndex: zoomIndexRef.current
        };
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 2 || !pinchRef.current) return;
      e.preventDefault();
      const dist = getDistance(e);
      if (dist === 0) return;
      const ratio = dist / pinchRef.current.initialDistance;
      const sensitivity = 2.5;
      const delta = Math.round(sensitivity * Math.log(ratio));
      const next = Math.max(0, Math.min(CHART_ZOOM_STEP_COUNT - 1, pinchRef.current.initialZoomIndex + delta));
      setZoomIndex(next);
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) pinchRef.current = null;
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
    };
  }, [isMobileChart, zoomIndex]);

  const wallNow = Date.now();
  const lastTickMs = points.length > 0 ? points[points.length - 1]!.timestamp : 0;
  const lastCandleDbTs =
    closedCandlesFromDb.length > 0
      ? closedCandlesFromDb[closedCandlesFromDb.length - 1]!.timestamp
      : 0;
  const lastActivityForLock = Math.max(lastTickMs, lastCandleDbTs);
  if (prevChartSymbolRef.current !== symbol) {
    prevChartSymbolRef.current = symbol;
    xauFreezeWallMsRef.current = null;
  }
  const xauLocked =
    isXauUsdSymbol(symbol) &&
    lastActivityForLock > 0 &&
    shouldShowXauMarketLock(symbol, lastActivityForLock, wallNow);
  if (xauLocked) {
    if (xauFreezeWallMsRef.current === null) {
      xauFreezeWallMsRef.current = lastActivityForLock;
    }
  } else {
    xauFreezeWallMsRef.current = null;
  }
  const freezeWallMs = xauFreezeWallMsRef.current;
  const candleWallNow = xauLocked && freezeWallMs != null ? freezeWallMs : wallNow;
  const pointsForCandles =
    xauLocked && freezeWallMs != null ? points.filter((p) => p.timestamp <= freezeWallMs) : points;

  const liveCandles =
    pointsForCandles.length > 0 ? buildCandles(pointsForCandles, timeframeSec, candleWallNow) : [];

  let allCandles: CandlePoint[];
  if (points.length === 0) {
    allCandles =
      closedCandlesFromDb.length > 0
        ? extendClosedCandlesToNow(closedCandlesFromDb, timeframeSec, candleWallNow)
        : [];
  } else if (closedCandlesFromDb.length > 0) {
    allCandles = mergeDbClosedWithLiveCandles(closedCandlesFromDb, liveCandles);
  } else {
    allCandles = liveCandles;
  }

  if (closedCandlesFromDb.length > 0 && liveCandles.length === 0 && allCandles.length > 0) {
    allCandles = extendClosedCandlesToNow(allCandles, timeframeSec, candleWallNow);
  }

  allCandles = fillCandleTimeGaps(allCandles, timeframeSec);
  // Bridge last bar to the current bucket so the forming candle + trade markers align with wall time
  // (merge + gap-fill alone can end before now when ticks are sparse).
  if (allCandles.length > 0) {
    allCandles = extendClosedCandlesToNow(allCandles, timeframeSec, candleWallNow);
  }

  allCandles = overlayLivePriceOnFormingCandle(
    allCandles,
    livePrice,
    timeframeSec,
    candleWallNow
  );

  const lastChartActivityMs = useMemo(() => {
    const lp =
      pointsForCandles.length > 0 ? pointsForCandles[pointsForCandles.length - 1]!.timestamp : 0;
    const lc = allCandles.length > 0 ? allCandles[allCandles.length - 1]!.timestamp : 0;
    return Math.max(lp, lc);
  }, [pointsForCandles, allCandles]);

  if (allCandles.length === 0) {
    const lp = livePrice;
    if (lp != null && Number.isFinite(lp) && lp > 0) {
      const tfMs = timeframeSec * 1000;
      const nb = Math.floor(candleWallNow / tfMs) * tfMs;
      allCandles = [{ timestamp: nb, open: lp, high: lp, low: lp, close: lp }];
    } else {
      return (
        <p className="muted">
          {expectBackendCandles
            ? "Loading saved candles from server…"
            : "Waiting for live price data…"}
        </p>
      );
    }
  }

  /** All TFs: clamp absurd H/L from mixed ticks/DB so candles look like real OHLC (not barcode). */
  const displayCandles = allCandles.map((c) => clampChartCandleBar(c, timeframeSec));

  const current = displayCandles[displayCandles.length - 1]!;
  const change = displayCandles.length > 1 ? current.close - displayCandles[0].open : 0;
  const changePct =
    displayCandles.length > 1 && displayCandles[0].open !== 0 ? (change / displayCandles[0].open) * 100 : 0;
  const prevCandle = displayCandles.length >= 2 ? displayCandles[displayCandles.length - 2]! : null;
  const candleRange = current.high - current.low;
  const candleBody = current.close - current.open;
  const vsPrevClose =
    prevCandle != null ? current.close - prevCandle.close : null;
  const openTrades = trades.filter((trade) => trade.status === "open");
  const fmtPrice = (p: number) =>
    p >= 1000 ? p.toFixed(2) : p >= 1 ? p.toFixed(4) : p.toFixed(6);
  /** Narrow toolbar on phone — fewer decimals so OHLC + R/Δ/P fit. */
  const fmtM = (p: number) => {
    const a = Math.abs(p);
    if (a >= 1000) return p.toFixed(2);
    if (a >= 10) return p.toFixed(2);
    if (a >= 1) return p.toFixed(3);
    return p.toFixed(4);
  };
  const fp = isMobileChart ? fmtM : fmtPrice;

  const pairLabel = formatForexPair(symbol);

  /** Same UTC bucket end as server `binaryCandleExpiresAtMs` — new candle when this hits 00:00. */
  const candleEndMs = candlePeriodEndMs(candleWallNow, timeframeSec);
  const msLeft = Math.max(0, candleEndMs - candleWallNow);
  const totalSec = Math.max(0, Math.ceil(msLeft / 1000));
  const cdSec = Math.min(3599, totalSec);
  const countdownStr = `${String(Math.floor(cdSec / 60)).padStart(2, "0")}:${String(cdSec % 60).padStart(2, "0")}`;

  const chartResetKey = `${symbol}-${timeframeSec}-${graphType}`;

  return (
    <div className={`chart-card tv-chart chart-wrapper-ref${isMobileChart ? " tv-chart-mobile" : ""}`}>
      {!isMobileChart ? (
        <div className="chart-meta tv-chart-toolbar">
          <div className="tv-toolbar-left">
            <strong className="tv-symbol">{pairLabel}</strong>
            {tickDirection ? (
              <span className={`tv-spot-tick ${tickDirection}`} aria-hidden>
                {tickDirection === "up" ? "↑" : "↓"}
              </span>
            ) : null}
            <span
              className="tv-ohlc"
              title={`O ${fp(current.open)} H ${fp(current.high)} L ${fp(current.low)} C ${fp(current.close)}`}
            >
              O {fp(current.open)} H {fp(current.high)} L {fp(current.low)} C {fp(current.close)}
            </span>
            <span className={change >= 0 ? "tv-change up" : "tv-change down"}>
              {change >= 0 ? "+" : ""}
              {change.toFixed(4)} ({changePct.toFixed(2)}%)
            </span>
            <span className="tv-chart-extra-stats" aria-label="Current candle metrics">
              <span className="tv-stat tv-stat--range" title="Range (high − low), this candle">
                <span className="tv-stat-label">R</span>
                {fp(candleRange)}
              </span>
              <span className="tv-stat-sep" aria-hidden>
                ·
              </span>
              <span
                className={`tv-stat tv-stat--body ${candleBody >= 0 ? "tv-stat--bull" : "tv-stat--bear"}`}
                title="Body (close − open), this candle"
              >
                <span className="tv-stat-label">Δ</span>
                {candleBody >= 0 ? "+" : ""}
                {fp(candleBody)}
              </span>
              {vsPrevClose != null ? (
                <>
                  <span className="tv-stat-sep" aria-hidden>
                    ·
                  </span>
                  <span
                    className={`tv-stat tv-stat--prev ${vsPrevClose >= 0 ? "tv-stat--bull" : "tv-stat--bear"}`}
                    title="Change vs previous candle close"
                  >
                    <span className="tv-stat-label">Prev</span>
                    {vsPrevClose >= 0 ? "+" : ""}
                    {fp(vsPrevClose)}
                  </span>
                </>
              ) : null}
            </span>
          </div>
          <div className="chart-meta-right tv-chart-meta">
            <span
              className={`tv-chart-candle-timer${
                tickDirection === "up"
                  ? " tv-chart-candle-timer--up"
                  : tickDirection === "down"
                    ? " tv-chart-candle-timer--down"
                    : ""
              }`}
              aria-live="polite"
              title="Time until this candle closes"
            >
              <span className="tv-chart-candle-timer-label">{tfLabel(timeframeSec)}</span>
              <span className="tv-chart-candle-timer-val">{countdownStr}</span>
            </span>
            <span className="tv-chart-meta-sep" aria-hidden>
              ·
            </span>
            <span title={`Open trades: ${openTrades.length}`}>Trades: {openTrades.length}</span>
          </div>
        </div>
      ) : null}
      <div className="chart-svg-wrap chart-lw-wrap">
        <div
          className="chart-touch-layer chart-lw-touch"
          ref={chartWrapRef}
          aria-hidden
          title={
            isMobileChart
              ? "Swipe sideways to view older candles · pinch to zoom in/out"
              : "Drag sideways or scroll wheel to view older candles"
          }
        >
          <LightweightTradingChart
            key={chartResetKey}
            candles={displayCandles}
            assetTag={symbol}
            timeframeLabel={tfLabel(timeframeSec)}
            formatPrice={(p) => formatFxPrice(symbol, p)}
            timeframeSec={timeframeSec}
            zoomIndex={zoomIndex}
            isMobileChart={isMobileChart}
            chartResetKey={chartResetKey}
            countdownStr={countdownStr}
            timerTextZoomed={timerTextZoomed}
            onTimerTap={() => setTimerTextZoomed((z) => !z)}
            tickDirection={tickDirection}
            tradeMarkers={chartTradeMarkers}
            tradeEntryLines={chartTradeEntryLines}
            graphType={graphType}
            lastChartActivityMs={lastChartActivityMs}
          />
        </div>

        {!hideSideToolbar ? (
          <div className="chart-toolbar-vertical">
            {TIMEFRAME_OPTIONS.map(({ value: tf, label }) => (
              <button
                key={tf}
                type="button"
                className={timeframeSec === tf ? "active" : ""}
                onClick={() => onTimeframeChange(tf)}
                title={`${label} candles`}
              >
                {label}
              </button>
            ))}
            <select
              className="chart-graph-type-select"
              value={graphType}
              onChange={(e) => onGraphTypeChange(e.target.value as ChartGraphType)}
              title="Chart style"
              aria-label="Chart style"
            >
              {CHART_GRAPH_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <button type="button" className="chart-toolbar-icon" title="Indicators">
              <span aria-hidden>📈</span>
            </button>
            <button type="button" className="chart-toolbar-icon" title="Drawing tools">
              <span aria-hidden>✏️</span>
            </button>
          </div>
        ) : null}

        {/* Bottom-center zoom — pill with − | + (above touch layer so clicks work) */}
        <div className="chart-zoom-controls" role="group" aria-label="Chart zoom">
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setZoomIndex((i) => Math.max(0, i - 1));
            }}
            title="Zoom out"
            aria-label="Zoom out"
          >
            −
          </button>
          <span className="chart-zoom-divider" aria-hidden />
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setZoomIndex((i) => Math.min(CHART_ZOOM_STEP_COUNT - 1, i + 1));
            }}
            title="Zoom in"
            aria-label="Zoom in"
          >
            +
          </button>
        </div>
      </div>
    </div>
  );
}

function mergeSnapshot(current: Record<string, MarketTick[]>, ticks: MarketTick[]) {
  const next = { ...current };
  for (const tick of ticks) {
    const sym = tick.symbol.toUpperCase();
    const t = { ...tick, symbol: sym };
    const existing = next[sym] ?? [];
    if (existing.length === 0) {
      next[sym] = [t];
      continue;
    }
    const last = existing[existing.length - 1]!;
    if (t.timestamp === last.timestamp && t.price === last.price) {
      continue;
    }
    if (t.timestamp < last.timestamp) {
      continue;
    }
    next[sym] = [...existing, t].slice(-15000);
  }
  return next;
}

/** Merge historical ticks into chart state so candles show past data when user opens chart after login. */
function mergeHistoryTicks(
  current: Record<string, MarketTick[]>,
  newTicks: MarketTick[]
): Record<string, MarketTick[]> {
  if (newTicks.length === 0) return current;
  const bySymbol = new Map<string, MarketTick[]>();
  for (const t of newTicks) {
    const list = bySymbol.get(t.symbol) ?? [];
    list.push(t);
    bySymbol.set(t.symbol, list);
  }
  const next = { ...current };
  for (const [sym, list] of bySymbol) {
    const existing = next[sym] ?? [];
    const merged = [...existing, ...list].sort((a, b) => a.timestamp - b.timestamp);
    const byTs = new Map<number, MarketTick>();
    for (const t of merged) {
      byTs.set(t.timestamp, t);
    }
    const deduped = [...byTs.values()].sort((a, b) => a.timestamp - b.timestamp);
    next[sym] = deduped.slice(-15000);
  }
  return next;
}

function appendPoint(current: Record<string, MarketTick[]>, tick: MarketTick) {
  const existing = current[tick.symbol] ?? [];
  const nextSeries = [...existing, tick].slice(-15000);
  return {
    ...current,
    [tick.symbol]: nextSeries
  };
}
