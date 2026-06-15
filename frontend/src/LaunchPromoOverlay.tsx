import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "./launch-promo.css";

export const APP_READY_EVENT = "iqfx-app-ready";

/** Shown once per app load, right after splash + boot complete. */
export default function LaunchPromoOverlay() {
  const [open, setOpen] = useState(false);
  const shownRef = useRef(false);

  useEffect(() => {
    const onReady = () => {
      if (shownRef.current) return;
      shownRef.current = true;
      setOpen(true);
    };
    window.addEventListener(APP_READY_EVENT, onReady);
    return () => window.removeEventListener(APP_READY_EVENT, onReady);
  }, []);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  if (!open) return null;

  return createPortal(
    <div className="launch-promo-backdrop" role="presentation" onClick={close}>
      <div
        className="launch-promo-panel"
        role="dialog"
        aria-modal="true"
        aria-label="IQFXPRO promotion"
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="launch-promo-close" aria-label="Close" onClick={close}>
          ×
        </button>
        <img
          src="/launch-popup.png"
          alt="IQFXPRO — earn with demo points and USDT rewards"
          className="launch-promo-img"
          width={862}
          height={1825}
          decoding="async"
        />
      </div>
    </div>,
    document.body
  );
}
