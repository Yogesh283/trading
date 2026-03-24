import { dbGet, dbRun, initAppDb } from "../db/appDb";
import { INVESTMENT_MONTHLY_YIELD } from "../config/investment";
import {
  getUplineFractionSumOfGrossYield,
  listInvestmentRoiLevelRows,
  updateInvestmentRoiLevelRows,
  type InvestmentRoiLevelRow
} from "./investmentRoiLevelService";

export type { InvestmentRoiLevelRow };

const ROI_KEY = "investment_monthly_roi_fraction";

function clampFraction(f: number): number {
  if (!Number.isFinite(f) || f < 0) {
    return 0;
  }
  return Math.min(f, 1);
}

/** Monthly ROI as fraction (e.g. 0.10 = 10% of principal per payout). */
export async function getInvestmentMonthlyRoiFraction(): Promise<number> {
  await initAppDb();
  const row = await dbGet<{ setting_value: string }>(
    "SELECT setting_value FROM app_settings WHERE setting_key = ?",
    [ROI_KEY]
  );
  const v = Number(String(row?.setting_value ?? "").trim());
  if (!Number.isFinite(v) || v < 0) {
    return INVESTMENT_MONTHLY_YIELD;
  }
  return clampFraction(v);
}

export async function setInvestmentMonthlyRoiFraction(fraction: number): Promise<void> {
  await initAppDb();
  const f = clampFraction(fraction);
  const existing = await dbGet<{ setting_key: string }>(
    "SELECT setting_key FROM app_settings WHERE setting_key = ?",
    [ROI_KEY]
  );
  const s = String(f);
  if (existing) {
    await dbRun("UPDATE app_settings SET setting_value = ? WHERE setting_key = ?", [s, ROI_KEY]);
  } else {
    await dbRun("INSERT INTO app_settings (setting_key, setting_value) VALUES (?, ?)", [ROI_KEY, s]);
  }
}

export interface InvestmentRoiAdminPayload {
  /** 0–1, e.g. 0.1 */
  monthlyRoiFraction: number;
  /** Same as fraction × 100 for UI */
  monthlyRoiPercent: number;
  /** Upline 1..5: each % is of **gross** monthly yield (principal × monthlyRoiFraction). */
  levels: InvestmentRoiLevelRow[];
  /** Sum of enabled level fractions (capped at 1 in payouts). */
  uplinePercentOfGrossSum: number;
  /** 1 − min(upline sum, 1); investor’s share of the gross pool. */
  investorNetFractionOfGross: number;
}

export async function getInvestmentRoiAdminPayload(): Promise<InvestmentRoiAdminPayload> {
  const monthlyRoiFraction = await getInvestmentMonthlyRoiFraction();
  const levels = await listInvestmentRoiLevelRows();
  const uplinePercentOfGrossSum = await getUplineFractionSumOfGrossYield();
  const capped = Math.min(uplinePercentOfGrossSum, 1);
  return {
    monthlyRoiFraction,
    monthlyRoiPercent: Number((monthlyRoiFraction * 100).toFixed(6)),
    levels,
    uplinePercentOfGrossSum,
    investorNetFractionOfGross: Number((1 - capped).toFixed(8))
  };
}

export async function updateInvestmentRoiAdminPayload(input: {
  monthlyRoiFraction?: number;
  levels?: InvestmentRoiLevelRow[];
}): Promise<void> {
  if (input.monthlyRoiFraction !== undefined) {
    const f = Number(input.monthlyRoiFraction);
    if (!Number.isFinite(f) || f < 0 || f > 1) {
      throw new Error("Monthly ROI must be between 0 and 1 (e.g. 0.1 = 10% per month)");
    }
    await setInvestmentMonthlyRoiFraction(f);
  }
  if (input.levels !== undefined) {
    await updateInvestmentRoiLevelRows(input.levels);
  }
  if (input.monthlyRoiFraction === undefined && input.levels === undefined) {
    throw new Error("Nothing to update");
  }
}
