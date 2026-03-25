import { useCallback, useEffect, useRef, useState } from "react";
import {
  AreaSeries,
  CandlestickSeries,
  ColorType,
  createChart,
  createSeriesMarkers,
  CrosshairMode,
  LineSeries
} from "lightweight-charts";
import type {
  IChartApi,
  IPriceLine,
  ISeriesApi,
  ISeriesMarkersPluginApi,
  SeriesMarker,
  Time,
  UTCTimestamp
} from "lightweight-charts";
import type { CandlestickData, LineData } from "lightweight-charts";
import type { CandlePoint } from "./chartCandles";
import { CHART_ZOOM_BAR_SPACING } from "./chartBarSpacing";

/**
 * TradingView [Lightweight Charts](https://github.com/tradingview/lightweight-charts) — same family many brokers
 * (Olymp-style web terminals often use canvas OHLC engines like this; exact stack of olymptrade.com is not public).
 */

const PRO_LAST_PRICE = "#d1d4dc";
const CANDLE_UP = "#089981";
const CANDLE_DOWN = "#f23645";
const CANDLE_BORDER_UP = "#068f76";
const CANDLE_BORDER_DOWN = "#d12e3a";
const CHART_BG = "#0b0d12";
const GRID_VERT = "rgba(42, 46, 58, 0.35)";
const GRID_HORZ = "rgba(42, 46, 58, 0.4)";
const SCALE_TEXT = "#929aa4";
const SCALE_BORDER = "#2b3139";
const CROSSHAIR = "rgba(117, 134, 150, 0.55)";
const CHART_FONT =
  'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Inter", sans-serif';

function priceLineColorForTick(dir: "up" | "down" | null | undefined): string {
  if (dir === "up") return CANDLE_UP;
  if (dir === "down") return CANDLE_DOWN;
  return PRO_LAST_PRICE;
}

export type ChartTradeMarker = {
  time: number;
  position: "belowBar" | "aboveBar";
  color: string;
  shape: "arrowUp" | "arrowDown";
  text?: string;
  id?: string;
};

function useMobileChartHeightPx(isMobile: boolean): number {
  const compute = useCallback(() => {
    if (typeof window === "undefined") {
      return 200;
    }
    const vh = window.visualViewport?.height ?? window.innerHeight;
    const target = vh * 0.32;
    return Math.round(Math.min(300, Math.max(188, target)));
  }, []);

  const [px, setPx] = useState(() => {
    if (!isMobile || typeof window === "undefined") {
      return 440;
    }
    return compute();
  });

  useEffect(() => {
    if (!isMobile) {
      return;
    }
    const on = () => setPx(compute());
    on();
    window.addEventListener("resize", on);
    window.addEventListener("orientationchange", on);
    const vv = window.visualViewport;
    vv?.addEventListener("resize", on);
    vv?.addEventListener("scroll", on);
    return () => {
      window.removeEventListener("resize", on);
      window.removeEventListener("orientationchange", on);
      vv?.removeEventListener("resize", on);
      vv?.removeEventListener("scroll", on);
    };
  }, [isMobile, compute]);

  return isMobile ? px : 480;
}

type MergedCandle = {
  bucketMs: number;
  open: number;
  high: number;
  low: number;
  close: number;
};

function candlestickDataFromCandles(candles: CandlePoint[]): MergedCandle[] {
  if (candles.length === 0) {
    return [];
  }
  const sorted = [...candles].sort((a, b) => a.timestamp - b.timestamp);
  const out: MergedCandle[] = [];
  for (const c of sorted) {
    const o = Number(c.open);
    const h0 = Number(c.high);
    const l0 = Number(c.low);
    const cl = Number(c.close);
    if (![o, h0, l0, cl].every(Number.isFinite)) {
      continue;
    }
    const high = Math.max(o, cl, h0, l0);
    const low = Math.min(o, cl, h0, l0);
    out.push({ bucketMs: c.timestamp, open: o, high, low, close: cl });
  }
  return out;
}

function candlestickOHLCForDisplay(c: MergedCandle): [number, number, number, number] {
  const { open, close, low, high } = c;
  const range = high - low;
  if (Number.isFinite(range) && range > 1e-12) {
    return [open, close, low, high];
  }
  const p = (open + close) / 2;
  const t = Math.max(Math.abs(p) * 1e-6, 1e-6);
  return [p - t / 2, p + t / 2, p - t, p + t];
}

export type ChartGraphType = "candles" | "line" | "area";

export const CHART_GRAPH_OPTIONS: { value: ChartGraphType; label: string }[] = [
  { value: "candles", label: "Candles" },
  { value: "line", label: "Line" },
  { value: "area", label: "Area" }
];

function yExtentFromCandlesRobust(cd: MergedCandle[]): { min: number; max: number } {
  if (cd.length === 0) {
    return { min: 0, max: 1 };
  }
  const vals: number[] = [];
  for (const c of cd) {
    vals.push(c.open, c.close, c.low, c.high);
  }
  const finite = vals.filter((v) => Number.isFinite(v));
  if (finite.length === 0) {
    return { min: 0, max: 1 };
  }
  finite.sort((a, b) => a - b);
  const n = finite.length;
  const loIdx = Math.max(0, Math.floor(n * 0.03));
  const hiIdx = Math.min(n - 1, Math.ceil(n * 0.97) - 1);
  let lo = finite[loIdx]!;
  let hi = finite[hiIdx]!;
  if (hi < lo) {
    [lo, hi] = [hi, lo];
  }
  const mid = (lo + hi) / 2;
  if (hi - lo < 1e-9) {
    const pad = Math.max(Math.abs(mid) * 0.002, 5e-5);
    return { min: mid - pad, max: mid + pad };
  }
  const pad = (hi - lo) * 0.12;
  return { min: lo - pad, max: hi + pad };
}

function alignYAxisToNiceStep(ext: { min: number; max: number }): { min: number; max: number } {
  const { min, max } = ext;
  const span = max - min;
  if (!(span > 0) || !Number.isFinite(span)) {
    return { min, max };
  }
  const mid = (min + max) / 2;
  const rough = span / 5.5;
  const exp = Math.floor(Math.log10(Math.max(rough, 1e-12)));
  const frac = rough / 10 ** exp;
  let nf = frac <= 1 ? 1 : frac <= 2 ? 2 : frac <= 5 ? 5 : 10;
  let interval = nf * 10 ** exp;
  if (Math.abs(mid) >= 300 && span >= 2 && span <= 16 && interval > 1) {
    interval = 1;
  }
  const amin = Math.floor(min / interval + 1e-12) * interval;
  let amax = Math.ceil(max / interval - 1e-12) * interval;
  if (amax <= amin) {
    amax = amin + interval;
  }
  return { min: amin, max: amax };
}

function yExtentForDisplay(cd: MergedCandle[], zoomStartPct: number, zoomEndPct: number): { min: number; max: number } {
  const n = cd.length;
  if (n === 0) {
    return { min: 0, max: 1 };
  }
  const z0 = Math.max(0, Math.min(100, zoomStartPct));
  const z1 = Math.max(0, Math.min(100, zoomEndPct));
  const i0 = Math.floor((n * z0) / 100);
  const i1 = Math.min(n, Math.ceil((n * z1) / 100));
  const slice = cd.slice(i0, Math.max(i0 + 1, i1));
  return yExtentFromCandlesRobust(slice.length > 0 ? slice : cd);
}

function dataZoomRange(zoomIndex: number, barCount: number): { start: number; end: number } {
  if (barCount <= 1) {
    return { start: 0, end: 100 };
  }
  const sp = CHART_ZOOM_BAR_SPACING[Math.min(zoomIndex, CHART_ZOOM_BAR_SPACING.length - 1)] ?? 15;
  const approxVisible = Math.max(8, Math.min(barCount, Math.floor(520 / sp)));
  const startPct = Math.max(0, ((barCount - approxVisible) / barCount) * 100);
  return { start: startPct, end: 100 };
}

function toUtcTime(ms: number): UTCTimestamp {
  return Math.floor(ms / 1000) as UTCTimestamp;
}

function buildSeriesMarkers(cd: MergedCandle[], markers: ChartTradeMarker[]): SeriesMarker<Time>[] {
  const out: SeriesMarker<Time>[] = [];
  for (const m of markers) {
    const idx = cd.findIndex((c) => Math.floor(c.bucketMs / 1000) === m.time);
    if (idx < 0) continue;
    const bar = cd[idx]!;
    const t = toUtcTime(bar.bucketMs);
    out.push({
      time: t,
      position: m.position === "belowBar" ? "belowBar" : "aboveBar",
      color: m.color,
      shape: m.shape === "arrowUp" ? "arrowUp" : "arrowDown",
      text: m.text
    });
  }
  return out;
}

type Props = {
  candles: CandlePoint[];
  assetTag: string;
  timeframeLabel: string;
  formatPrice: (p: number) => string;
  timeframeSec: number;
  zoomIndex: number;
  isMobileChart: boolean;
  chartResetKey: string;
  countdownStr: string;
  timerTextZoomed: boolean;
  onTimerTap: () => void;
  tickDirection?: "up" | "down" | null;
  tradeMarkers?: ChartTradeMarker[];
  graphType?: ChartGraphType;
};

export function LightweightTradingChart({
  candles,
  assetTag,
  timeframeLabel,
  formatPrice,
  timeframeSec,
  zoomIndex,
  isMobileChart,
  chartResetKey,
  countdownStr,
  timerTextZoomed,
  onTimerTap,
  tickDirection = null,
  tradeMarkers = [],
  graphType = "candles"
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick" | "Line" | "Area"> | null>(null);
  const priceLineRef = useRef<IPriceLine | null>(null);
  const markersPluginRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  /** When this matches current layout, only `setData` — do not reset time scale (avoids snap-back every 1s tick). */
  const lastStructuralKeyRef = useRef<string | null>(null);
  const candlesRef = useRef(candles);
  candlesRef.current = candles;
  const [axisPillTop, setAxisPillTop] = useState<number | null>(null);

  const height = useMobileChartHeightPx(isMobileChart);

  const updateAxisPill = useCallback(() => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!chart || !series || seriesRef.current === null) {
      setAxisPillTop(null);
      return;
    }
    const list = candlesRef.current;
    const cd = candlestickDataFromCandles(list);
    if (cd.length === 0) {
      setAxisPillTop(null);
      return;
    }
    const lastBar = cd[cd.length - 1]!;
    const y = series.priceToCoordinate(lastBar.close);
    setAxisPillTop(y != null && Number.isFinite(y) ? y : null);
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) {
      return;
    }
    const chart = createChart(el, {
      layout: {
        background: { type: ColorType.Solid, color: CHART_BG },
        textColor: SCALE_TEXT,
        fontFamily: CHART_FONT,
        attributionLogo: false
      },
      grid: {
        vertLines: { color: GRID_VERT },
        horzLines: { color: GRID_HORZ }
      },
      rightPriceScale: {
        borderColor: SCALE_BORDER,
        scaleMargins: { top: 0.08, bottom: 0.08 }
      },
      timeScale: {
        borderColor: SCALE_BORDER,
        timeVisible: true,
        secondsVisible: timeframeSec < 60,
        rightOffset: 4
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: CROSSHAIR, width: 1, style: 2, labelBackgroundColor: "#1e222d" },
        horzLine: { color: CROSSHAIR, width: 1, style: 2, labelBackgroundColor: "#1e222d" }
      },
      localization: {
        locale: "en-US"
      },
      width: el.clientWidth,
      height,
      autoSize: true
    });
    chartRef.current = chart;
    const ro = new ResizeObserver(() => {
      chart.resize(el.clientWidth, height);
      updateAxisPill();
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      markersPluginRef.current = null;
      priceLineRef.current = null;
      seriesRef.current = null;
      chart.remove();
      chartRef.current = null;
      lastStructuralKeyRef.current = null;
    };
  }, [assetTag, height, isMobileChart, timeframeSec, updateAxisPill]);

  useEffect(() => {
    const chart = chartRef.current;
    const el = containerRef.current;
    if (!chart || !el || candles.length === 0) {
      return;
    }

    const cd = candlestickDataFromCandles(candles);
    if (cd.length === 0) {
      return;
    }

    const lastPt = cd[cd.length - 1]!;
    const dz = dataZoomRange(zoomIndex, cd.length);
    const yExt = yExtentForDisplay(cd, dz.start, dz.end);
    const yScaled = alignYAxisToNiceStep(yExt);
    const lineCol = priceLineColorForTick(tickDirection);

    const n = cd.length;
    const fromIdx = Math.floor((n * dz.start) / 100);
    const toIdx = Math.max(fromIdx, n - 1);

    const structuralKey = `${chartResetKey}|${graphType}|${zoomIndex}|${assetTag}|${tickDirection}`;
    const structuralChanged =
      lastStructuralKeyRef.current !== structuralKey || seriesRef.current === null;

    const autoscale = () => ({
      priceRange: { minValue: yScaled.min, maxValue: yScaled.max }
    });

    const candleRows: CandlestickData<UTCTimestamp>[] = [];
    const seen = new Map<number, CandlestickData<UTCTimestamp>>();
    for (const c of cd) {
      const [open, close, low, high] = candlestickOHLCForDisplay(c);
      const t = toUtcTime(c.bucketMs);
      seen.set(t as number, { time: t, open, high, low, close });
    }
    for (const v of seen.values()) {
      candleRows.push(v);
    }
    candleRows.sort((a, b) => (a.time as number) - (b.time as number));

    const lineData: LineData<UTCTimestamp>[] = cd.map((c) => ({
      time: toUtcTime(c.bucketMs),
      value: c.close
    }));

    const applyMarkers = (series: ISeriesApi<"Candlestick" | "Line" | "Area">) => {
      if (tradeMarkers.length > 0) {
        const built = buildSeriesMarkers(cd, tradeMarkers);
        if (markersPluginRef.current) {
          markersPluginRef.current.setMarkers(built);
        } else {
          markersPluginRef.current = createSeriesMarkers(series, built);
        }
      } else if (markersPluginRef.current) {
        markersPluginRef.current.setMarkers([]);
      }
    };

    const refreshPriceLine = (series: ISeriesApi<"Candlestick" | "Line" | "Area">) => {
      if (priceLineRef.current) {
        series.removePriceLine(priceLineRef.current);
        priceLineRef.current = null;
      }
      if (graphType === "candles") {
        priceLineRef.current = series.createPriceLine({
          price: lastPt.close,
          color: PRO_LAST_PRICE,
          lineWidth: 1,
          lineStyle: 0,
          axisLabelVisible: false
        });
      } else if (graphType === "line") {
        priceLineRef.current = series.createPriceLine({
          price: lastPt.close,
          color: lineCol,
          lineWidth: 1,
          lineStyle: 2,
          axisLabelVisible: false
        });
      }
    };

    if (!structuralChanged && seriesRef.current) {
      const series = seriesRef.current;
      series.applyOptions({ autoscaleInfoProvider: autoscale });
      if (graphType === "candles") {
        series.setData(candleRows);
      } else {
        series.setData(lineData);
      }
      refreshPriceLine(series);
      applyMarkers(series);
      requestAnimationFrame(() => {
        chart.resize(el.clientWidth, height);
        updateAxisPill();
      });
      return;
    }

    if (seriesRef.current) {
      chart.removeSeries(seriesRef.current);
      seriesRef.current = null;
      priceLineRef.current = null;
      markersPluginRef.current = null;
    }

    if (graphType === "candles") {
      const series = chart.addSeries(CandlestickSeries, {
        upColor: CANDLE_UP,
        downColor: CANDLE_DOWN,
        borderVisible: true,
        wickUpColor: CANDLE_BORDER_UP,
        wickDownColor: CANDLE_BORDER_DOWN,
        borderUpColor: CANDLE_BORDER_UP,
        borderDownColor: CANDLE_BORDER_DOWN,
        autoscaleInfoProvider: autoscale
      });
      series.setData(candleRows);
      priceLineRef.current = series.createPriceLine({
        price: lastPt.close,
        color: PRO_LAST_PRICE,
        lineWidth: 1,
        lineStyle: 0,
        axisLabelVisible: false
      });
      if (tradeMarkers.length > 0) {
        markersPluginRef.current = createSeriesMarkers(series, buildSeriesMarkers(cd, tradeMarkers));
      }
      seriesRef.current = series;
    } else if (graphType === "line") {
      const series = chart.addSeries(LineSeries, {
        color: lineCol,
        lineWidth: 2,
        crosshairMarkerVisible: true,
        autoscaleInfoProvider: autoscale
      });
      series.setData(lineData);
      priceLineRef.current = series.createPriceLine({
        price: lastPt.close,
        color: lineCol,
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: false
      });
      if (tradeMarkers.length > 0) {
        markersPluginRef.current = createSeriesMarkers(series, buildSeriesMarkers(cd, tradeMarkers));
      }
      seriesRef.current = series;
    } else {
      const fillTop =
        tickDirection === "up"
          ? "rgba(0, 196, 140, 0.42)"
          : tickDirection === "down"
            ? "rgba(255, 78, 92, 0.4)"
            : "rgba(146, 154, 164, 0.2)";
      const series = chart.addSeries(AreaSeries, {
        lineColor: lineCol,
        topColor: fillTop,
        bottomColor: "rgba(7, 10, 15, 0)",
        lineWidth: 2,
        autoscaleInfoProvider: autoscale
      });
      series.setData(lineData);
      if (tradeMarkers.length > 0) {
        markersPluginRef.current = createSeriesMarkers(series, buildSeriesMarkers(cd, tradeMarkers));
      }
      seriesRef.current = series;
    }

    lastStructuralKeyRef.current = structuralKey;
    chart.timeScale().setVisibleLogicalRange({ from: fromIdx, to: toIdx });

    requestAnimationFrame(() => {
      chart.resize(el.clientWidth, height);
      updateAxisPill();
    });
  }, [
    assetTag,
    candles,
    chartResetKey,
    graphType,
    height,
    tickDirection,
    tradeMarkers,
    updateAxisPill,
    zoomIndex
  ]);

  const tailKey =
    candles.length > 0
      ? `${candles[candles.length - 1]!.timestamp}-${candles[candles.length - 1]!.close}`
      : "";

  useEffect(() => {
    const chart = chartRef.current;
    const el = containerRef.current;
    if (!chart || !el) {
      return;
    }
    const onRange = () => updateAxisPill();
    chart.timeScale().subscribeVisibleLogicalRangeChange(onRange);
    const ro = new ResizeObserver(() => updateAxisPill());
    ro.observe(el);
    updateAxisPill();
    return () => {
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(onRange);
      ro.disconnect();
    };
  }, [chartResetKey, assetTag, graphType, isMobileChart, tailKey, updateAxisPill, zoomIndex]);

  const last = candles.length > 0 ? candles[candles.length - 1]! : null;
  const mobileTimerMod =
    tickDirection === "up"
      ? " tv-live-badge--tick-up"
      : tickDirection === "down"
        ? " tv-live-badge--tick-down"
        : "";
  const pillMod =
    tickDirection === "up"
      ? " chart-lw-axis-pill--up"
      : tickDirection === "down"
        ? " chart-lw-axis-pill--down"
        : " chart-lw-axis-pill--neutral";

  return (
    <div className="chart-lw-outer">
      <div className="chart-lw-stack" style={{ position: "relative", width: "100%", height }}>
        <div ref={containerRef} className="chart-lw-host" style={{ width: "100%", height }} />
        {last != null && axisPillTop != null ? (
          <div className="chart-lw-axis-pill-layer" aria-hidden>
            <div className={`chart-lw-axis-pill chart-lw-axis-pill--terminal${pillMod}`} style={{ top: axisPillTop }}>
              <div className="chart-lw-axis-pill-anchor">
                <span className="chart-lw-axis-pill-price">{formatPrice(last.close)}</span>
                <span className="chart-lw-axis-pill-timer">
                  <span className="chart-lw-axis-pill-tf">{timeframeLabel}</span>
                  <span className="chart-lw-axis-pill-cd">{countdownStr}</span>
                </span>
              </div>
            </div>
          </div>
        ) : null}
      </div>
      {isMobileChart && candles.length > 0 ? (
        <div className="chart-lw-timer-anchor">
          <button
            type="button"
            className={`tv-live-badge tv-live-badge--btn tv-live-badge--timer-only${mobileTimerMod}`}
            aria-label="Tap to enlarge countdown (same as axis pill)"
            onClick={onTimerTap}
          >
            <span className={`tv-live-badge-cd${timerTextZoomed ? " zoomed" : ""}`}>
              <span className="tv-live-badge-cd-tf">{timeframeLabel}</span> {countdownStr}
            </span>
          </button>
        </div>
      ) : null}
    </div>
  );
}
