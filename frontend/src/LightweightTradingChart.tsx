import { useCallback, useEffect, useRef, useState } from "react";
import {
  ColorType,
  createChart,
  CrosshairMode,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp
} from "lightweight-charts";
import type { CandlePoint } from "./chartCandles";
import { CHART_ZOOM_BAR_SPACING } from "./chartBarSpacing";

/** Last-price line + axis label background (TradingView-style, all assets). */
const TV_LAST_RED = "#f23645";
/** Classic TV candle greens / reds (same family as reference charts). */
const TV_CANDLE_UP = "#26a69a";
const TV_CANDLE_UP_LINE = "#26a69a";
const TV_CANDLE_DOWN = "#ef5350";
const TV_CANDLE_DOWN_LINE = "#ef5350";
const TV_CHART_BG = "#131722";
const TV_GRID = "rgba(42, 46, 57, 0.5)";

/** Responsive chart height for phone — large enough to feel “full” (toolbar + dock stay outside). */
function useMobileChartHeightPx(isMobile: boolean): number {
  const compute = useCallback(() => {
    if (typeof window === "undefined") {
      return 380;
    }
    const vh = window.visualViewport?.height ?? window.innerHeight;
    const target = vh * 0.52;
    return Math.round(Math.min(580, Math.max(300, target)));
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

  return isMobile ? px : 440;
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

type Props = {
  candles: CandlePoint[];
  assetTag: string;
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
};

export function LightweightTradingChart({
  candles,
  assetTag,
  formatPrice,
  timeframeSec,
  zoomIndex,
  isMobileChart,
  chartResetKey,
  countdownStr,
  timerTextZoomed,
  onTimerTap,
  tickDirection = null
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const lastResetKeyRef = useRef("");

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
        background: { type: ColorType.Solid, color: TV_CHART_BG },
        textColor: "#d1d4dc",
        fontSize: isMobileChart ? 13 : 12
      },
      grid: {
        vertLines: { color: TV_GRID },
        horzLines: { color: TV_GRID }
      },
      /** Hide empty left scale — all prices on the right (TradingView-style). */
      leftPriceScale: {
        visible: false
      },
      crosshair: {
        mode: isMobileChart ? CrosshairMode.Magnet : CrosshairMode.Normal,
        vertLine: { color: "rgba(197, 203, 206, 0.2)", width: 1 },
        horzLine: { color: "rgba(197, 203, 206, 0.2)", width: 1 }
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: timeframeSec < 60,
        borderColor: "rgba(42, 46, 57, 0.85)",
        // Extra gap so last candle + wicks aren’t flush against the price scale on narrow screens
        rightOffset: isMobileChart ? 14 : 8,
        fixLeftEdge: false,
        lockVisibleTimeRangeOnResize: true,
        minBarSpacing: 2
      },
      rightPriceScale: {
        visible: true,
        borderVisible: true,
        ticksVisible: true,
        entireTextOnly: false,
        textColor: "#c4ced9",
        borderColor: "rgba(56, 68, 82, 0.95)",
        // Wide enough for "XAUUSD 4413.47" / JPY-style quotes on the axis
        minimumWidth: isMobileChart ? 80 : 88,
        // Mobile: more vertical padding so full wicks (high/low) stay inside the plot, not clipped at edges
        scaleMargins: isMobileChart ? { top: 0.12, bottom: 0.22 } : { top: 0.06, bottom: 0.12 }
      },
      localization: {
        priceFormatter: (p: number) =>
          p >= 1000 ? p.toFixed(2) : p >= 1 ? p.toFixed(4) : p.toFixed(6)
      },
      ...(isMobileChart
        ? {
            handleScroll: {
              mouseWheel: false,
              pressedMouseMove: true,
              horzTouchDrag: true,
              vertTouchDrag: false
            },
            handleScale: {
              mouseWheel: false,
              pinch: true,
              axisPressedMouseMove: false,
              axisDoubleClickReset: true
            },
            kineticScroll: {
              mouse: false,
              touch: true
            }
          }
        : {})
    });

    const candleSeries = chart.addCandlestickSeries({
      upColor: TV_CANDLE_UP,
      downColor: TV_CANDLE_DOWN,
      borderUpColor: TV_CANDLE_UP_LINE,
      borderDownColor: TV_CANDLE_DOWN_LINE,
      wickUpColor: TV_CANDLE_UP_LINE,
      wickDownColor: TV_CANDLE_DOWN_LINE,
      borderVisible: true,
      wickVisible: true,
      /** Symbol next to last price on the right scale (e.g. USDJPY). */
      title: assetTag,
      lastValueVisible: true,
      /** Red dashed last-price line like TradingView. */
      priceLineVisible: true,
      priceLineColor: TV_LAST_RED,
      priceLineWidth: 1,
      priceLineStyle: LineStyle.Dashed
    });

    chartRef.current = chart;
    candleRef.current = candleSeries;

    return () => {
      lastResetKeyRef.current = "";
      chart.remove();
      chartRef.current = null;
      candleRef.current = null;
    };
  }, [assetTag, isMobileChart, timeframeSec]);

  useEffect(() => {
    const chart = chartRef.current;
    const candleSeries = candleRef.current;
    if (!chart || !candleSeries || candles.length === 0) {
      return;
    }

    chart.applyOptions({
      timeScale: {
        secondsVisible: timeframeSec < 60
      }
    });

    const cd = candlestickDataFromCandles(candles);
    candleSeries.setData(cd);
    candleSeries.applyOptions({
      title: assetTag,
      priceLineColor: TV_LAST_RED
    });

    chart.priceScale("right").applyOptions({
      visible: true,
      minimumWidth: isMobileChart ? 80 : 88
    });

    if (lastResetKeyRef.current !== chartResetKey) {
      lastResetKeyRef.current = chartResetKey;
      chart.timeScale().fitContent();
    }
  }, [assetTag, candles, chartResetKey, isMobileChart, timeframeSec]);

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

  const badgeMod =
    tickDirection === "up" ? " tv-live-badge--tick-up" : tickDirection === "down" ? " tv-live-badge--tick-down" : "";

  return (
    <div className="chart-lw-outer">
      <div ref={containerRef} className="chart-lw-host" style={{ width: "100%", height }} />
      {isMobileChart && candles.length > 0 ? (
        <div className="chart-lw-timer-anchor">
          <button
            type="button"
            className={`tv-live-badge tv-live-badge--btn tv-live-badge--timer-only${badgeMod}`}
            aria-label="Candle countdown; tap to resize timer"
            onClick={onTimerTap}
          >
            <span className={`tv-live-badge-cd${timerTextZoomed ? " zoomed" : ""}`}>{countdownStr}</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}
