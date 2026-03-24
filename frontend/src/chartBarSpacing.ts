/** Must match lightweight-charts `timeScale.barSpacing` steps (− / + on chart). Larger = wider candles. */
export const CHART_ZOOM_BAR_SPACING = [5, 8, 11, 15, 20, 26, 34, 44, 54, 68] as const;

export const CHART_ZOOM_STEP_COUNT = CHART_ZOOM_BAR_SPACING.length;
