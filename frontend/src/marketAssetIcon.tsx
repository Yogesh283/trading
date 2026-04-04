/**
 * Olymp-style market icons: overlapping flag discs (forex / XAU), rounded badge (crypto).
 * Fiat flags use flagcdn PNGs inside circles; emoji stays as fallback if the image fails to load.
 */

import { useState } from "react";

/** ISO 3166-1 alpha-2 for regional-indicator flag emojis (EUR → EU flag). */
const FX_CC_TO_REGION: Record<string, string> = {
  USD: "US",
  EUR: "EU",
  GBP: "GB",
  JPY: "JP",
  CHF: "CH",
  AUD: "AU",
  CAD: "CA",
  NZD: "NZ",
  SEK: "SE",
  NOK: "NO",
  TRY: "TR",
  MXN: "MX",
  ZAR: "ZA",
  SGD: "SG"
};

/** Lowercase alpha-2 for https://flagcdn.com/w80/xx.png */
function currencyToFlagCode(ccy: string): string | null {
  if (ccy === "XAU") {
    return null;
  }
  const r = (FX_CC_TO_REGION[ccy] ?? ccy.slice(0, 2)).toUpperCase();
  if (r.length !== 2) {
    return null;
  }
  return r.toLowerCase();
}

function flagEmojiFromRegion(region: string): string {
  const up = region.toUpperCase();
  if (up === "EU") {
    return String.fromCodePoint(0x1f1ea, 0x1f1fa);
  }
  if (up.length !== 2) {
    return "🏳️";
  }
  const base = 0x1f1e6;
  return String.fromCodePoint(up.codePointAt(0)! - 65 + base, up.codePointAt(1)! - 65 + base);
}

/** Plain instrument id (no slashes) — e.g. `EURUSD`, `XAUUSD`. */
export function formatMarketSymbolPath(sym: string): string {
  const s = sym.toUpperCase().trim();
  if (!s) return "—";
  return s;
}

export function formatForexPair(sym: string): string {
  return formatMarketSymbolPath(sym);
}

/** Primary list label: `EURUSD OTC` style. */
export function formatMarketPairOtc(sym: string): string {
  return `${formatMarketSymbolPath(sym)} OTC`;
}

/** Plain-text flags for `<option>` / labels where JSX flags are not usable. */
export function assetPairEmojiPrefix(sym: string): string {
  if (!/^[A-Z]{6}$/.test(sym)) {
    return "";
  }
  const base = sym.slice(0, 3);
  const quote = sym.slice(3, 6);
  const b = base === "XAU" ? "🥇" : flagEmojiFromRegion(FX_CC_TO_REGION[base] ?? base.slice(0, 2));
  const q = flagEmojiFromRegion(FX_CC_TO_REGION[quote] ?? quote.slice(0, 2));
  return `${b}${q} `;
}

/** 3-letter base in a 6-char pair — rounded flag discs for forex / metals. */
function FlagDisc({
  flagCode,
  emoji,
  slot
}: {
  flagCode: string | null;
  emoji: string;
  slot: "back" | "front";
}) {
  const [showImg, setShowImg] = useState(Boolean(flagCode));
  const pos = slot === "back" ? "market-asset-icon__disc--back" : "market-asset-icon__disc--front";
  const isGold = flagCode == null && emoji === "🥇";

  return (
    <span
      className={`market-asset-icon__disc ${pos}${isGold ? " market-asset-icon__disc--gold" : ""}`}
      aria-hidden
    >
      {flagCode && showImg ? (
        <img
          className="market-asset-icon__flag-img"
          src={`https://flagcdn.com/w80/${flagCode}.png`}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setShowImg(false)}
        />
      ) : null}
      <span
        className={
          flagCode && showImg && !isGold
            ? "market-asset-icon__emoji market-asset-icon__emoji--hidden"
            : "market-asset-icon__emoji"
        }
      >
        {emoji}
      </span>
    </span>
  );
}

export function AssetPairFlags({ symbol, className }: { symbol: string; className?: string }) {
  const extra = className ? ` ${className}` : "";

  if (!/^[A-Z]{6}$/.test(symbol)) {
    return (
      <span
        className={`market-asset-icon market-asset-icon--other${extra}`}
        aria-hidden
        title={symbol || "?"}
      >
        <span className="market-asset-icon__fallback">{(symbol || "?").slice(0, 2)}</span>
      </span>
    );
  }

  const base = symbol.slice(0, 3);
  const quote = symbol.slice(3, 6);
  const title = formatForexPair(symbol);

  const baseEmoji =
    base === "XAU" ? "🥇" : flagEmojiFromRegion(FX_CC_TO_REGION[base] ?? base.slice(0, 2));
  const quoteEmoji = flagEmojiFromRegion(FX_CC_TO_REGION[quote] ?? quote.slice(0, 2));
  const baseCode = currencyToFlagCode(base);
  const quoteCode = currencyToFlagCode(quote);

  return (
    <span className={`market-asset-icon market-asset-icon--forex${extra}`} aria-hidden title={title}>
      <FlagDisc flagCode={baseCode} emoji={baseEmoji} slot="back" />
      <FlagDisc flagCode={quoteCode} emoji={quoteEmoji} slot="front" />
    </span>
  );
}
