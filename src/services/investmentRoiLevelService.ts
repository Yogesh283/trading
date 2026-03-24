import { dbAll, dbRun, initAppDb } from "../db/appDb";
import { LEVEL_INCOME_DEPTH } from "../config/referral";

export interface InvestmentRoiLevelRow {
  level: number;
  /** Fraction of the **gross** monthly yield (principal × monthly ROI %) paid to this upline level. */
  percentOfGrossYield: number;
  enabled: boolean;
}

export async function listInvestmentRoiLevelRows(): Promise<InvestmentRoiLevelRow[]> {
  await initAppDb();
  const rows = await dbAll<{ level_num: number; percent_of_gross_yield: number; enabled: number }>(
    "SELECT level_num, percent_of_gross_yield, enabled FROM investment_roi_level_distribution ORDER BY level_num ASC"
  );
  return rows.map((r) => ({
    level: r.level_num,
    percentOfGrossYield: Number(r.percent_of_gross_yield),
    enabled: Boolean(r.enabled)
  }));
}

/** Sum of enabled level fractions; investor receives gross × (1 − min(sum, 1)). */
export async function getUplineFractionSumOfGrossYield(): Promise<number> {
  const rows = await listInvestmentRoiLevelRows();
  let s = 0;
  for (const r of rows) {
    if (r.enabled) {
      const p = Number(r.percentOfGrossYield);
      if (Number.isFinite(p) && p > 0) {
        s += p;
      }
    }
  }
  return s;
}

export async function getEffectiveInvestmentRoiUplinePercents(): Promise<Map<number, number>> {
  const m = new Map<number, number>();
  for (const r of await listInvestmentRoiLevelRows()) {
    const p = r.enabled && Number.isFinite(r.percentOfGrossYield) && r.percentOfGrossYield > 0 ? r.percentOfGrossYield : 0;
    m.set(r.level, p);
  }
  return m;
}

export async function updateInvestmentRoiLevelRows(levels: InvestmentRoiLevelRow[]): Promise<void> {
  await initAppDb();
  const byLevel = new Map<number, InvestmentRoiLevelRow>();
  for (const L of levels) {
    const lv = Math.floor(Number(L.level));
    if (lv < 1 || lv > LEVEL_INCOME_DEPTH) {
      throw new Error(`Invalid level ${L.level} (must be 1–${LEVEL_INCOME_DEPTH})`);
    }
    byLevel.set(lv, L);
  }
  if (byLevel.size !== LEVEL_INCOME_DEPTH) {
    throw new Error(`Provide exactly ${LEVEL_INCOME_DEPTH} levels (1–${LEVEL_INCOME_DEPTH})`);
  }

  let sum = 0;
  for (let lv = 1; lv <= LEVEL_INCOME_DEPTH; lv++) {
    const L = byLevel.get(lv)!;
    const p = Number(L.percentOfGrossYield);
    if (!Number.isFinite(p) || p < 0 || p > 1) {
      throw new Error(`Invalid percent for investment ROI level ${lv} (0–1 = fraction of gross monthly yield)`);
    }
    if (L.enabled) {
      sum += p;
    }
  }
  if (sum > 1 + 1e-9) {
    throw new Error(
      `Sum of enabled upline percents (${(sum * 100).toFixed(2)}%) cannot exceed 100% of gross monthly yield`
    );
  }

  for (let lv = 1; lv <= LEVEL_INCOME_DEPTH; lv++) {
    const L = byLevel.get(lv)!;
    const p = Number(L.percentOfGrossYield);
    await dbRun(
      "UPDATE investment_roi_level_distribution SET percent_of_gross_yield = ?, enabled = ? WHERE level_num = ?",
      [p, L.enabled ? 1 : 0, lv]
    );
  }
}
