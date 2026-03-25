/** Filled / multi-color icons for mobile bottom dock (readable on dark UI). */

const cls = "mobile-dock-fg-icon";

export function DockIconDeposit() {
  return (
    <svg className={cls} viewBox="0 0 24 24" aria-hidden>
      <rect x="2" y="6" width="20" height="12" rx="2.5" fill="#153050" stroke="#42a5f5" strokeWidth="1.4" />
      <path d="M2 11h20" stroke="#64b5f6" strokeWidth="1.5" opacity={0.45} />
      <rect x="14" y="13" width="6" height="4" rx="0.6" fill="#90caf9" />
      <circle cx="7" cy="15" r="1.2" fill="#bbdefb" />
    </svg>
  );
}

export function DockIconWithdraw() {
  return (
    <svg className={cls} viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="12" r="9" fill="rgba(38,198,218,0.12)" stroke="#26c6da" strokeWidth="1.2" />
      <path
        d="M12 17V7M8 11l4-4 4 4"
        fill="none"
        stroke="#4dd0e1"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Candlestick-style bars — center “Trade” FAB + dock. */
export function DockIconTradeBars() {
  return (
    <svg className={`${cls} ${cls}--trade`} viewBox="0 0 24 24" aria-hidden>
      <rect x="4.5" y="12" width="4.2" height="9" rx="0.8" fill="#66bb6a" />
      <rect x="9.9" y="8" width="4.2" height="13" rx="0.8" fill="#ec407a" />
      <rect x="15.3" y="10" width="4.2" height="11" rx="0.8" fill="#42a5f5" />
    </svg>
  );
}

/** Alias — same trade/chart icon (no +); kept for older imports. */
export function DockIconTradePlus() {
  return <DockIconTradeBars />;
}

/** White line sprout — optional alternate center icon. */
export function DockIconTradeSprout() {
  return (
    <svg className={`${cls} ${cls}--sprout`} viewBox="0 0 24 24" aria-hidden>
      <path
        d="M12 20.5V11"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M12 13.5c-3.8-2.2-5.5-6.2-4.2-9.8 1.8.8 3.2 4.2 4.2 9.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.85"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M12 14.5c4-1.8 6.5-5.2 7-9.5-2.8 1-5.2 4.5-7 9.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.85"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.92}
      />
      <path
        d="M12 14.5c-4-1.8-6.5-5.2-7-9.5 2.8 1 5.2 4.5 7 9.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.85"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.92}
      />
    </svg>
  );
}

export function DockIconInvest() {
  return (
    <svg className={cls} viewBox="0 0 24 24" aria-hidden>
      <path
        d="M4 18V6l4 4 4-3 4 5 4-2v10"
        fill="none"
        stroke="#ffb74d"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M17 8h4v4"
        fill="none"
        stroke="#ff9800"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="7" cy="10" r="1.3" fill="#ffe082" />
    </svg>
  );
}

export function DockIconMarkets() {
  return (
    <svg className={cls} viewBox="0 0 24 24" aria-hidden>
      <rect x="3" y="3" width="8" height="8" rx="1.5" fill="#7e57c2" opacity={0.95} />
      <rect x="13" y="3" width="8" height="8" rx="1.5" fill="#26a69a" opacity={0.95} />
      <rect x="3" y="13" width="8" height="8" rx="1.5" fill="#ef5350" opacity={0.9} />
      <rect x="13" y="13" width="8" height="8" rx="1.5" fill="#ffa726" opacity={0.95} />
    </svg>
  );
}

export function DockIconMenu() {
  return (
    <svg className={cls} viewBox="0 0 24 24" aria-hidden>
      <path d="M4 7h16" stroke="#cfd8dc" strokeWidth="2" strokeLinecap="round" />
      <path d="M4 12h16" stroke="#eceff1" strokeWidth="2" strokeLinecap="round" />
      <path d="M4 17h16" stroke="#cfd8dc" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/** Promotion tab — bottom dock (two heads + shoulders + spark). */
export function DockIconReferral() {
  return (
    <svg className={cls} viewBox="0 0 24 24" aria-hidden>
      <circle cx="9" cy="9" r="3.2" fill="#66bb6a" opacity={0.95} />
      <circle cx="15" cy="9" r="3.2" fill="#42a5f5" opacity={0.95} />
      <path
        d="M6 20c0-3.5 2.8-5.5 6-5.5s6 2 6 5.5"
        fill="none"
        stroke="#b0bec5"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path d="M12 4v3" stroke="#fff59d" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
