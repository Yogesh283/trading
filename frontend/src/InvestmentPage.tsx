import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  investmentDeposit,
  investmentWithdraw,
  loadInvestment,
  type InvestmentInfo
} from "./api";
import "./funds.css";
import { BrandLogo } from "./BrandLogo";

type Props = {
  token: string;
  onBack: () => void;
  onSuccess?: () => void;
};

function formatHms(totalSec: number): string {
  const s = Math.max(0, totalSec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD"
});

export default function InvestmentPage({ token, onBack, onSuccess }: Props) {
  const [info, setInfo] = useState<InvestmentInfo | null>(null);
  const [addAmount, setAddAmount] = useState("100");
  const [wdAmount, setWdAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [tick, setTick] = useState(0);

  const refresh = useCallback(async () => {
    const data = await loadInvestment(token);
    setInfo(data);
    setWdAmount((w) => {
      if (w) return w;
      return data.principal > 0 ? String(Math.floor(data.principal * 100) / 100) : "";
    });
  }, [token]);

  useEffect(() => {
    void refresh().catch(() => setInfo(null));
  }, [refresh]);

  useEffect(() => {
    if (!info?.locked) return;
    const id = window.setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [info?.locked]);

  const onAdd = async (e: FormEvent) => {
    e.preventDefault();
    setMessage("");
    const n = Number(addAmount);
    if (!Number.isFinite(n) || n <= 0) {
      setMessage("Enter a valid amount.");
      return;
    }
    setBusy(true);
    try {
      const next = await investmentDeposit(token, n);
      setInfo(next);
      setMessage(`Invested ${currency.format(n)}. Unlocks in 24h.`);
      onSuccess?.();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  const onWd = async (e: FormEvent) => {
    e.preventDefault();
    setMessage("");
    const n = Number(wdAmount);
    if (!Number.isFinite(n) || n <= 0) {
      setMessage("Enter amount to withdraw.");
      return;
    }
    setBusy(true);
    try {
      const next = await investmentWithdraw(token, n);
      setInfo(next);
      setMessage(`Returned ${currency.format(n)} to wallet. No further yield on that amount.`);
      onSuccess?.();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  const secondsLeft =
    info?.locked && info.secondsUntilUnlock
      ? Math.max(0, info.secondsUntilUnlock - tick)
      : 0;

  return (
    <main className="funds-page investment-page">
      <div className="funds-inner">
        <button type="button" className="funds-back" onClick={onBack}>
          ← Back to trading
        </button>
        <div className="funds-title-row investment-title-row">
          <BrandLogo size={44} />
          <h1>Investment</h1>
        </div>
        <p className="funds-lead">
          Move funds from your <strong>live wallet</strong> into investment. Earn about{" "}
          <strong>{info?.monthlyYieldPercent ?? 10}% per month</strong>, credited <strong>daily</strong> (cron). After
          each investment, funds are <strong>locked 24 hours</strong> before you can withdraw back to your wallet.
          Anything you withdraw stops earning.
        </p>

        {info ? (
          <div className="investment-stats">
            <div className="investment-stat">
              <span>Invested principal</span>
              <strong>{currency.format(info.principal)}</strong>
            </div>
            <div className="investment-stat">
              <span>Live wallet (available to invest)</span>
              <strong>{currency.format(info.liveWalletBalance)}</strong>
            </div>
            <div className="investment-stat">
              <span>Est. daily income (on principal)</span>
              <strong>{currency.format(info.estimatedDailyIncome)}</strong>
            </div>
            <div className="investment-stat">
              <span>Last yield day (UTC)</span>
              <strong>{info.lastYieldDate ?? "—"}</strong>
            </div>
          </div>
        ) : null}

        {info?.locked ? (
          <div className="investment-lock-banner">
            <strong>Withdrawal locked</strong>
            <p>
              Unlocks in <code>{formatHms(secondsLeft)}</code> (24h after your last investment add).
            </p>
          </div>
        ) : info && info.principal > 0 ? (
          <p className="muted investment-unlocked">You can withdraw invested funds to your wallet anytime.</p>
        ) : null}

        <section className="funds-card">
          <h2>Add to investment</h2>
          <p className="muted small">
            Deducts from live wallet. Resets 24h lock on the full invested balance.
          </p>
          <form onSubmit={onAdd} className="funds-form">
            <label>
              Amount (USDT)
              <input
                type="number"
                min={0.01}
                step="any"
                value={addAmount}
                onChange={(e) => setAddAmount(e.target.value)}
                disabled={busy}
              />
            </label>
            <button type="submit" disabled={busy}>
              {busy ? "…" : "Invest"}
            </button>
          </form>
        </section>

        <section className="funds-card">
          <h2>Withdraw to wallet</h2>
          <p className="muted small">
            Returns USDT to your live balance. That amount no longer receives daily yield.
          </p>
          <form onSubmit={onWd} className="funds-form">
            <label>
              Amount
              <input
                type="number"
                min={0.01}
                step="any"
                value={wdAmount}
                onChange={(e) => setWdAmount(e.target.value)}
                disabled={busy || info?.locked}
              />
            </label>
            <button type="submit" disabled={busy || info?.locked || !info?.principal}>
              {busy ? "…" : "Withdraw to wallet"}
            </button>
          </form>
        </section>

        {message ? <p className="funds-message">{message}</p> : null}

        <p className="muted small investment-cron-note">
          Server runs a daily job at <strong>00:05 UTC</strong>, or use{" "}
          <code>npm run cron:investment</code> / HTTP POST <code>/api/system/investment-yield</code> with secret.
        </p>
      </div>
    </main>
  );
}
