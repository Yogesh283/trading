import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { CHART_ZOOM_BAR_SPACING, effectiveZoomIndexForView } from "./chartBarSpacing";
import { isXauUsdSymbol, shouldShowXauMarketLock } from "./xauChartLock";

/**
 * TradingView [Lightweight Charts](https://github.com/tradingview/lightweight-charts) — same family many brokers
 * (Olymp-style web terminals often use canvas OHLC engines like this; exact stack of olymptrade.com is not public).
 */

const PRO_LAST_PRICE = "#d1d4dc";
const CANDLE_UP = "#089981";
const CANDLE_DOWN = "#f23645";
const CANDLE_BORDER_UP = "#068f76";
const CANDLE_BORDER_DOWN = "#d12e3a";
/** Muted OHLC when XAU is weekend / stale (market “off”). */
const XAU_CANDLE_OFF = {
  upColor: "#4a5a52",
  downColor: "#5c4548",
  borderUpColor: "#3d4a44",
  borderDownColor: "#4a3a3d",
  wickUpColor: "#3d4a44",
  wickDownColor: "#4a3a3d"
};
const XAU_LINE_OFF = "#6b7280";
const XAU_PRICE_LINE_OFF = "#7a8290";
const CHART_BG = "#0b0d12";
const GRID_VERT = "rgba(42, 46, 58, 0.35)";
const GRID_HORZ = "rgba(42, 46, 58, 0.4)";
const SCALE_TEXT = "#929aa4";
const SCALE_BORDER = "#2b3139";
const CROSSHAIR = "rgba(117, 134, 150, 0.55)";
const CHART_FONT =
  'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Inter", sans-serif';

/** Empty space after last candle on mobile (logical bar slots) — gap before price scale. */
const MOBILE_CHART_RIGHT_GAP_BARS = 5;

function priceLineColorForTick(dir: "up" | "down" | null | undefined): string {
  if (dir === "up") return CANDLE_UP;
  if (dir === "down") return CANDLE_DOWN;
  return PRO_LAST_PRICE;
}

function areaSeriesFillTop(tickDirection: "up" | "down" | null | undefined): string {
  if (tickDirection === "up") return "rgba(0, 196, 140, 0.42)";
  if (tickDirection === "down") return "rgba(255, 78, 92, 0.4)";
  return "rgba(146, 154, 164, 0.2)";
}

export type ChartTradeMarker = {
  time: number;
  position: "belowBar" | "aboveBar";
  color: string;
  shape: "arrowUp" | "arrowDown";
  text?: string;
  id?: string;
};

/** Horizontal line at binary entry price (open trades for this symbol). */
export type ChartTradeEntryLine = {
  tradeId: string;
  price: number;
  direction: "up" | "down";
};

/** Keep scroll/zoom when the chart canvas is resized (viewport, rotation, container). */
function resizeChartPreserveRange(chart: IChartApi, width: number, heightPx: number) {
  const range = chart.timeScale().getVisibleLogicalRange();
  chart.resize(width, heightPx);
  if (range != null && Number.isFinite(range.from) && Number.isFinite(range.to)) {
    requestAnimationFrame(() => {
      chart.timeScale().setVisibleLogicalRange(range);
    });
  }
}

function useMobileChartHeightPx(isMobile: boolean): number {
  const compute = useCallback(() => {
    if (typeof window === "undefined") {
      return 280;
    }
    const vh = window.visualViewport?.height ?? window.innerHeight;
    const target = vh * 0.54;
    return Math.round(Math.min(560, Math.max(280, target)));
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

function applyXauSeriesVisualLock(
  series: ISeriesApi<"Candlestick" | "Line" | "Area">,
  graphType: ChartGraphType,
  locked: boolean,
  tickDirection: "up" | "down" | null,
  assetTag: string
): void {
  if (!isXauUsdSymbol(assetTag)) {
    return;
  }
  if (graphType === "candles") {
    const s = series as ISeriesApi<"Candlestick">;
    if (locked) {
      s.applyOptions(XAU_CANDLE_OFF);
    } else {
      s.applyOptions({
        upColor: CANDLE_UP,
        downColor: CANDLE_DOWN,
        borderUpColor: CANDLE_BORDER_UP,
        borderDownColor: CANDLE_BORDER_DOWN,
        wickUpColor: CANDLE_BORDER_UP,
        wickDownColor: CANDLE_BORDER_DOWN
      });
    }
  } else if (graphType === "line") {
    const s = series as ISeriesApi<"Line">;
    const col = locked ? XAU_LINE_OFF : priceLineColorForTick(tickDirection);
    s.applyOptions({ color: col });
  } else {
    const s = series as ISeriesApi<"Area">;
    const lc = locked ? XAU_LINE_OFF : priceLineColorForTick(tickDirection);
    s.applyOptions({
      lineColor: lc,
      topColor: locked ? "rgba(107, 114, 128, 0.35)" : areaSeriesFillTop(tickDirection)
    });
  }
}

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

function syncTradeEntryPriceLines(
  series: ISeriesApi<"Candlestick" | "Line" | "Area">,
  entries: ChartTradeEntryLine[],
  mapRef: { current: Map<string, IPriceLine> },
  graphType: ChartGraphType
): void {
  if (graphType === "area") {
    for (const [, line] of mapRef.current) {
      series.removePriceLine(line);
    }
    mapRef.current.clear();
    return;
  }
  const want = new Set(entries.map((e) => e.tradeId));
  for (const [id, line] of [...mapRef.current.entries()]) {
    if (!want.has(id)) {
      series.removePriceLine(line);
      mapRef.current.delete(id);
    }
  }
  for (const e of entries) {
    if (!Number.isFinite(e.price)) {
      continue;
    }
    const col = e.direction === "up" ? CANDLE_UP : CANDLE_DOWN;
    const existing = mapRef.current.get(e.tradeId);
    const opts = {
      price: e.price,
      color: col,
      lineWidth: 2 as const,
      lineStyle: 2 as const,
      axisLabelVisible: true,
      title: "Order",
      lineVisible: true
    };
    if (existing) {
      existing.applyOptions(opts);
    } else {
      mapRef.current.set(e.tradeId, series.createPriceLine(opts));
    }
  }
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

function candleBarKey(b: CandlestickData<UTCTimestamp>): string {
  return `${b.time as number}|${b.open}|${b.high}|${b.low}|${b.close}`;
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
  /** Full-width horizontal lines at each open trade’s entry price (this symbol). */
  tradeEntryLines?: ChartTradeEntryLine[];
  graphType?: ChartGraphType;
  /** Latest of last tick ts and last candle bucket start (ms); used for XAU stale lock. */
  lastChartActivityMs?: number;
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
  tradeEntryLines = [],
  graphType = "candles",
  lastChartActivityMs = 0
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick" | "Line" | "Area"> | null>(null);
  const priceLineRef = useRef<IPriceLine | null>(null);
  const tradeEntryPriceLineRefs = useRef<Map<string, IPriceLine>>(new Map());
  const prevCandlestickRowsRef = useRef<CandlestickData<UTCTimestamp>[] | null>(null);
  const markersPluginRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  /** When this matches current layout, only `setData` — do not reset time scale (avoids snap-back every 1s tick). */
  const lastStructuralKeyRef = useRef<string | null>(null);
  /** After login, bar count often jumps when `chart_candles` merge in — refit range so candles aren’t stuck “fat”. */
  const lastBarCountForRangeRef = useRef(0);
  /** When DB history prepends bars, first bucket shifts — refit so old candles aren’t only off-screen left. */
  const firstBarMsForRangeRef = useRef(0);
  const candlesRef = useRef(candles);
  candlesRef.current = candles;
  const [axisPillTop, setAxisPillTop] = useState<number | null>(null);
  /** XAU: padlock at last bar (weekend IST or stale feed). */
  const [lockOverlay, setLockOverlay] = useState<{ left: number; top: number } | null>(null);
  /** Last-price line + pill/timer only when viewport is at the live (right) edge — hide while viewing older candles. */
  const [showLiveRightUi, setShowLiveRightUi] = useState(true);

  const zoomIndexRef = useRef(zoomIndex);
  zoomIndexRef.current = zoomIndex;
  const timeframeSecRef = useRef(timeframeSec);
  timeframeSecRef.current = timeframeSec;
  const isMobileChartRef = useRef(isMobileChart);
  isMobileChartRef.current = isMobileChart;
  const graphTypeRef = useRef(graphType);
  graphTypeRef.current = graphType;
  const assetTagRef = useRef(assetTag);
  assetTagRef.current = assetTag;
  const lastChartActivityMsRef = useRef(lastChartActivityMs);
  lastChartActivityMsRef.current = lastChartActivityMs;

  const [lockTick, setLockTick] = useState(0);
  const xauLocked = useMemo(
    () => shouldShowXauMarketLock(assetTag, lastChartActivityMs),
    [assetTag, lastChartActivityMs, lockTick]
  );

  const height = useMobileChartHeightPx(isMobileChart);
  const heightRef = useRef(height);
  heightRef.current = height;

  const syncLivePriceChrome = useCallback(() => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!chart || !series || seriesRef.current === null) {
      setShowLiveRightUi(false);
      setAxisPillTop(null);
      setLockOverlay(null);
      return;
    }
    const list = candlesRef.current;
    const cd = candlestickDataFromCandles(list);
    if (cd.length === 0) {
      setShowLiveRightUi(false);
      setAxisPillTop(null);
      setLockOverlay(null);
      return;
    }
    const n = cd.length;
    const zi = effectiveZoomIndexForView(zoomIndexRef.current, timeframeSecRef.current);
    const dzR = dataZoomRange(zi, n);
    const fromR = Math.floor((n * dzR.start) / 100);
    const gapR = isMobileChartRef.current ? MOBILE_CHART_RIGHT_GAP_BARS : 0;
    const toR = Math.max(fromR, n - 1 + gapR);
    const vis = chart.timeScale().getVisibleLogicalRange();
    const atLive =
      vis == null ||
      (Number.isFinite(vis.to) && vis.to >= toR - 1.5);

    setShowLiveRightUi(atLive);

    const gt = graphTypeRef.current;
    if (priceLineRef.current && (gt === "candles" || gt === "line")) {
      priceLineRef.current.applyOptions({ lineVisible: atLive });
    }

    if (!atLive) {
      setAxisPillTop(null);
      setLockOverlay(null);
      return;
    }
    const lastBar = cd[cd.length - 1]!;
    const y = series.priceToCoordinate(lastBar.close);
    setAxisPillTop(y != null && Number.isFinite(y) ? y : null);

    const tag = assetTagRef.current;
    const act = lastChartActivityMsRef.current;
    if (shouldShowXauMarketLock(tag, act)) {
      const t = toUtcTime(lastBar.bucketMs);
      const x = chart.timeScale().timeToCoordinate(t as Time);
      const gt0 = graphTypeRef.current;
      const price = gt0 === "candles" ? lastBar.high : lastBar.close;
      const yLock = series.priceToCoordinate(price);
      if (x != null && yLock != null && Number.isFinite(x) && Number.isFinite(yLock)) {
        setLockOverlay({ left: x, top: yLock });
      } else {
        setLockOverlay(null);
      }
    } else {
      setLockOverlay(null);
    }
  }, []);

  const jumpToLive = useCallback(() => {
    const chart = chartRef.current;
    if (!chart) {
      return;
    }
    chart.timeScale().scrollToRealTime();
    requestAnimationFrame(() => {
      syncLivePriceChrome();
    });
  }, [syncLivePriceChrome]);

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
        scaleMargins: { top: 0.08, bottom: 0.08 },
        /** Reserve a bit more width for axis labels so the candle pane doesn’t crowd the last-price pill. */
        minimumWidth: isMobileChart ? 56 : 52
      },
      timeScale: {
        borderColor: SCALE_BORDER,
        timeVisible: true,
        secondsVisible: timeframeSec < 60,
        /** Kept in sync with logical `to` when we extend past last bar on mobile. */
        rightOffset: isMobileChart ? MOBILE_CHART_RIGHT_GAP_BARS : 8,
        /** Only shifts when the last bar is still visible — keeps the forming candle in view without snapping pan when viewing history. */
        shiftVisibleRangeOnNewBar: true
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
      autoSize: false
    });
    chartRef.current = chart;
    const ro = new ResizeObserver(() => {
      resizeChartPreserveRange(chart, el.clientWidth, heightRef.current);
      syncLivePriceChrome();
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      markersPluginRef.current = null;
      tradeEntryPriceLineRefs.current.clear();
      prevCandlestickRowsRef.current = null;
      priceLineRef.current = null;
      seriesRef.current = null;
      chart.remove();
      chartRef.current = null;
      lastStructuralKeyRef.current = null;
      lastBarCountForRangeRef.current = 0;
      firstBarMsForRangeRef.current = 0;
    };
  }, [assetTag, isMobileChart, timeframeSec, syncLivePriceChrome]);

  /** Pixel height changes must not recreate the chart — only resize (pan/zoom preserved). */
  useEffect(() => {
    const chart = chartRef.current;
    const el = containerRef.current;
    if (!chart || !el) {
      return;
    }
    resizeChartPreserveRange(chart, el.clientWidth, height);
    syncLivePriceChrome();
  }, [height, syncLivePriceChrome]);

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
    const dz = dataZoomRange(effectiveZoomIndexForView(zoomIndex, timeframeSec), cd.length);
    const yExt = yExtentForDisplay(cd, dz.start, dz.end);
    const yScaled = alignYAxisToNiceStep(yExt);
    const lineCol = priceLineColorForTick(tickDirection);

    const n = cd.length;
    const fromIdx = Math.floor((n * dz.start) / 100);
    const rightGap = isMobileChart ? MOBILE_CHART_RIGHT_GAP_BARS : 0;
    const toIdx = Math.max(fromIdx, n - 1 + rightGap);

    /** Do not include `tickDirection` — it changes every tick and was forcing a full series rebuild + `setVisibleLogicalRange`, which reset pan so older candles could not be viewed. */
    const structuralKey = `${chartResetKey}|${graphType}|${zoomIndex}|${assetTag}`;
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
      const xau = isXauUsdSymbol(assetTag);
      const plCandle = xauLocked && xau ? XAU_PRICE_LINE_OFF : PRO_LAST_PRICE;
      const plLine = xauLocked && xau ? XAU_PRICE_LINE_OFF : lineCol;
      if (graphType === "candles") {
        const opts = {
          price: lastPt.close,
          color: plCandle,
          lineWidth: 1 as const,
          lineStyle: 0 as const,
          axisLabelVisible: false
        };
        if (priceLineRef.current) {
          priceLineRef.current.applyOptions(opts);
        } else {
          priceLineRef.current = series.createPriceLine(opts);
        }
      } else if (graphType === "line") {
        const opts = {
          price: lastPt.close,
          color: plLine,
          lineWidth: 1 as const,
          lineStyle: 2 as const,
          axisLabelVisible: false
        };
        if (priceLineRef.current) {
          priceLineRef.current.applyOptions(opts);
        } else {
          priceLineRef.current = series.createPriceLine(opts);
        }
      } else if (priceLineRef.current) {
        series.removePriceLine(priceLineRef.current);
        priceLineRef.current = null;
      }
    };

    if (!structuralChanged && seriesRef.current) {
      const series = seriesRef.current;
      series.applyOptions({ autoscaleInfoProvider: autoscale });
      if (graphType === "candles") {
        const prevRows = prevCandlestickRowsRef.current;
        if (prevRows && prevRows.length === candleRows.length && candleRows.length > 0) {
          let allSame = true;
          for (let i = 0; i < candleRows.length; i++) {
            if (candleBarKey(prevRows[i]!) !== candleBarKey(candleRows[i]!)) {
              allSame = false;
              break;
            }
          }
          if (allSame) {
            refreshPriceLine(series);
            syncTradeEntryPriceLines(series, tradeEntryLines, tradeEntryPriceLineRefs, graphType);
            applyMarkers(series);
            requestAnimationFrame(() => {
              resizeChartPreserveRange(chart, el.clientWidth, height);
              syncLivePriceChrome();
            });
            return;
          }
        }
        let usedUpdate = false;
        if (prevRows && prevRows.length === candleRows.length && candleRows.length > 0) {
          let samePrefix = true;
          for (let i = 0; i < candleRows.length - 1; i++) {
            if (candleBarKey(prevRows[i]!) !== candleBarKey(candleRows[i]!)) {
              samePrefix = false;
              break;
            }
          }
          if (
            samePrefix &&
            candleBarKey(prevRows[prevRows.length - 1]!) !== candleBarKey(candleRows[candleRows.length - 1]!)
          ) {
            series.update(candleRows[candleRows.length - 1]!);
            usedUpdate = true;
          }
        }
        if (!usedUpdate) {
          series.setData(candleRows);
        }
        prevCandlestickRowsRef.current = candleRows;
      } else {
        prevCandlestickRowsRef.current = null;
        if (graphType === "line") {
          series.applyOptions({ color: lineCol });
        } else if (graphType === "area") {
          series.applyOptions({
            lineColor: lineCol,
            topColor: areaSeriesFillTop(tickDirection)
          });
        }
        series.setData(lineData);
      }
      refreshPriceLine(series);
      syncTradeEntryPriceLines(series, tradeEntryLines, tradeEntryPriceLineRefs, graphType);
      applyMarkers(series);
      const prevRangeN = lastBarCountForRangeRef.current;
      const rangeN = cd.length;
      const firstMs = cd[0]?.bucketMs ?? 0;
      const prevFirstMs = firstBarMsForRangeRef.current;
      const headChanged =
        prevFirstMs !== 0 && firstMs !== 0 && firstMs !== prevFirstMs;
      if (firstMs > 0) {
        firstBarMsForRangeRef.current = firstMs;
      }
      const refitRange =
        rangeN > 0 &&
        (headChanged ||
          (prevRangeN > 0 && rangeN - prevRangeN >= 18) ||
          (prevRangeN < 24 && rangeN >= 24) ||
          (prevRangeN < 10 && rangeN - prevRangeN >= 6));
      if (refitRange) {
        const zi = effectiveZoomIndexForView(zoomIndex, timeframeSec);
        const dzR = dataZoomRange(zi, rangeN);
        const fromR = Math.floor((rangeN * dzR.start) / 100);
        const gapR = isMobileChart ? MOBILE_CHART_RIGHT_GAP_BARS : 0;
        const toR = Math.max(fromR, rangeN - 1 + gapR);
        const vis = chart.timeScale().getVisibleLogicalRange();
        const atRightEdge =
          vis == null || (Number.isFinite(vis.to) && vis.to >= toR - 1.5);
        if (atRightEdge) {
          requestAnimationFrame(() => {
            chart.timeScale().setVisibleLogicalRange({ from: fromR, to: toR });
          });
        }
      }
      lastBarCountForRangeRef.current = rangeN;
      requestAnimationFrame(() => {
        resizeChartPreserveRange(chart, el.clientWidth, height);
        syncLivePriceChrome();
      });
      return;
    }

    if (seriesRef.current) {
      tradeEntryPriceLineRefs.current.clear();
      prevCandlestickRowsRef.current = null;
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
        /** We draw one custom last-price line at the forming candle’s close — hide series default to avoid double line/labels. */
        priceLineVisible: false,
        lastValueVisible: false,
        autoscaleInfoProvider: autoscale
      });
      series.setData(candleRows);
      applyXauSeriesVisualLock(series, graphType, xauLocked, tickDirection, assetTag);
      prevCandlestickRowsRef.current = candleRows;
      priceLineRef.current = series.createPriceLine({
        price: lastPt.close,
        color: xauLocked && isXauUsdSymbol(assetTag) ? XAU_PRICE_LINE_OFF : PRO_LAST_PRICE,
        lineWidth: 1,
        lineStyle: 0,
        axisLabelVisible: false
      });
      syncTradeEntryPriceLines(series, tradeEntryLines, tradeEntryPriceLineRefs, graphType);
      if (tradeMarkers.length > 0) {
        markersPluginRef.current = createSeriesMarkers(series, buildSeriesMarkers(cd, tradeMarkers));
      }
      seriesRef.current = series;
    } else if (graphType === "line") {
      const series = chart.addSeries(LineSeries, {
        color: lineCol,
        lineWidth: 2,
        crosshairMarkerVisible: true,
        priceLineVisible: false,
        lastValueVisible: false,
        autoscaleInfoProvider: autoscale
      });
      series.setData(lineData);
      applyXauSeriesVisualLock(series, graphType, xauLocked, tickDirection, assetTag);
      priceLineRef.current = series.createPriceLine({
        price: lastPt.close,
        color: xauLocked && isXauUsdSymbol(assetTag) ? XAU_PRICE_LINE_OFF : lineCol,
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: false
      });
      syncTradeEntryPriceLines(series, tradeEntryLines, tradeEntryPriceLineRefs, graphType);
      if (tradeMarkers.length > 0) {
        markersPluginRef.current = createSeriesMarkers(series, buildSeriesMarkers(cd, tradeMarkers));
      }
      seriesRef.current = series;
    } else {
      const series = chart.addSeries(AreaSeries, {
        lineColor: lineCol,
        topColor: areaSeriesFillTop(tickDirection),
        bottomColor: "rgba(7, 10, 15, 0)",
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: false,
        autoscaleInfoProvider: autoscale
      });
      series.setData(lineData);
      applyXauSeriesVisualLock(series, graphType, xauLocked, tickDirection, assetTag);
      if (tradeMarkers.length > 0) {
        markersPluginRef.current = createSeriesMarkers(series, buildSeriesMarkers(cd, tradeMarkers));
      }
      seriesRef.current = series;
    }

    lastStructuralKeyRef.current = structuralKey;
    lastBarCountForRangeRef.current = cd.length;
    firstBarMsForRangeRef.current = cd[0]?.bucketMs ?? 0;
    chart.timeScale().setVisibleLogicalRange({ from: fromIdx, to: toIdx });
    /** Snap scroll to the live (newest) edge — default view always shows the current / forming candle. */
    chart.timeScale().scrollToRealTime();

    requestAnimationFrame(() => {
      resizeChartPreserveRange(chart, el.clientWidth, height);
      syncLivePriceChrome();
    });
  }, [
    assetTag,
    candles,
    chartResetKey,
    graphType,
    height,
    timeframeSec,
    tradeMarkers,
    tradeEntryLines,
    syncLivePriceChrome,
    zoomIndex,
    isMobileChart,
    xauLocked
  ]);

  /**
   * Tick direction + XAU lock: series / last-price line when OHLC is unchanged (main candle effect does not re-run).
   * Non-XAU line/area colors also live here so `tickDirection` can stay off the heavy candle effect deps (preserves pan-left history).
   */
  useEffect(() => {
    const s = seriesRef.current;
    if (!s || candles.length === 0) {
      return;
    }
    const cd = candlestickDataFromCandles(candles);
    if (cd.length === 0) {
      return;
    }
    const lastPt = cd[cd.length - 1]!;
    const lineCol = priceLineColorForTick(tickDirection);
    applyXauSeriesVisualLock(s, graphType, xauLocked, tickDirection, assetTag);
    if (isXauUsdSymbol(assetTag)) {
      if (priceLineRef.current && (graphType === "candles" || graphType === "line")) {
        priceLineRef.current.applyOptions({
          price: lastPt.close,
          color: xauLocked ? XAU_PRICE_LINE_OFF : graphType === "candles" ? PRO_LAST_PRICE : lineCol,
          lineWidth: 1,
          lineStyle: graphType === "candles" ? 0 : 2,
          axisLabelVisible: false
        });
      }
    } else {
      if (graphType === "line") {
        (s as ISeriesApi<"Line">).applyOptions({ color: lineCol });
      } else if (graphType === "area") {
        (s as ISeriesApi<"Area">).applyOptions({
          lineColor: lineCol,
          topColor: areaSeriesFillTop(tickDirection)
        });
      }
      if (priceLineRef.current && (graphType === "candles" || graphType === "line")) {
        priceLineRef.current.applyOptions({
          price: lastPt.close,
          color: graphType === "candles" ? PRO_LAST_PRICE : lineCol,
          lineWidth: 1,
          lineStyle: graphType === "candles" ? 0 : 2,
          axisLabelVisible: false
        });
      }
    }
    syncLivePriceChrome();
  }, [xauLocked, graphType, tickDirection, assetTag, candles, syncLivePriceChrome]);

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
    const onRange = () => syncLivePriceChrome();
    chart.timeScale().subscribeVisibleLogicalRangeChange(onRange);
    const ro = new ResizeObserver(() => syncLivePriceChrome());
    ro.observe(el);
    syncLivePriceChrome();
    return () => {
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(onRange);
      ro.disconnect();
    };
  }, [chartResetKey, assetTag, graphType, isMobileChart, tailKey, syncLivePriceChrome, zoomIndex, lastChartActivityMs]);

  useEffect(() => {
    const id = window.setInterval(() => {
      setLockTick((n) => n + 1);
      syncLivePriceChrome();
    }, 60_000);
    return () => window.clearInterval(id);
  }, [syncLivePriceChrome]);

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
        {!showLiveRightUi && candles.length > 0 ? (
          <button
            type="button"
            className="chart-lw-live-jump"
            aria-label="Jump to live candle"
            title="Back to live (current) candle"
            onClick={jumpToLive}
          >
            Live
          </button>
        ) : null}
        {lockOverlay != null && showLiveRightUi ? (
          <div
            className="chart-xau-lock"
            style={{ left: lockOverlay.left, top: lockOverlay.top }}
            aria-hidden
            title="Market closed (XAU/USD Sat–Sun IST) or feed paused"
          >
            <svg className="chart-xau-lock-svg" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M7 11V8a5 5 0 0110 0v3"
              />
              <rect x="5" y="11" width="14" height="10" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
              <circle cx="12" cy="16" r="1.2" fill="currentColor" />
            </svg>
          </div>
        ) : null}
        {last != null && showLiveRightUi && axisPillTop != null ? (
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
      {isMobileChart && candles.length > 0 && showLiveRightUi ? (
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
