import { useCallback, useEffect, useRef, useState } from "react";
import {
  ColorType,
  createChart,
  CrosshairMode,
  LineStyle,
  TrackingModeExitMode,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp
} from "lightweight-charts";
import type { CandlePoint } from "./chartCandles";
import { CHART_ZOOM_BAR_SPACING } from "./chartBarSpacing";

/** Desktop: red last-price line + label (TradingView pro). */
const TV_LAST_RED = "#ff4d5e";
/** Mobile ref: white price pill → library picks black text via contrast. */
const MOBILE_PRICE_PILL = "#ffffff";
/** Classic TV / pro app greens & reds (all assets, same on mobile + desktop). */
const CANDLE_UP = "#089981";
const CANDLE_DOWN = "#f23645";
const DESKTOP_CHART_BG = "#0a0c12";
const MOBILE_CHART_BG = "#000000";
const DESKTOP_GRID_VERT = "rgba(100, 116, 139, 0.14)";
const DESKTOP_GRID_HORZ = "rgba(100, 116, 139, 0.22)";
const MOBILE_GRID_VERT = "rgba(255, 255, 255, 0.055)";
const MOBILE_GRID_HORZ = "rgba(255, 255, 255, 0.075)";
const CHART_FONT =
  'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Inter", sans-serif';

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
        background: {
          type: ColorType.Solid,
          color: isMobileChart ? MOBILE_CHART_BG : DESKTOP_CHART_BG
        },
        textColor: isMobileChart ? "#c8cdd5" : "#e8edf4",
        fontSize: isMobileChart ? 14 : 13,
        fontFamily: CHART_FONT
      },
      grid: {
        vertLines: { color: isMobileChart ? MOBILE_GRID_VERT : DESKTOP_GRID_VERT },
        horzLines: { color: isMobileChart ? MOBILE_GRID_HORZ : DESKTOP_GRID_HORZ }
      },
      /** Hide empty left scale — all prices on the right (TradingView-style). */
      leftPriceScale: {
        visible: false
      },
      crosshair: {
        mode: isMobileChart ? CrosshairMode.Magnet : CrosshairMode.Normal,
        vertLine: {
          color: isMobileChart ? "rgba(255, 255, 255, 0.12)" : "rgba(212, 175, 55, 0.22)",
          width: 1
        },
        horzLine: {
          color: isMobileChart ? "rgba(255, 255, 255, 0.1)" : "rgba(212, 175, 55, 0.18)",
          width: 1
        }
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: timeframeSec < 60,
        borderColor: isMobileChart ? "rgba(255, 255, 255, 0.1)" : "rgba(148, 163, 184, 0.35)",
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
        textColor: isMobileChart ? "#a8b0bd" : "#e2e8f0",
        borderColor: isMobileChart ? "rgba(255, 255, 255, 0.08)" : "rgba(148, 163, 184, 0.4)",
        // Wide enough for "XAUUSD 4413.47" / JPY-style quotes on the axis
        minimumWidth: isMobileChart ? 80 : 88,
        // Mobile: more vertical padding so full wicks (high/low) stay inside the plot, not clipped at edges
        scaleMargins: isMobileChart ? { top: 0.12, bottom: 0.22 } : { top: 0.06, bottom: 0.12 }
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

    const candleSeries = chart.addCandlestickSeries({
      upColor: CANDLE_UP,
      downColor: CANDLE_DOWN,
      borderUpColor: CANDLE_UP,
      borderDownColor: CANDLE_DOWN,
      wickUpColor: CANDLE_UP,
      wickDownColor: CANDLE_DOWN,
      borderVisible: true,
      wickVisible: true,
      /** Mobile: price-only pill on axis (ref). Desktop: symbol + price. */
      title: isMobileChart ? "" : assetTag,
      lastValueVisible: true,
      priceLineVisible: true,
      priceLineColor: isMobileChart ? MOBILE_PRICE_PILL : TV_LAST_RED,
      priceLineWidth: isMobileChart ? 1 : 2,
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
      title: isMobileChart ? "" : assetTag,
      priceLineColor: isMobileChart ? MOBILE_PRICE_PILL : TV_LAST_RED
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
