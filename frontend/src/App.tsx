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
  candlePeriodEndMs,
  extendClosedCandlesToNow,
  mergeDbClosedWithLiveCandles,
  type CandlePoint
} from "./chartCandles";
import { CHART_ZOOM_STEP_COUNT } from "./chartBarSpacing";
import { lastTickMove } from "./tickDirection";
import { LightweightTradingChart } from "./LightweightTradingChart";
import {
  AccountSnapshot,
  AuthUser,
  TIMEFRAME_OPTIONS,
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
import { APP_NAME, SESSION_STORAGE_KEY, USER_ACCOUNT_WALLET_STORAGE_KEY } from "./appBrand";
import { PHONE_COUNTRY_OPTIONS } from "./phoneCountryCodes";
import { BrandLogo } from "./BrandLogo";
import { DEFAULT_DEMO_BALANCE_INR, formatInr } from "./fundsConfig";
import {
  DockIconDeposit,
  DockIconMarkets,
  DockIconReferral,
  DockIconTradeBars,
  DockIconWithdraw
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

type DashboardSection = "trading" | "deposit" | "withdrawal" | "investment" | "referral" | "about";

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

/** Per-symbol DB+memory merge; ~2 ticks/s → enough buckets for many 5m/10m candles. */
const CHART_HISTORY_TICKS = 35_000;

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
  const [symbol, setSymbol] = useState("EURUSD");
  const [pairNames, setPairNames] = useState<Record<string, string>>({});
  const [forexSymbolList, setForexSymbolList] = useState<string[]>([...FOREX_SYMBOLS_DEFAULT]);
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [quantity, setQuantity] = useState("1");
  /** Chart + trade candle period: 5s … 10m (see TIMEFRAME_OPTIONS). */
  const [chartTimeframe, setChartTimeframe] = useState(5);
  const [binaryTimeframe, setBinaryTimeframe] = useState(5);
  const [mobileTfMenuOpen, setMobileTfMenuOpen] = useState(false);

  const onChartTimeframeChange = (sec: number) => {
    setChartTimeframe(sec);
    setBinaryTimeframe(sec);
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
  const [orderPlacedPopup, setOrderPlacedPopup] = useState<
    null | { account: "demo" | "live"; summary: string; direction: "up" | "down" }
  >(null);
  /** Browser `window.setTimeout` returns `number` (Node types use `NodeJS.Timeout`). */
  const orderPopupTimeoutRef = useRef<number | null>(null);
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
  /** After binary timeout, server settles in RAM — WS does not push trades; we poll + show this banner. */
  const [binarySettleNotice, setBinarySettleNotice] = useState<null | { text: string; pnl: number }>(
    null
  );
  const binarySettleNoticeTimerRef = useRef<number | null>(null);
  const prevOpenBinaryIdsRef = useRef<Set<string>>(new Set());
  const binaryTradesSnapInitializedRef = useRef(false);

  const dismissOrderPlacedPopup = useCallback(() => {
    if (orderPopupTimeoutRef.current) {
      clearTimeout(orderPopupTimeoutRef.current);
      orderPopupTimeoutRef.current = null;
    }
    setOrderPlacedPopup(null);
  }, []);

  const showOrderPlacedPopup = useCallback(
    (account: "demo" | "live", summary: string, direction: "up" | "down") => {
    if (orderPopupTimeoutRef.current) {
      clearTimeout(orderPopupTimeoutRef.current);
    }
    setOrderPlacedPopup({ account, summary, direction });
    orderPopupTimeoutRef.current = window.setTimeout(() => {
      setOrderPlacedPopup(null);
      orderPopupTimeoutRef.current = null;
    }, 5000);
  },
  []
);

  useEffect(() => {
    return () => {
      if (orderPopupTimeoutRef.current) {
        clearTimeout(orderPopupTimeoutRef.current);
      }
      if (binaryCreatedTimerRef.current != null) {
        window.clearTimeout(binaryCreatedTimerRef.current);
      }
      if (binarySettleNoticeTimerRef.current != null) {
        window.clearTimeout(binarySettleNoticeTimerRef.current);
      }
    };
  }, []);

  const scrollMobileTradeHistoryIntoView = useCallback(() => {
    if (typeof window === "undefined" || !window.matchMedia("(max-width: 768px)").matches) {
      return;
    }
    window.requestAnimationFrame(() => {
      document.getElementById("app-mobile-history")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
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
    if (!orderPlacedPopup) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismissOrderPlacedPopup();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [orderPlacedPopup, dismissOrderPlacedPopup]);

  useEffect(() => {
    if (!session) return;
    const id = window.setInterval(() => setTimerTick((n) => n + 1), 1000);
    return () => clearInterval(id);
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
    }
  }, [assetPickerOpen]);

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

  /** Bootstrap closed OHLC from DB for the active symbol + timeframe (VIP ladder). */
  useEffect(() => {
    if (booting || !chartSessionKey) {
      return;
    }
    let cancelled = false;
    const sym = symbol;
    const tf = chartTimeframe;
    const k = `${sym}:${tf}`;
    void loadMarketCandles(sym, tf, 800)
      .then((rows) => {
        if (!cancelled) {
          setDbClosedCandles((prev) => ({ ...prev, [k]: rows }));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDbClosedCandles((prev) => ({ ...prev, [k]: [] }));
        }
      });
    return () => {
      cancelled = true;
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
        const rows = await loadMarketCandles(symbolRef.current, chartTimeframeRef.current, 800);
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

    const ws = new WebSocket(wsUrl);
    ws.onopen = () => {
      wsMarketLiveRef.current = true;
      wsHttpSyncCounterRef.current = 0;
      setStatus("Live");
    };
    ws.onclose = () => {
      wsMarketLiveRef.current = false;
      wsHttpSyncCounterRef.current = 0;
      setStatus("Disconnected");
    };
    ws.onerror = () => {
      wsMarketLiveRef.current = false;
      setStatus("Connection error");
    };
    ws.onmessage = (event) => {
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
        const applyUserSnap = session != null && isPersonalSnap && snapWallet === accountWallet;
        if (applyUserSnap) {
          setAccount(payload.data.account);
          setDualBalances((prev) => ({
            ...prev,
            [accountWallet]: payload.data.account.balance
          }));
          if (Array.isArray(payload.data.trades)) {
            setTrades(payload.data.trades);
          }
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
      wsMarketLiveRef.current = false;
      wsHttpSyncCounterRef.current = 0;
      ws.close();
      window.clearInterval(interval);
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
    setBinarySettleNotice(null);
    if (binarySettleNoticeTimerRef.current != null) {
      window.clearTimeout(binarySettleNoticeTimerRef.current);
      binarySettleNoticeTimerRef.current = null;
    }
  }, [sessionToken, accountWallet]);

  /** While any binary is open, sync trades + balance over HTTP — settlement is server-side only. */
  useEffect(() => {
    if (!sessionToken || openBinaryPollKey === "") {
      return;
    }
    const sync = () => {
      void refreshRef.current(undefined, { skipMarketTicks: true }).catch(() => undefined);
    };
    sync();
    const id = window.setInterval(sync, 1500);
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
      if (binarySettleNoticeTimerRef.current != null) {
        window.clearTimeout(binarySettleNoticeTimerRef.current);
      }
      const settledWithPnl = newlySettled.filter((t): t is Trade & { pnl: number } => typeof t.pnl === "number");
      let text: string;
      if (settledWithPnl.length === 1) {
        const t = settledWithPnl[0]!;
        text = `${formatForexPair(t.symbol)} · Timeout · ${t.pnl >= 0 ? "Win" : "Loss"} ${
          t.pnl >= 0 ? "+" : ""
        }${formatInr(t.pnl)}`;
      } else {
        const total = settledWithPnl.reduce((s, tr) => s + tr.pnl, 0);
        text = `${settledWithPnl.length} trades · Timeout · total ${total >= 0 ? "+" : ""}${formatInr(total)}`;
      }
      const totalPnl = settledWithPnl.reduce((s, tr) => s + tr.pnl, 0);
      setBinarySettleNotice({ text, pnl: totalPnl });
      binarySettleNoticeTimerRef.current = window.setTimeout(() => {
        setBinarySettleNotice(null);
        binarySettleNoticeTimerRef.current = null;
      }, 8500);
      scrollMobileTradeHistoryIntoView();
    }
    prevOpenBinaryIdsRef.current = nowOpen;
  }, [sessionToken, trades]);

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
      scrollMobileTradeHistoryIntoView();
      showOrderPlacedPopup(
        "demo",
        `${direction === "up" ? "Up" : "Down"} · ${formatForexPair(symbol)} · ${binaryTimeframe}s · ${formatInr(amount)}`,
        direction
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
      scrollMobileTradeHistoryIntoView();
      showOrderPlacedPopup(
        "live",
        `${direction === "up" ? "Up" : "Down"} · ${formatForexPair(symbol)} · ${binaryTimeframe}s · ${formatInr(amount)}`,
        direction
      );
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Order failed");
    }
  };

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
          onBack={() => setPublicScreen("landing")}
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
  const headerDemoBal = dualBalances.demo ?? DEFAULT_DEMO_BALANCE_INR;
  const headerLiveBal = dualBalances.live ?? 0;

  return (
    <div
      className={`app-shell${session && isPhone ? " app-mobile-trade" : ""}${session && !isPhone ? " app-guest-desktop-dock" : ""}`}
      data-dock={session && isPhone ? "theme" : undefined}
    >
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
            <BrandLogo className="app-nav-brand-logo" />
            <span className="app-nav-brand">{APP_NAME}</span>
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
              <button
                type="button"
                onClick={() =>
                  document.getElementById("app-trade-history")?.scrollIntoView({ behavior: "smooth", block: "start" })
                }
              >
                History
              </button>
              <button type="button" onClick={() => setAssetPickerOpen(true)}>
                Markets
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
                  void refresh().catch(() => undefined);
                  setMessage("");
                }}
              >
                Refresh
              </button>
              <button
                type="button"
                className={dashboardSection === "about" ? "active" : ""}
                onClick={() => setDashboardSection("about")}
              >
                About
              </button>
              <>
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
                  onClick={() => {
                    setWalletActivityOpen(true);
                  }}
                >
                  Wallet log
                </button>
              </>
            </nav>
          ) : null}
          <div className="app-nav-right">
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
                <span className="app-nav-balance-col-amt">{fmtWallet(headerDemoBal)}</span>
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
                <span className="app-nav-balance-col-amt">{fmtWallet(headerLiveBal)}</span>
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
            {accountWallet === "demo"
              ? "Demo — virtual funds · switch to Live for your funded balance"
              : formatAuthUserContact(session.user)}
          </p>
        ) : null}
      </header>

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
            <div className="app-nav-drawer-links">
              <button
                type="button"
                onClick={() => {
                  setDashboardSection("trading");
                  setMainNavOpen(false);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
              >
                Trading
              </button>
              <button
                type="button"
                onClick={() => {
                  setMainNavOpen(false);
                  setAssetPickerOpen(true);
                }}
              >
                Markets (pairs)
              </button>
              <button
                type="button"
                onClick={() => {
                  setMainNavOpen(false);
                  if (isPhone) {
                    window.requestAnimationFrame(() =>
                      document.getElementById("app-mobile-account")?.scrollIntoView({ behavior: "smooth" })
                    );
                  } else {
                    document.getElementById("app-account-summary")?.scrollIntoView({ behavior: "smooth" });
                  }
                }}
              >
                Account
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
                Trade history
              </button>
              <button
                type="button"
                onClick={() => {
                  setMainNavOpen(false);
                  document.getElementById("app-chart-anchor")?.scrollIntoView({ behavior: "smooth" });
                }}
              >
                Chart
              </button>
              <button
                type="button"
                onClick={() => {
                  setMainNavOpen(false);
                  void refresh().catch(() => undefined);
                  setMessage("Data refreshed.");
                }}
              >
                Refresh data
              </button>
              <button
                type="button"
                onClick={() => {
                  setDashboardSection("about");
                  setMainNavOpen(false);
                }}
              >
                About
              </button>
              <>
                <button
                  type="button"
                  onClick={() => {
                    setDashboardSection("deposit");
                    setMainNavOpen(false);
                  }}
                >
                  Deposit USDT
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDashboardSection("withdrawal");
                    setMainNavOpen(false);
                  }}
                >
                  Withdraw USDT
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDashboardSection("investment");
                    setMainNavOpen(false);
                  }}
                >
                  Investment
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDashboardSection("referral");
                    setMainNavOpen(false);
                  }}
                >
                  Promotion
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMainNavOpen(false);
                    setWalletActivityOpen(true);
                  }}
                >
                  Wallet activity
                </button>
              </>
              <button type="button" className="app-nav-drawer-danger" onClick={() => { setMainNavOpen(false); logout(); }}>
                Log out
              </button>
            </div>
          </nav>
        </div>
      ) : null}

      {dashboardSection === "about" ? (
        <AboutPage embeddedInApp onBack={() => setDashboardSection("trading")} />
      ) : dashboardSection === "deposit" ? (
        <DepositPage
          token={session.token}
          onBack={() => setDashboardSection("trading")}
          onSuccess={() => void refresh()}
        />
      ) : dashboardSection === "withdrawal" ? (
        <WithdrawalPage
          token={session.token}
          balance={account?.balance ?? 0}
          onBack={() => setDashboardSection("trading")}
          onSuccess={() => void refresh()}
        />
      ) : dashboardSection === "investment" ? (
        <InvestmentPage
          token={session.token}
          onBack={() => setDashboardSection("trading")}
          onSuccess={() => void refresh()}
        />
      ) : dashboardSection === "referral" ? (
        <ReferralPage token={session.token} onBack={() => setDashboardSection("trading")} />
      ) : (
      <>
      {session && isPhone ? (
        <main className="mobile-trade-root">
          <header className="mobile-chart-topbar">
            <button
              type="button"
              className="mobile-asset-pill"
              onClick={() => setAssetPickerOpen(true)}
            >
              <span className="mobile-asset-pill-icon">{getAssetIcon(symbol)}</span>
              <span className="mobile-asset-pill-text">{formatForexPair(symbol)} · FX</span>
              <span className="mobile-chevron" aria-hidden>
                ▾
              </span>
            </button>
            <div className="mobile-topbar-right">
              <div className="mobile-tf-wrap" ref={mobileTfWrapRef}>
                <button
                  type="button"
                  className="mobile-tf-pill mobile-tf-pill-trigger"
                  aria-expanded={mobileTfMenuOpen}
                  aria-haspopup="listbox"
                  aria-label="Candle timeframe"
                  onClick={() => setMobileTfMenuOpen((o) => !o)}
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
              <span className="mobile-live-badge">
                <span className="live-dot" />
                Live
              </span>
            </div>
          </header>

          <section className="mobile-asset-list-panel" aria-labelledby="mobile-trade-asset-heading">
            <h3 id="mobile-trade-asset-heading" className="mobile-asset-list-heading">
              Trade — Select asset
            </h3>
            <p className="mobile-asset-list-hint muted">Scroll · tap pair to load chart</p>
            <ul className="mobile-asset-chips">
              {forexSymbolList.map((s) => {
                const tick = markets.find((t) => t.symbol === s);
                const priceDir = lastTickMove(history[s]);
                return (
                  <li key={s} className="mobile-asset-chip-li">
                  <button
                    type="button"
                    className={`mobile-asset-chip ${s === symbol ? "active" : ""}`}
                    onClick={() => setSymbol(s)}
                  >
                    <span className="mobile-asset-chip-top">
                      <span className="mobile-asset-chip-icon">{getAssetIcon(s)}</span>
                      <span className="mobile-asset-chip-pair">{formatForexPair(s)}</span>
                    </span>
                    {tick ? (
                      <span className={`mobile-asset-chip-price ${priceDir ?? ""}`}>
                        {priceDir === "up" ? "↑ " : priceDir === "down" ? "↓ " : ""}
                        {formatFxPrice(s, tick.price)}
                      </span>
                    ) : (
                      <span className="mobile-asset-chip-price muted">—</span>
                    )}
                  </button>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="panel wide mobile-chart-wrap" id="app-chart-anchor">
            <LiveChart
              points={chartSeries}
              closedCandlesFromDb={dbClosedCandles[`${symbol}:${chartTimeframe}`] ?? []}
              symbol={symbol}
              trades={symbolTrades}
              timeframeSec={chartTimeframe}
              onTimeframeChange={onChartTimeframeChange}
              hideSideToolbar
              isMobileChart
              tickDirection={spotTickMove}
            />
          </section>

          <div className="mobile-trade-dock">
            <div className="mobile-bs-row">
              <button
                type="button"
                className={`mobile-bs-btn buy ${mobileSide === "buy" ? "on" : ""}${binaryCreatedFlash === "up" ? " binary-created-flash" : ""}`}
                onClick={() => setMobileSide("buy")}
              >
                {binaryCreatedFlash === "up" ? "Up · Created" : "Up"}
              </button>
              <button
                type="button"
                className={`mobile-bs-btn sell ${mobileSide === "sell" ? "on" : ""}${binaryCreatedFlash === "down" ? " binary-created-flash" : ""}`}
                onClick={() => setMobileSide("sell")}
              >
                {binaryCreatedFlash === "down" ? "Down · Created" : "Down"}
              </button>
            </div>

            <div className="mobile-amount-block">
              <label className="mobile-field-label" htmlFor="mob-amt">
                Amount (₹)
              </label>
              <div className="mobile-input-row">
                <input
                  id="mob-amt"
                  type="number"
                  min={1}
                  step={1}
                  className="mobile-amt-input"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                />
                <div className="mobile-pct-row">
                  {[10, 20, 50, 100].map((pct) => (
                    <button
                      key={pct}
                      type="button"
                      className="mobile-pct-chip"
                      onClick={() => {
                        const b = account?.balance ?? DEFAULT_DEMO_BALANCE_INR;
                        setQuantity(String(Math.max(1, Math.floor((b * pct) / 100))));
                      }}
                    >
                      {pct}%
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="mobile-timeout-strip" data-tick={timerTick}>
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

            <button
              type="button"
              className={`mobile-cta ${mobileSide === "buy" ? "cta-buy" : "cta-sell"}${
                binaryCreatedFlash === (mobileSide === "buy" ? "up" : "down")
                  ? " mobile-cta--created binary-created-flash"
                  : ""
              }`}
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
              <span className="mobile-cta-text">
                <strong className="mobile-cta-title">
                  {binaryCreatedFlash === (mobileSide === "buy" ? "up" : "down")
                    ? mobileSide === "buy"
                      ? "Up · Created"
                      : "Down · Created"
                    : mobileSide === "buy"
                      ? "Create Order Up"
                      : "Create Order Down"}
                </strong>
                <small className={spotTickMove ? `mobile-cta-spot ${spotTickMove}` : undefined}>
                  {spotTickMove === "up" ? "↑ " : spotTickMove === "down" ? "↓ " : ""}
                  {selectedTick ? formatFxPrice(symbol, selectedTick.price) : "—"}
                </small>
              </span>
              <span className="mobile-cta-arrow" aria-hidden>
                {mobileSide === "buy" ? "↑" : "↓"}
              </span>
            </button>
            {message ? <p className="message mobile-trade-msg">{message}</p> : null}
            {binarySettleNotice ? (
              <p
                className={`binary-settle-banner mobile-trade-msg${binarySettleNotice.pnl >= 0 ? " binary-settle-banner--win" : " binary-settle-banner--loss"}`}
                role="status"
              >
                {binarySettleNotice.text}
              </p>
            ) : null}
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
                <div className="mobile-hist-legend">
                  <span>Pair</span>
                  <span>Up / Down</span>
                  <span>Stake</span>
                  <span>Entry</span>
                  <span>Close</span>
                  <span>P&amp;L</span>
                </div>
              ) : null}
              {trades.slice(0, 20).map((trade) => {
                const dir = formatTradeDirectionLabel(trade.direction, trade.side);
                const isBinary = trade.direction === "up" || trade.direction === "down";
                return (
                  <div key={trade.id} className="mobile-hist-item">
                    <div className="mobile-hist-row">
                      <span title={trade.symbol}>{formatForexPair(trade.symbol)}</span>
                      <span
                        className={isBinary ? (trade.direction === "up" ? "dir-up" : "dir-down") : ""}
                        title={isBinary ? `Direction: ${dir}` : undefined}
                      >
                        {isBinary ? (trade.direction === "up" ? "↑ Up" : "↓ Down") : dir}
                      </span>
                      <span title="Stake (₹)">{fmtWallet(trade.quantity)}</span>
                      <span title="Price when order was placed (execution / entry)">
                        {formatFxPrice(trade.symbol, trade.entryPrice)}
                      </span>
                      <span
                        className="mobile-hist-close"
                        title={
                          trade.status === "closed"
                            ? typeof trade.closePrice === "number"
                              ? `Settlement / close price: ${formatFxPrice(trade.symbol, trade.closePrice)}`
                              : "Close price not recorded"
                            : "Shows close price after trade settles"
                        }
                      >
                        {formatTradeCloseCell(trade)}
                      </span>
                      <span
                        className={
                          typeof trade.pnl === "number"
                            ? trade.pnl >= 0
                              ? "pnl-win"
                              : "pnl-loss"
                            : ""
                        }
                        title={
                          trade.status === "closed" && trade.closePrice != null
                            ? `Entry ${formatFxPrice(trade.symbol, trade.entryPrice)} → close ${formatFxPrice(trade.symbol, trade.closePrice)}`
                            : undefined
                        }
                      >
                        {trade.status === "closed" && trade.pnl != null
                          ? trade.pnl >= 0
                            ? `+${fmtWallet(trade.pnl)}`
                            : fmtWallet(trade.pnl)
                          : trade.status === "open"
                            ? "Open"
                            : trade.status}
                      </span>
                    </div>
                    <p
                      className={
                        trade.status === "closed" && isBinary && trade.closePrice != null
                          ? "mobile-hist-meta mobile-hist-meta--settled"
                          : "mobile-hist-meta muted"
                      }
                    >
                      {isBinary ? (
                        trade.status === "open" ? (
                          <>
                            <strong>{trade.direction === "up" ? "Up" : "Down"}</strong> @{" "}
                            {formatFxPrice(trade.symbol, trade.entryPrice)}
                            {trade.timeframeSeconds != null ? ` · ${trade.timeframeSeconds}s` : ""}
                          </>
                        ) : trade.closePrice != null ? (
                          <>
                            <strong>Close</strong> {formatFxPrice(trade.symbol, trade.closePrice)} ·{" "}
                            <strong>Entry</strong> {formatFxPrice(trade.symbol, trade.entryPrice)}
                            {trade.timeframeSeconds != null ? ` · ${trade.timeframeSeconds}s candle` : ""}
                          </>
                        ) : (
                          <>
                            Settled · entry {formatFxPrice(trade.symbol, trade.entryPrice)}
                            {trade.timeframeSeconds != null ? ` · ${trade.timeframeSeconds}s` : ""}
                          </>
                        )
                      ) : (
                        <>
                          Open @ {formatFxPrice(trade.symbol, trade.entryPrice)}
                          {trade.status === "closed" && trade.closePrice != null
                            ? ` → closed @ ${formatFxPrice(trade.symbol, trade.closePrice)}`
                            : null}
                        </>
                      )}
                    </p>
                  </div>
                );
              })}
              {trades.length === 0 ? <p className="muted">No trades yet.</p> : null}
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
              <p style={{ margin: "0.35rem 0 0", fontSize: "0.88rem" }}>
                Share link: add <code>?ref={session.user.selfReferralCode}</code> to the site URL. When your team
                places live binary bets, you earn <strong>0.1%</strong> of stake per level up to{" "}
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
          <p className="muted asset-select-or">Or select a tile</p>
          <div className="asset-grid-scroll">
            <div className="asset-grid">
              {forexSymbolList.map((s) => {
                const tick = markets.find((t) => t.symbol === s);
                const tileMove = lastTickMove(history[s]);
                return (
                  <button
                    key={s}
                    type="button"
                    className={`asset-tile ${s === symbol ? "active" : ""}`}
                    onClick={() => setSymbol(s)}
                  >
                    <span className="asset-tile-icon">{getAssetIcon(s)}</span>
                    <span className="asset-tile-name">{getAssetName(s, pairNames)}</span>
                    <span className="asset-tile-pair">{formatForexPair(s)}</span>
                    {tick ? (
                      <span className={`asset-tile-price${tileMove ? ` ${tileMove}` : ""}`}>
                        {tileMove === "up" ? "↑ " : tileMove === "down" ? "↓ " : ""}
                        {formatFxPrice(s, tick.price)}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
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
              <p className="muted">Top 20 forex · same chart for every period (5s–10m)</p>
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
            tickDirection={spotTickMove}
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
            <p className="muted" style={{ fontSize: "0.9rem", marginTop: "0.35rem" }}>
              Win: wallet gets <strong>1.8×</strong> stake (e.g. {formatInr(100)} → {formatInr(180)}). Loss: full stake
              already taken.
            </p>
            <div className="trade-form binary-trade-form binary-trade-form-inline">
              <label>
                Timeframe (also in bottom bar)
                <select
                  value={binaryTimeframe}
                  onChange={(e) => setBinaryTimeframe(Number(e.target.value))}
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
                  onClick={() => void handleBinaryOrder("up")}
                >
                  {binaryCreatedFlash === "up" ? "Up · Created" : "Up"}
                </button>
                <button
                  type="button"
                  className={`btn-buy-down${binaryCreatedFlash === "down" ? " binary-created-flash" : ""}`}
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
                        {formatForexPair(t.symbol)} · {t.direction === "up" ? "Up" : "Down"} · stake{" "}
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
            <p className="muted" style={{ fontSize: "0.9rem", marginTop: "0.35rem" }}>
              Win: <strong>1.8×</strong> stake back (e.g. {formatInr(100)} → {formatInr(180)}). Loss: full stake.
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
              <span>Stake</span>
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
                  <span title="Stake (₹) at order time">
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
                      trade.status === "closed" && trade.closePrice != null
                        ? `Settlement price: ${formatFxPrice(trade.symbol, trade.closePrice)}`
                        : undefined
                    }
                  >
                    {trade.status === "closed" && typeof trade.pnl === "number"
                      ? (trade.pnl >= 0 ? `+${fmtWallet(trade.pnl)}` : fmtWallet(trade.pnl))
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
                onChange={(e) => setBinaryTimeframe(Number(e.target.value))}
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
              <input
                type="number"
                min={1}
                step={1}
                className="desktop-demo-amt"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </label>
            <div className="desktop-demo-block desktop-demo-bs-block">
              <span className="desktop-demo-label">Direction</span>
              <div className="desktop-demo-bs-row">
                <button
                  type="button"
                  className={`desktop-demo-bs-btn buy ${mobileSide === "buy" ? "on" : ""}${binaryCreatedFlash === "up" ? " binary-created-flash" : ""}`}
                  onClick={() => setMobileSide("buy")}
                >
                  {binaryCreatedFlash === "up" ? "Up · Created" : "Up"}
                </button>
                <button
                  type="button"
                  className={`desktop-demo-bs-btn sell ${mobileSide === "sell" ? "on" : ""}${binaryCreatedFlash === "down" ? " binary-created-flash" : ""}`}
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
                  stake{" "}
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
          {binarySettleNotice ? (
            <p
              className={`binary-settle-banner desktop-demo-bar-msg${binarySettleNotice.pnl >= 0 ? " binary-settle-banner--win" : " binary-settle-banner--loss"}`}
              role="status"
            >
              {binarySettleNotice.text}
            </p>
          ) : null}
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
            <p className="muted asset-picker-sub">All pairs · click to open chart</p>
            <div className="asset-grid asset-grid-modal">
              {forexSymbolList.map((s) => {
                const tick = markets.find((t) => t.symbol === s);
                const tileMove = lastTickMove(history[s]);
                return (
                  <button
                    key={s}
                    type="button"
                    className={`asset-tile ${s === symbol ? "active" : ""}`}
                    onClick={() => {
                      setSymbol(s);
                      setAssetPickerOpen(false);
                    }}
                  >
                    <span className="asset-tile-icon">{getAssetIcon(s)}</span>
                    <span className="asset-tile-name">{getAssetName(s, pairNames)}</span>
                    <span className="asset-tile-pair">{formatForexPair(s)}</span>
                    {tick ? (
                      <span className={`asset-tile-price${tileMove ? ` ${tileMove}` : ""}`}>
                        {tileMove === "up" ? "↑ " : tileMove === "down" ? "↓ " : ""}
                        {formatFxPrice(s, tick.price)}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}
      </>
      )}
      {session && isPhone ? (
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
                {walletTxs.map((tx) => (
                  <div key={tx.id} className="wallet-tx-row">
                    <div className="wallet-tx-row-main">
                      <strong>{tx.txn_type.replace(/_/g, " ")}</strong>
                      <span className={tx.amount >= 0 ? "wallet-tx-pos" : "wallet-tx-neg"}>
                        {tx.amount >= 0 ? "+" : ""}
                        {formatInr(Number(tx.amount))}
                      </span>
                    </div>
                    <div className="wallet-tx-row-sub muted">
                      Bal {formatInr(Number(tx.before_balance))} → {formatInr(Number(tx.after_balance))} ·{" "}
                      {new Date(tx.created_at).toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null}
      {orderPlacedPopup ? (
        <div
          className="order-placed-backdrop"
          role="presentation"
          onClick={dismissOrderPlacedPopup}
        >
          <div
            className={`order-placed-modal order-placed-modal--${orderPlacedPopup.direction}`}
            role="alertdialog"
            aria-labelledby="order-placed-title"
            aria-describedby="order-placed-desc"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="order-placed-icon" aria-hidden>
              ✓
            </div>
            <p className={`order-placed-badge ${orderPlacedPopup.account}`}>
              {orderPlacedPopup.account === "demo" ? "Demo account" : "Live account"}
            </p>
            <p className={`order-placed-direction order-placed-direction--${orderPlacedPopup.direction}`}>
              {orderPlacedPopup.direction === "up" ? "↑ Up" : "↓ Down"}
            </p>
            <h2 id="order-placed-title" className="order-placed-title">
              Order created
            </h2>
            <p id="order-placed-desc" className="order-placed-summary">
              {orderPlacedPopup.summary}
            </p>
            <button type="button" className="order-placed-ok" onClick={dismissOrderPlacedPopup}>
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

          <div className="auth-phone-row">
            <label className="auth-cc-field">
              Country code
              <input
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
            </label>
            <label className="auth-phone-field">
              Mobile number
              <input
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
              />
            </label>
          </div>

          <label>
            Password
            <input
              type="password"
              value={authView === "login" ? loginForm.password : registerForm.password}
              onChange={(event) => {
                const value = event.target.value;
                if (authView === "login") {
                  onLoginFormChange((current) => ({ ...current, password: value }));
                  return;
                }

                onRegisterFormChange((current) => ({ ...current, password: value }));
              }}
              placeholder="••••••••"
              autoComplete={authView === "login" ? "current-password" : "new-password"}
            />
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
/** Index `0` = minimum bar spacing (widest view). */
const MOBILE_DEFAULT_ZOOM_INDEX = 0;
const DESKTOP_DEFAULT_ZOOM_INDEX = 0;

function LiveChart({
  points,
  closedCandlesFromDb = [],
  symbol,
  trades,
  timeframeSec,
  onTimeframeChange,
  hideSideToolbar = false,
  isMobileChart = false,
  tickDirection = null
}: {
  points: MarketTick[];
  /** Closed OHLC from `/api/markets/candles` (DB); live leg from WebSocket `live_price` ticks. */
  closedCandlesFromDb?: CandlePoint[];
  symbol: string;
  trades: Trade[];
  timeframeSec: number;
  onTimeframeChange: (sec: number) => void;
  hideSideToolbar?: boolean;
  /** Wider default zoom + reset on TF change (Olymp / TV-style mobile chart). */
  isMobileChart?: boolean;
  tickDirection?: "up" | "down" | null;
}) {
  const [, setTick] = useState(0);
  const defaultZoom = isMobileChart ? MOBILE_DEFAULT_ZOOM_INDEX : DESKTOP_DEFAULT_ZOOM_INDEX;
  const [zoomIndex, setZoomIndex] = useState(defaultZoom);
  /** Touch/tap on timer badge zooms the time text (mobile). */
  const [timerTextZoomed, setTimerTextZoomed] = useState(false);
  const chartWrapRef = useRef<HTMLDivElement>(null);
  const pinchRef = useRef<{ initialDistance: number; initialZoomIndex: number } | null>(null);
  const zoomIndexRef = useRef(zoomIndex);
  zoomIndexRef.current = zoomIndex;

  /** 1s tick: countdown + current candle stay aligned with selected timeframe (same buckets as `buildCandles`). */
  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    setZoomIndex(isMobileChart ? MOBILE_DEFAULT_ZOOM_INDEX : DESKTOP_DEFAULT_ZOOM_INDEX);
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

  const now = Date.now();
  const firstTickMs =
    points.length > 0 ? Math.min(...points.map((p) => p.timestamp)) : null;
  const liveCandles =
    points.length > 0 ? buildCandles(points, timeframeSec, now) : [];

  let allCandles: CandlePoint[];
  if (points.length === 0) {
    allCandles =
      closedCandlesFromDb.length > 0
        ? extendClosedCandlesToNow(closedCandlesFromDb, timeframeSec, now)
        : [];
  } else if (closedCandlesFromDb.length > 0) {
    allCandles = mergeDbClosedWithLiveCandles(
      closedCandlesFromDb,
      liveCandles,
      timeframeSec,
      firstTickMs
    );
  } else {
    allCandles = liveCandles;
  }

  if (allCandles.length === 0) {
    return <p className="muted">Waiting for live price data...</p>;
  }

  const current = allCandles[allCandles.length - 1]!;
  const change = allCandles.length > 1 ? current.close - allCandles[0].open : 0;
  const changePct =
    allCandles.length > 1 && allCandles[0].open !== 0 ? (change / allCandles[0].open) * 100 : 0;
  const openTrades = trades.filter((trade) => trade.status === "open");
  const fmtPrice = (p: number) =>
    p >= 1000 ? p.toFixed(2) : p >= 1 ? p.toFixed(4) : p.toFixed(6);

  const pairLabel = formatForexPair(symbol);

  /** Same UTC bucket end as server `binaryCandleExpiresAtMs` — new candle when this hits 00:00. */
  const candleEndMs = candlePeriodEndMs(now, timeframeSec);
  const msLeft = Math.max(0, candleEndMs - now);
  const totalSec = Math.max(0, Math.ceil(msLeft / 1000));
  const cdSec = Math.min(3599, totalSec);
  const countdownStr = `${String(Math.floor(cdSec / 60)).padStart(2, "0")}:${String(cdSec % 60).padStart(2, "0")}`;

  const chartResetKey = `${symbol}-${timeframeSec}`;

  return (
    <div className={`chart-card tv-chart chart-wrapper-ref${isMobileChart ? " tv-chart-mobile" : ""}`}>
      <div className="chart-meta tv-chart-toolbar">
        <div className="tv-toolbar-left">
          <strong className="tv-symbol">{pairLabel}</strong>
          {tickDirection ? (
            <span className={`tv-spot-tick ${tickDirection}`} aria-hidden>
              {tickDirection === "up" ? "↑" : "↓"}
            </span>
          ) : null}
          <span className="tv-ohlc">
            O {fmtPrice(current.open)} H {fmtPrice(current.high)} L {fmtPrice(current.low)} C{" "}
            {fmtPrice(current.close)}
          </span>
          <span className={change >= 0 ? "tv-change up" : "tv-change down"}>
            {change >= 0 ? "+" : ""}
            {change.toFixed(4)} ({changePct.toFixed(2)}%)
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
          <span>Trades: {openTrades.length}</span>
        </div>
      </div>
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
            candles={allCandles}
            assetTag={symbol}
            timeframeLabel={tfLabel(timeframeSec)}
            formatPrice={fmtPrice}
            timeframeSec={timeframeSec}
            zoomIndex={zoomIndex}
            isMobileChart={isMobileChart}
            chartResetKey={chartResetKey}
            countdownStr={countdownStr}
            timerTextZoomed={timerTextZoomed}
            onTimerTap={() => setTimerTextZoomed((z) => !z)}
            tickDirection={tickDirection}
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
            <button type="button" className="chart-toolbar-icon" title="Chart type">
              <span aria-hidden>📊</span>
            </button>
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
