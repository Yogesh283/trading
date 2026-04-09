/**
 * Virtual INR for the demo wallet: new users, bust-to-zero top-up, default “Add demo funds” tranche, etc.
 *
 * Set in `.env` (restart Node after change):
 * - **`DEMO_ACCOUNT_DEFAULT_INR`** — preferred name (0–1e12).
 * - **`DEMO_START_BALANCE`** — legacy alias; used only if `DEMO_ACCOUNT_DEFAULT_INR` is unset.
 *
 * If neither is set, **10_000** is used.
 */
export const DEFAULT_DEMO_BALANCE_INR = (() => {
  const primary = Number(process.env.DEMO_ACCOUNT_DEFAULT_INR);
  if (Number.isFinite(primary) && primary >= 0) {
    return Math.min(primary, 1e12);
  }
  const legacy = Number(process.env.DEMO_START_BALANCE);
  if (Number.isFinite(legacy) && legacy >= 0) {
    return Math.min(legacy, 1e12);
  }
  return 10_000;
})();

/** Old server default — wallets still at this amount are bumped to `DEFAULT_DEMO_BALANCE_INR` on read (see walletStore). */
export const LEGACY_DEMO_BALANCE_INR = 1_000;

/** Set `DEMO_MIGRATE_LEGACY_BALANCE=0` to skip auto-upgrading demo_balance from legacy 1k → current default. */
export const DEMO_MIGRATE_LEGACY_BALANCE =
  process.env.DEMO_MIGRATE_LEGACY_BALANCE !== "0" && process.env.DEMO_MIGRATE_LEGACY_BALANCE !== "false";
