import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";
import "./site-frame.css";
import "./mobile.css";
import "./mobile-trade.css";

/** Capacitor APK: avoid double top inset (WebView + #root safe-area) — see site-frame.css `.cap-native` */
function stripViewportFitCoverAndroid() {
  try {
    const c = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string } })
      .Capacitor;
    if (!c?.isNativePlatform?.() || c.getPlatform?.() !== "android") return;
    const m = document.querySelector('meta[name="viewport"]');
    if (!m) return;
    const content = m.getAttribute("content") || "";
    if (!/viewport-fit\s*=\s*cover/i.test(content)) return;
    m.setAttribute(
      "content",
      content
        .replace(/\s*,\s*viewport-fit\s*=\s*cover/gi, "")
        .replace(/viewport-fit\s*=\s*cover\s*,?/gi, "")
        .replace(/,\s*,/g, ",")
        .replace(/^,\s*|\s*,$/g, "")
        .trim()
    );
  } catch {
    /* ignore */
  }
}

function markCapacitorNative() {
  try {
    const c = (window as unknown as {
      Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string };
    }).Capacitor;
    if (!c?.isNativePlatform?.()) {
      return;
    }
    stripViewportFitCoverAndroid();
    document.documentElement.classList.add("cap-native");
    const platform = c.getPlatform?.();
    document.documentElement.classList.remove("cap-android", "cap-ios");
    if (platform === "android" || (platform !== "ios" && /Android/i.test(navigator.userAgent))) {
      document.documentElement.classList.add("cap-android");
    } else if (platform === "ios") {
      document.documentElement.classList.add("cap-ios");
    }
  } catch {
    /* ignore */
  }
}
markCapacitorNative();
window.setTimeout(markCapacitorNative, 0);
window.setTimeout(markCapacitorNative, 150);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
