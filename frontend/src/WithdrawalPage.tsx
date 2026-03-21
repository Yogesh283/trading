import { FormEvent, useEffect, useState } from "react";
import { loadMyWithdrawals, submitWithdrawalRequest } from "./api";
import "./funds.css";
import { BrandLogo } from "./BrandLogo";
import { formatInr, INR_PER_USDT, previewInrFromUsdt } from "./fundsConfig";

const MIN_WITHDRAW_USDT = 20;
const MIN_BALANCE_INR = MIN_WITHDRAW_USDT * INR_PER_USDT;

type Props = {
  token: string;
  onBack: () => void;
  balance: number;
  onSuccess: () => void;
};

export default function WithdrawalPage({ token, onBack, balance, onSuccess }: Props) {
  const [amount, setAmount] = useState("");
  const [address, setAddress] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [withdrawals, setWithdrawals] = useState<
    Awaited<ReturnType<typeof loadMyWithdrawals>>["withdrawals"]
  >([]);

  useEffect(() => {
    void loadMyWithdrawals(token)
      .then((r) => setWithdrawals(r.withdrawals))
      .catch(() => undefined);
  }, [token]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setMessage("");

    const num = Number(amount);
    if (!Number.isFinite(num) || num < MIN_WITHDRAW_USDT) {
      setMessage(`Minimum withdrawal is ${MIN_WITHDRAW_USDT} USDT (need at least ${formatInr(MIN_BALANCE_INR)} in wallet).`);
      return;
    }
    const inrNeeded = previewInrFromUsdt(num);
    if (inrNeeded > balance + 1e-6) {
      setMessage(
        `Not enough balance. ${num} USDT needs ${formatInr(inrNeeded)} (1 USDT = ₹${INR_PER_USDT}); you have ${formatInr(balance)}.`
      );
      return;
    }
    const trimmed = address.trim();
    if (!trimmed || trimmed.length < 40 || !trimmed.startsWith("0x")) {
      setMessage("Enter a valid BEP20 (0x...) address.");
      return;
    }

    setBusy(true);
    try {
      const res = await submitWithdrawalRequest(token, num, trimmed);
      const debited = res.inrDebited ?? inrNeeded;
      setMessage(
        `Withdrawal submitted for ${num} USDT. ${formatInr(debited)} reserved from your wallet (1 USDT = ₹${res.inrPerUsdt ?? INR_PER_USDT}).`
      );
      setAmount("");
      setAddress("");
      onSuccess();
      const r = await loadMyWithdrawals(token);
      setWithdrawals(r.withdrawals);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Request failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="funds-page">
      <button type="button" className="funds-back" onClick={onBack}>
        ← Dashboard
      </button>

      <div className="funds-card">
        <div className="funds-title-row">
          <BrandLogo size={44} />
          <h1>Withdraw USDT</h1>
        </div>
        <p className="funds-network">
          <span className="funds-badge">BEP20</span> You receive <strong>USDT</strong> on-chain; trading wallet is debited in{" "}
          <strong>INR</strong> (₹{INR_PER_USDT} per 1 USDT)
        </p>

        <div className="funds-balance">
          <span>Available (trading wallet)</span>
          <strong>{formatInr(balance)}</strong>
        </div>

        <form className="funds-form" onSubmit={(e) => void handleSubmit(e)}>
          <label>
            Amount to receive (USDT)
            <input
              type="number"
              min={MIN_WITHDRAW_USDT}
              step="0.01"
              placeholder="20.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={busy}
            />
          </label>
          <p className="muted withdrawal-inr-line">
            Deducted from balance: ≈ <strong>{formatInr(previewInrFromUsdt(Number(amount) || 0))}</strong>
          </p>

          <label>
            Your USDT address (BEP20)
            <input
              type="text"
              placeholder="0x..."
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              disabled={busy}
            />
          </label>

          <button type="submit" disabled={busy}>
            {busy ? "Submitting…" : "Submit withdrawal"}
          </button>
        </form>

        {message ? <p className="funds-message">{message}</p> : null}

        {withdrawals.length > 0 ? (
          <div className="funds-history">
            <h2>Your withdrawals</h2>
            <ul className="funds-history-list">
              {withdrawals.map((w) => (
                <li key={w.id}>
                  <span>{w.amount} USDT</span>
                  <span className="funds-history-status">{w.status}</span>
                  <span className="funds-history-meta">
                    {w.to_address.slice(0, 10)}… · {new Date(w.created_at).toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="funds-warn">
          <strong>Note</strong>
          <ul>
            <li>
              Minimum: <strong>{MIN_WITHDRAW_USDT} USDT</strong> (≈ {formatInr(MIN_BALANCE_INR)} balance). Funds are reserved when you submit.
            </li>
            <li>Wrong BEP20 address can mean permanent loss — double-check.</li>
          </ul>
        </div>

        <p className="funds-note">Demo ledger — integrate custody for real on-chain payouts.</p>
      </div>
    </div>
  );
}
