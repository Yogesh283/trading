import { useCallback, useEffect, useRef, useState } from "react";
import {
  ColorType,
  createChart,
  CrosshairMode,
  LineStyle,
  TrackingModeExitMode,
  type IChartApi,
  type ISeriesApi,
  type SeriesMarker,
  type UTCTimestamp
} from "lightweight-charts";
import type { CandlePoint } from "./chartCandles";
import { CHART_ZOOM_BAR_SPACING } from "./chartBarSpacing";

/** Last-price line + axis pill (light neutral, readable on dark pane — exchange terminals). */
const PRO_LAST_PRICE = "#eaecef";
/** High-contrast candles: crisp bodies, deep borders, bright wicks (easier to read on mobile). */
const CANDLE_UP = "#00c48c";
const CANDLE_DOWN = "#ff4e5c";
const CANDLE_BORDER_UP = "#007a55";
const CANDLE_BORDER_DOWN = "#b31929";
const WICK_UP = "#5fffd4";
const WICK_DOWN = "#ffb0ba";
const CHART_BG = "#070a0f";
const GRID_VERT = "rgba(48, 55, 65, 0.42)";
const GRID_HORZ = "rgba(48, 55, 65, 0.48)";
const SCALE_TEXT = "#929aa4";
const SCALE_BORDER = "#2b3139";
/** TradingView-style crosshair gray */
const CROSSHAIR = "rgba(117, 134, 150, 0.55)";
const CHART_FONT =
  'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Inter", sans-serif';

function priceLineColorForTick(dir: "up" | "down" | null | undefined): string {
  if (dir === "up") {
    return CANDLE_UP;
  }
  if (dir === "down") {
    return CANDLE_DOWN;
  }
  return PRO_LAST_PRICE;
}

/** Responsive chart height for phone — minimal so dock + order row dominate the screen. */
function useMobileChartHeightPx(isMobile: boolean): number {
  const compute = useCallback(() => {
    if (typeof window === "undefined") {
      return 200;
    }
    const vh = window.visualViewport?.height ?? window.innerHeight;
    /* Taller pane so full candles + wicks stay visible above the trade row */
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

/**
 * One point per chart bucket, time = unix seconds (lightweight-charts).
 * Coerces OHLC so high/low always wrap open/close (avoids broken candle geometry).
 * Duplicate unix seconds (should be rare) merge into one bar.
 */
function candlestickDataFromCandles(candles: CandlePoint[]) {
  if (candles.length === 0) {
    return [];
  }
  const sorted = [...candles].sort((a, b) => a.timestamp - b.timestamp);
  const merged = new Map<number, { open: number; high: number; low: number; close: number }>();
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
    const t = Math.floor(c.timestamp / 1000);
    const m = merged.get(t);
    if (!m) {
      merged.set(t, { open: o, high, low, close: cl });
    } else {
      m.high = Math.max(m.high, high);
      m.low = Math.min(m.low, low);
      m.close = cl;
    }
  }
  const secs = Array.from(merged.keys()).sort((a, b) => a - b);
  return secs.map((sec) => {
    const m = merged.get(sec)!;
    return {
      time: sec as UTCTimestamp,
      open: m.open,
      high: m.high,
      low: m.low,
      close: m.close
    };
  });
}

/** How OHLC buckets are drawn: full candles, close-only line, or filled area under the line. */
export type ChartGraphType = "candles" | "line" | "area";

export const CHART_GRAPH_OPTIONS: { value: ChartGraphType; label: string }[] = [
  { value: "candles", label: "Candles" },
  { value: "line", label: "Line" },
  { value: "area", label: "Area" }
];

function lineLikeDataFromMergedCandles(
  cd: ReturnType<typeof candlestickDataFromCandles>
): { time: UTCTimestamp; value: number }[] {
  return cd.map((c) => ({ time: c.time, value: c.close }));
}

function applySeriesTickColors(
  series: ISeriesApi<"Candlestick"> | ISeriesApi<"Line"> | ISeriesApi<"Area">,
  graphType: ChartGraphType,
  tickDirection: "up" | "down" | null
) {
  const lineCol = priceLineColorForTick(tickDirection);
  if (graphType === "candles") {
    (series as ISeriesApi<"Candlestick">).applyOptions({ priceLineColor: lineCol });
    return;
  }
  if (graphType === "line") {
    (series as ISeriesApi<"Line">).applyOptions({
      color: lineCol,
      priceLineColor: lineCol
    });
    return;
  }
  const fill =
    tickDirection === "up"
      ? { top: "rgba(0, 196, 140, 0.42)", bottom: "rgba(7, 10, 15, 0)" }
      : tickDirection === "down"
        ? { top: "rgba(255, 78, 92, 0.4)", bottom: "rgba(7, 10, 15, 0)" }
        : { top: "rgba(146, 154, 164, 0.2)", bottom: "rgba(7, 10, 15, 0)" };
  (series as ISeriesApi<"Area">).applyOptions({
    lineColor: lineCol,
    priceLineColor: lineCol,
    topColor: fill.top,
    bottomColor: fill.bottom
  });
}

type Props = {
  candles: CandlePoint[];
  assetTag: string;
  /** Same short label as toolbar (e.g. 10S, 1M) — shown in the right-axis last-price pill with the countdown. */
  timeframeLabel: string;
  formatPrice: (p: number) => string;
  timeframeSec: number;
  zoomIndex: number;
  isMobileChart: boolean;
  chartResetKey: string;
  countdownStr: string;
  timerTextZoomed: boolean;
  onTimerTap: () => void;
  /** Last spot tick vs previous (green ↑ / red ↓). */
  tickDirection?: "up" | "down" | null;
  /** Open binary trades on this symbol — rendered as arrows on candles. */
  tradeMarkers?: SeriesMarker<UTCTimestamp>[];
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
  const mainSeriesRef = useRef<
    ISeriesApi<"Candlestick"> | ISeriesApi<"Line"> | ISeriesApi<"Area"> | null
  >(null);
  const lastResetKeyRef = useRef("");
  /** Last applied series state — use `update()` for live ticks so the forming candle moves smoothly. */
  const liveSeriesStateRef = useRef<{
    resetKey: string;
    len: number;
    firstTime: number;
    lastTime: number;
  } | null>(null);
  const candlesRef = useRef(candles);
  candlesRef.current = candles;
  /** Y px for custom last-price pill (native label hidden — show TF + countdown + price). */
  const [axisPillTop, setAxisPillTop] = useState<number | null>(null);

  const height = useMobileChartHeightPx(isMobileChart);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) {
      return;
    }

    lastResetKeyRef.current = "";

    const chart = createChart(el, {
      /** ResizeObserver on container — avoids wrong clientWidth on first paint + keeps right price scale laid out. */
      autoSize: true,
      width: 0,
      height: 0,
      layout: {
        background: {
          type: ColorType.Solid,
          color: CHART_BG
        },
        textColor: SCALE_TEXT,
        fontSize: isMobileChart ? 12 : 13,
        fontFamily: CHART_FONT
      },
      grid: {
        vertLines: { color: GRID_VERT },
        horzLines: { color: GRID_HORZ }
      },
      /** Hide empty left scale — all prices on the right (TradingView-style). */
      leftPriceScale: {
        visible: false
      },
      crosshair: {
        mode: isMobileChart ? CrosshairMode.Magnet : CrosshairMode.Normal,
        vertLine: {
          color: CROSSHAIR,
          width: 1,
          style: LineStyle.LargeDashed
        },
        horzLine: {
          color: CROSSHAIR,
          width: 1,
          style: LineStyle.LargeDashed
        }
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: timeframeSec < 60,
        borderColor: SCALE_BORDER,
        // Extra gap so last candle + wicks aren’t flush against the price scale on narrow screens
        rightOffset: isMobileChart ? 14 : 8,
        fixLeftEdge: false,
        fixRightEdge: false,
        lockVisibleTimeRangeOnResize: true,
        minBarSpacing: 2,
        /** When the latest candle is in view, new ticks follow; when user scrolls left, view stays on history. */
        shiftVisibleRangeOnNewBar: true
      },
      rightPriceScale: {
        visible: true,
        borderVisible: true,
        ticksVisible: true,
        entireTextOnly: false,
        textColor: SCALE_TEXT,
        borderColor: SCALE_BORDER,
        // Room for last-value pill: timeframe + MM:SS + price (desktop)
        minimumWidth: isMobileChart ? 76 : 124,
        // Mobile: more vertical padding so full wicks (high/low) stay inside the plot, not clipped at edges
        scaleMargins: isMobileChart ? { top: 0.12, bottom: 0.22 } : { top: 0.05, bottom: 0.1 }
      },
      localization: {
        priceFormatter: (p: number) =>
          p >= 1000 ? p.toFixed(2) : p >= 1 ? p.toFixed(4) : p.toFixed(6)
      },
      /** Desktop: wheel / drag; mobile: finger pan + pinch zoom — both can scroll to older candles. */
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: false
      },
      handleScale: {
        mouseWheel: true,
        pinch: true,
        axisPressedMouseMove: false,
        axisDoubleClickReset: true
      },
      kineticScroll: {
        mouse: true,
        touch: true
      },
      /** Long-press crosshair no longer traps scroll until another tap (finger up returns to pan). */
      trackingMode: {
        exitMode: TrackingModeExitMode.OnTouchEnd
      }
    });

    const priceLineW = isMobileChart ? 2 : 1;
    const mainSeries =
      graphType === "candles"
        ? chart.addCandlestickSeries({
            upColor: CANDLE_UP,
            downColor: CANDLE_DOWN,
            borderUpColor: CANDLE_BORDER_UP,
            borderDownColor: CANDLE_BORDER_DOWN,
            wickUpColor: WICK_UP,
            wickDownColor: WICK_DOWN,
            borderVisible: true,
            wickVisible: true,
            title: "",
            lastValueVisible: false,
            priceLineVisible: true,
            priceLineColor: PRO_LAST_PRICE,
            priceLineWidth: priceLineW,
            priceLineStyle: LineStyle.Solid
          })
        : graphType === "line"
          ? chart.addLineSeries({
              color: PRO_LAST_PRICE,
              lineWidth: isMobileChart ? 2 : 2,
              title: "",
              lastValueVisible: false,
              priceLineVisible: true,
              priceLineColor: PRO_LAST_PRICE,
              priceLineWidth: priceLineW,
              priceLineStyle: LineStyle.Solid
            })
          : chart.addAreaSeries({
              lineColor: CANDLE_UP,
              topColor: "rgba(0, 196, 140, 0.35)",
              bottomColor: "rgba(7, 10, 15, 0)",
              lineWidth: isMobileChart ? 2 : 2,
              title: "",
              lastValueVisible: false,
              priceLineVisible: true,
              priceLineColor: PRO_LAST_PRICE,
              priceLineWidth: priceLineW,
              priceLineStyle: LineStyle.Solid
            });

    chartRef.current = chart;
    mainSeriesRef.current = mainSeries;

    return () => {
      lastResetKeyRef.current = "";
      liveSeriesStateRef.current = null;
      chart.remove();
      chartRef.current = null;
      mainSeriesRef.current = null;
    };
  }, [assetTag, graphType, isMobileChart, timeframeSec]);

  useEffect(() => {
    const chart = chartRef.current;
    const series = mainSeriesRef.current;
    if (!chart || !series || candles.length === 0) {
      return;
    }

    chart.applyOptions({
      timeScale: {
        secondsVisible: timeframeSec < 60
      }
    });

    const cd = candlestickDataFromCandles(candles);
    const lastPt = cd[cd.length - 1]!;
    const firstPt = cd[0]!;
    const lastT = Number(lastPt.time);
    const firstT = Number(firstPt.time);
    const st = liveSeriesStateRef.current;

    let useFullSet = true;
    if (st && st.resetKey === chartResetKey && st.firstTime === firstT) {
      const sameBar = cd.length === st.len && lastT === st.lastTime;
      const oneNewBar = cd.length === st.len + 1 && lastT > st.lastTime;
      if (sameBar || oneNewBar) {
        if (graphType === "candles") {
          (series as ISeriesApi<"Candlestick">).update(lastPt);
        } else {
          (series as ISeriesApi<"Line">).update({
            time: lastPt.time,
            value: lastPt.close
          });
        }
        useFullSet = false;
      }
    }

    if (useFullSet) {
      if (graphType === "candles") {
        (series as ISeriesApi<"Candlestick">).setData(cd);
      } else {
        (series as ISeriesApi<"Line">).setData(lineLikeDataFromMergedCandles(cd));
      }
    }

    liveSeriesStateRef.current = {
      resetKey: chartResetKey,
      len: cd.length,
      firstTime: firstT,
      lastTime: lastT
    };

    chart.priceScale("right").applyOptions({
      visible: true,
      minimumWidth: isMobileChart ? 76 : 124
    });

    if (lastResetKeyRef.current !== chartResetKey) {
      lastResetKeyRef.current = chartResetKey;
      chart.timeScale().fitContent();
    }
  }, [assetTag, candles, chartResetKey, graphType, isMobileChart, timeframeSec]);

  useEffect(() => {
    const series = mainSeriesRef.current;
    if (!series) {
      return;
    }
    series.setMarkers(tradeMarkers);
  }, [tradeMarkers, chartResetKey, assetTag, graphType]);

  /** Custom HTML pill for TF + countdown + price; native last-value label stays off. */
  useEffect(() => {
    const series = mainSeriesRef.current;
    if (!series || candles.length === 0) {
      return;
    }
    applySeriesTickColors(series, graphType, tickDirection);
  }, [candles.length, graphType, tickDirection]);

  const tailKey =
    candles.length > 0
      ? `${candles[candles.length - 1]!.timestamp}-${candles[candles.length - 1]!.close}`
      : "";

  useEffect(() => {
    const chart = chartRef.current;
    const series = mainSeriesRef.current;
    const el = containerRef.current;
    if (!chart || !series || !el) {
      return;
    }

    const sync = () => {
      const list = candlesRef.current;
      const last = list[list.length - 1];
      if (!last) {
        setAxisPillTop(null);
        return;
      }
      const y = series.priceToCoordinate(last.close);
      setAxisPillTop(y == null ? null : Number(y));
    };

    sync();
    const ro = new ResizeObserver(() => sync());
    ro.observe(el);
    const ts = chart.timeScale();
    ts.subscribeVisibleLogicalRangeChange(sync);
    ts.subscribeVisibleTimeRangeChange(sync);
    return () => {
      ro.disconnect();
      ts.unsubscribeVisibleLogicalRangeChange(sync);
      ts.unsubscribeVisibleTimeRangeChange(sync);
    };
  }, [chartResetKey, assetTag, graphType, isMobileChart, timeframeSec, zoomIndex, tailKey]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) {
      return;
    }
    const sp =
      CHART_ZOOM_BAR_SPACING[Math.min(zoomIndex, CHART_ZOOM_BAR_SPACING.length - 1)] ?? 15;
    const minSp = Math.min(5, Math.max(2, sp * 0.28));
    chart.timeScale().applyOptions({ barSpacing: sp, minBarSpacing: minSp });
  }, [zoomIndex]);

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
            <div
              className={`chart-lw-axis-pill${pillMod}`}
              style={{ top: axisPillTop, transform: "translateY(-50%)" }}
            >
              <span className="chart-lw-axis-pill-timer">
                <span className="chart-lw-axis-pill-tf">{timeframeLabel}</span>
                <span className="chart-lw-axis-pill-cd">{countdownStr}</span>
              </span>
              <span className="chart-lw-axis-pill-price">{formatPrice(last.close)}</span>
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
