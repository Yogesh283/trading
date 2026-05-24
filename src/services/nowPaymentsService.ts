import crypto from "node:crypto";
import { nowPaymentsApiBase } from "../config/nowPayments";

export type NowPaymentsInvoice = {
  id: string;
  invoice_url: string;
};

export type NowPaymentsPayment = {
  payment_id: string;
  payment_status: string;
  pay_address: string;
  pay_amount: number;
  pay_currency: string;
  network?: string;
  expiration_estimate_date?: string;
};

function sortObject(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.keys(obj)
    .sort()
    .reduce(
      (result, key) => {
        const v = obj[key];
        result[key] =
          v != null && typeof v === "object" && !Array.isArray(v)
            ? sortObject(v as Record<string, unknown>)
            : v;
        return result;
      },
      {} as Record<string, unknown>
    );
}

export function verifyNowPaymentsIpnSignature(
  body: Record<string, unknown>,
  signatureHeader: string | undefined,
  ipnSecret: string
): boolean {
  const sig = signatureHeader?.trim();
  if (!sig || !ipnSecret.trim()) {
    return false;
  }
  const sorted = sortObject(body);
  const payload = JSON.stringify(sorted);
  const expected = crypto.createHmac("sha512", ipnSecret.trim()).update(payload).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, "utf8"), Buffer.from(sig, "utf8"));
  } catch {
    return expected === sig;
  }
}

export async function createNowPaymentsInvoice(input: {
  apiKey: string;
  sandbox: boolean;
  priceAmount: number;
  orderId: string;
  orderDescription: string;
  ipnCallbackUrl: string;
  successUrl: string;
  cancelUrl: string;
}): Promise<NowPaymentsInvoice> {
  const res = await fetch(`${nowPaymentsApiBase(input.sandbox)}/invoice`, {
    method: "POST",
    headers: {
      "x-api-key": input.apiKey.trim(),
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      price_amount: input.priceAmount,
      price_currency: "usd",
      pay_currency: "usdtbsc",
      order_id: input.orderId,
      order_description: input.orderDescription,
      ipn_callback_url: input.ipnCallbackUrl,
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      is_fixed_rate: true,
      is_fee_paid_by_user: false
    })
  });

  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const msg =
      typeof data.message === "string"
        ? data.message
        : typeof data.error === "string"
          ? data.error
          : `NOWPayments invoice failed (${res.status})`;
    throw new Error(msg);
  }

  const id = String(data.id ?? "").trim();
  const invoiceUrl = String(data.invoice_url ?? "").trim();
  if (!id || !invoiceUrl) {
    throw new Error("NOWPayments returned an invalid invoice response");
  }
  return { id, invoice_url: invoiceUrl };
}

/** Minimum USDT (BEP20) deposit for usdtbsc → usdtbsc (floating rate, matches status page ~0.06). */
export async function fetchNowPaymentsMinDepositUsdt(input: {
  apiKey: string;
  sandbox: boolean;
  /** Must match `createNowPaymentsPayment` (fixed rate has a much higher minimum). */
  isFixedRate?: boolean;
}): Promise<number> {
  const params = new URLSearchParams({
    currency_from: "usdtbsc",
    currency_to: "usdtbsc",
    is_fixed_rate: String(input.isFixedRate ?? false),
    is_fee_paid_by_user: "false"
  });
  const res = await fetch(`${nowPaymentsApiBase(input.sandbox)}/min-amount?${params}`, {
    headers: { "x-api-key": input.apiKey.trim() }
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const msg =
      typeof data.message === "string"
        ? data.message
        : `NOWPayments min-amount failed (${res.status})`;
    throw new Error(msg);
  }
  const min = Number(data.min_amount);
  if (!Number.isFinite(min) || min <= 0) {
    throw new Error("NOWPayments returned an invalid minimum amount");
  }
  return min;
}

/** Direct payment — returns deposit address + amount for in-app QR (no hosted redirect). */
export async function createNowPaymentsPayment(input: {
  apiKey: string;
  sandbox: boolean;
  /** USDT amount customer must send on BSC. */
  payAmountUsdt: number;
  orderId: string;
  orderDescription: string;
  ipnCallbackUrl: string;
}): Promise<NowPaymentsPayment> {
  const res = await fetch(`${nowPaymentsApiBase(input.sandbox)}/payment`, {
    method: "POST",
    headers: {
      "x-api-key": input.apiKey.trim(),
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      price_amount: input.payAmountUsdt,
      price_currency: "usd",
      pay_amount: input.payAmountUsdt,
      pay_currency: "usdtbsc",
      order_id: input.orderId,
      order_description: input.orderDescription,
      ipn_callback_url: input.ipnCallbackUrl,
      is_fixed_rate: false,
      is_fee_paid_by_user: false
    })
  });

  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const rawMsg =
      typeof data.message === "string"
        ? data.message
        : typeof data.error === "string"
          ? data.error
          : `NOWPayments payment failed (${res.status})`;
    const msg =
      /amountto is too small|too small/i.test(rawMsg)
        ? "Amount is below NOWPayments minimum for USDT (BSC). Increase the deposit amount."
        : rawMsg;
    throw new Error(msg);
  }

  const paymentId = String(data.payment_id ?? "").trim();
  const payAddress = String(data.pay_address ?? "").trim();
  const payAmount = Number(data.pay_amount);
  const payCurrency = String(data.pay_currency ?? "usdtbsc").trim();
  if (!paymentId || !payAddress || !Number.isFinite(payAmount) || payAmount <= 0) {
    throw new Error("NOWPayments returned an invalid payment response");
  }

  return {
    payment_id: paymentId,
    payment_status: String(data.payment_status ?? "waiting"),
    pay_address: payAddress,
    pay_amount: payAmount,
    pay_currency: payCurrency,
    network: typeof data.network === "string" ? data.network : undefined,
    expiration_estimate_date:
      typeof data.expiration_estimate_date === "string" ? data.expiration_estimate_date : undefined
  };
}

export async function getNowPaymentsPaymentStatus(input: {
  apiKey: string;
  sandbox: boolean;
  paymentId: string;
}): Promise<{ payment_id: string; payment_status: string }> {
  const id = input.paymentId.trim();
  const res = await fetch(`${nowPaymentsApiBase(input.sandbox)}/payment/${encodeURIComponent(id)}`, {
    headers: { "x-api-key": input.apiKey.trim() }
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const msg =
      typeof data.message === "string"
        ? data.message
        : `NOWPayments payment status failed (${res.status})`;
    throw new Error(msg);
  }
  const paymentId = String(data.payment_id ?? id).trim();
  const paymentStatus = String(data.payment_status ?? "waiting").toLowerCase();
  return { payment_id: paymentId, payment_status: paymentStatus };
}

export function parseNowPaymentsPaymentIdFromTxHash(txHash: string | null | undefined): string | null {
  if (!txHash) return null;
  const m = txHash.match(/^np-p-(.+)$/i);
  return m?.[1]?.trim() || null;
}
