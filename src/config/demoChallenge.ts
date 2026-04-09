/**
 * Demo → live skill challenge: grow demo wallet to target, earn a small real bonus (locked until traded as profit).
 * Env overrides optional.
 */
export const DEMO_CHALLENGE_TARGET_INR = Math.max(
  1,
  Math.min(1e12, Number(process.env.DEMO_CHALLENGE_TARGET_INR) || 100_000)
);

/** Real INR credited to live wallet when demo target is reached (non-withdrawable until PnL). */
export const DEMO_CHALLENGE_REWARD_INR = Math.max(
  0,
  Math.min(1e9, Number(process.env.DEMO_CHALLENGE_REWARD_INR) || 100)
);

/** If demo balance falls below this, user may claim practice reset to `DEMO_CHALLENGE_START_INR`. */
export const DEMO_PRACTICE_RETRY_BELOW_INR = Math.max(
  0,
  Math.min(1e6, Number(process.env.DEMO_PRACTICE_RETRY_BELOW_INR) || 1)
);

/** Minimum INR that must be withdrawn (USDT amount × rate). */
export const MIN_WITHDRAWAL_INR = Math.max(
  1,
  Math.min(1e9, Number(process.env.MIN_WITHDRAWAL_INR) || 1000)
);
