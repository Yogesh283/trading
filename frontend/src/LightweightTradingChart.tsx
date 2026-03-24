import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import {
  ColorType,
  createChart,
  CrosshairMode,
  LineStyle,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type UTCTimestamp
} from "lightweight-charts";
import type { CandlePoint } from "./chartCandles";
import { CHART_ZOOM_BAR_SPACING } from "./chartBarSpacing";

/** Last-price line (TradingView red) */
const TV_LAST_RED = "#f23645";
/** Candle fills / borders — brighter so bodies read clearly on dark chart (lightweight-charts). */
const TV_CANDLE_UP = "#26d7a0";
const TV_CANDLE_UP_LINE = "#5eead4";
const TV_CANDLE_DOWN = "#ff5a5a";
const TV_CANDLE_DOWN_LINE = "#ff9494";

/** Responsive chart height for phone (visual viewport / rotation). */
function useMobileChartHeightPx(isMobile: boolean): number {
  const compute = useCallback(() => {
    if (typeof window === "undefined") {
      return 360;
    }
    const vh = window.visualViewport?.height ?? window.innerHeight;
    return Math.round(Math.min(Math.max(vh * 0.36, 272), 520));
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
 * One candlestick per bucket start time (unix seconds). Preserves real spacing (e.g. 5s TF → 5s on axis).
 * Same unix second only if bad/duplicate data — merge OHLC instead of faking `time + 1` (which hid separate bars).
 */
function candlestickDataFromCandles(candles: CandlePoint[]) {
  if (candles.length === 0) {
    return [];
  }
  const sorted = [...candles].sort((a, b) => a.timestamp - b.timestamp);
  const merged = new Map<number, { open: number; high: number; low: number; close: number }>();
  for (const c of sorted) {
    const t = Math.floor(c.timestamp / 1000);
    const m = merged.get(t);
    if (!m) {
      merged.set(t, { open: c.open, high: c.high, low: c.low, close: c.close });
    } else {
      m.high = Math.max(m.high, c.high);
      m.low = Math.min(m.low, c.low);
      m.close = c.close;
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
  onTimerTap
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const priceLineRef = useRef<IPriceLine | null>(null);
  const candlesRef = useRef(candles);
  const lastResetKeyRef = useRef("");

  const [badgeTopPx, setBadgeTopPx] = useState<number | null>(null);

  candlesRef.current = candles;

  const height = useMobileChartHeightPx(isMobileChart);

  const scheduleBadgeUpdate = useCallback(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const series = candleRef.current;
        const list = candlesRef.current;
        if (!series || list.length === 0) {
          setBadgeTopPx(null);
          return;
        }
        const lastClose = list[list.length - 1]!.close;
        const y = series.priceToCoordinate(lastClose);
        if (y == null || Number.isNaN(y)) {
          setBadgeTopPx(null);
        } else {
          setBadgeTopPx(y);
        }
      });
    });
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) {
      return;
    }

    lastResetKeyRef.current = "";

    const w0 = el.clientWidth;
    const h0 = Math.max(el.clientHeight, 200);

    const chart = createChart(el, {
      layout: {
        background: { type: ColorType.Solid, color: isMobileChart ? "#0b0e14" : "#131722" },
        textColor: "#d1d4dc",
        fontSize: isMobileChart ? 13 : 12
      },
      grid: {
        vertLines: { color: "rgba(42, 46, 57, 0.35)" },
        horzLines: { color: "rgba(42, 46, 57, 0.35)" }
      },
      width: w0,
      height: h0,
      crosshair: {
        mode: isMobileChart ? CrosshairMode.Magnet : CrosshairMode.Normal,
        vertLine: { color: "rgba(197, 203, 206, 0.2)", width: 1 },
        horzLine: { color: "rgba(197, 203, 206, 0.2)", width: 1 }
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: timeframeSec < 60,
        borderColor: "rgba(42, 46, 57, 0.85)",
        rightOffset: 8,
        fixLeftEdge: false,
        lockVisibleTimeRangeOnResize: true,
        minBarSpacing: 2
      },
      rightPriceScale: {
        borderColor: "rgba(42, 46, 57, 0.85)",
        scaleMargins: isMobileChart ? { top: 0.05, bottom: 0.14 } : { top: 0.06, bottom: 0.12 }
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
      lastValueVisible: false,
      priceLineVisible: false
    });

    chartRef.current = chart;
    candleRef.current = candleSeries;
    priceLineRef.current = null;

    const onLogicalRange = () => scheduleBadgeUpdate();
    chart.timeScale().subscribeVisibleLogicalRangeChange(onLogicalRange);

    const ro = new ResizeObserver(() => {
      if (!containerRef.current || !chartRef.current) {
        return;
      }
      const box = containerRef.current;
      chartRef.current.applyOptions({
        width: box.clientWidth,
        height: Math.max(box.clientHeight, 200)
      });
      scheduleBadgeUpdate();
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(onLogicalRange);
      priceLineRef.current = null;
      lastResetKeyRef.current = "";
      chart.remove();
      chartRef.current = null;
      candleRef.current = null;
    };
  }, [isMobileChart, scheduleBadgeUpdate, timeframeSec]);

  /** Viewport height changes without remounting the chart instance. */
  useEffect(() => {
    const chart = chartRef.current;
    const el = containerRef.current;
    if (!chart || !el) {
      return;
    }
    chart.applyOptions({
      width: el.clientWidth,
      height: Math.max(el.clientHeight, 200)
    });
    scheduleBadgeUpdate();
  }, [height, scheduleBadgeUpdate]);

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

    const lastClose = candles[candles.length - 1]!.close;

    if (!priceLineRef.current) {
      priceLineRef.current = candleSeries.createPriceLine({
        price: lastClose,
        color: TV_LAST_RED,
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: false,
        title: ""
      });
    } else {
      priceLineRef.current.applyOptions({ price: lastClose });
    }

    if (lastResetKeyRef.current !== chartResetKey) {
      lastResetKeyRef.current = chartResetKey;
      chart.timeScale().fitContent();
    }

    scheduleBadgeUpdate();
  }, [candles, timeframeSec, chartResetKey, scheduleBadgeUpdate]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) {
      return;
    }
    const sp =
      CHART_ZOOM_BAR_SPACING[Math.min(zoomIndex, CHART_ZOOM_BAR_SPACING.length - 1)] ?? 15;
    const minSp = Math.min(5, Math.max(2, sp * 0.28));
    chart.timeScale().applyOptions({ barSpacing: sp, minBarSpacing: minSp });
    scheduleBadgeUpdate();
  }, [zoomIndex, scheduleBadgeUpdate]);

  const lastClose = candles.length ? candles[candles.length - 1]!.close : null;

  const BadgeInner = (
    <>
      <span className="tv-live-badge-tag">{assetTag}</span>
      <span className="tv-live-badge-price">{lastClose != null ? formatPrice(lastClose) : "—"}</span>
      <span className={`tv-live-badge-cd${timerTextZoomed ? " zoomed" : ""}`}>{countdownStr}</span>
    </>
  );

  return (
    <div className="chart-lw-outer">
      <div ref={containerRef} className="chart-lw-host" style={{ width: "100%", height }} />
      {badgeTopPx != null && lastClose != null ? (
        <div
          className="chart-lw-badge-layer"
          style={
            {
              "--tv-badge-top": `${badgeTopPx}px`
            } as CSSProperties
          }
        >
          {isMobileChart ? (
            <button
              type="button"
              className="tv-live-badge tv-live-badge--btn"
              style={{ top: "var(--tv-badge-top)" }}
              aria-label="Current price and candle countdown; tap to resize timer"
              onClick={onTimerTap}
            >
              {BadgeInner}
            </button>
          ) : (
            <div className="tv-live-badge" style={{ top: "var(--tv-badge-top)" }}>
              {BadgeInner}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
