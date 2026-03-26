/**
 * Outline / neon-cyan style icons for mobile dock & drawer (matches dark trading UI).
 * All strokes use currentColor — parent sets color (dock label / FAB / drawer row).
 */

const cls = "mobile-dock-fg-icon";
const drawerCls = "app-nav-drawer-icon";

type IconProps = { className?: string };

function cx(base: string, extra?: string) {
  return extra ? `${base} ${extra}`.trim() : base;
}

/** Card + stripe + chip — bottom dock + drawer */
export function DockIconDeposit(props: IconProps = {}) {
  const { className } = props;
  return (
    <svg className={cx(cls, className)} viewBox="0 0 24 24" aria-hidden>
      <rect x="3" y="6.5" width="18" height="11.5" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.45" />
      <path d="M3 11h18" stroke="currentColor" strokeWidth="1.1" strokeOpacity={0.45} />
      <rect x="14.5" y="13.5" width="4.8" height="3" rx="0.55" fill="none" stroke="currentColor" strokeWidth="1.1" />
      <circle cx="8" cy="15" r="0.85" fill="currentColor" />
    </svg>
  );
}

/** Circle + up arrow (withdraw / send) */
export function DockIconWithdraw(props: IconProps = {}) {
  const { className } = props;
  return (
    <svg className={cx(cls, className)} viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="12" r="8.75" fill="none" stroke="currentColor" strokeWidth="1.45" />
      <path
        d="M12 16.5V8M8.2 11.2L12 7.5l3.8 3.7"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.65"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Outline candlesticks — center Trade FAB */
export function DockIconTradeBars(props: IconProps = {}) {
  const { className } = props;
  return (
    <svg className={cx(`${cls} ${cls}--trade`, className)} viewBox="0 0 24 24" aria-hidden>
      <path d="M7 18V8" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
      <rect x="5" y="10" width="4" height="5.5" rx="0.65" fill="none" stroke="currentColor" strokeWidth="1.25" />
      <path d="M12 18V5.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
      <rect x="10" y="7.5" width="4" height="8" rx="0.65" fill="none" stroke="currentColor" strokeWidth="1.25" />
      <path d="M17 18V7" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
      <rect x="15" y="9" width="4" height="6.5" rx="0.65" fill="none" stroke="currentColor" strokeWidth="1.25" />
    </svg>
  );
}

export function DockIconTradePlus(props: IconProps = {}) {
  const { className } = props;
  return <DockIconTradeBars className={className} />;
}

/** Trend sprout — optional */
export function DockIconTradeSprout(props: IconProps = {}) {
  const { className } = props;
  return (
    <svg className={cx(`${cls} ${cls}--sprout`, className)} viewBox="0 0 24 24" aria-hidden>
      <path d="M12 20.5V11" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" />
      <path
        d="M12 13.5c-3.8-2.2-5.5-6.2-4.2-9.8 1.8.8 3.2 4.2 4.2 9.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M12 14.5c4-1.8 6.5-5.2 7-9.5-2.8 1-5.2 4.5-7 9.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.85}
      />
    </svg>
  );
}

/** Trend line + arrow — investment */
export function DockIconInvest(props: IconProps = {}) {
  const { className } = props;
  return (
    <svg className={cx(cls, className)} viewBox="0 0 24 24" aria-hidden>
      <path
        d="M4 17V8.5l4 3 3.5-2.5L16 13l4-4.5V17"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.45"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M17 6.5h3.5V10"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.45"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** 2×2 grid — markets */
export function DockIconMarkets(props: IconProps = {}) {
  const { className } = props;
  return (
    <svg className={cx(cls, className)} viewBox="0 0 24 24" aria-hidden>
      <rect x="3" y="3" width="7.5" height="7.5" rx="1.4" fill="none" stroke="currentColor" strokeWidth="1.35" />
      <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.4" fill="none" stroke="currentColor" strokeWidth="1.35" />
      <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.4" fill="none" stroke="currentColor" strokeWidth="1.35" />
      <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.4" fill="none" stroke="currentColor" strokeWidth="1.35" />
    </svg>
  );
}

export function DockIconMenu(props: IconProps = {}) {
  const { className } = props;
  return (
    <svg className={cx(cls, className)} viewBox="0 0 24 24" aria-hidden>
      <path d="M5 7h14" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M5 12h14" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M5 17h14" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

/** Two users + arc — promotion / referral */
export function DockIconReferral(props: IconProps = {}) {
  const { className } = props;
  return (
    <svg className={cx(cls, className)} viewBox="0 0 24 24" aria-hidden>
      <circle cx="9" cy="8.5" r="3" fill="none" stroke="currentColor" strokeWidth="1.35" />
      <circle cx="15" cy="8.5" r="3" fill="none" stroke="currentColor" strokeWidth="1.35" />
      <path
        d="M5.5 20.5c0-3.4 2.9-5.6 6.5-5.6s6.5 2.2 6.5 5.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinecap="round"
      />
      <path d="M12 3.5v2.8" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
    </svg>
  );
}

/* —— Drawer-only (same visual language) —— */

export function DrawerIconTrading(props: IconProps = {}) {
  const { className } = props;
  return <DockIconTradeBars className={cx(drawerCls, className)} />;
}

export function DrawerIconMarkets(props: IconProps = {}) {
  const { className } = props;
  return <DockIconMarkets className={cx(drawerCls, className)} />;
}

export function DrawerIconAccount(props: IconProps = {}) {
  const { className } = props;
  return (
    <svg className={cx(drawerCls, className)} viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="8" r="3.25" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M5 20.5c0-3.8 3.5-6 7-6s7 2.2 7 6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function DrawerIconHistory(props: IconProps = {}) {
  const { className } = props;
  return (
    <svg className={cx(drawerCls, className)} viewBox="0 0 24 24" aria-hidden>
      <path
        d="M8 4h9.5A2.5 2.5 0 0120 6.5V18l-4-3.5-4 3.5v-2.5H8A2.5 2.5 0 015.5 13V6.5A2.5 2.5 0 018 4z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinejoin="round"
      />
      <path d="M8.5 9.5h6M8.5 12h4" stroke="currentColor" strokeWidth="1.15" strokeLinecap="round" />
    </svg>
  );
}

export function DrawerIconChart(props: IconProps = {}) {
  const { className } = props;
  return (
    <svg className={cx(drawerCls, className)} viewBox="0 0 24 24" aria-hidden>
      <rect x="3.5" y="4" width="17" height="16" rx="2" fill="none" stroke="currentColor" strokeWidth="1.35" />
      <path
        d="M7 15l3-4 3.5 2.5L17 8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function DrawerIconRefresh(props: IconProps = {}) {
  const { className } = props;
  return (
    <svg className={cx(drawerCls, className)} viewBox="0 0 24 24" aria-hidden>
      <path
        d="M5 12a7 7 0 0112.88-3.5M19 12a7 7 0 01-12.88 3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <path d="M5.5 8.5V4.5H9" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M18.5 15.5v4h-3.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function DrawerIconAbout(props: IconProps = {}) {
  const { className } = props;
  return (
    <svg className={cx(drawerCls, className)} viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="12" r="8.75" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M12 16.5v-1M12 7.8v4.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function DrawerIconDeposit(props: IconProps = {}) {
  const { className } = props;
  return <DockIconDeposit className={cx(drawerCls, className)} />;
}

export function DrawerIconWithdraw(props: IconProps = {}) {
  const { className } = props;
  return <DockIconWithdraw className={cx(drawerCls, className)} />;
}

export function DrawerIconInvestment(props: IconProps = {}) {
  const { className } = props;
  return <DockIconInvest className={cx(drawerCls, className)} />;
}

export function DrawerIconPromotion(props: IconProps = {}) {
  const { className } = props;
  return <DockIconReferral className={cx(drawerCls, className)} />;
}

export function DrawerIconWalletActivity(props: IconProps = {}) {
  const { className } = props;
  return (
    <svg className={cx(drawerCls, className)} viewBox="0 0 24 24" aria-hidden>
      <path
        d="M4 7.5h15a1.5 1.5 0 011.5 1.5v10a1.5 1.5 0 01-1.5 1.5H4a1.5 1.5 0 01-1.5-1.5V9A1.5 1.5 0 014 7.5z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.35"
      />
      <path d="M4 11.5h16.5" stroke="currentColor" strokeWidth="1.35" />
      <circle cx="15.5" cy="15" r="1" fill="currentColor" />
    </svg>
  );
}

/** Down arrow to tray — APK download */
export function DrawerIconDownload(props: IconProps = {}) {
  const { className } = props;
  return (
    <svg className={cx(drawerCls, className)} viewBox="0 0 24 24" aria-hidden>
      <path
        d="M12 4v11.5m0 0l4-4m-4 4l-4-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.45"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M5 19.5h14" fill="none" stroke="currentColor" strokeWidth="1.45" strokeLinecap="round" />
    </svg>
  );
}

/** Chat bubble + ? — Help / tickets */
export function DrawerIconHelp(props: IconProps = {}) {
  const { className } = props;
  return (
    <svg className={cx(drawerCls, className)} viewBox="0 0 24 24" aria-hidden>
      <path
        d="M6.5 8.5h11a2 2 0 012 2v5a2 2 0 01-2 2h-3.5l-3.2 2.4a.6.6 0 01-.9-.5V17.5H6.5a2 2 0 01-2-2v-5a2 2 0 012-2z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinejoin="round"
      />
      <path
        d="M10.2 11.2h.1M12 11.2h.1M13.8 11.2h.1"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}
