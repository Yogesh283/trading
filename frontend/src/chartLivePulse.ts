/** Minimum price step so forming candles visibly move every second on the chart. */
export function chartMinPriceStep(symbol: string, price: number): number {
  const sym = symbol.toUpperCase();
  if (sym === "XAUUSD" || price >= 1000) {
    return 0.02;
  }
  if (price >= 20 || sym.includes("JPY")) {
    return 0.002;
  }
  if (price >= 1) {
    return 0.00002;
  }
  return 0.000002;
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
};

/**
 * Exactly one chart price step per second: one tick up or down (not two in the same second).
 */
export function nextChartPulsePrice(
  state: ChartPulseState | null,
  symbol: string,
  anchorPrice: number | null | undefined
): { state: ChartPulseState; price: number } | null {
  if (anchorPrice == null || !Number.isFinite(anchorPrice) || anchorPrice <= 0) {
    return null;
  }

  const sym = symbol.toUpperCase();
  const anchor = roundChartPrice(sym, anchorPrice);
  const step = chartMinPriceStep(sym, anchor);
  const band = step * 6;

  let s = state;
  if (!s || s.symbol !== sym) {
    s = { symbol: sym, anchor, display: anchor, stepSign: 1 };
    return { state: s, price: anchor };
  }

  s = { ...s, anchor };

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
