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

/** Last-price line + axis pill (light neutral, readable on dark pane — exchange terminals). */
const PRO_LAST_PRICE = "#eaecef";
/** Binance-style candles + slightly darker borders for depth (VIP terminal). */
const CANDLE_UP = "#0ecb81";
const CANDLE_DOWN = "#f6465d";
const CANDLE_BORDER_UP = "#078f6a";
const CANDLE_BORDER_DOWN = "#c93545";
const WICK_UP = "#12d991";
const WICK_DOWN = "#ff5c6c";
const CHART_BG = "#0d1117";
const GRID_VERT = "rgba(43, 49, 57, 0.38)";
const GRID_HORZ = "rgba(43, 49, 57, 0.5)";
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
  tickDirection = null
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const lastResetKeyRef = useRef("");
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
        minimumWidth: isMobileChart ? 92 : 124,
        // Mobile: more vertical padding so full wicks (high/low) stay inside the plot, not clipped at edges
        scaleMargins: isMobileChart ? { top: 0.1, bottom: 0.2 } : { top: 0.05, bottom: 0.1 }
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
      priceLineWidth: 1,
      priceLineStyle: LineStyle.Solid
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

    chart.priceScale("right").applyOptions({
      visible: true,
      minimumWidth: isMobileChart ? 92 : 124
    });

    if (lastResetKeyRef.current !== chartResetKey) {
      lastResetKeyRef.current = chartResetKey;
      chart.timeScale().fitContent();
    }
  }, [assetTag, candles, chartResetKey, isMobileChart, timeframeSec]);

  /** Custom HTML pill for TF + countdown + price; native last-value label stays off. */
  useEffect(() => {
    const candleSeries = candleRef.current;
    if (!candleSeries || candles.length === 0) {
      return;
    }
    candleSeries.applyOptions({
      priceLineColor: priceLineColorForTick(tickDirection)
    });
  }, [candles.length, tickDirection]);

  const tailKey =
    candles.length > 0
      ? `${candles[candles.length - 1]!.timestamp}-${candles[candles.length - 1]!.close}`
      : "";

  useEffect(() => {
    const chart = chartRef.current;
    const series = candleRef.current;
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
  }, [chartResetKey, assetTag, isMobileChart, timeframeSec, zoomIndex, tailKey]);

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
