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
  /** From /api/auth/me — withdrawal authenticator enabled. */
  withdrawalTotpEnabled?: boolean;
  /** Setup started but not confirmed. */
  withdrawalTotpSetupPending?: boolean;
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

export async function loadMarkets() {
  const response = await fetch(`${apiBase()}/api/markets`);
  if (!response.ok) {
    throw new Error("Unable to load markets");
  }

  return (await response.json()) as {
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
  const response = await fetch(`${apiBase()}/api/markets/history?${params}`);
  if (!response.ok) {
    throw new Error("Unable to load chart history");
  }
  return (await response.json()) as { ticks: MarketTick[] };
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
  dailyYieldPercent: number;
  estimatedDailyIncome: number;
  lastYieldDate: string | null;
  explanation: string;
}

export interface ReferralTeamMember {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  selfReferralCode: string;
  liveWalletBalanceInr: number;
  totalDepositedUsdt: number;
}

export interface ReferralSummary {
  selfReferralCode: string;
  inviter: { name: string; email: string } | null;
  directTeam: ReferralTeamMember[];
  directCount: number;
  totalTeamCount: number;
  /** Sum of direct referrals’ live wallet (INR). */
  directTotalLiveBalanceInr: number;
  /** Sum of direct referrals’ credited deposits (USDT). */
  directTeamTotalDepositsUsdt: number;
  /** Total commissions credited to your live wallet (betting + staking). */
  totalReferralCommissionInr?: number;
  /** From referrals’ live binary stakes. */
  bettingCommissionInr?: number;
  /** From referrals’ staking (investment) deposits. */
  stakingCommissionInr?: number;
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
  tpn: string
) {
  const response = await fetch(`${apiBase()}/api/withdrawals`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...requestHeaders(token, "live") },
    body: JSON.stringify({ amount, toAddress, tpn })
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

/** Chart + binary: sub-minute + minute candles (matches server TRADE_TIMEFRAMES_SEC). */
export const TIMEFRAME_OPTIONS = [
  { value: 5, label: "5s" },
  { value: 10, label: "10s" },
  { value: 60, label: "1m" },
  { value: 120, label: "2m" },
  { value: 180, label: "3m" },
  { value: 300, label: "5m" },
  { value: 600, label: "10m" }
] as const;

export type ChartTimeframeSec = (typeof TIMEFRAME_OPTIONS)[number]["value"];

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
