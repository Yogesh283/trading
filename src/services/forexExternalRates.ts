import { FOREX_SYMBOLS } from "../config/symbols";
import { logger } from "../utils/logger";

/** Pyth Network Metal.XAU/USD spot — same family of feed TradingView “Pyth” uses. */
const PYTH_HERMES_XAU_USD =
  "0x765d2ba906dbc32ca17cc11f5310a89e9ee1f6420508c63861f2f8ba4ee34bb2";

function pythMantissaToFloat(priceStr: string, expo: number): number {
  const m = Number(priceStr);
  if (!Number.isFinite(m)) {
    return NaN;
  }
  return m * 10 ** expo;
}

type PythPriceObj = { price?: string | number; expo?: number };

function pythPriceToUsdPerOz(raw: PythPriceObj | undefined): number | null {
  if (!raw?.price) {
    return null;
  }
  const priceStr = String(raw.price);
  const expo =
    typeof raw.expo === "number" && Number.isFinite(raw.expo)
      ? raw.expo
      : Number(raw.expo ?? NaN);
  if (!Number.isFinite(expo)) {
    return null;
  }
  const usdPerOz = pythMantissaToFloat(priceStr, expo);
  if (!Number.isFinite(usdPerOz) || usdPerOz < 500 || usdPerOz > 50_000) {
    return null;
  }
  return usdPerOz;
}

function splitPair(symbol: string): [string, string] {
  const s = symbol.toUpperCase();
  return [s.slice(0, 3), s.slice(3, 6)];
}

/**
 * ECB-based FX via Frankfurter (free, no key). `rates[X]` = how much of X you get for 1 USD.
 * Derives all configured pairs from USD legs (plus optional gold spot).
 */
export async function fetchFrankfurterUsdMatrix(): Promise<Map<string, number>> {
  const res = await fetch("https://api.frankfurter.app/latest?from=USD", {
    headers: { Accept: "application/json" }
  });
  if (!res.ok) {
    throw new Error(`Frankfurter HTTP ${res.status}`);
  }
  const j = (await res.json()) as { rates?: Record<string, number> };
  const rates = j.rates ?? {};
  /** USD value of 1 unit of currency (e.g. EUR → dollars per euro). */
  const usdPerUnit: Record<string, number> = { USD: 1 };
  for (const [cur, perUsd] of Object.entries(rates)) {
    if (typeof perUsd === "number" && Number.isFinite(perUsd) && perUsd > 0) {
      usdPerUnit[cur] = 1 / perUsd;
    }
  }

  const out = new Map<string, number>();
  for (const sym of FOREX_SYMBOLS) {
    if (sym === "XAUUSD") {
      continue;
    }
    const [base, quote] = splitPair(sym);
    const ub = usdPerUnit[base];
    const uq = usdPerUnit[quote];
    if (
      ub !== undefined &&
      uq !== undefined &&
      Number.isFinite(ub) &&
      Number.isFinite(uq) &&
      uq !== 0
    ) {
      out.set(sym, Number((ub / uq).toFixed(8)));
    }
  }
  return out;
}

/** USD per troy oz from Pyth Hermes (parsed aggregate). No API key. */
export async function fetchGoldUsdPyth(): Promise<number | null> {
  try {
    const url = new URL("https://hermes.pyth.network/v2/updates/price/latest");
    url.searchParams.append("ids[]", PYTH_HERMES_XAU_USD);
    const ac = new AbortController();
    const to = setTimeout(() => ac.abort(), 12_000);
    const res = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
      signal: ac.signal
    }).finally(() => clearTimeout(to));
    if (!res.ok) {
      return null;
    }
    const j = (await res.json()) as {
      parsed?: Array<{ price?: PythPriceObj; ema_price?: PythPriceObj }>;
    };
    const row = j.parsed?.[0];
    const fromAgg = pythPriceToUsdPerOz(row?.price);
    if (fromAgg != null) {
      return fromAgg;
    }
    return pythPriceToUsdPerOz(row?.ema_price);
  } catch (e) {
    logger.warn({ e }, "Gold Pyth Hermes fetch failed");
  }
  return null;
}

/** Spot-style XAUUSD (USD per troy oz) from Yahoo chart — aligns with common retail spot (TradingView family). */
export async function fetchGoldUsdYahoo(): Promise<number | null> {
  try {
    const url =
      "https://query1.finance.yahoo.com/v8/finance/chart/XAUUSD=X?range=1d&interval=5m";
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        Accept: "application/json"
      }
    });
    if (!res.ok) {
      return null;
    }
    const j = (await res.json()) as {
      chart?: {
        result?: Array<{
          meta?: {
            regularMarketPrice?: number;
            chartPreviousClose?: number;
          };
          indicators?: { quote?: Array<{ close?: Array<number | null> }> };
        }>;
      };
    };
    const result = j.chart?.result?.[0];
    const meta = result?.meta;
    const fromMeta = meta?.regularMarketPrice ?? meta?.chartPreviousClose;
    if (typeof fromMeta === "number" && Number.isFinite(fromMeta) && fromMeta > 100) {
      return fromMeta;
    }
    const closes = result?.indicators?.quote?.[0]?.close;
    if (Array.isArray(closes)) {
      for (let i = closes.length - 1; i >= 0; i--) {
        const c = closes[i];
        if (typeof c === "number" && Number.isFinite(c) && c > 100) {
          return c;
        }
      }
    }
  } catch (e) {
    logger.warn({ e }, "Gold Yahoo fetch failed");
  }
  return null;
}

/** Yahoo spot first (TV-like), then Pyth — use for all feed modes so XAU is not stuck on simulated ~4400 seed. */
export async function fetchGoldUsdSpot(): Promise<number | null> {
  return (await fetchGoldUsdYahoo()) ?? (await fetchGoldUsdPyth());
}

export async function fetchTraderMadeLive(
  apiKey: string,
  symbols: readonly string[]
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const currency = symbols.join(",");
  const url = new URL("https://marketdata.tradermade.com/api/v1/live");
  url.searchParams.set("currency", currency);
  url.searchParams.set("api_key", apiKey.trim());
  const res = await fetch(url.toString(), { headers: { Accept: "application/json" } });
  const j = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    const msg = typeof j.message === "string" ? j.message : res.statusText;
    throw new Error(`TraderMade: ${msg}`);
  }
  const quotes = (j.quotes ?? j.data ?? []) as Record<string, unknown>[];
  if (!Array.isArray(quotes)) {
    logger.warn({ j }, "TraderMade: unexpected response shape");
    return out;
  }
  for (const q of quotes) {
    const sym = String(
      q.requested_symbol ?? q.symbol ?? `${q.base_currency ?? ""}${q.quote_currency ?? ""}`
    )
      .trim()
      .toUpperCase();
    let mid = Number(q.mid);
    if (!Number.isFinite(mid)) {
      const bid = Number(q.bid);
      const ask = Number(q.ask);
      if (Number.isFinite(bid) && Number.isFinite(ask)) {
        mid = (bid + ask) / 2;
      }
    }
    if (sym && Number.isFinite(mid) && mid > 0) {
      out.set(sym, mid);
    }
  }
  return out;
}

export type TraderMadeHistoricalBar = {
  bucketStartMs: number;
  open: number;
  high: number;
  low: number;
  close: number;
};

/**
 * TraderMade REST historical — `GET /api/v1/historical?currency=&date=YYYY-MM-DD&api_key=`
 * Bar spacing depends on plan (hourly common on free tier). Used to seed DB when dense enough.
 */
export async function fetchTraderMadeHistoricalDay(
  apiKey: string,
  symbol: string,
  dateYmd: string
): Promise<TraderMadeHistoricalBar[]> {
  const sym = symbol.trim().toUpperCase();
  const url = new URL("https://marketdata.tradermade.com/api/v1/historical");
  url.searchParams.set("currency", sym);
  url.searchParams.set("date", dateYmd);
  url.searchParams.set("api_key", apiKey.trim());
  const res = await fetch(url.toString(), { headers: { Accept: "application/json" } });
  const j = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    const msg = typeof j.message === "string" ? j.message : res.statusText;
    throw new Error(`TraderMade historical: ${msg}`);
  }
  const raw = (j.quotes ?? j.data ?? j.result ?? []) as unknown;
  const quotes = Array.isArray(raw) ? raw : [];
  const out: TraderMadeHistoricalBar[] = [];
  for (const q of quotes as Record<string, unknown>[]) {
    const open = Number(q.open ?? q.o ?? q.Open);
    const high = Number(q.high ?? q.h ?? q.High);
    const low = Number(q.low ?? q.l ?? q.Low);
    const close = Number(q.close ?? q.c ?? q.Close);
    const ds = q.date ?? q.datetime ?? q.time ?? q.timestamp;
    let t: number;
    if (typeof ds === "number" && Number.isFinite(ds)) {
      t = ds < 1e12 ? ds * 1000 : ds;
    } else if (typeof ds === "string") {
      t = new Date(ds).getTime();
    } else {
      continue;
    }
    if (![open, high, low, close].every((x) => Number.isFinite(x))) {
      continue;
    }
    const hi = Math.max(open, high, low, close);
    const lo = Math.min(open, high, low, close);
    out.push({ bucketStartMs: t, open, high: hi, low: lo, close });
  }
  return out.sort((a, b) => a.bucketStartMs - b.bucketStartMs);
}
