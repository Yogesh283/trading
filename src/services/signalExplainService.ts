import OpenAI from "openai";
import { APIError } from "openai";
import { env } from "../config/env";
import { logger } from "../utils/logger";

export type SignalExplainDirection = "up" | "down" | "neutral";

function throwMappedOpenAIError(e: unknown): never {
  if (e instanceof APIError) {
    const raw = e.message ?? String(e);
    logger.warn({ status: e.status, msg: raw }, "OpenAI explain-signal error");
    const lower = raw.toLowerCase();
    if (
      e.status === 429 ||
      lower.includes("quota") ||
      lower.includes("billing") ||
      lower.includes("insufficient_quota")
    ) {
      throw new Error(
        "OpenAI account has no quota — add billing / credits at platform.openai.com/account/billing, then try again."
      );
    }
    throw new Error(raw || "OpenAI request failed");
  }
  throw e;
}

function normalizeDirection(v: unknown): SignalExplainDirection | null {
  if (v === "up" || v === "down" || v === "neutral") return v;
  if (typeof v === "string") {
    const s = v.toLowerCase().trim();
    if (s === "up" || s === "bull" || s === "bullish") return "up";
    if (s === "down" || s === "bear" || s === "bearish") return "down";
    if (s === "neutral" || s === "sideways" || s === "flat") return "neutral";
  }
  return null;
}

function coerceDirectionFromSignal(signal: unknown): SignalExplainDirection {
  if (signal && typeof signal === "object" && !Array.isArray(signal)) {
    const o = signal as Record<string, unknown>;
    const d = o.lastTickDirection;
    if (d === "up" || d === "down") return d;
  }
  return "neutral";
}

function parseExplainJson(
  text: string,
  fallbackSignal: unknown
): { explanation: string; direction: SignalExplainDirection } {
  try {
    let t = text.trim();
    if (t.startsWith("```")) {
      const m = t.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (m) t = m[1]!.trim();
    }
    const start = t.indexOf("{");
    const end = t.lastIndexOf("}");
    if (start < 0 || end <= start) {
      throw new Error("no json");
    }
    const obj = JSON.parse(t.slice(start, end + 1)) as {
      direction?: unknown;
      explanation?: unknown;
    };
    const direction =
      normalizeDirection(obj.direction) ?? coerceDirectionFromSignal(fallbackSignal);
    const explanation = String(obj.explanation ?? "").trim() || "—";
    return { explanation, direction };
  } catch {
    const direction = coerceDirectionFromSignal(fallbackSignal);
    const explanation = text.trim().slice(0, 400) || "—";
    return { explanation, direction };
  }
}

/**
 * Turns a small JSON "signal" payload into a short line of plain language + a bias arrow hint.
 * Does NOT predict prices — only narrates what the app already computed.
 */
export async function explainSignalWithOpenAI(params: {
  signal: unknown;
  /** e.g. "en", "hi", "ur" — hint for response language */
  locale?: string;
}): Promise<{ explanation: string; direction: SignalExplainDirection }> {
  const key = env.OPENAI_API_KEY?.trim();
  if (!key) {
    throw new Error("OPENAI_API_KEY is not configured");
  }
  const model = env.OPENAI_MODEL?.trim() || "gpt-4o-mini";
  const locale = String(params.locale ?? "en").trim().slice(0, 12) || "en";

  const system = `You are a concise trading-app helper. The user sends a JSON object that ALREADY contains app-computed context (e.g. last tick direction, symbol, timeframe) — not live predictions from you.

You must reply with valid json only (no markdown fences, no text before or after).

Schema for the json output:
{
  "direction": "up" | "down" | "neutral",
  "explanation": "string"
}

Rules:
- "direction": short-term bias implied by that snapshot — "up" if momentum/context leans higher, "down" if lower, "neutral" if mixed/unclear. Base this only on the fields in the payload (e.g. lastTickDirection, candle context if present).
- "explanation": exactly 1–2 short sentences in plain language for the trader (max ~220 characters). Educational only.
- Do NOT predict future prices or guarantee profit/loss. Do NOT instruct buy/sell.
- If locale is not English, you may write explanation in that language when natural (e.g. Hindi/Urdu for "hi" or "ur").
- No markdown in "explanation".`;

  /** Responses API requires the literal word "json" in `input` when using text.format json_object. */
  const userPayload = `Respond with json only per instructions. Chart snapshot payload:\n${JSON.stringify(
    { locale, signal: params.signal },
    null,
    0
  )}`;

  const openai = new OpenAI({ apiKey: key });

  try {
    if (env.OPENAI_API_MODE === "chat") {
      const completion = await openai.chat.completions.create({
        model,
        temperature: 0.35,
        max_tokens: 350,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: userPayload }
        ]
      });
      const text = completion.choices[0]?.message?.content?.trim();
      if (!text) {
        throw new Error("Empty explanation from model");
      }
      return parseExplainJson(text, params.signal);
    }

    const response = await openai.responses.create({
      model,
      instructions: system,
      input: userPayload,
      temperature: 0.35,
      max_output_tokens: 350,
      store: false,
      text: { format: { type: "json_object" } }
    });

    if (response.error) {
      throw new Error(response.error.message || "OpenAI response error");
    }
    const text = response.output_text?.trim();
    if (!text) {
      throw new Error("Empty explanation from model");
    }
    return parseExplainJson(text, params.signal);
  } catch (e) {
    throwMappedOpenAIError(e);
  }
}
