/** Maps zoom step (− / +) to visible bar count via `dataZoom` (Apache ECharts). Larger index = more zoom in. */
export const CHART_ZOOM_BAR_SPACING = [6, 10, 14, 19, 25, 33, 42, 52, 64, 78] as const;

export const CHART_ZOOM_STEP_COUNT = CHART_ZOOM_BAR_SPACING.length;
