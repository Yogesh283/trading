import type { MarketTick } from "./api";

/** Compare last tick vs previous tick in the series (live feed order). */
export function lastTickMove(pts: MarketTick[] | undefined | null): "up" | "down" | null {
  if (!pts || pts.length < 2) {
    return null;
  }
  const cur = pts[pts.length - 1]!.price;
  const prev = pts[pts.length - 2]!.price;
  if (cur > prev) {
    return "up";
  }
  if (cur < prev) {
    return "down";
  }
  return null;
}
