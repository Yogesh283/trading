import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  changeWithdrawalTpinApi,
  loadMyWithdrawals,
  loadWithdrawalTpinStatus,
  loadWithdrawalTotpStatus,
  setWithdrawalTpinApi,
  submitWithdrawalRequest
} from "./api";
import "./funds.css";
import { BrandLogo } from "./BrandLogo";
import GlobalRefreshButton from "./GlobalRefreshButton";
import { formatInr, INR_PER_USDT, previewInrFromUsdt } from "./fundsConfig";

const MIN_WITHDRAW_USDT = 10;
const MIN_BALANCE_INR = MIN_WITHDRAW_USDT * INR_PER_USDT;

/** BEP20 / EVM address: 0x + 40 hex chars */
const BEP20_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

type Props = {
  token: string;
  balance: number;
  onSuccess: () => void;
};

export default function WithdrawalPage({ token, balance, onSuccess }: Props) {
  const [amount, setAmount] = useState("");
  const [address, setAddress] = useState("");
  const [codeField, setCodeField] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [pinBusy, setPinBusy] = useState(false);
  const [pinSet, setPinSet] = useState(false);
  const [totpLegacy, setTotpLegacy] = useState(false);
  const [newPin, setNewPin] = useState("");
  const [confirmNewPin, setConfirmNewPin] = useState("");
  const [currentPin, setCurrentPin] = useState("");
  const [changePin, setChangePin] = useState("");
  const [changeConfirm, setChangeConfirm] = useState("");
  const [showChange, setShowChange] = useState(false);
  const [withdrawals, setWithdrawals] = useState<
    Awaited<ReturnType<typeof loadMyWithdrawals>>["withdrawals"]
  >([]);
  const [refreshBusy, setRefreshBusy] = useState(false);

  const refreshSecurity = useCallback(async () => {
    try {
      const [tpinSt, totpSt] = await Promise.all([
        loadWithdrawalTpinStatus(token),
        loadWithdrawalTotpStatus(token)
      ]);
      setPinSet(tpinSt.pinSet);
      setTotpLegacy(totpSt.enabled && !tpinSt.pinSet);
    } catch {
      setPinSet(false);
      setTotpLegacy(false);
    }
  }, [token]);

  useEffect(() => {
    void loadMyWithdrawals(token)
      .then((r) => setWithdrawals(r.withdrawals))
      .catch(() => undefined);
    void refreshSecurity();
  }, [token, refreshSecurity]);

  const handleRefresh = useCallback(async () => {
    setRefreshBusy(true);
    setMessage("");
    try {
      await Promise.allSettled([
        loadMyWithdrawals(token).then((r) => setWithdrawals(r.withdrawals)),
        refreshSecurity()
      ]);
      onSuccess();
    } finally {
      setRefreshBusy(false);
    }
  }, [token, refreshSecurity, onSuccess]);

  const canWithdraw = pinSet || totpLegacy;
  const codeDigits = pinSet ? 4 : totpLegacy ? 6 : 0;

  const handleSetPin = async () => {
    setMessage("");
    setPinBusy(true);
    try {
      await setWithdrawalTpinApi(token, newPin, confirmNewPin);
      setNewPin("");
      setConfirmNewPin("");
      await refreshSecurity();
      setMessage("Withdrawal TPIN saved. Use it every time you withdraw.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not save TPIN");
    } finally {
      setPinBusy(false);
    }
  };

  const handleChangePin = async () => {
    setMessage("");
    setPinBusy(true);
    try {
      await changeWithdrawalTpinApi(token, currentPin, changePin, changeConfirm);
      setCurrentPin("");
      setChangePin("");
      setChangeConfirm("");
      setShowChange(false);
      await refreshSecurity();
      setMessage("Withdrawal TPIN updated.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not change TPIN");
    } finally {
      setPinBusy(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setMessage("");

    if (!canWithdraw) {
      setMessage("Create your 4-digit withdrawal TPIN above first (or use legacy authenticator if already enabled).");
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
    if (!trimmed) {
      setMessage("Enter your BEP20 USDT receive address (wallet starting with 0x…).");
      return;
    }
    if (trimmed.includes("@")) {
      setMessage(
        "That looks like an email. Paste your on-chain wallet address (0x…, 42 characters) — not an email or phone number."
      );
      return;
    }
    if (!BEP20_ADDRESS_RE.test(trimmed)) {
      setMessage(
        "Enter a valid BEP20 address: exactly 42 characters — 0x followed by 40 hexadecimal digits (a–f, 0–9)."
      );
      return;
    }
    const code = codeField.replace(/\s/g, "");
    const ok =
      pinSet && /^\d{4}$/.test(code)
        ? true
        : totpLegacy && /^\d{6}$/.test(code)
          ? true
          : false;
    if (!ok) {
      setMessage(
        pinSet
          ? "Enter your 4-digit withdrawal TPIN."
          : "Enter the 6-digit code from your authenticator app."
      );
      return;
    }

    setBusy(true);
    try {
      const res = await submitWithdrawalRequest(token, num, trimmed, code);
      const debited = res.inrDebited ?? inrNeeded;
      setMessage(
        `Withdrawal submitted for ${num} USDT. ${formatInr(debited)} reserved from your wallet (1 USDT = ₹${res.inrPerUsdt ?? INR_PER_USDT}).`
      );
      setAmount("");
      setAddress("");
      setCodeField("");
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
      <div className="funds-card">
        <div className="funds-title-row">
          <BrandLogo size={44} />
          <h1>Withdraw USDT</h1>
          <GlobalRefreshButton
            className="global-refresh-fab--sm"
            title="Refresh balances and withdrawal list"
            disabled={refreshBusy}
            onClick={() => void handleRefresh()}
          />
        </div>
        <p className="funds-network">
          <span className="funds-badge">BEP20</span> You receive <strong>USDT</strong> on-chain; trading wallet is debited in{" "}
          <strong>INR</strong> (₹{INR_PER_USDT} per 1 USDT). Minimum withdrawal: <strong>{MIN_WITHDRAW_USDT} USDT</strong>{" "}
          (~${MIN_WITHDRAW_USDT}).
        </p>

        <div className="funds-balance">
          <span>Available (live wallet — not demo)</span>
          <strong>{formatInr(balance)}</strong>
        </div>

        <div className="withdrawal-tpn-panel">
          <h2 className="withdrawal-tpn-title">Withdrawal TPIN (4 digits)</h2>
          <p className="withdrawal-tpn-hint">
            Create a <strong className="withdrawal-tpn-em">4-digit PIN</strong> once. It is stored securely on the server (not
            plain text). Every withdrawal requires this TPIN.
          </p>

          {pinSet ? (
            <>
              <span className="withdrawal-tpn-active">TPIN active</span>
              {showChange ? (
                <button type="button" className="withdrawal-tpn-btn-cancel" onClick={() => setShowChange(false)}>
                  Cancel change
                </button>
              ) : (
                <button type="button" className="withdrawal-tpn-primary-btn" onClick={() => setShowChange(true)}>
                  Change TPIN
                </button>
              )}
              {showChange ? (
                <div className="withdrawal-tpn-setup">
                  <label>
                    Current TPIN
                    <input
                      type="password"
                      inputMode="numeric"
                      autoComplete="off"
                      maxLength={4}
                      placeholder="••••"
                      value={currentPin}
                      onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                      disabled={pinBusy}
                    />
                  </label>
                  <label>
                    New TPIN
                    <input
                      type="password"
                      inputMode="numeric"
                      autoComplete="new-password"
                      maxLength={4}
                      placeholder="••••"
                      value={changePin}
                      onChange={(e) => setChangePin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                      disabled={pinBusy}
                    />
                  </label>
                  <label>
                    Confirm new TPIN
                    <input
                      type="password"
                      inputMode="numeric"
                      autoComplete="new-password"
                      maxLength={4}
                      placeholder="••••"
                      value={changeConfirm}
                      onChange={(e) => setChangeConfirm(e.target.value.replace(/\D/g, "").slice(0, 4))}
                      disabled={pinBusy}
                    />
                  </label>
                  <button
                    type="button"
                    className="withdrawal-tpn-primary-btn"
                    disabled={
                      pinBusy ||
                      currentPin.length < 4 ||
                      changePin.length < 4 ||
                      changeConfirm.length < 4
                    }
                    onClick={() => void handleChangePin()}
                  >
                    Update TPIN
                  </button>
                </div>
              ) : null}
            </>
          ) : (
            <div className="withdrawal-tpn-setup">
              <label>
                New TPIN (4 digits)
                <input
                  type="password"
                  inputMode="numeric"
                  autoComplete="new-password"
                  maxLength={4}
                  placeholder="••••"
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  disabled={pinBusy}
                />
              </label>
              <label>
                Confirm TPIN
                <input
                  type="password"
                  inputMode="numeric"
                  autoComplete="new-password"
                  maxLength={4}
                  placeholder="••••"
                  value={confirmNewPin}
                  onChange={(e) => setConfirmNewPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  disabled={pinBusy}
                />
              </label>
              <button
                type="button"
                className="withdrawal-tpn-primary-btn"
                disabled={pinBusy || newPin.length < 4 || confirmNewPin.length < 4}
                onClick={() => void handleSetPin()}
              >
                Save TPIN
              </button>
              {totpLegacy ? (
                <p className="muted withdrawal-tpn-resume">
                  You still have <strong>Google Authenticator</strong> enabled for withdrawals until you save a TPIN above.
                  After you save a TPIN, only the 4-digit TPIN will be used.
                </p>
              ) : null}
            </div>
          )}
        </div>

        <form className="funds-form" onSubmit={(e) => void handleSubmit(e)}>
          <fieldset disabled={!canWithdraw || busy} className="withdrawal-form-fieldset">
            <legend className="sr-only">Withdrawal request</legend>
            <label>
              Amount to receive (USDT)
              <input
                type="number"
                min={MIN_WITHDRAW_USDT}
                step="0.01"
                placeholder="10.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={busy || !canWithdraw}
              />
            </label>
            <p className="muted withdrawal-inr-line">
              Deducted from balance: ≈ <strong>{formatInr(previewInrFromUsdt(Number(amount) || 0))}</strong>
            </p>

            <label>
              Your USDT address (BEP20)
              <input
                type="text"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                placeholder="0x followed by 40 hex characters"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                disabled={busy || !canWithdraw}
              />
            </label>

            <label>
              {pinSet ? "Withdrawal TPIN (4 digits)" : "Authenticator code (4 digits)"}
              <input
                type="password"
                inputMode="numeric"
                autoComplete="off"
                maxLength={codeDigits || 4}
                placeholder={pinSet ? "••••" : "From app"}
                value={codeField}
                onChange={(e) =>
                  setCodeField(e.target.value.replace(/\D/g, "").slice(0, codeDigits || 6))
                }
                disabled={busy || !canWithdraw}
              />
            </label>

            <button type="submit" disabled={busy || !canWithdraw}>
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
              Minimum: <strong>{MIN_WITHDRAW_USDT} USDT</strong> (~${MIN_WITHDRAW_USDT}) — ≈ {formatInr(MIN_BALANCE_INR)} INR
              from live wallet. Funds are reserved when you submit.
            </li>
            <li>Wrong BEP20 address can mean permanent loss — double-check.</li>
            <li>Do not share your TPIN. Support will never ask for it.</li>
          </ul>
        </div>

        <p className="funds-note">Demo ledger — integrate custody for real on-chain payouts.</p>
      </div>
    </div>
  );
}
