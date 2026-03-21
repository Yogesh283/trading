/** Query + hash + localStorage: MetaMask WebView does NOT share sessionStorage with Chrome/Safari. */
export const DEPOSIT_AMOUNT_QUERY = "depositAmount";
/** When set to 1, Deposit page auto-opens the USDT transfer prompt (treasury + amount) in the in-wallet browser. */
export const AUTODEPOSIT_QUERY = "autodeposit";
export const DEPOSIT_AMOUNT_SESSION_KEY = "updownfx_deposit_amount";
/** Same-origin localStorage sometimes survives in-wallet reload (query/hash are primary). */
export const DEPOSIT_AMOUNT_LOCAL_KEY = "updownfx_deposit_amount_v1";
/** Set right before wallet deep link; read after in-app browser loads (query can be stripped). */
export const AUTODEPOSIT_LOCAL_KEY = "updownfx_autodeposit_v1";

export function appendDepositAmountToPageUrl(href: string, amountStr: string): string {
  try {
    const u = new URL(href);
    u.searchParams.set(DEPOSIT_AMOUNT_QUERY, amountStr);
    u.searchParams.set(AUTODEPOSIT_QUERY, "1");
    const hashParams = new URLSearchParams();
    hashParams.set(DEPOSIT_AMOUNT_QUERY, amountStr);
    hashParams.set(AUTODEPOSIT_QUERY, "1");
    u.hash = hashParams.toString();
    return u.toString();
  } catch {
    return href;
  }
}

export function readAutoDepositFromLocation(): boolean {
  try {
    const p = new URLSearchParams(window.location.search);
    if (p.get(AUTODEPOSIT_QUERY) === "1") return true;
    const h = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    if (h.get(AUTODEPOSIT_QUERY) === "1") return true;
  } catch {
    /* ignore */
  }
  return false;
}

export function readAutoDepositFromLocal(): boolean {
  try {
    return window.localStorage.getItem(AUTODEPOSIT_LOCAL_KEY) === "1";
  } catch {
    return false;
  }
}

export function setAutoDepositLocalPending(): void {
  try {
    window.localStorage.setItem(AUTODEPOSIT_LOCAL_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function clearAutoDepositLocal(): void {
  try {
    window.localStorage.removeItem(AUTODEPOSIT_LOCAL_KEY);
  } catch {
    /* ignore */
  }
}

export function stripAutoDepositFromUrl(): void {
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.has(AUTODEPOSIT_QUERY)) {
      params.delete(AUTODEPOSIT_QUERY);
      const q = params.toString();
      const next = `${window.location.pathname}${q ? `?${q}` : ""}${window.location.hash}`;
      window.history.replaceState({}, "", next);
    }
  } catch {
    /* ignore */
  }
  try {
    const raw = window.location.hash.replace(/^#/, "");
    if (!raw) return;
    const hp = new URLSearchParams(raw);
    if (!hp.has(AUTODEPOSIT_QUERY)) return;
    hp.delete(AUTODEPOSIT_QUERY);
    const q = hp.toString();
    const next = `${window.location.pathname}${window.location.search}${q ? `#${q}` : ""}`;
    window.history.replaceState({}, "", next);
  } catch {
    /* ignore */
  }
}

export function readDepositAmountFromLocation(): string | null {
  try {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get(DEPOSIT_AMOUNT_QUERY);
    if (fromUrl != null && fromUrl !== "" && Number(fromUrl) >= 1) {
      return fromUrl;
    }
  } catch {
    /* ignore */
  }
  return null;
}

/** Parse #depositAmount=50 */
export function readDepositAmountFromHash(): string | null {
  try {
    const raw = window.location.hash.replace(/^#/, "");
    if (!raw) return null;
    const params = new URLSearchParams(raw);
    const v = params.get(DEPOSIT_AMOUNT_QUERY);
    if (v != null && v !== "" && Number(v) >= 1) {
      return v;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function readDepositAmountFromSession(): string | null {
  try {
    const stored = sessionStorage.getItem(DEPOSIT_AMOUNT_SESSION_KEY);
    if (stored != null && stored !== "" && Number(stored) >= 1) {
      return stored;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function readDepositAmountFromLocal(): string | null {
  try {
    const stored = localStorage.getItem(DEPOSIT_AMOUNT_LOCAL_KEY);
    if (stored != null && stored !== "" && Number(stored) >= 1) {
      return stored;
    }
  } catch {
    /* ignore */
  }
  return null;
}

/** Try all storages (order: query → hash → local → session). */
export function readAnySavedDepositAmount(): string | null {
  return (
    readDepositAmountFromLocation() ??
    readDepositAmountFromHash() ??
    readDepositAmountFromLocal() ??
    readDepositAmountFromSession()
  );
}

/**
 * Apply saved amount into the form; strip query/hash from URL after read.
 * Call from useLayoutEffect + short delays so MetaMask in-app load races are handled.
 */
export function consumeDepositAmountFromNavigation(setAmount: (value: string) => void): void {
  const fromQ = readDepositAmountFromLocation();
  const fromH = readDepositAmountFromHash();
  const fromL = readDepositAmountFromLocal();
  const fromS = readDepositAmountFromSession();
  const val = fromQ ?? fromH ?? fromL ?? fromS;
  if (val != null) {
    setAmount(val);
  }
  if (fromQ != null) {
    stripDepositAmountFromUrl();
  }
  if (fromH != null) {
    stripDepositAmountFromHash();
  }
}

/** Remove query param from address bar without reload (after applying to form). */
export function stripDepositAmountFromUrl(): void {
  try {
    const params = new URLSearchParams(window.location.search);
    if (!params.has(DEPOSIT_AMOUNT_QUERY)) return;
    params.delete(DEPOSIT_AMOUNT_QUERY);
    const q = params.toString();
    const next = `${window.location.pathname}${q ? `?${q}` : ""}${window.location.hash}`;
    window.history.replaceState({}, "", next);
  } catch {
    /* ignore */
  }
}

export function stripDepositAmountFromHash(): void {
  try {
    const raw = window.location.hash.replace(/^#/, "");
    if (!raw) return;
    const params = new URLSearchParams(raw);
    if (!params.has(DEPOSIT_AMOUNT_QUERY)) return;
    params.delete(DEPOSIT_AMOUNT_QUERY);
    const q = params.toString();
    const next = `${window.location.pathname}${window.location.search}${q ? `#${q}` : ""}`;
    window.history.replaceState({}, "", next);
  } catch {
    /* ignore */
  }
}

/** Logged-in app: open Deposit tab if amount was passed (query or hash). */
export function shouldOpenDepositScreenFromUrl(): boolean {
  return readDepositAmountFromLocation() != null || readDepositAmountFromHash() != null;
}
