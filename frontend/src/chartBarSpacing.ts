/** Must match lightweight-charts `timeScale.barSpacing` steps (− / + on chart). Larger = wider candles — smoother VIP zoom range. */
export const CHART_ZOOM_BAR_SPACING = [6, 10, 14, 19, 25, 33, 42, 52, 64, 78] as const;

export const CHART_ZOOM_STEP_COUNT = CHART_ZOOM_BAR_SPACING.length;
