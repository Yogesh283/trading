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
 * One chart price per second: chase API anchor smoothly, then wiggle up/down so the forming candle moves every tick.
 */
export function nextChartPulsePrice(
  state: ChartPulseState | null,
  symbol: string,
  anchorPrice: number | null | undefined,
  tickIndex: number
): { state: ChartPulseState; price: number } | null {
  if (anchorPrice == null || !Number.isFinite(anchorPrice) || anchorPrice <= 0) {
    return null;
  }

  const sym = symbol.toUpperCase();
  const anchor = roundChartPrice(sym, anchorPrice);
  const step = chartMinPriceStep(sym, anchor);

  let s = state;
  if (!s || s.symbol !== sym) {
    s = { symbol: sym, anchor, display: anchor, stepSign: 1 };
  }

  if (s.anchor !== anchor) {
    const delta = anchor - s.display;
    const chase = Math.sign(delta) * Math.max(step, Math.abs(delta) * 0.38);
    const display =
      Math.abs(delta) <= step ? anchor : roundChartPrice(sym, s.display + chase);
    s = { symbol: sym, anchor, display, stepSign: display >= anchor ? (-1 as const) : (1 as const) };
    return { state: s, price: display };
  }

  const band = step * (6 + (tickIndex % 4));
  const wiggle = step * (1 + (tickIndex % 2));
  let display = roundChartPrice(sym, s.display + s.stepSign * wiggle);

  if (display > anchor + band) {
    display = roundChartPrice(sym, anchor + band);
    s = { ...s, anchor, display, stepSign: -1 };
  } else if (display < anchor - band) {
    display = roundChartPrice(sym, anchor - band);
    s = { ...s, anchor, display, stepSign: 1 };
  } else if (display === s.display) {
    display = roundChartPrice(sym, s.display + s.stepSign * step);
    s = { ...s, anchor, display, stepSign: (s.stepSign * -1) as 1 | -1 };
  } else {
    s = { ...s, anchor, display, stepSign: (s.stepSign * -1) as 1 | -1 };
  }

  return { state: s, price: display };
}
