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

const ZOOM_BAR_SPACING = [2, 3, 4, 6, 8, 10, 12, 16, 20, 26];

/** TradingView-style last-price red */
const TV_LAST_RED = "#f23645";

function candlestickDataFromCandles(candles: CandlePoint[]) {
  const out: Array<{
    time: UTCTimestamp;
    open: number;
    high: number;
    low: number;
    close: number;
  }> = [];
  let lastT = 0;
  for (const c of candles) {
    let t = Math.floor(c.timestamp / 1000);
    if (t <= lastT) {
      t = lastT + 1;
    }
    lastT = t;
    out.push({
      time: t as UTCTimestamp,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close
    });
  }
  return out;
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

  const height = isMobileChart ? 400 : 440;

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

    const chart = createChart(el, {
      layout: {
        background: { type: ColorType.Solid, color: isMobileChart ? "#0b0e14" : "#131722" },
        textColor: "#B2B5BE",
        fontSize: isMobileChart ? 13 : 12
      },
      grid: {
        vertLines: { color: "rgba(197, 203, 206, 0.06)" },
        horzLines: { color: "rgba(197, 203, 206, 0.06)" }
      },
      width: el.clientWidth,
      height,
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: "rgba(197, 203, 206, 0.2)", width: 1 },
        horzLine: { color: "rgba(197, 203, 206, 0.2)", width: 1 }
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: timeframeSec < 60,
        borderColor: "rgba(42, 46, 57, 0.85)"
      },
      rightPriceScale: {
        borderColor: "rgba(42, 46, 57, 0.85)",
        scaleMargins: { top: 0.06, bottom: 0.12 }
      },
      localization: {
        priceFormatter: (p: number) =>
          p >= 1000 ? p.toFixed(2) : p >= 1 ? p.toFixed(4) : p.toFixed(6)
      }
    });

    const candleSeries = chart.addCandlestickSeries({
      upColor: "#26a69a",
      downColor: "#ef5350",
      borderUpColor: "#26a69a",
      borderDownColor: "#ef5350",
      wickUpColor: "#26a69a",
      wickDownColor: "#ef5350",
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
      chartRef.current.applyOptions({ width: containerRef.current.clientWidth, height });
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
  }, [height, isMobileChart, scheduleBadgeUpdate, timeframeSec]);

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
    const sp = ZOOM_BAR_SPACING[Math.min(zoomIndex, ZOOM_BAR_SPACING.length - 1)] ?? 8;
    chart.timeScale().applyOptions({ barSpacing: sp });
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
