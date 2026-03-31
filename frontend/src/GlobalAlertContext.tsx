import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";

export type GlobalAlertVariant = "error" | "info";

type GlobalAlertState = { message: string; variant: GlobalAlertVariant } | null;

type GlobalAlertContextValue = {
  showAlert: (message: string, variant?: GlobalAlertVariant) => void;
};

const GlobalAlertContext = createContext<GlobalAlertContextValue | null>(null);

export function GlobalAlertProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GlobalAlertState>(null);

  const showAlert = useCallback((message: string, variant: GlobalAlertVariant = "error") => {
    const t = String(message).trim();
    if (!t) return;
    setState({ message: t, variant });
  }, []);

  const close = useCallback(() => setState(null), []);

  useEffect(() => {
    if (!state) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state, close]);

  const value = useMemo(() => ({ showAlert }), [showAlert]);

  return (
    <GlobalAlertContext.Provider value={value}>
      {children}
      {state ? (
        <div className="global-alert-backdrop" role="presentation" onClick={close}>
          <div
            className={`global-alert-dialog global-alert-dialog--${state.variant}`}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="global-alert-title"
            aria-describedby="global-alert-body"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="global-alert-title" className="global-alert-title">
              {state.variant === "error" ? "Error" : "Notice"}
            </h2>
            <p id="global-alert-body" className="global-alert-body">
              {state.message}
            </p>
            <button type="button" className="global-alert-ok" onClick={close} autoFocus>
              OK
            </button>
          </div>
        </div>
      ) : null}
    </GlobalAlertContext.Provider>
  );
}

export function useGlobalAlert(): GlobalAlertContextValue {
  const ctx = useContext(GlobalAlertContext);
  if (!ctx) {
    throw new Error("useGlobalAlert must be used inside GlobalAlertProvider");
  }
  return ctx;
}
