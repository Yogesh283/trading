/** Maps zoom step (− / +) to px per bar (`dataZoomRange` in LightweightTradingChart). Larger index = wider bars = fewer on screen. */
export const CHART_ZOOM_BAR_SPACING = [6, 10, 14, 19, 25, 33, 42, 52, 64, 78] as const;

export const CHART_ZOOM_STEP_COUNT = CHART_ZOOM_BAR_SPACING.length;

/** Optional view offset on zoom step (0 = user −/+ matches `dataZoomRange` 1:1). */
export const CHART_ZOOM_VIEW_OFFSET = 0;

export function effectiveZoomIndexForView(zoomIndex: number, _timeframeSec?: number): number {
  return Math.max(0, Math.min(CHART_ZOOM_STEP_COUNT - 1, zoomIndex + CHART_ZOOM_VIEW_OFFSET));
}

/**
 * Default zoom step (higher = wider candles / fewer bars on screen).
 * Short TFs (5s/10s/30s) start a bit zoomed in so ticks don’t look like a flat hairline.
 */
export function defaultZoomIndexForTimeframe(timeframeSec: number, isMobileChart: boolean): number {
  if (timeframeSec === 5) {
    return 2;
  }
  if (timeframeSec === 10) {
    return 3;
  }
  if (timeframeSec === 30) {
    return 3;
  }
  if (timeframeSec === 60) {
    return 1;
  }
  if (timeframeSec === 180 || timeframeSec === 300) {
    return isMobileChart ? 3 : 2;
  }
  return 0;
}
