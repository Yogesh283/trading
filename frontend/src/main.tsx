import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";
import "./site-frame.css";
import "./mobile.css";
import "./mobile-trade.css";

/** Capacitor APK: avoid double top inset (WebView + #root safe-area) — see site-frame.css `.cap-native` */
function markCapacitorNative() {
  try {
    const c = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
    if (c?.isNativePlatform?.()) {
      document.documentElement.classList.add("cap-native");
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
