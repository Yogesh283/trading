import { FormEvent, useEffect, useState } from "react";
import { loadMyWithdrawals, submitWithdrawalRequest } from "./api";
import "./funds.css";
import { BrandLogo } from "./BrandLogo";

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const MIN_WITHDRAW = 20;

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
    if (!Number.isFinite(num) || num < MIN_WITHDRAW) {
      setMessage(`Minimum withdrawal is ${MIN_WITHDRAW} USDT.`);
      return;
    }
    if (num > balance) {
      setMessage("Amount exceeds available balance.");
      return;
    }
    const trimmed = address.trim();
    if (!trimmed || trimmed.length < 40 || !trimmed.startsWith("0x")) {
      setMessage("Enter a valid BEP20 (0x...) address.");
      return;
    }

    setBusy(true);
    try {
      await submitWithdrawalRequest(token, num, trimmed);
      setMessage("Withdrawal submitted. USDT is held until processing.");
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
          <span className="funds-badge">BEP20</span> Withdrawals are sent to your BEP20 address only
        </p>

        <div className="funds-balance">
          <span>Available</span>
          <strong>{currency.format(balance)}</strong>
        </div>

        <form className="funds-form" onSubmit={(e) => void handleSubmit(e)}>
          <label>
            Amount (USDT)
            <input
              type="number"
              min={MIN_WITHDRAW}
              step="0.01"
              placeholder="20.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={busy}
            />
          </label>

          <label>
            Withdrawal address (USDT BEP20)
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
                  <span>{currency.format(w.amount)}</span>
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
              Minimum withdrawal: <strong>{MIN_WITHDRAW} USDT</strong>. Balance is reserved when you submit.
            </li>
            <li>Double-check the BEP20 address. Wrong address may cause permanent loss.</li>
          </ul>
        </div>

        <p className="funds-note">
          Demo / app-side ledger — integrate custody for real on-chain payouts.
        </p>
      </div>
    </div>
  );
}
