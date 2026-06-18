import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  changeWithdrawalTpinApi,
  loadMyWithdrawals,
  loadWithdrawalTpinStatus,
  loadWithdrawalTotpStatus,
  loadWithdrawalsStatus,
  setWithdrawalTpinApi,
  submitWithdrawalRequest
} from "./api";
import "./funds.css";
import { BrandLogo } from "./BrandLogo";
import GlobalRefreshButton from "./GlobalRefreshButton";
import { useGlobalAlert } from "./GlobalAlertContext";
import { formatCoins, formatInr, INR_PER_USDT, MIN_WITHDRAWAL_USDT, previewBonusCoinsFromUsdt, previewInrFromUsdt, BONUS_MIN_WITHDRAW_COINS, BONUS_MIN_WITHDRAW_USDT, BONUS_COINS_PER_USDT, BONUS_COINS_USDT_HINT } from "./fundsConfig";

const MIN_LIVE_WITHDRAW_USDT = MIN_WITHDRAWAL_USDT;
const MIN_LIVE_BALANCE_INR = MIN_LIVE_WITHDRAW_USDT * INR_PER_USDT;

/** BEP20 / EVM address: 0x + 40 hex chars */
const BEP20_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

type Props = {
  token: string;
  /** Which wallet to pre-select (from header / assets screen). */
  initialWallet: "live" | "bonus";
  liveBal: number;
  bonusBal: number;
  onSuccess: () => void;
};

export default function WithdrawalPage({ token, initialWallet, liveBal, bonusBal, onSuccess }: Props) {
  const [walletSource, setWalletSource] = useState<"live" | "bonus">(initialWallet);
  useEffect(() => {
    setWalletSource(initialWallet);
  }, [initialWallet]);

  const fromBonus = walletSource === "bonus";
  const balance = fromBonus ? bonusBal : liveBal;
  const minWithdrawUsdt = fromBonus ? BONUS_MIN_WITHDRAW_USDT : MIN_LIVE_WITHDRAW_USDT;
  const { showAlert } = useGlobalAlert();
  const [amount, setAmount] = useState("");
  const [address, setAddress] = useState("");
  const [codeField, setCodeField] = useState("");
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
  const [withdrawalsBlocked, setWithdrawalsBlocked] = useState<{
    disabled: boolean;
    message: string | null;
  }>({ disabled: false, message: null });

  const refreshWithdrawalAvailability = useCallback(async () => {
    const s = await loadWithdrawalsStatus();
    setWithdrawalsBlocked({
      disabled: s.withdrawalsDisabled,
      message: s.withdrawalsDisabledMessage
    });
  }, []);

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
    void refreshWithdrawalAvailability();
  }, [token, refreshSecurity, refreshWithdrawalAvailability]);

  const handleRefresh = useCallback(async () => {
    setRefreshBusy(true);
    try {
      await Promise.allSettled([
        loadMyWithdrawals(token).then((r) => setWithdrawals(r.withdrawals)),
        refreshSecurity(),
        refreshWithdrawalAvailability()
      ]);
      onSuccess();
    } finally {
      setRefreshBusy(false);
    }
  }, [token, refreshSecurity, refreshWithdrawalAvailability, onSuccess]);

  const canWithdraw = pinSet || totpLegacy;
  const codeDigits = pinSet ? 4 : totpLegacy ? 6 : 0;

  const handleSetPin = async () => {
    setPinBusy(true);
    try {
      await setWithdrawalTpinApi(token, newPin, confirmNewPin);
      setNewPin("");
      setConfirmNewPin("");
      await refreshSecurity();
      showAlert("Withdrawal TPIN saved. Use it every time you withdraw.", "info");
    } catch (e) {
      showAlert(e instanceof Error ? e.message : "Could not save TPIN", "error");
    } finally {
      setPinBusy(false);
    }
  };

  const handleChangePin = async () => {
    setPinBusy(true);
    try {
      await changeWithdrawalTpinApi(token, currentPin, changePin, changeConfirm);
      setCurrentPin("");
      setChangePin("");
      setChangeConfirm("");
      setShowChange(false);
      await refreshSecurity();
      showAlert("Withdrawal TPIN updated.", "info");
    } catch (e) {
      showAlert(e instanceof Error ? e.message : "Could not change TPIN", "error");
    } finally {
      setPinBusy(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!canWithdraw) {
      showAlert(
        "Create your 4-digit withdrawal TPIN above first (or use legacy authenticator if already enabled).",
        "error"
      );
      return;
    }

    const num = Number(amount);
    if (!Number.isFinite(num) || num < minWithdrawUsdt) {
      showAlert(
        fromBonus
          ? `Minimum bonus withdrawal is ${BONUS_MIN_WITHDRAW_COINS} coins (${BONUS_MIN_WITHDRAW_USDT} USDT BEP20).`
          : `Minimum withdrawal is ${MIN_LIVE_WITHDRAW_USDT} USDT (need at least ${formatInr(MIN_LIVE_BALANCE_INR)} in live wallet).`,
        "error"
      );
      return;
    }
    const holdNeeded = fromBonus ? previewBonusCoinsFromUsdt(num) : previewInrFromUsdt(num);
    if (holdNeeded > balance + 1e-6) {
      showAlert(
        fromBonus
          ? `Not enough bonus balance. ${num} USDT needs ${formatCoins(holdNeeded)} (${BONUS_MIN_WITHDRAW_COINS} coins = ${BONUS_MIN_WITHDRAW_USDT} USDT); you have ${formatCoins(balance)}.`
          : `Not enough balance. ${num} USDT needs ${formatInr(holdNeeded)} (1 USDT = ${INR_PER_USDT}); you have ${formatInr(balance)}.`,
        "error"
      );
      return;
    }
    const trimmed = address.trim();
    if (!trimmed) {
      showAlert("Enter your BEP20 USDT receive address (wallet starting with 0x…).", "error");
      return;
    }
    if (trimmed.includes("@")) {
      showAlert(
        "That looks like an email. Paste your on-chain wallet address (0x…, 42 characters) — not an email or phone number.",
        "error"
      );
      return;
    }
    if (!BEP20_ADDRESS_RE.test(trimmed)) {
      showAlert(
        "Enter a valid BEP20 address: exactly 42 characters — 0x followed by 40 hexadecimal digits (a–f, 0–9).",
        "error"
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
      showAlert(
        pinSet
          ? "Enter your 4-digit withdrawal TPIN."
          : "Enter the 6-digit code from your authenticator app.",
        "error"
      );
      return;
    }

    setBusy(true);
    try {
      const res = await submitWithdrawalRequest(token, num, trimmed, code, walletSource);
      if (fromBonus) {
        const debited = res.coinsDebited ?? holdNeeded;
        showAlert(
          `Bonus withdrawal submitted for ${num} USDT. ${formatCoins(debited)} reserved from your bonus wallet (${BONUS_COINS_PER_USDT} coins = 1 USDT).`,
          "info"
        );
      } else {
        const debited = res.inrDebited ?? holdNeeded;
        showAlert(
          `Withdrawal submitted for ${num} USDT. ${formatInr(debited)} reserved from your live wallet (1 USDT = ${res.inrPerUsdt ?? INR_PER_USDT}).`,
          "info"
        );
      }
      if (res.withdrawal) {
        setWithdrawals((prev) => [res.withdrawal, ...prev.filter((w) => w.id !== res.withdrawal.id)]);
      }
      setAmount("");
      setAddress("");
      setCodeField("");
      onSuccess();
      void loadMyWithdrawals(token)
        .then((r) => setWithdrawals(r.withdrawals))
        .catch(() => undefined);
    } catch (err) {
      showAlert(err instanceof Error ? err.message : "Request failed", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="funds-page">
      <div className="funds-card">
        <div className="funds-title-row">
          <BrandLogo size={44} />
          <h1>{fromBonus ? "Withdraw bonus (USDT)" : "Withdraw USDT"}</h1>
          <GlobalRefreshButton
            className="global-refresh-fab--sm"
            title="Refresh balances and withdrawal list"
            disabled={refreshBusy}
            onClick={() => void handleRefresh()}
          />
        </div>
        <p className="funds-network">
          <span className="funds-badge">BEP20</span> You receive <strong>USDT</strong> on-chain.
          {fromBonus ? (
            <>
              {" "}
              Bonus wallet is debited in <strong>coins</strong>. Minimum:{" "}
              <strong>{formatCoins(BONUS_MIN_WITHDRAW_COINS)}</strong>.
            </>
          ) : (
            <>
              {" "}
              Live wallet is debited in <strong>INR</strong> ({INR_PER_USDT} per 1 USDT). Minimum withdrawal:{" "}
              <strong>{MIN_LIVE_WITHDRAW_USDT} USDT</strong>.
            </>
          )}
        </p>

        <div className="funds-wallets-block">
          <p className="funds-wallets-title">Withdraw from</p>
          <p className="funds-wallets-hint">Choose Live (INR) or Bonus (coins). Demo wallet cannot withdraw.</p>
          <div className="wallet-grid wallet-row-minimal" role="group" aria-label="Withdrawal wallet">
            <button
              type="button"
              className={`wallet-tile wallet-tile--compact${walletSource === "live" ? " wallet-tile--active" : ""}`}
              aria-pressed={walletSource === "live"}
              onClick={() => setWalletSource("live")}
            >
              <span className="wallet-tile-name">Live wallet</span>
              <span className="wallet-tile-desc">{formatInr(liveBal)} · min {MIN_LIVE_WITHDRAW_USDT} USDT</span>
            </button>
            <button
              type="button"
              className={`wallet-tile wallet-tile--compact${walletSource === "bonus" ? " wallet-tile--active" : ""}`}
              aria-pressed={walletSource === "bonus"}
              onClick={() => setWalletSource("bonus")}
            >
              <span className="wallet-tile-name">Bonus wallet</span>
              <span className="wallet-tile-desc">
                {formatCoins(bonusBal)} · min {BONUS_MIN_WITHDRAW_USDT} USDT
              </span>
            </button>
          </div>
        </div>

        {withdrawalsBlocked.disabled && withdrawalsBlocked.message ? (
          <div className="funds-warn withdrawal-maintenance-banner" role="status">
            <strong>Withdrawals temporarily unavailable</strong>
            <p className="withdrawal-maintenance-msg">{withdrawalsBlocked.message}</p>
          </div>
        ) : null}

        <div className="funds-balance">
          <span>{fromBonus ? "Available (bonus wallet)" : "Available (live wallet — not demo)"}</span>
          <strong>{fromBonus ? formatCoins(balance) : formatInr(balance)}</strong>
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
          <fieldset
            disabled={!canWithdraw || busy || withdrawalsBlocked.disabled}
            className="withdrawal-form-fieldset"
          >
            <legend className="sr-only">Withdrawal request</legend>
            <label>
              Amount to receive (USDT)
              <input
                type="number"
                min={minWithdrawUsdt}
                step="0.01"
                placeholder={fromBonus ? "10.00" : "10.00"}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={busy || !canWithdraw}
              />
            </label>
            <p className="muted withdrawal-inr-line">
              Deducted from balance: ≈{" "}
              <strong>
                {fromBonus
                  ? formatCoins(previewBonusCoinsFromUsdt(Number(amount) || 0))
                  : formatInr(previewInrFromUsdt(Number(amount) || 0))}
              </strong>
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

            <button type="submit" disabled={busy || !canWithdraw || withdrawalsBlocked.disabled}>
              {busy ? "Submitting…" : withdrawalsBlocked.disabled ? "Withdrawals paused" : "Submit withdrawal"}
            </button>
          </fieldset>
        </form>


        {withdrawals.length > 0 ? (
          <div className="funds-history">
            <h2>Your withdrawals</h2>
            <ul className="funds-history-list">
              {withdrawals.map((w) => (
                <li key={w.id}>
                  <span>
                    {w.amount} USDT
                    {w.source_wallet === "bonus" ? " · bonus" : w.source_wallet === "live" ? " · live" : ""}
                  </span>
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
              {fromBonus ? (
                <>
                  Minimum: <strong>{formatCoins(BONUS_MIN_WITHDRAW_COINS)}</strong> ({BONUS_MIN_WITHDRAW_USDT} USDT) from bonus
                  wallet. Funds are reserved when you submit.
                </>
              ) : (
                <>
                  Minimum: <strong>{MIN_LIVE_WITHDRAW_USDT} USDT</strong> (≈ {formatInr(MIN_LIVE_BALANCE_INR)} INR) from live
                  wallet. Funds are reserved when you submit.
                </>
              )}
            </li>
            {fromBonus ? (
              <li>
                Bonus conversion rate: <strong>{BONUS_COINS_USDT_HINT}</strong>.
              </li>
            ) : null}
            <li>Wrong BEP20 address can mean permanent loss — double-check.</li>
            <li>Do not share your TPIN. Support will never ask for it.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
