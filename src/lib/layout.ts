/** Shared width for the left sidebar and the header brand column. */
export const SIDEBAR_WIDTH = 240;

export const RIGHT_PANEL_DEFAULT_WIDTH = 380;
export const RIGHT_PANEL_MIN_WIDTH = 280;
export const RIGHT_PANEL_MAX_WIDTH = 720;
export const RIGHT_PANEL_WIDTH_KEY = "kh.rightPanel.width";

/** Client-only — call from useEffect after mount to avoid hydration mismatch. */
export function readRightPanelWidth(): number {
  if (typeof window === "undefined") return RIGHT_PANEL_DEFAULT_WIDTH;
  try {
    const saved = window.localStorage.getItem(RIGHT_PANEL_WIDTH_KEY);
    if (!saved) return RIGHT_PANEL_DEFAULT_WIDTH;
    const n = parseInt(saved, 10);
    if (isNaN(n)) return RIGHT_PANEL_DEFAULT_WIDTH;
    return Math.max(RIGHT_PANEL_MIN_WIDTH, Math.min(RIGHT_PANEL_MAX_WIDTH, n));
  } catch {
    return RIGHT_PANEL_DEFAULT_WIDTH;
  }
}
