import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  beginWithdrawalTotpSetup,
  confirmWithdrawalTotpSetup,
  loadMyWithdrawals,
  loadWithdrawalTotpStatus,
  submitWithdrawalRequest
} from "./api";
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
  const [tpnField, setTpnField] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [totpBusy, setTotpBusy] = useState(false);
  const [totpEnabled, setTotpEnabled] = useState(false);
  const [totpPending, setTotpPending] = useState(false);
  const [setupSecret, setSetupSecret] = useState("");
  const [setupUrl, setSetupUrl] = useState("");
  const [confirmCode, setConfirmCode] = useState("");
  const [withdrawals, setWithdrawals] = useState<
    Awaited<ReturnType<typeof loadMyWithdrawals>>["withdrawals"]
  >([]);

  const refreshTotp = useCallback(async () => {
    try {
      const st = await loadWithdrawalTotpStatus(token);
      setTotpEnabled(st.enabled);
      setTotpPending(st.setupPending);
      if (!st.setupPending && !st.enabled) {
        setSetupSecret("");
        setSetupUrl("");
      }
    } catch {
      setTotpEnabled(false);
      setTotpPending(false);
    }
  }, [token]);

  useEffect(() => {
    void loadMyWithdrawals(token)
      .then((r) => setWithdrawals(r.withdrawals))
      .catch(() => undefined);
    void refreshTotp();
  }, [token, refreshTotp]);

  const handleBeginTotp = async () => {
    setMessage("");
    setTotpBusy(true);
    try {
      const out = await beginWithdrawalTotpSetup(token);
      setSetupSecret(out.secret);
      setSetupUrl(out.otpauthUrl);
      await refreshTotp();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "TPN setup failed");
    } finally {
      setTotpBusy(false);
    }
  };

  const handleConfirmTotp = async () => {
    setMessage("");
    setTotpBusy(true);
    try {
      await confirmWithdrawalTotpSetup(token, confirmCode);
      setConfirmCode("");
      setSetupSecret("");
      setSetupUrl("");
      await refreshTotp();
      setMessage("Withdrawal TPN enabled. You can submit a withdrawal below.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Confirm failed");
    } finally {
      setTotpBusy(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setMessage("");

    if (!totpEnabled) {
      setMessage("Complete withdrawal TPN setup above first.");
      return;
    }

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
    const tpn = tpnField.replace(/\s/g, "");
    if (!/^\d{6}$/.test(tpn)) {
      setMessage("Enter the 6-digit withdrawal TPN from your authenticator app.");
      return;
    }

    setBusy(true);
    try {
      const res = await submitWithdrawalRequest(token, num, trimmed, tpn);
      const debited = res.inrDebited ?? inrNeeded;
      setMessage(
        `Withdrawal submitted for ${num} USDT. ${formatInr(debited)} reserved from your wallet (1 USDT = ₹${res.inrPerUsdt ?? INR_PER_USDT}).`
      );
      setAmount("");
      setAddress("");
      setTpnField("");
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

        <div className="withdrawal-tpn-panel">
          <h2 className="withdrawal-tpn-title">Withdrawal TPN (authenticator)</h2>
          <p className="muted withdrawal-tpn-hint">
            Every withdrawal needs a fresh 6-digit code from an app such as <strong>Google Authenticator</strong>. Set this up once
            below.
          </p>
          {totpEnabled ? (
            <p className="funds-badge withdrawal-tpn-active">TPN active — enter a new code for each withdrawal.</p>
          ) : (
            <>
              <button type="button" className="secondary-button" disabled={totpBusy} onClick={() => void handleBeginTotp()}>
                {totpBusy ? "…" : setupSecret || setupUrl ? "Regenerate setup link" : "Generate authenticator link"}
              </button>
              {totpPending && !setupSecret && !setupUrl ? (
                <p className="muted withdrawal-tpn-resume">
                  Setup was started before — tap <strong>Generate</strong> above to show the secret and link again.
                </p>
              ) : null}
              {(setupSecret || setupUrl) && !totpEnabled ? (
                <div className="withdrawal-tpn-setup">
                  <p className="muted">
                    Add an account in your authenticator app using the <strong>secret</strong> or <strong>setup link</strong>, then
                    enter the 6-digit code to confirm.
                  </p>
                  {setupUrl ? (
                    <label className="withdrawal-tpn-url-label">
                      Setup link (copy into app if it supports URL import)
                      <input readOnly className="withdrawal-tpn-url-input" value={setupUrl} />
                    </label>
                  ) : null}
                  {setupSecret ? (
                    <label>
                      Secret key (manual entry)
                      <input readOnly value={setupSecret} className="withdrawal-tpn-secret-input" />
                    </label>
                  ) : null}
                  <label>
                    6-digit code from app
                    <input
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={8}
                      placeholder="123456"
                      value={confirmCode}
                      onChange={(e) => setConfirmCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      disabled={totpBusy}
                    />
                  </label>
                  <button type="button" disabled={totpBusy || confirmCode.length < 6} onClick={() => void handleConfirmTotp()}>
                    Confirm &amp; enable TPN
                  </button>
                </div>
              ) : null}
            </>
          )}
        </div>

        <form className="funds-form" onSubmit={(e) => void handleSubmit(e)}>
          <fieldset disabled={!totpEnabled || busy} className="withdrawal-form-fieldset">
            <legend className="sr-only">Withdrawal request</legend>
            <label>
              Amount to receive (USDT)
              <input
                type="number"
                min={MIN_WITHDRAW_USDT}
                step="0.01"
                placeholder="20.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={busy || !totpEnabled}
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
                disabled={busy || !totpEnabled}
              />
            </label>

            <label>
              Withdrawal TPN (6-digit code)
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="From authenticator"
                value={tpnField}
                onChange={(e) => setTpnField(e.target.value.replace(/\D/g, "").slice(0, 6))}
                disabled={busy || !totpEnabled}
              />
            </label>

            <button type="submit" disabled={busy || !totpEnabled}>
              {busy ? "Submitting…" : "Submit withdrawal"}
            </button>
          </fieldset>
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
            <li>Each withdrawal uses a new TPN code from your authenticator (time-based).</li>
          </ul>
        </div>

        <p className="funds-note">Demo ledger — integrate custody for real on-chain payouts.</p>
      </div>
    </div>
  );
}
