/** Maps zoom step (− / +) to px per bar (`dataZoomRange` in LightweightTradingChart). Larger index = wider bars = fewer on screen. */
export const CHART_ZOOM_BAR_SPACING = [6, 10, 14, 19, 25, 33, 42, 52, 64, 78] as const;

export const CHART_ZOOM_STEP_COUNT = CHART_ZOOM_BAR_SPACING.length;

/** Always applied on top of the user zoom step so candles look 2 steps more zoomed in. */
export const CHART_ZOOM_VIEW_OFFSET = 2;

export function effectiveZoomIndexForView(zoomIndex: number, timeframeSec?: number): number {
  const extra5s = timeframeSec === 5 ? 1 : 0;
  return Math.max(
    0,
    Math.min(CHART_ZOOM_STEP_COUNT - 1, zoomIndex + CHART_ZOOM_VIEW_OFFSET + extra5s)
  );
}

/**
 * Default zoom step (0 = widest). Higher = more zoomed in (`CHART_ZOOM_BAR_SPACING`).
 * 5s → 1, 10s → 3, 1m → 3; 3m / 5m stay tighter for readable bodies on mobile vs desktop.
 */
export function defaultZoomIndexForTimeframe(timeframeSec: number, isMobileChart: boolean): number {
  if (timeframeSec === 5) {
    return 1;
  }
  if (timeframeSec === 10) {
    return 3;
  }
  if (timeframeSec === 60) {
    return 3;
  }
  if (timeframeSec === 180 || timeframeSec === 300) {
    return isMobileChart ? 5 : 4;
  }
  return 0;
}
