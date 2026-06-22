/** Minimum price step so forming candles visibly move every second on the chart. */
export function chartMinPriceStep(symbol: string, price: number, timeframeSec = 5): number {
  const sym = symbol.toUpperCase();
  let base: number;
  if (sym === "XAUUSD" || price >= 1000) {
    base = 0.02;
  } else if (price >= 20 || sym.includes("JPY")) {
    base = 0.002;
  } else if (price >= 1) {
    base = 0.00002;
  } else {
    base = 0.000002;
  }
  /** Shorter TFs (5s) — slightly smaller per-second step so the bar grows smoothly over the period. */
  const tfScale = Math.sqrt(Math.max(5, timeframeSec) / 5);
  return base / tfScale;
}

function roundChartPrice(symbol: string, raw: number): number {
  const sym = symbol.toUpperCase();
  if (raw >= 1000) {
    return Number(raw.toFixed(2));
  }
  const decimals =
    sym === "XAUUSD" || raw >= 20 || (raw >= 1 && sym.includes("JPY")) ? 3 : raw >= 5 ? 4 : 5;
  return Number(raw.toFixed(decimals));
}

export type ChartPulseState = {
  symbol: string;
  anchor: number;
  display: number;
  /** Flip each second for up/down wiggle around anchor. */
  stepSign: 1 | -1;
  timeframeSec: number;
};

/** When a new candle bucket starts (e.g. 5s TF), open at the prior close — no gap jump. */
export function resetChartPulseForNewCandle(
  symbol: string,
  openPrice: number,
  anchorPrice: number,
  timeframeSec: number
): ChartPulseState {
  const sym = symbol.toUpperCase();
  const open = roundChartPrice(sym, openPrice);
  const anchor = roundChartPrice(sym, anchorPrice);
  return { symbol: sym, anchor, display: open, stepSign: 1, timeframeSec };
}

/**
 * Exactly one chart price step per second: one tick up or down (not two in the same second).
 */
export function nextChartPulsePrice(
  state: ChartPulseState | null,
  symbol: string,
  anchorPrice: number | null | undefined,
  timeframeSec = 5
): { state: ChartPulseState; price: number } | null {
  if (anchorPrice == null || !Number.isFinite(anchorPrice) || anchorPrice <= 0) {
    return null;
  }

  const sym = symbol.toUpperCase();
  const anchor = roundChartPrice(sym, anchorPrice);
  const step = chartMinPriceStep(sym, anchor, timeframeSec);
  const band = step * 6;

  let s = state;
  if (!s || s.symbol !== sym || s.timeframeSec !== timeframeSec) {
    s = { symbol: sym, anchor, display: anchor, stepSign: 1, timeframeSec };
    return { state: s, price: anchor };
  }

  s = { ...s, anchor, timeframeSec };

  if (s.display !== anchor) {
    const delta = anchor - s.display;
    if (Math.abs(delta) <= step) {
      s = { ...s, display: anchor, stepSign: (delta >= 0 ? -1 : 1) as 1 | -1 };
      return { state: s, price: anchor };
    }
    const display = roundChartPrice(sym, s.display + Math.sign(delta) * step);
    s = { ...s, display, stepSign: (Math.sign(delta) * -1) as 1 | -1 };
    return { state: s, price: display };
  }

  let display = roundChartPrice(sym, s.display + s.stepSign * step);
  if (display > anchor + band) {
    display = roundChartPrice(sym, anchor + band);
    s = { ...s, display, stepSign: -1 };
  } else if (display < anchor - band) {
    display = roundChartPrice(sym, anchor - band);
    s = { ...s, display, stepSign: 1 };
  } else {
    s = { ...s, display, stepSign: (s.stepSign * -1) as 1 | -1 };
  }

  return { state: s, price: display };
}
