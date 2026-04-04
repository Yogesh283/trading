import { useCallback, useEffect, useState } from "react";
import {
  loadInvestment,
  investmentDeposit,
  investmentWithdraw,
  type InvestmentInfo,
  type MarketTick
} from "./api";
import { ProductWordmark } from "./ProductWordmark";
import { BrandLogo } from "./BrandLogo";
import { formatInr } from "./fundsConfig";
import { useGlobalAlert } from "./GlobalAlertContext";

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
    "EURUSD",
    "USDJPY",
    "GBPUSD",
    "EURJPY",
    "AUDUSD",
    "USDCAD",
    "NZDUSD",
    "USDCHF",
    "XAUUSD",
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

function HomeIconGift() {
  return (
    <svg className="mobile-dash-home__qicon" viewBox="0 0 24 24" aria-hidden>
      <rect x="4" y="10" width="16" height="11" rx="2" fill="none" stroke="currentColor" strokeWidth="1.35" />
      <path d="M12 10V21" stroke="currentColor" strokeWidth="1.2" />
      <path d="M4 14.5h16" stroke="currentColor" strokeWidth="1.2" opacity={0.5} />
      <path
        d="M8 10c0-2.2 1.8-4 4-4s4 1.8 4 4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinecap="round"
      />
      <path d="M12 6v4" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
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
          <HomeIconGift />
          <span>Rewards</span>
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

function formatUnlockRemaining(sec: number): string {
  if (sec <= 0) return "";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h}h ${m}m left`;
  return `${Math.max(1, m)}m left`;
}

/** Investment / staking pool — same data as GET /api/investment; add & withdraw move live wallet ↔ principal. */
function MobileOffersInvestmentMember(props: { token: string; onChanged?: () => void }) {
  const { token, onChanged } = props;
  const { showAlert } = useGlobalAlert();
  const [info, setInfo] = useState<InvestmentInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [addAmt, setAddAmt] = useState("1000");
  const [wdAmt, setWdAmt] = useState("");
  const [busy, setBusy] = useState<"add" | "wd" | null>(null);

  const reload = useCallback(async () => {
    try {
      const snap = await loadInvestment(token);
      setInfo(snap);
    } catch (e) {
      showAlert(e instanceof Error ? e.message : "Could not load investment", "error");
      setInfo(null);
    } finally {
      setLoading(false);
    }
  }, [token, showAlert]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const doAdd = async () => {
    const n = Number(addAmt);
    if (!Number.isFinite(n) || n <= 0) {
      showAlert("Enter a valid amount to add.", "error");
      return;
    }
    setBusy("add");
    try {
      const snap = await investmentDeposit(token, n);
      setInfo(snap);
      setAddAmt("");
      onChanged?.();
      showAlert("Added to investment pool from live wallet.", "info");
    } catch (e) {
      showAlert(e instanceof Error ? e.message : "Add failed", "error");
    } finally {
      setBusy(null);
    }
  };

  const doWithdraw = async () => {
    const n = Number(wdAmt);
    if (!Number.isFinite(n) || n <= 0) {
      showAlert("Enter a valid amount to withdraw.", "error");
      return;
    }
    setBusy("wd");
    try {
      const snap = await investmentWithdraw(token, n);
      setInfo(snap);
      setWdAmt("");
      onChanged?.();
      showAlert("Withdrawn to live wallet.", "info");
    } catch (e) {
      showAlert(e instanceof Error ? e.message : "Withdraw failed", "error");
    } finally {
      setBusy(null);
    }
  };

  return (
    <li className="mobile-dash-offer-card mobile-dash-offer-card--invest">
      <strong className="mobile-dash-offer-card__title">Offers</strong>
      {loading ? (
        <p className="mobile-dash-offer-card__desc">Loading…</p>
      ) : info ? (
        <div className="mobile-dash-offer-invest">
          <div className="mobile-dash-offer-invest__summary" role="group" aria-label="Investment snapshot">
            <span className="mobile-dash-offer-invest__cell">
              <strong>Principal</strong>
              <span className="mobile-dash-offer-invest__value">{formatInr(info.principal)}</span>
            </span>
            <span className="mobile-dash-offer-invest__cell">
              <strong>Monthly ROI</strong>
              <span className="mobile-dash-offer-invest__value">
                {info.monthlyYieldPercent.toFixed(2)}% gross
              </span>
            </span>
            <span className="mobile-dash-offer-invest__cell">
              <strong>Est. / month (you)</strong>
              <span className="mobile-dash-offer-invest__value">{formatInr(info.estimatedMonthlyIncome)}</span>
            </span>
            <span className="mobile-dash-offer-invest__cell">
              <strong>Live wallet</strong>
              <span className="mobile-dash-offer-invest__value">{formatInr(info.liveWalletBalance)}</span>
            </span>
          </div>
          {info.locked ? (
            <p className="mobile-dash-offer-invest__lock">
              Locked — withdraw after unlock
              {info.lockedUntil ? (
                <>
                  {" "}
                  (<time dateTime={info.lockedUntil}>{new Date(info.lockedUntil).toLocaleString()}</time>)
                </>
              ) : null}
              {info.secondsUntilUnlock > 0 ? (
                <span className="mobile-dash-offer-invest__lock-eta"> · {formatUnlockRemaining(info.secondsUntilUnlock)}</span>
              ) : null}
            </p>
          ) : (
            <p className="mobile-dash-offer-invest__lock mobile-dash-offer-invest__lock--ok">Unlocked — you can withdraw up to principal.</p>
          )}
          <div className="mobile-dash-offer-invest__actions">
            <label className="mobile-dash-offer-invest__field">
              <span>Add from live (₹)</span>
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                value={addAmt}
                onChange={(e) => setAddAmt(e.target.value)}
                disabled={busy !== null}
              />
            </label>
            <button
              type="button"
              className="mobile-dash-btn mobile-dash-btn--primary mobile-dash-offer-invest__add-btn"
              disabled={busy !== null}
              onClick={() => void doAdd()}
            >
              {busy === "add" ? "…" : "Add"}
            </button>
          </div>
          <div className="mobile-dash-offer-invest__actions">
            <label className="mobile-dash-offer-invest__field">
              <span>Withdraw to live (₹)</span>
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                value={wdAmt}
                onChange={(e) => setWdAmt(e.target.value)}
                disabled={busy !== null || info.locked}
              />
            </label>
            <button
              type="button"
              className="mobile-dash-btn mobile-dash-btn--secondary mobile-dash-offer-invest__withdraw-btn"
              disabled={busy !== null || info.locked}
              onClick={() => void doWithdraw()}
            >
              {busy === "wd" ? "…" : "Withdraw"}
            </button>
          </div>
          <p className="mobile-dash-offer-invest__hint">{info.explanation}</p>
        </div>
      ) : (
        <p className="mobile-dash-offer-card__desc muted">Could not load investment.</p>
      )}
    </li>
  );
}

export function MobileOffersPage(props: {
  token: string;
  referralCode: string | null | undefined;
  demoBal: number | null;
  liveBal: number | null;
  onInvestmentChanged?: () => void;
}) {
  const { token, referralCode, demoBal, liveBal, onInvestmentChanged } = props;
  const code = referralCode?.trim() || null;

  return (
    <main className="mobile-dash-page mobile-dash-page--offers">
      <div className="mobile-dash-page__inner">
        <h1 className="mobile-dash-page__title">Offers</h1>
        <p className="mobile-dash-page__muted">Live snapshot from your account.</p>
        <ul className="mobile-dash-offer-list">
          <MobileOffersInvestmentMember token={token} onChanged={onInvestmentChanged} />
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
