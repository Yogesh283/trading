/** Forex + gold — `base` seeds chart/sim only; fiat from ECB, gold from Pyth Hermes when live feed runs. */
export const FOREX_PAIRS = [
  { symbol: "XAUUSD", name: "Gold / US Dollar", base: 4400 },
  { symbol: "EURUSD", name: "Euro / US Dollar", base: 1.085 },
  { symbol: "GBPUSD", name: "British Pound / US Dollar", base: 1.265 },
  { symbol: "USDJPY", name: "US Dollar / Japanese Yen", base: 149.5 },
  { symbol: "USDCHF", name: "US Dollar / Swiss Franc", base: 0.885 },
  { symbol: "AUDUSD", name: "Australian Dollar / US Dollar", base: 0.652 },
  { symbol: "USDCAD", name: "US Dollar / Canadian Dollar", base: 1.358 },
  { symbol: "NZDUSD", name: "NZ Dollar / US Dollar", base: 0.598 },
  { symbol: "EURJPY", name: "Euro / Japanese Yen", base: 162.2 },
  { symbol: "GBPJPY", name: "British Pound / Japanese Yen", base: 189.1 },
  { symbol: "EURGBP", name: "Euro / British Pound", base: 0.8575 },
  { symbol: "AUDJPY", name: "Australian Dollar / Japanese Yen", base: 97.5 },
  { symbol: "EURCHF", name: "Euro / Swiss Franc", base: 0.96 },
  { symbol: "GBPCAD", name: "British Pound / Canadian Dollar", base: 1.718 },
  { symbol: "AUDNZD", name: "Australian Dollar / NZ Dollar", base: 1.09 },
  { symbol: "USDSGD", name: "US Dollar / Singapore Dollar", base: 1.345 },
  { symbol: "USDSEK", name: "US Dollar / Swedish Krona", base: 10.85 },
  { symbol: "USDNOK", name: "US Dollar / Norwegian Krone", base: 10.95 },
  { symbol: "USDTRY", name: "US Dollar / Turkish Lira", base: 32.5 },
  { symbol: "USDMXN", name: "US Dollar / Mexican Peso", base: 17.2 },
  { symbol: "USDZAR", name: "US Dollar / South African Rand", base: 18.5 }
] as const;

export const FOREX_SYMBOLS = FOREX_PAIRS.map((p) => p.symbol);

export type ForexSymbol = (typeof FOREX_SYMBOLS)[number];
