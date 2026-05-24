import QRCode from "qrcode";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  createNowPaymentsDeposit,
  loadMyDeposits,
  loadNowPaymentsDepositConfig,
  syncNowPaymentsDeposit,
  type DepositRecord,
  type NowPaymentsDepositConfig
} from "./api";
import "./funds.css";
import { BrandLogo } from "./BrandLogo";
import { useGlobalAlert } from "./GlobalAlertContext";
import { formatInr, INR_PER_USDT, previewInrFromUsdt } from "./fundsConfig";

type Props = {
  token: string;
  onSuccess?: () => void;
};

type ActivePayment = {
  depositId: string;
  paymentId: string;
  payAddress: string;
  payAmount: number;
  payCurrency: string;
  network: string;
  qrDataUrl: string;
  walletCreditInr: number;
};

const PAYMENT_POLL_MS = 4000;
/** Hide QR ~1 min after on-chain payment is detected. */
const QR_HIDE_AFTER_PAYMENT_MS = 60_000;

function depositStatusLabel(status: string): string {
  if (status === "pending_review") return "Pending admin";
  if (status === "pending_wallet") return "Awaiting payment";
  if (status === "tx_sent") return "Crediting…";
  if (status === "credited") return "Credited";
  return status.replace(/_/g, " ");
}

function depositRefLabel(depositId: string): string {
  const id = depositId.replace(/^dep-/, "");
  return id.length > 10 ? `${id.slice(0, 8)}…` : id;
}

function payKindLabel(currency: string): string {
  const c = currency.toLowerCase();
  if (c.includes("usdt")) return "USDT";
  return currency.toUpperCase();
}

export default function DepositPage({ token, onSuccess }: Props) {
  const { showAlert } = useGlobalAlert();
  const [amount, setAmount] = useState("1");
  const [deposits, setDeposits] = useState<DepositRecord[]>([]);
  const [busy, setBusy] = useState(false);
  const [gateway, setGateway] = useState<NowPaymentsDepositConfig | null>(null);
  const [activePayment, setActivePayment] = useState<ActivePayment | null>(null);
  const [trackingDepositId, setTrackingDepositId] = useState<string | null>(null);
  const [paymentDetected, setPaymentDetected] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const paymentDetectedAtRef = useRef<number | null>(null);
  const qrHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshDeposits = useCallback(async () => {
    try {
      const { deposits: rows } = await loadMyDeposits(token);
      setDeposits(rows);
      return rows;
    } catch {
      setDeposits([]);
      return [];
    }
  }, [token]);

  const clearPaymentPoll = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const clearQrHideTimer = useCallback(() => {
    if (qrHideTimerRef.current) {
      clearTimeout(qrHideTimerRef.current);
      qrHideTimerRef.current = null;
    }
  }, []);

  const hideQrPanel = useCallback(() => {
    setActivePayment(null);
    clearQrHideTimer();
  }, [clearQrHideTimer]);

  const finishPaymentSuccess = useCallback(
    (message = "Payment confirmed — live wallet credited.") => {
      clearPaymentPoll();
      clearQrHideTimer();
      setActivePayment(null);
      setTrackingDepositId(null);
      setPaymentDetected(false);
      paymentDetectedAtRef.current = null;
      showAlert(message, "info");
      void refreshDeposits();
      onSuccess?.();
    },
    [clearPaymentPoll, clearQrHideTimer, onSuccess, refreshDeposits, showAlert]
  );

  const scheduleQrHideAfterPayment = useCallback(() => {
    if (qrHideTimerRef.current || !paymentDetectedAtRef.current) return;
    const elapsed = Date.now() - paymentDetectedAtRef.current;
    const delay = Math.max(0, QR_HIDE_AFTER_PAYMENT_MS - elapsed);
    qrHideTimerRef.current = setTimeout(() => {
      qrHideTimerRef.current = null;
      hideQrPanel();
      showAlert("Payment received. Wallet updates after confirmation.", "info");
    }, delay);
  }, [hideQrPanel, showAlert]);

  useEffect(() => {
    void refreshDeposits();
  }, [refreshDeposits]);

  useEffect(() => {
    void loadNowPaymentsDepositConfig().then((cfg) => {
      setGateway(cfg);
      if (cfg?.minUsdt != null && Number.isFinite(cfg.minUsdt)) {
        setAmount((prev) => {
          const n = Number(prev);
          return !Number.isFinite(n) || n < cfg.minUsdt ? String(cfg.minUsdt) : prev;
        });
      }
    });
  }, []);

  useEffect(() => {
    if (!trackingDepositId) {
      clearPaymentPoll();
      return;
    }

    const checkStatus = async () => {
      try {
        const sync = await syncNowPaymentsDeposit(token, trackingDepositId);
        void refreshDeposits();

        if (sync.credited) {
          finishPaymentSuccess();
          return;
        }

        if (sync.paymentDetected || sync.hideQr) {
          if (!paymentDetectedAtRef.current) {
            paymentDetectedAtRef.current = Date.now();
            setPaymentDetected(true);
          }
          scheduleQrHideAfterPayment();
        }
      } catch {
        const rows = await refreshDeposits();
        const row = rows.find((d) => d.id === trackingDepositId);
        if (row?.status === "credited") {
          finishPaymentSuccess();
        }
      }
    };

    void checkStatus();
    pollRef.current = setInterval(() => void checkStatus(), PAYMENT_POLL_MS);
    return clearPaymentPoll;
  }, [
    trackingDepositId,
    token,
    clearPaymentPoll,
    finishPaymentSuccess,
    refreshDeposits,
    scheduleQrHideAfterPayment
  ]);

  useEffect(() => () => {
    clearPaymentPoll();
    clearQrHideTimer();
  }, [clearPaymentPoll, clearQrHideTimer]);

  const startDeposit = async () => {
    const num = Number(amount);
    const min = gateway?.minUsdt ?? 1;
    const max = gateway?.maxUsdt ?? 1_000_000;
    if (!Number.isFinite(num) || num < min) {
      showAlert(`Minimum ${min} USDT.`, "error");
      return;
    }
    if (num > max) {
      showAlert(`Maximum ${max} USDT.`, "error");
      return;
    }
    if (gateway && !gateway.enabled) {
      showAlert("Deposit gateway is not available. Please try again later.", "error");
      return;
    }

    setBusy(true);
    paymentDetectedAtRef.current = null;
    setPaymentDetected(false);
    clearQrHideTimer();
    try {
      const out = await createNowPaymentsDeposit(token, num);
      const qrDataUrl = await QRCode.toDataURL(out.payAddress, {
        width: 240,
        margin: 2,
        color: { dark: "#0a0e17", light: "#ffffff" }
      });
      const payment = {
        depositId: out.deposit.id,
        paymentId: out.paymentId,
        payAddress: out.payAddress,
        payAmount: out.payAmount,
        payCurrency: out.payCurrency,
        network: out.network,
        qrDataUrl,
        walletCreditInr: out.walletCreditInr ?? previewInrFromUsdt(num, out.inrPerUsdt ?? INR_PER_USDT)
      };
      setActivePayment(payment);
      setTrackingDepositId(out.deposit.id);
      void refreshDeposits();
    } catch (e) {
      showAlert(e instanceof Error ? e.message.slice(0, 220) : "Could not start payment", "error");
    } finally {
      setBusy(false);
    }
  };

  const copyAddress = async () => {
    if (!activePayment) return;
    try {
      await navigator.clipboard.writeText(activePayment.payAddress);
      showAlert("Address copied.", "info");
    } catch {
      showAlert("Could not copy — select and copy manually.", "error");
    }
  };

  const cancelPayment = () => {
    clearPaymentPoll();
    clearQrHideTimer();
    setActivePayment(null);
    setTrackingDepositId(null);
    setPaymentDetected(false);
    paymentDetectedAtRef.current = null;
  };

  const amountUsdt = Number(amount);
  const amountValid = Number.isFinite(amountUsdt) && amountUsdt >= (gateway?.minUsdt ?? 1);
  const inrPerUsdt = gateway?.inrPerUsdt ?? INR_PER_USDT;
  const gatewayReady = gateway?.enabled !== false;
  const showForm = !activePayment;

  return (
    <div className="funds-page funds-gateway">
      <div className="funds-card">
        <div className="funds-title-row">
          <BrandLogo size={44} />
          <h1>Deposit</h1>
        </div>
        <p className="funds-network">
          <span className="funds-badge">USDT BEP20</span> Pay on BNB Smart Chain · live wallet credits in{" "}
          <strong>INR</strong> (1 USDT = ₹{inrPerUsdt})
          {gateway?.sandbox ? (
            <>
              {" "}
              · <strong>sandbox</strong>
            </>
          ) : null}
        </p>

        {!gatewayReady && gateway !== null ? (
          <p className="funds-warn">Deposits are temporarily unavailable. Contact support if this continues.</p>
        ) : null}

        {showForm ? (
          <>
            <label className="funds-amount-label">
              Amount (USDT)
              <input
                type="number"
                min={gateway?.minUsdt ?? 1}
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={busy}
              />
            </label>
            <p className="deposit-inr-preview muted">
              Trading wallet credit: ≈{" "}
              <strong>{amountValid ? formatInr(previewInrFromUsdt(amountUsdt, inrPerUsdt)) : "—"}</strong> (after
              payment confirms; min {gateway?.minUsdt ?? 1} USDT)
            </p>

            <div className="deposit-direct-wrap">
              <button
                type="button"
                className="deposit-confirm-primary"
                disabled={busy || !amountValid || !gatewayReady}
                onClick={() => void startDeposit()}
              >
                {busy ? "Generating QR…" : "Confirm & show QR"}
              </button>
            </div>
          </>
        ) : activePayment ? (
          <section className="deposit-qr-section" aria-live="polite">
            <p className="deposit-qr-amount-hint">
              Send exactly{" "}
              <strong>
                {activePayment.payAmount} {payKindLabel(activePayment.payCurrency)}
              </strong>{" "}
              on <strong>{activePayment.network || "BSC"}</strong> to the address below.
            </p>
            <p className="deposit-inr-preview muted">
              Deposit ID: <strong>{depositRefLabel(activePayment.depositId)}</strong>
              {" · "}
              Wallet credit: <strong>{formatInr(activePayment.walletCreditInr)}</strong>
            </p>

            <div className="deposit-qr-panel">
              <div className="deposit-qr-visual">
                <img
                  src={activePayment.qrDataUrl}
                  alt="USDT deposit QR code"
                  className="deposit-qr-img"
                  width={240}
                  height={240}
                />
              </div>

              <div className="deposit-address-card">
                <p className="deposit-address-title">Deposit address</p>
                <p className="deposit-address-line">{activePayment.payAddress}</p>
                <div className="deposit-address-actions">
                  <button type="button" className="deposit-copy-btn" onClick={() => void copyAddress()}>
                    Copy address
                  </button>
                </div>
              </div>

              <p className="muted">
                {paymentDetected
                  ? "Payment detected — QR will close in about 1 minute. Wallet updates after confirmation."
                  : "Waiting for payment… QR closes ~1 min after payment is detected."}
              </p>

              <div className="deposit-qr-actions">
                <button type="button" className="deposit-qr-cancel" onClick={cancelPayment}>
                  Cancel
                </button>
              </div>
            </div>
          </section>
        ) : paymentDetected && trackingDepositId ? (
          <p className="funds-warn">
            Payment received for deposit <strong>{depositRefLabel(trackingDepositId)}</strong>.
            Confirming on-chain — live wallet will update shortly.
          </p>
        ) : null}

        {!activePayment ? (
          <div className="funds-warn">
            <strong>How it works</strong>
            <ul>
              <li>Enter amount and tap <strong>Confirm & show QR</strong>.</li>
              <li>Scan the QR or copy the address — send the exact USDT amount shown.</li>
              <li>After payment, QR closes in ~1 minute and your <strong>live wallet</strong> is credited automatically.</li>
            </ul>
          </div>
        ) : null}
      </div>

      <div className="funds-card funds-history">
        <h2>Your deposit records</h2>
        {deposits.length === 0 ? (
          <p className="muted">No deposits yet.</p>
        ) : (
          <div className="deposit-table-wrap">
            <table className="deposit-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>ID</th>
                </tr>
              </thead>
              <tbody>
                {deposits.map((d) => (
                  <tr key={d.id}>
                    <td>{new Date(d.created_at).toLocaleString()}</td>
                    <td>{d.amount} USDT</td>
                    <td>
                      <span className={`dep-status dep-${d.status}`} title={d.status}>
                        {depositStatusLabel(d.status)}
                      </span>
                    </td>
                    <td className="dep-tx" title={d.id}>
                      {depositRefLabel(d.id)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
