/** NOWPayments — crypto deposit gateway (https://nowpayments.io). */
export const NOWPAYMENTS_API_BASE = "https://api.nowpayments.io/v1";
export const NOWPAYMENTS_SANDBOX_API_BASE = "https://api-sandbox.nowpayments.io/v1";

export function nowPaymentsApiBase(sandbox: boolean): string {
  return sandbox ? NOWPAYMENTS_SANDBOX_API_BASE : NOWPAYMENTS_API_BASE;
}

export function isNowPaymentsConfigured(apiKey: string | undefined): boolean {
  return Boolean(apiKey?.trim());
}

/** Credit live wallet when IPN reports these statuses. */
export const NOWPAYMENTS_PAID_STATUSES = new Set(["finished", "confirmed"]);

/** Payment seen on-chain / processing — hide QR in UI (wallet credit may still be pending). */
export const NOWPAYMENTS_PAYMENT_DETECTED_STATUSES = new Set([
  "confirming",
  "confirmed",
  "sending",
  "finished",
  "partially_paid"
]);
