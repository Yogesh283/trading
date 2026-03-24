/**
 * Virtual INR in `wallets.demo_balance` for new signups and safe fallbacks when the column is missing.
 * Set `DEMO_START_BALANCE` in `.env` to override (0–1e12).
 */
export const DEFAULT_DEMO_BALANCE_INR = (() => {
  const raw = Number(process.env.DEMO_START_BALANCE);
  if (Number.isFinite(raw) && raw >= 0) {
    return Math.min(raw, 1e12);
  }
  return 10_000;
})();

/** Old server default — wallets still at this amount are bumped to `DEFAULT_DEMO_BALANCE_INR` on read (see walletStore). */
export const LEGACY_DEMO_BALANCE_INR = 1_000;

/** Set `DEMO_MIGRATE_LEGACY_BALANCE=0` to skip auto-upgrading demo_balance from legacy 1k → current default. */
export const DEMO_MIGRATE_LEGACY_BALANCE =
  process.env.DEMO_MIGRATE_LEGACY_BALANCE !== "0" && process.env.DEMO_MIGRATE_LEGACY_BALANCE !== "false";
