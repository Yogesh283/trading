export interface MarketTick {
  symbol: string;
  price: number;
  timestamp: number;
  source: "binance" | "forex";
}

export interface AccountSnapshot {
  balance: number;
  equity: number;
  unrealizedPnl: number;
  realizedPnl: number;
  openTrades: Array<{
    id: string;
    symbol: string;
    side: "buy" | "sell";
    quantity: number;
    entryPrice: number;
    openedAt: string;
    status: "open" | "closed";
  }>;
  tradeCount: number;
}

export interface Trade {
  id: string;
  symbol: string;
  side: "buy" | "sell";
  quantity: number;
  entryPrice: number;
  openedAt: string;
  status: "open" | "closed";
  closePrice?: number;
  closedAt?: string;
  pnl?: number;
  direction?: "up" | "down";
  expiryAt?: number;
  timeframeSeconds?: number;
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  /** Mobile signup; null for legacy accounts. */
  phoneCountryCode: string | null;
  phoneLocal: string | null;
  createdAt: string;
  /** Your invite code (share with new signups). */
  selfReferralCode: string;
  role: "user" | "admin";
  /** From /api/auth/me — withdrawal authenticator enabled (legacy). */
  withdrawalTotpEnabled?: boolean;
  /** Setup started but not confirmed. */
  withdrawalTotpSetupPending?: boolean;
  /** From /api/auth/me — 4-digit withdrawal TPIN saved (hashed on server). */
  withdrawalTpinSet?: boolean;
}

export interface AuthDatabaseInfo {
  kind: "mysql" | "sqlite";
  /** MySQL database name when kind is mysql */
  database?: string;
  /** SQLite file path when kind is sqlite */
  file?: string;
}

export interface AuthResponse {
  user: AuthUser;
  token: string;
  /** Present on register/login from API — use to match phpMyAdmin vs SQLite file */
  database?: AuthDatabaseInfo;
}

import { getBackendHttpOrigin } from "./backendOrigin";

function apiBase(): string {
  return getBackendHttpOrigin();
}

export type WalletType = "demo" | "live";

function requestHeaders(token?: string | null, wallet?: WalletType): Record<string, string> {
  const headers: Record<string, string> = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  if (token && wallet) {
    headers["X-Account-Type"] = wallet;
  }
  return headers;
}

/** Some older deployments returned this on order POST routes; current API allows trading 7 days/week. */
function isLegacyWeekendMarketClosedMessage(msg: string): boolean {
  return (
    /market\s+is\s+closed\s+on\s+weekends/i.test(msg) &&
    /\bnew\s+orders\s+are\s+disabled\b/i.test(msg)
  );
}

async function parseJson<T>(response: Response) {
  if (!response.ok) {
    const error = (await response.json().catch(() => null)) as { message?: string } | null;
    const raw = error?.message ?? "Request failed";
    if (isLegacyWeekendMarketClosedMessage(raw)) {
      throw new Error("Restart the trading API (npm run dev) — deployed server is an old build that still blocks orders.");
    }
    throw new Error(raw);
  }

  return (await response.json()) as T;
}

/** Always hit the backend — never serve stale asset prices from the browser cache. */
const FETCH_MARKETS_LIVE: RequestInit = {
  cache: "no-store",
  headers: { Accept: "application/json" }
};

/**
 * Live deployments sometimes mis-route `/api/*` to the SPA (HTML). Detect that so fixes point at nginx.
 * See DEPLOY.md — `location /api/` must be before the SPA catch‑all and proxy to Node.
 */
async function readJsonFromOkResponse(response: Response, endpoint: string): Promise<unknown> {
  const text = await response.text();
  const t = text.trimStart();
  if (t.startsWith("<") || (t.length > 0 && !t.startsWith("{") && !t.startsWith("["))) {
    throw new Error(
      `${endpoint} returned a non-JSON page — usually nginx/Apache sent index.html instead of Node. Put location /api/ before location / and proxy_pass to the app (see DEPLOY.md).`
    );
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(`${endpoint}: invalid JSON from server`);
  }
}

export async function loadMarkets() {
  const response = await fetch(`${apiBase()}/api/markets`, FETCH_MARKETS_LIVE);
  if (!response.ok) {
    throw new Error("Unable to load markets");
  }

  return (await readJsonFromOkResponse(response, "GET /api/markets")) as {
    symbols: string[];
    ticks: MarketTick[];
    pairs?: Array<{ symbol: string; name: string }>;
  };
}

/** Fetch historical ticks for chart so candles appear from before login. */
export async function loadMarketsHistory(symbol?: string, limit = 500) {
  const params = new URLSearchParams();
  if (symbol) params.set("symbol", symbol);
  params.set("limit", String(limit));
  const response = await fetch(`${apiBase()}/api/markets/history?${params}`, FETCH_MARKETS_LIVE);
  if (!response.ok) {
    throw new Error("Unable to load chart history");
  }
  return (await readJsonFromOkResponse(response, "GET /api/markets/history")) as { ticks: MarketTick[] };
}

/** Closed OHLC from DB (merge with WebSocket LivePrice ticks on the chart). */
export async function loadMarketCandles(symbol: string, timeframeSec: number, limit = 500) {
  const params = new URLSearchParams({
    symbol: symbol.trim().toUpperCase(),
    timeframe: String(timeframeSec),
    limit: String(limit)
  });
  const response = await fetch(`${apiBase()}/api/markets/candles?${params}`, FETCH_MARKETS_LIVE);
  if (!response.ok) {
    throw new Error("Unable to load chart candles");
  }
  const data = (await readJsonFromOkResponse(response, "GET /api/markets/candles")) as {
    candles?: Array<{ t: number; o: number; h: number; l: number; c: number }>;
  };
  const rows = Array.isArray(data.candles) ? data.candles : [];
  return rows
    .map((r) => ({
      timestamp: Number(r.t),
      open: Number(r.o),
      high: Number(r.h),
      low: Number(r.l),
      close: Number(r.c)
    }))
    .filter((c) => Number.isFinite(c.timestamp) && Number.isFinite(c.close));
}

async function fetchJsonOrThrow(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (e) {
    if (e instanceof TypeError) {
      throw new Error(
        "API server not reachable. Start backend: in project root run `npm run dev` (port 3000), then use frontend with `npm run frontend:dev`."
      );
    }
    throw e;
  }
}

export async function registerUser(input: {
  name: string;
  countryCode: string;
  phone: string;
  password: string;
  referralCode?: string;
}) {
  const response = await fetchJsonOrThrow(`${apiBase()}/api/auth/register`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      name: input.name,
      countryCode: input.countryCode,
      phone: input.phone,
      password: input.password,
      referralCode: input.referralCode
    })
  });

  return parseJson<AuthResponse>(response);
}

/** App: countryCode + phone + password. Admin: email + password. Legacy: user id in `email` + password. */
export async function loginUser(input: {
  email?: string;
  countryCode?: string;
  phone?: string;
  password: string;
}) {
  const body: Record<string, string> = { password: input.password };
  if (input.email != null && String(input.email).trim() !== "") {
    body.email = String(input.email).trim();
  }
  if (input.countryCode != null && String(input.countryCode).trim() !== "") {
    body.countryCode = String(input.countryCode).trim();
  }
  if (input.phone != null && String(input.phone).trim() !== "") {
    body.phone = String(input.phone).trim();
  }
  const response = await fetchJsonOrThrow(`${apiBase()}/api/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  return parseJson<AuthResponse>(response);
}

export async function requestForgotPasswordOtp(input: { countryCode: string; phone: string }) {
  const response = await fetchJsonOrThrow(`${apiBase()}/api/auth/forgot-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ countryCode: input.countryCode, phone: input.phone })
  });
  return parseJson<{ ok: true; debugOtp?: string }>(response);
}

export async function resetPasswordWithOtpApi(input: {
  countryCode: string;
  phone: string;
  otp: string;
  newPassword: string;
}) {
  const response = await fetchJsonOrThrow(`${apiBase()}/api/auth/reset-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      countryCode: input.countryCode,
      phone: input.phone,
      otp: input.otp,
      newPassword: input.newPassword
    })
  });
  return parseJson<{ ok: true }>(response);
}

/** Forgot password: mobile + new password only (no OTP). */
export async function resetPasswordByPhoneApi(input: {
  countryCode: string;
  phone: string;
  newPassword: string;
}) {
  const response = await fetchJsonOrThrow(`${apiBase()}/api/auth/reset-password-by-phone`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      countryCode: input.countryCode,
      phone: input.phone,
      newPassword: input.newPassword
    })
  });
  return parseJson<{ ok: true }>(response);
}

export async function loadSession(token: string) {
  const response = await fetch(`${apiBase()}/api/auth/me`, {
    headers: {
      ...requestHeaders(token)
    }
  });

  return parseJson<{ user: AuthUser }>(response);
}

export async function loadAccount(token?: string | null, wallet: WalletType = "demo") {
  const response = await fetch(`${apiBase()}/api/account`, {
    headers: {
      ...requestHeaders(token, token ? wallet : undefined)
    }
  });
  if (!response.ok) {
    throw new Error("Unable to load account");
  }

  return (await response.json()) as AccountSnapshot;
}

/** Add virtual INR to the demo wallet (logged-in only). Omit `amount` to add one default tranche (server `DEMO_START_BALANCE`). */
export async function addDemoFunds(token: string, amount?: number) {
  const response = await fetch(`${apiBase()}/api/me/demo/add-funds`, {
    method: "POST",
    headers: {
      ...requestHeaders(token),
      "Content-Type": "application/json"
    },
    body: JSON.stringify(amount === undefined ? {} : { amount })
  });
  return parseJson<{ ok: true; demo_balance: number; added: number }>(response);
}

export async function loadTrades(token?: string | null, wallet: WalletType = "demo") {
  const response = await fetch(`${apiBase()}/api/trades`, {
    headers: {
      ...requestHeaders(token, token ? wallet : undefined)
    }
  });

  return parseJson<{ trades: Trade[] }>(response);
}

export interface WalletLedgerRow {
  id: string;
  txn_type: string;
  amount: number;
  before_balance: number;
  after_balance: number;
  reference_id: string | null;
  created_at: string;
}

export async function loadWalletTransactions(token: string) {
  const response = await fetch(`${apiBase()}/api/wallet/transactions`, {
    headers: { ...requestHeaders(token) }
  });
  return parseJson<{ transactions: WalletLedgerRow[] }>(response);
}

export interface InvestmentInfo {
  principal: number;
  lockedUntil: string | null;
  locked: boolean;
  secondsUntilUnlock: number;
  liveWalletBalance: number;
  monthlyYieldPercent: number;
  /** Legacy; daily accrual removed — 0. */
  dailyYieldPercent: number;
  estimatedMonthlyIncome: number;
  /** principal × monthly ROI % (before upline split). */
  estimatedMonthlyGrossYield?: number;
  /** Sum of admin upline shares of gross (0–1). */
  uplinePercentOfMonthlyGrossSum?: number;
  /** Investor’s share of gross (0–1). */
  investorNetFractionOfGross?: number;
  /** Legacy — 0; use estimatedMonthlyIncome. */
  estimatedDailyIncome: number;
  lastYieldDate: string | null;
  /** Last calendar month (YYYY-MM UTC) when monthly ROI was credited. */
  lastMonthlyYieldYm: string | null;
  payoutDayUtc: number;
  explanation: string;
}

export interface ReferralTeamMember {
  id: string;
  name: string;
  email: string;
  mobile: string;
  createdAt: string;
  selfReferralCode: string;
  liveWalletBalanceInr: number;
  totalDepositedUsdt: number;
  /** 1 = your direct referral; deeper = indirect (full team list). */
  depth?: number;
}

export interface BetStakeLevelScheduleRow {
  level: number;
  uplineLabel: string;
  fractionOfStake: number;
  percentLabel: string;
  paysOut: boolean;
  exampleIncomeInr: number;
  /** Total INR you received from this upline depth (binary + staking commissions). */
  receivedInr?: number;
}

export interface MonthlyRoiLevelScheduleRow {
  level: number;
  uplineLabel: string;
  fractionOfGrossYield: number;
  percentLabel: string;
  paysOut: boolean;
  /** Total INR you received from monthly ROI upline at this depth. */
  receivedInr?: number;
}

export interface ReferralSummary {
  selfReferralCode: string;
  inviter: { name: string; email: string; mobile: string } | null;
  /** Direct referrals only (depth 1). */
  directTeam: ReferralTeamMember[];
  /** Full downline — every level under you (includes directs). */
  downlineTeam?: ReferralTeamMember[];
  /** All-time direct count. */
  directCount: number;
  /** Direct referrals who joined today (IST). */
  directJoinedTodayCount?: number;
  /** All-time total downline size (all levels). */
  totalTeamCount: number;
  /** Sum of direct referrals’ live wallet (INR). */
  directTotalLiveBalanceInr: number;
  /** Sum of direct referrals’ credited deposits (USDT). */
  directTeamTotalDepositsUsdt: number;
  /** Today (IST) commissions (promotion page level income block). */
  totalReferralCommissionInr?: number;
  /** From referrals’ live binary stakes. */
  bettingCommissionInr?: number;
  /** From referrals’ staking (investment) deposits. */
  stakingCommissionInr?: number;
  /** From referrals’ monthly investment ROI (level_income_roi). */
  investmentRoiCommissionInr?: number;
  /** Master switch: level income on stakes not paid when false. */
  referralProgramEnabled?: boolean;
  /** Stake used for example INR column (live binary + investment add). */
  levelIncomeExampleStakeInr?: number;
  betStakeLevelSchedule?: BetStakeLevelScheduleRow[];
  monthlyRoiLevelSchedule?: MonthlyRoiLevelScheduleRow[];
}

export async function loadReferralSummary(token: string) {
  const response = await fetch(`${apiBase()}/api/referrals/summary`, {
    headers: { ...requestHeaders(token) }
  });
  const j = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((j as { message?: string }).message ?? "Failed to load referrals");
  }
  return j as ReferralSummary;
}

/** Optional: OpenAI narration + bias for app-computed signal JSON (`POST /api/ai/explain-signal`). Requires server `OPENAI_API_KEY`. */
export async function explainSignalAI(
  token: string,
  signal: Record<string, unknown>,
  locale?: string
): Promise<{ explanation: string; direction: "up" | "down" | "neutral" }> {
  const response = await fetch(`${apiBase()}/api/ai/explain-signal`, {
    method: "POST",
    headers: { ...requestHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify({ signal, ...(locale ? { locale } : {}) })
  });
  const j = await parseJson<{ explanation: string; direction?: string }>(response);
  const d = String(j.direction ?? "").toLowerCase();
  const direction =
    d === "up" || d === "down" || d === "neutral" ? d : ("neutral" as const);
  return { explanation: j.explanation, direction };
}

export interface SupportTicket {
  id: string;
  subject: string;
  body: string;
  status: string;
  createdAt: string;
}

export async function loadSupportTickets(token: string): Promise<SupportTicket[]> {
  const response = await fetch(`${apiBase()}/api/support/tickets`, {
    headers: { ...requestHeaders(token) }
  });
  const j = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((j as { message?: string }).message ?? "Failed to load tickets");
  }
  return (j as { tickets: SupportTicket[] }).tickets ?? [];
}

export async function createSupportTicket(token: string, subject: string, body: string): Promise<SupportTicket> {
  const response = await fetch(`${apiBase()}/api/support/tickets`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...requestHeaders(token) },
    body: JSON.stringify({ subject, body })
  });
  const j = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((j as { message?: string }).message ?? "Failed to create ticket");
  }
  return (j as { ticket: SupportTicket }).ticket;
}

export async function loadInvestment(token: string) {
  const response = await fetch(`${apiBase()}/api/investment`, {
    headers: { ...requestHeaders(token) }
  });
  if (!response.ok) {
    const j = await response.json().catch(() => ({}));
    throw new Error((j as { message?: string }).message ?? "Failed to load investment");
  }
  return (await response.json()) as InvestmentInfo;
}

export async function investmentDeposit(token: string, amount: number) {
  const response = await fetch(`${apiBase()}/api/investment/deposit`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...requestHeaders(token) },
    body: JSON.stringify({ amount })
  });
  const j = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((j as { message?: string }).message ?? "Deposit failed");
  }
  return j as InvestmentInfo;
}

export async function investmentWithdraw(token: string, amount: number) {
  const response = await fetch(`${apiBase()}/api/investment/withdraw`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...requestHeaders(token) },
    body: JSON.stringify({ amount })
  });
  const j = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((j as { message?: string }).message ?? "Withdraw failed");
  }
  return j as InvestmentInfo;
}

export interface DepositRecord {
  id: string;
  user_id: string;
  user_email: string;
  amount: number;
  wallet_provider: string;
  admin_to_address: string;
  token_contract: string;
  chain_id: number;
  from_address: string | null;
  tx_hash: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface WithdrawalRecord {
  id: string;
  user_id: string;
  user_email: string;
  amount: number;
  to_address: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export type WithdrawalTotpStatus = {
  enabled: boolean;
  setupPending: boolean;
};

export type WithdrawalTpinStatus = {
  pinSet: boolean;
};

export async function loadWithdrawalTpinStatus(token: string): Promise<WithdrawalTpinStatus> {
  const response = await fetch(`${apiBase()}/api/me/withdrawal-tpin/status`, {
    headers: { ...requestHeaders(token, "live") }
  });
  const j = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((j as { message?: string }).message ?? "Failed to load TPIN status");
  }
  return j as WithdrawalTpinStatus;
}

export async function setWithdrawalTpinApi(
  token: string,
  pin: string,
  confirmPin: string
): Promise<void> {
  const response = await fetch(`${apiBase()}/api/me/withdrawal-tpin/set`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...requestHeaders(token, "live") },
    body: JSON.stringify({ pin, confirmPin })
  });
  const j = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((j as { message?: string }).message ?? "Failed to save TPIN");
  }
}

export async function changeWithdrawalTpinApi(
  token: string,
  currentPin: string,
  pin: string,
  confirmPin: string
): Promise<void> {
  const response = await fetch(`${apiBase()}/api/me/withdrawal-tpin/change`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...requestHeaders(token, "live") },
    body: JSON.stringify({ currentPin, pin, confirmPin })
  });
  const j = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((j as { message?: string }).message ?? "Failed to change TPIN");
  }
}

export async function loadWithdrawalTotpStatus(token: string): Promise<WithdrawalTotpStatus> {
  const response = await fetch(`${apiBase()}/api/me/withdrawal-totp/status`, {
    headers: { ...requestHeaders(token, "live") }
  });
  const j = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((j as { message?: string }).message ?? "Failed to load TPN status");
  }
  return j as WithdrawalTotpStatus;
}

export async function beginWithdrawalTotpSetup(token: string): Promise<{ secret: string; otpauthUrl: string }> {
  const response = await fetch(`${apiBase()}/api/me/withdrawal-totp/begin`, {
    method: "POST",
    headers: { ...requestHeaders(token, "live") }
  });
  const j = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((j as { message?: string }).message ?? "Failed to start TPN setup");
  }
  return j as { secret: string; otpauthUrl: string };
}

export async function confirmWithdrawalTotpSetup(token: string, code: string): Promise<void> {
  const response = await fetch(`${apiBase()}/api/me/withdrawal-totp/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...requestHeaders(token, "live") },
    body: JSON.stringify({ code })
  });
  const j = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((j as { message?: string }).message ?? "Confirm failed");
  }
}

export async function submitWithdrawalRequest(
  token: string,
  amount: number,
  toAddress: string,
  tpinOrTotp: string
) {
  const response = await fetch(`${apiBase()}/api/withdrawals`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...requestHeaders(token, "live") },
    body: JSON.stringify({ amount, toAddress, tpin: tpinOrTotp })
  });
  return parseJson<{
    withdrawal: WithdrawalRecord;
    inrDebited?: number;
    inrPerUsdt?: number;
  }>(response);
}

export async function loadMyWithdrawals(token: string) {
  const response = await fetch(`${apiBase()}/api/withdrawals/my`, {
    headers: { ...requestHeaders(token, "live") }
  });
  return parseJson<{ withdrawals: WithdrawalRecord[] }>(response);
}

export type DepositPublicInfo = {
  treasuryAddress: string;
  tokenContract: string;
  chainId: number;
  networkName: string;
};

/** No login — show platform receive address on deposit screen. */
export async function loadDepositPublicInfo(): Promise<DepositPublicInfo | null> {
  try {
    const response = await fetch(`${apiBase()}/api/deposits/public-info`);
    if (!response.ok) return null;
    return (await response.json()) as DepositPublicInfo;
  } catch {
    return null;
  }
}

export async function createDepositIntent(
  token: string,
  amount: number,
  walletProvider: string
) {
  const response = await fetch(`${apiBase()}/api/deposits/intent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...requestHeaders(token) },
    body: JSON.stringify({ amount, walletProvider })
  });
  return parseJson<{
    deposit: DepositRecord;
    chainId: number;
    chainIdHex: string;
    tokenAddress: string;
    toAddress: string;
    amount: number;
    decimals: number;
    inrPerUsdt?: number;
    walletCreditInr?: number;
  }>(response);
}

export type SubmitDepositTxResponse = {
  ok: boolean;
  pendingReview?: boolean;
  deposit: DepositRecord;
  message?: string;
  creditedUsdt?: number;
  creditedInr?: number;
  inrPerUsdt?: number;
};

export async function submitDepositTx(
  token: string,
  depositId: string,
  txHash: string,
  fromAddress: string,
  amountUsdt?: number
) {
  const response = await fetch(`${apiBase()}/api/deposits/submit-tx`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...requestHeaders(token) },
    body: JSON.stringify({
      depositId,
      txHash,
      fromAddress,
      ...(amountUsdt != null && Number.isFinite(amountUsdt) ? { amountUsdt } : {})
    })
  });
  return parseJson<SubmitDepositTxResponse>(response);
}

export async function adminApproveDeposit(adminToken: string, depositId: string) {
  const response = await fetch(`${apiBase()}/api/deposits/admin-approve`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${adminToken}`
    },
    body: JSON.stringify({ depositId })
  });
  const j = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((j as { message?: string }).message ?? "Approve failed");
  }
  return j as {
    ok: boolean;
    depositId: string;
    userId: string;
    creditedUsdt: number;
    creditedInr: number;
    inrPerUsdt?: number;
  };
}

export async function adminApproveWithdrawal(adminToken: string, withdrawalId: string) {
  const response = await fetch(`${apiBase()}/api/admin/withdrawals/approve`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${adminToken}`
    },
    body: JSON.stringify({ withdrawalId })
  });
  const j = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((j as { message?: string }).message ?? "Approve failed");
  }
  return j as { ok: boolean; withdrawalId: string; userId?: string; idempotent?: boolean };
}

export async function adminRejectWithdrawal(adminToken: string, withdrawalId: string) {
  const response = await fetch(`${apiBase()}/api/admin/withdrawals/reject`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${adminToken}`
    },
    body: JSON.stringify({ withdrawalId })
  });
  const j = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((j as { message?: string }).message ?? "Reject failed");
  }
  return j as { ok: boolean; withdrawalId: string; userId?: string; idempotent?: boolean; refundedInr?: number };
}

export type AdminWithdrawalStatus = "pending" | "processing" | "completed" | "rejected";

export async function adminSetWithdrawalStatus(
  adminToken: string,
  withdrawalId: string,
  status: AdminWithdrawalStatus
) {
  const response = await fetch(`${apiBase()}/api/admin/withdrawals/set-status`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${adminToken}`
    },
    body: JSON.stringify({ withdrawalId, status })
  });
  const j = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((j as { message?: string }).message ?? "Status update failed");
  }
  return j as {
    ok: boolean;
    withdrawalId: string;
    status?: AdminWithdrawalStatus;
    userId?: string;
    idempotent?: boolean;
    refundedInr?: number;
  };
}

export async function loadMyDeposits(token: string) {
  const response = await fetch(`${apiBase()}/api/deposits/my`, {
    headers: { ...requestHeaders(token) }
  });
  return parseJson<{ deposits: DepositRecord[] }>(response);
}

export async function loadAdminDeposits(adminToken: string) {
  const response = await fetch(`${apiBase()}/api/deposits/admin-all`, {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  if (!response.ok) {
    const err = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(err?.message ?? "Admin request failed");
  }
  return (await response.json()) as { deposits: DepositRecord[]; total: number };
}

/** Chart + binary (matches server TRADE_TIMEFRAMES_SEC). */
export const TIMEFRAME_OPTIONS = [
  { value: 5, label: "5s" },
  { value: 10, label: "10s" },
  { value: 30, label: "30s" },
  { value: 60, label: "1m" },
  { value: 180, label: "3m" },
  { value: 300, label: "5m" }
] as const;

export type ChartTimeframeSec = (typeof TIMEFRAME_OPTIONS)[number]["value"];

const TIMEFRAME_VALUE_SET = new Set<number>(TIMEFRAME_OPTIONS.map((o) => o.value));

/** After TF list changes (e.g. remove 1s), coerce stale UI state so chart countdown + API stay valid. */
export function coerceTradeTimeframeSec(sec: number, fallback: ChartTimeframeSec = 5): ChartTimeframeSec {
  return TIMEFRAME_VALUE_SET.has(sec) ? (sec as ChartTimeframeSec) : fallback;
}

/** @deprecated use TIMEFRAME_OPTIONS */
export const BINARY_TIMEFRAMES = TIMEFRAME_OPTIONS;

export async function createDemoOrder(
  input: {
    symbol: string;
    side?: "buy" | "sell";
    quantity?: number;
    direction?: "up" | "down";
    amount?: number;
    timeframe?: number;
  },
  token?: string | null,
  wallet: WalletType = "demo"
) {
  const body: Record<string, unknown> = {
    symbol: input.symbol,
    ...(input.direction != null && {
      direction: input.direction,
      amount: input.amount ?? input.quantity ?? 0,
      timeframe: input.timeframe
    }),
    ...(input.side != null && { side: input.side, quantity: input.quantity ?? 0 })
  };
  const response = await fetch(`${apiBase()}/api/demo/orders`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...requestHeaders(token, token ? wallet : undefined)
    },
    body: JSON.stringify(body)
  });

  return parseJson<{ trade: Trade }>(response);
}

export async function createLiveOrder(input: {
  symbol: string;
  direction: "up" | "down";
  amount: number;
  timeframe: number;
}, token: string) {
  const response = await fetch(`${apiBase()}/api/orders`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...requestHeaders(token, "live")
    },
    body: JSON.stringify(input)
  });
  return parseJson<{ trade: Trade }>(response);
}
