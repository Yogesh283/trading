import { useEffect, useMemo, useState } from "react";
import { getBackendHttpOrigin } from "./backendOrigin";

const CHART_AI_LANDING_ICON = `${import.meta.env.BASE_URL}chart-ai-icon.png`.replace(/\/{2,}/g, "/");
const LANDING_PREVIEW_SYMBOL = "EURUSD";
const LANDING_PREVIEW_TF_SEC = 60;

async function fetchPublicCandles(): Promise<Array<{ close: number }>> {
  const base = getBackendHttpOrigin().replace(/\/$/, "");
  const params = new URLSearchParams({
    symbol: LANDING_PREVIEW_SYMBOL,
    timeframe: String(LANDING_PREVIEW_TF_SEC),
    limit: "96"
  });
  const url = `${base}/api/markets/candles?${params}`;
  const response = await fetch(url, {
    cache: "no-store",
    headers: { Accept: "application/json" }
  });
  if (!response.ok) {
    throw new Error("candles request failed");
  }
  const text = await response.text();
  const t = text.trimStart();
  if (t.startsWith("<") || (t.length > 0 && !t.startsWith("{") && !t.startsWith("["))) {
    throw new Error("non-JSON response");
  }
  const data = JSON.parse(text) as { candles?: Array<{ c?: number }> };
  const rows = Array.isArray(data.candles) ? data.candles : [];
  return rows
    .map((r) => ({ close: Number(r.c) }))
    .filter((x) => Number.isFinite(x.close));
}

/** Landing only: public GET /api/markets/candles (chart_candles DB) + Chart AI copy */
export function LandingChartAiCandlesPreview() {
  const [rows, setRows] = useState<Array<{ close: number }>>([]);
  const [phase, setPhase] = useState<"loading" | "ok" | "empty" | "err">("loading");

  useEffect(() => {
    let cancelled = false;
    setPhase("loading");
    void fetchPublicCandles()
      .then((list) => {
        if (cancelled) return;
        if (list.length === 0) {
          setPhase("empty");
        } else {
          setRows(list);
          setPhase("ok");
        }
      })
      .catch(() => {
        if (!cancelled) setPhase("err");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const spark = useMemo(() => {
    if (rows.length < 2) return null;
    const closes = rows.map((r) => r.close);
    const w = 320;
    const h = 80;
    const min = Math.min(...closes);
    const max = Math.max(...closes);
    const span = Math.max(max - min, 1e-9);
    const pad = span * 0.06;
    const lo = min - pad;
    const hi = max + pad;
    const pts = closes
      .map((v, i) => {
        const x = (i / (closes.length - 1)) * w;
        const y = h - ((v - lo) / (hi - lo)) * h;
        return `${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(" ");
    return { pts, last: closes[closes.length - 1]!, w, h };
  }, [rows]);

  return (
    <section className="landing-chart-ai-band" id="landing-chart-ai" aria-label="Chart AI and live candles">
      <div className="landing-chart-ai-inner">
        <div className="landing-chart-ai-head">
          <img
            src={CHART_AI_LANDING_ICON}
            alt=""
            width={40}
            height={40}
            className="landing-chart-ai-head-ico"
            decoding="async"
            loading="lazy"
          />
          <h2 className="landing-chart-ai-title">Chart AI &amp; live candles</h2>
        </div>
        <p className="landing-chart-ai-lead">
          After you sign in, open <strong>Trading</strong> for full OHLC charts. The server stores closed candles in{" "}
          <code className="landing-chart-ai-code">chart_candles</code> — merged with live prices.{" "}
          <strong>Chart AI</strong> gives a directional hint on your timeframe (live wallet, ₹1 per use — educational
          only).
        </p>
        <div className="landing-chart-ai-preview" aria-live="polite">
          <p className="landing-chart-ai-preview-label">
            Sample feed · {LANDING_PREVIEW_SYMBOL} · {LANDING_PREVIEW_TF_SEC}s candles
          </p>
          {phase === "loading" ? (
            <p className="landing-chart-ai-preview-status">Loading candle snapshot…</p>
          ) : phase === "err" ? (
            <p className="landing-chart-ai-preview-status">
              Chart API unavailable (check that the trading server is running). Open the app after sign-in for live data.
            </p>
          ) : phase === "empty" ? (
            <p className="landing-chart-ai-preview-status">
              No stored candles yet for this pair — they fill as the market runs. Sign in to load the full chart.
            </p>
          ) : spark ? (
            <div className="landing-chart-ai-spark-wrap">
              <svg
                className="landing-chart-ai-spark"
                viewBox={`0 0 ${spark.w} ${spark.h}`}
                preserveAspectRatio="none"
                aria-hidden
              >
                <polyline
                  fill="none"
                  stroke="#38bdf8"
                  strokeWidth="2"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  points={spark.pts}
                />
              </svg>
              <p className="landing-chart-ai-last">
                Last close (sample): <strong>{spark.last.toFixed(5)}</strong>
              </p>
            </div>
          ) : (
            <p className="landing-chart-ai-preview-status">Not enough points for a preview.</p>
          )}
        </div>
      </div>
    </section>
  );
}
