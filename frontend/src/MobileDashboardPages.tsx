import { type MarketTick } from "./api";
import { AiChartInsightIcon } from "./AiChartInsightIcon";
import { ProductWordmark } from "./ProductWordmark";
import { BrandLogo } from "./BrandLogo";
import { formatInr } from "./fundsConfig";

function walletInr(n: number | null): string {
  return n == null ? "—" : formatInr(n);
}
import { formatForexPair } from "./marketAssetIcon";
import { lastTickMove } from "./tickDirection";

function cx(...parts: (string | false | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

const TRENDING_ROW_COUNT = 6;

/** Prefer majors (screenshot order); fill from `symbolList` so rows always match loaded markets. */
function trendingSymbolsFor(symbolList: string[]): string[] {
  const pref = [
    "XAUUSD",
    "EURUSD",
    "USDJPY",
    "GBPUSD",
    "EURJPY",
    "AUDUSD",
    "USDCAD",
    "NZDUSD",
    "USDCHF",
    "GBPJPY",
    "AUDJPY"
  ];
  const avail = new Set(symbolList);
  const out: string[] = [];
  for (const s of pref) {
    if (avail.has(s) && !out.includes(s)) out.push(s);
    if (out.length >= TRENDING_ROW_COUNT) return out;
  }
  for (const s of symbolList) {
    if (!out.includes(s)) out.push(s);
    if (out.length >= TRENDING_ROW_COUNT) return out;
  }
  return out;
}

function formatFxPrice(sym: string, p: number) {
  if (p >= 1000) return p.toFixed(2);
  if (p >= 50) return p.toFixed(3);
  if (p >= 5) return p.toFixed(4);
  return p.toFixed(5);
}

function HomeIconRefer() {
  return (
    <svg className="mobile-dash-home__qicon" viewBox="0 0 24 24" aria-hidden>
      <circle cx="9" cy="8" r="3" fill="none" stroke="currentColor" strokeWidth="1.35" />
      <circle cx="15" cy="8" r="3" fill="none" stroke="currentColor" strokeWidth="1.35" />
      <path
        d="M5.5 19c0-2.8 2.2-4.5 6.5-4.5S18.5 16.2 18.5 19"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinecap="round"
      />
    </svg>
  );
}

function HomeIconTrades() {
  return (
    <svg className="mobile-dash-home__qicon" viewBox="0 0 24 24" aria-hidden>
      <rect x="5" y="5" width="11" height="14" rx="2" fill="none" stroke="currentColor" strokeWidth="1.35" />
      <path
        d="M14.5 12.5H19M19 12.5l-2-2M19 12.5l-2 2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function HomeIconSupport() {
  return (
    <svg className="mobile-dash-home__qicon" viewBox="0 0 24 24" aria-hidden>
      <path
        d="M4.5 18.5c-1 0-1.5-.6-1.5-1.5V9.5C3 6.4 6.4 4 12 4s9 2.4 9 5.5v7.5c0 .9-.5 1.5-1.5 1.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinecap="round"
      />
      <path d="M9.5 18.5v1c0 1 1 2 2.5 2s2.5-1 2.5-2v-1" fill="none" stroke="currentColor" strokeWidth="1.35" />
      <circle cx="9" cy="10" r="0.9" fill="currentColor" />
      <path d="M13.5 10h2M13.5 12.5h1.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function HomeIconFire() {
  return (
    <svg className="mobile-dash-home__fire" viewBox="0 0 24 24" aria-hidden>
      <path
        d="M12 4c2 3.5 6 4.5 6 9a6 6 0 11-12 0c0-2 1.2-3.6 2.5-5C10 10.5 10 7 12 4z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function MobileHomePage(props: {
  accountWallet: "demo" | "live";
  demoBal: number | null;
  liveBal: number | null;
  markets: MarketTick[];
  /** Per-symbol quote ticks (newest last) — used for up/down price color on the home list. */
  tickHistory: Record<string, MarketTick[]>;
  symbolList: string[];
  onOpenMenu: () => void;
  onRefer2Earn: () => void;
  onRewards: () => void;
  onTrades: () => void;
  onSupport: () => void;
  onDeposit: () => void;
  onWithdraw: () => void;
  onTradeSymbol: (symbol: string) => void;
}) {
  const {
    accountWallet,
    demoBal,
    liveBal,
    markets,
    tickHistory,
    symbolList,
    onOpenMenu,
    onRefer2Earn,
    onRewards,
    onTrades,
    onSupport,
    onDeposit,
    onWithdraw,
    onTradeSymbol
  } = props;

  const trendingSyms = trendingSymbolsFor(symbolList);

  return (
    <main className="mobile-dash-page mobile-dash-page--home mobile-dash-home">
      <header className="mobile-dash-home__header">
        <div className="mobile-dash-home__brand">
          <BrandLogo size={36} className="mobile-dash-home__logo" />
          <ProductWordmark className="mobile-dash-home__brand-name" size="compact" />
        </div>
        <button
          type="button"
          className="mobile-dash-home__profile-btn"
          aria-label="Open menu"
          onClick={onOpenMenu}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
            <circle cx="12" cy="9" r="3.5" stroke="currentColor" strokeWidth="1.55" />
            <path
              d="M6 19.5c0-3 2.8-5 6-5s6 2 6 5"
              stroke="currentColor"
              strokeWidth="1.55"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </header>

      <div className="mobile-dash-home__wallet">
        <span className="mobile-dash-home__wallet-label">Your wallets (live from server)</span>
        <div className="mobile-dash-home__wallet-block mobile-dash-home__wallet-block--live">
          <div className="mobile-dash-home__wallet-block-head">
            <span className="mobile-dash-home__wallet-tag">Live</span>
          </div>
          <div className="mobile-dash-home__wallet-row">
            <span className="mobile-dash-home__wallet-amt">{walletInr(liveBal)}</span>
          </div>
        </div>
        <div className="mobile-dash-home__wallet-line">
          <span className="mobile-dash-home__wallet-line-label">Demo (practice)</span>
          <strong className="mobile-dash-home__wallet-line-val">{walletInr(demoBal)}</strong>
        </div>
        <p className="mobile-dash-home__wallet-active-note">
          Active for trading:{" "}
          <strong>{accountWallet === "live" ? "Live" : "Demo"}</strong>{" "}
          <span className="muted">— switch from header menu</span>
        </p>
      </div>

      <div className="mobile-dash-home__fund-row">
        <button type="button" className="mobile-dash-home__fund-btn mobile-dash-home__fund-btn--deposit" onClick={onDeposit}>
          Deposit
        </button>
        <button type="button" className="mobile-dash-home__fund-btn mobile-dash-home__fund-btn--withdraw" onClick={onWithdraw}>
          Withdraw
        </button>
      </div>

      <div className="mobile-dash-home__quick">
        <button type="button" className="mobile-dash-home__quick-tile" onClick={onRefer2Earn}>
          <HomeIconRefer />
          <span>Refer2Earn</span>
        </button>
        <button type="button" className="mobile-dash-home__quick-tile" onClick={onRewards}>
          <span className="mobile-dash-home__quick-ai" aria-hidden>
            <AiChartInsightIcon className="mobile-dash-home__ai-ico" />
          </span>
          <span>AI</span>
        </button>
        <button type="button" className="mobile-dash-home__quick-tile" onClick={onTrades}>
          <HomeIconTrades />
          <span>Trades</span>
        </button>
        <button type="button" className="mobile-dash-home__quick-tile" onClick={onSupport}>
          <HomeIconSupport />
          <span>Support</span>
        </button>
      </div>

      <section className="mobile-dash-home__trending" aria-labelledby="mobile-dash-trending-title">
        <div className="mobile-dash-home__trending-head">
          <h2 id="mobile-dash-trending-title" className="mobile-dash-home__trending-title">
            Trending
          </h2>
          <HomeIconFire />
        </div>
        <div className="mobile-dash-home__table-wrap">
          <table className="mobile-dash-home__table">
            <thead>
              <tr>
                <th className="mobile-dash-home__th-name">Name</th>
                <th className="mobile-dash-home__th-price">Price</th>
                <th className="mobile-dash-home__th-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {trendingSyms.map((sym) => {
                const tick = markets.find((m) => m.symbol === sym);
                const priceLabel = tick != null ? formatFxPrice(sym, tick.price) : "—";
                const move = lastTickMove(tickHistory[sym]);
                return (
                  <tr key={sym}>
                    <td className="mobile-dash-home__td-name">{formatForexPair(sym)}</td>
                    <td
                      className={cx(
                        "mobile-dash-home__td-price",
                        move === "up" && "mobile-dash-home__td-price--up",
                        move === "down" && "mobile-dash-home__td-price--down"
                      )}
                    >
                      {priceLabel}
                    </td>
                    <td className="mobile-dash-home__td-actions">
                      <button
                        type="button"
                        className={cx(
                          "mobile-dash-home__trade-btn",
                          move === "up" && "mobile-dash-home__trade-btn--up",
                          move === "down" && "mobile-dash-home__trade-btn--down"
                        )}
                        onClick={() => onTradeSymbol(sym)}
                      >
                        Trade
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

/** Chart AI — how it works (same rules as first-use modal on Trading). */
function MobileChartAiHelpCard() {
  return (
    <li className="mobile-dash-offer-card mobile-dash-offer-card--chart-ai">
      <div className="mobile-dash-chart-ai__head">
        <AiChartInsightIcon className="mobile-dash-chart-ai__head-icon" aria-hidden />
        <strong className="mobile-dash-offer-card__title">Chart AI</strong>
      </div>
      <p className="mobile-dash-chart-ai__lead">
        Get AI-based direction for your selected timeframe.
      </p>
      <ul className="mobile-dash-chart-ai__bullets">
        <li>
          Works only on <strong>Live</strong> wallet — switch in the header.
        </li>
        <li>
          Predicts <strong>UP</strong> <span aria-hidden>📈</span> or <strong>DOWN</strong>{" "}
          <span aria-hidden>📉</span> for the current chart period.
        </li>
        <li>
          Cost: <strong>₹1</strong> per successful use (debited from your live wallet).
        </li>
        <li>Result appears as a small on-chart hint (pair · timeframe · arrow).</li>
      </ul>
      <div className="mobile-dash-chart-ai__how">
        <strong>How to use</strong>
        <p>
          Open <strong>Trading</strong>, pick pair + candle timeframe, then tap <strong>AI insight</strong> on the chart.
          The first time, read the disclaimer and tap <strong>Continue</strong>.
        </p>
      </div>
      <div className="mobile-dash-chart-ai__disclaimer" role="note">
        <p className="mobile-dash-chart-ai__disclaimer-warn">
          <span aria-hidden>⚠️</span> Educational only. Not financial advice.
        </p>
        <p className="mobile-dash-chart-ai__disclaimer-sub">
          Accuracy is not guaranteed. Use at your own risk.
        </p>
      </div>
    </li>
  );
}

export function MobileOffersPage(props: {
  referralCode: string | null | undefined;
  demoBal: number | null;
  liveBal: number | null;
}) {
  const { referralCode, demoBal, liveBal } = props;
  const code = referralCode?.trim() || null;

  const aiPageBrandImgSrc = `${import.meta.env.BASE_URL}brand/${encodeURIComponent("I2..png")}`;

  return (
    <main className="mobile-dash-page mobile-dash-page--offers">
      <div className="mobile-dash-page__inner">
        <h1 className="mobile-dash-page__title">AI</h1>
        <p className="mobile-dash-page__muted">Chart AI guide and account shortcuts.</p>
        <div className="mobile-dash-ai-hero">
          <img
            src={aiPageBrandImgSrc}
            alt="Chart AI"
            className="mobile-dash-ai-hero__img"
            decoding="async"
            loading="lazy"
          />
        </div>
        <ul className="mobile-dash-offer-list">
          <MobileChartAiHelpCard />
          <li className="mobile-dash-offer-card">
            <strong className="mobile-dash-offer-card__title">Wallets (INR)</strong>
            <p className="mobile-dash-offer-card__desc">
              <strong>Live:</strong> {walletInr(liveBal)}
              <br />
              <strong>Demo:</strong> {walletInr(demoBal)}
            </p>
          </li>
          <li className="mobile-dash-offer-card">
            <strong className="mobile-dash-offer-card__title">Your referral code</strong>
            <p className="mobile-dash-offer-card__desc">
              {code ? (
                <code className="referral-code-pill">{code}</code>
              ) : (
                <span className="muted">—</span>
              )}{" "}
              · share link: add <code>?ref={code ?? "CODE"}</code> to the site URL. Open <strong>Promotion</strong> for
              team details.
            </p>
          </li>
          <li className="mobile-dash-offer-card">
            <strong className="mobile-dash-offer-card__title">Fund &amp; trade</strong>
            <p className="mobile-dash-offer-card__desc">
              Use <strong>Deposit</strong> (USDT BEP20) to credit your live wallet. Timed forex trades and charts are under{" "}
              <strong>Trading</strong>.
            </p>
          </li>
        </ul>
      </div>
    </main>
  );
}

export function MobileAssetsPage(props: {
  accountWallet: "demo" | "live";
  demoBal: number | null;
  liveBal: number | null;
  onDeposit: () => void;
  onWithdraw: () => void;
  onWalletActivity: () => void;
}) {
  const { accountWallet, demoBal, liveBal, onDeposit, onWithdraw, onWalletActivity } = props;

  function fmtBal(n: number | null): string {
    return n == null ? "—" : new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(n);
  }

  return (
    <main className="mobile-dash-page mobile-dash-page--assets">
      <div className="mobile-dash-page__inner">
        <h1 className="mobile-dash-page__title">Assets</h1>
        <p className="mobile-dash-page__muted">Wallets and cash movement.</p>

        <div className="mobile-dash-assets-grid">
          <div
            className={cx(
              "mobile-dash-asset-tile",
              accountWallet === "demo" && "mobile-dash-asset-tile--active"
            )}
          >
            <span className="mobile-dash-asset-tile__label">Demo</span>
            <strong className="mobile-dash-asset-tile__val">{fmtBal(demoBal)}</strong>
          </div>
          <div
            className={cx(
              "mobile-dash-asset-tile",
              accountWallet === "live" && "mobile-dash-asset-tile--active"
            )}
          >
            <span className="mobile-dash-asset-tile__label">Live</span>
            <strong className="mobile-dash-asset-tile__val">{fmtBal(liveBal)}</strong>
          </div>
        </div>

        <div className="mobile-dash-actions mobile-dash-actions--stack">
          <button type="button" className="mobile-dash-btn mobile-dash-btn--primary" onClick={onDeposit}>
            Deposit
          </button>
          <button type="button" className="mobile-dash-btn mobile-dash-btn--secondary" onClick={onWithdraw}>
            Withdraw
          </button>
          <button type="button" className="mobile-dash-btn mobile-dash-btn--ghost" onClick={onWalletActivity}>
            Wallet activity
          </button>
        </div>
      </div>
    </main>
  );
}
