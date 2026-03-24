import crypto from "node:crypto";
import { dbGet, initAppDb } from "../db/appDb";
import { LEVEL_INCOME_DEPTH } from "../config/referral";
import { getEffectiveLevelPercents } from "./referralLevelConfigService";
import { applyLedger } from "./walletStore";
import { logger } from "../utils/logger";

const REF_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateSelfReferralCode(): string {
  let s = "";
  for (let i = 0; i < 8; i++) {
    s += REF_CODE_CHARS[crypto.randomInt(REF_CODE_CHARS.length)];
  }
  return s;
}

export async function allocateUniqueSelfReferralCode(): Promise<string> {
  await initAppDb();
  for (let attempt = 0; attempt < 100; attempt++) {
    const code = generateSelfReferralCode();
    const taken = await dbGet<{ id: string }>(
      "SELECT id FROM users WHERE UPPER(self_referral_code) = UPPER(?) LIMIT 1",
      [code]
    );
    if (!taken) return code;
  }
  throw new Error("Could not generate unique referral code");
}

/** Inviter must exist; returns normalized uppercase code. */
export async function validateInviterReferralCode(raw: string | undefined): Promise<string | null> {
  const trimmed = String(raw ?? "").trim().toUpperCase();
  if (!trimmed) {
    return null;
  }
  await initAppDb();
  const inviter = await dbGet<{ id: string }>(
    "SELECT id FROM users WHERE UPPER(self_referral_code) = UPPER(?) LIMIT 1",
    [trimmed]
  );
  if (!inviter) {
    throw new Error("Invalid referral code");
  }
  return trimmed;
}

/**
 * Upline chain via referral_code (code user used at signup → parent's self_referral_code match).
 * Returns up to 5 user ids (level 1 = direct inviter).
 */
export async function getLevelIncomeRecipientIds(bettorUserId: string): Promise<string[]> {
  await initAppDb();
  const recipients: string[] = [];
  const seen = new Set<string>([bettorUserId]);
  let currentId = bettorUserId;

  for (let depth = 0; depth < LEVEL_INCOME_DEPTH; depth++) {
    const row = await dbGet<{ referral_code: string | null }>(
      "SELECT referral_code FROM users WHERE id = ?",
      [currentId]
    );
    const code = row?.referral_code?.trim().toUpperCase();
    if (!code) break;

    const parent = await dbGet<{ id: string }>(
      "SELECT id FROM users WHERE UPPER(self_referral_code) = UPPER(?) LIMIT 1",
      [code]
    );
    if (!parent || seen.has(parent.id)) break;

    seen.add(parent.id);
    recipients.push(parent.id);
    currentId = parent.id;
  }

  return recipients;
}

type LevelIncomeKind = "level_income" | "level_income_staking";

async function distributeLevelIncomeToUpline(
  sourceUserId: string,
  stakeAmount: number,
  referenceBase: string,
  ledgerTxnType: LevelIncomeKind,
  logLabel: string
): Promise<void> {
  if (!Number.isFinite(stakeAmount) || stakeAmount <= 0) return;

  const { byLevel } = await getEffectiveLevelPercents();
  const recipients = await getLevelIncomeRecipientIds(sourceUserId);
  let level = 1;
  for (const userId of recipients) {
    const fraction = byLevel.get(level) ?? 0;
    if (fraction <= 0) {
      level += 1;
      continue;
    }
    const share = Number((stakeAmount * fraction).toFixed(4));
    if (share <= 0) {
      level += 1;
      continue;
    }
    try {
      await applyLedger(userId, share, ledgerTxnType, `${referenceBase}-L${level}`);
    } catch (e) {
      logger.warn({ e, userId, referenceBase, level, logLabel }, "Level income ledger failed");
    }
    level += 1;
  }
}

/** Commission to upline when a referral places a live binary bet (stake). */
export async function distributeBinaryBetLevelIncome(
  bettorUserId: string,
  stakeAmount: number,
  tradeId: string
): Promise<void> {
  return distributeLevelIncomeToUpline(bettorUserId, stakeAmount, tradeId, "level_income", "binary");
}

/** Commission to upline when a referral adds principal to staking (investment) from live wallet. */
export async function distributeInvestmentStakeLevelIncome(
  investorUserId: string,
  stakeAmount: number,
  investmentRef: string
): Promise<void> {
  return distributeLevelIncomeToUpline(
    investorUserId,
    stakeAmount,
    investmentRef,
    "level_income_staking",
    "staking"
  );
}
