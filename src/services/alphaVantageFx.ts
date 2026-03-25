/**
 * Alpha Vantage forex helpers (server-side only — key from env).
 * @see https://www.alphavantage.co/documentation/
 *
 * Free tier: very low daily quota — use sparingly (chart seed only).
 * FX_INTRADAY is premium; FX_DAILY works on free keys (compact ≈ last 100 days).
 */

const BASE = "https://www.alphavantage.co/query";

export type AlphaVantageDailyBar = {
  bucketStartMs: number;
  open: number;
  high: number;
  low: number;
  close: number;
};

/** EURUSD → EUR + USD; USDJPY → USD + JPY. Skips XAUUSD and non-6-char symbols. */
export function splitForexPairForAlphaVantage(symbol: string): { from: string; to: string } | null {
  const s = symbol.trim().toUpperCase();
  if (s.length !== 6) return null;
  const a = s.slice(0, 3);
  const b = s.slice(3, 6);
  if (a === "XAU" || b === "XAU") return null;
  return { from: a, to: b };
}

/**
 * Daily FX OHLC (UTC calendar day; bucket = that day 00:00:00.000 UTC).
 */
export async function fetchAlphaVantageFXDaily(
  fromSymbol: string,
  toSymbol: string,
  apiKey: string
): Promise<AlphaVantageDailyBar[]> {
  const key = apiKey.trim();
  if (!key) return [];

  const url = new URL(BASE);
  url.searchParams.set("function", "FX_DAILY");
  url.searchParams.set("from_symbol", fromSymbol);
  url.searchParams.set("to_symbol", toSymbol);
  url.searchParams.set("outputsize", "compact");
  url.searchParams.set("datatype", "json");
  url.searchParams.set("apikey", key);

  const res = await fetch(url.toString(), { headers: { Accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`Alpha Vantage FX_DAILY: HTTP ${res.status}`);
  }
  const j = (await res.json()) as Record<string, unknown>;

  const note = j["Note"] ?? j["Information"] ?? j["Error Message"];
  if (typeof note === "string" && note.length > 0) {
    throw new Error(`Alpha Vantage: ${note.slice(0, 200)}`);
  }

  const series = j["Time Series FX (Daily)"] as Record<string, Record<string, string>> | undefined;
  if (!series || typeof series !== "object") {
    return [];
  }

  const out: AlphaVantageDailyBar[] = [];
  for (const [dateStr, row] of Object.entries(series)) {
    const o = Number(row["1. open"]);
    const h = Number(row["2. high"]);
    const l = Number(row["3. low"]);
    const c = Number(row["4. close"]);
    if (![o, h, l, c].every(Number.isFinite)) continue;
    const dayMs = Date.parse(`${dateStr}T00:00:00.000Z`);
    if (!Number.isFinite(dayMs)) continue;
    out.push({
      bucketStartMs: dayMs,
      open: o,
      high: Math.max(o, h, l, c),
      low: Math.min(o, h, l, c),
      close: c
    });
  }
  out.sort((a, b) => a.bucketStartMs - b.bucketStartMs);
  return out;
}
