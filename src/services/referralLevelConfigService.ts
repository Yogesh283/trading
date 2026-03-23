import { dbAll, dbGet, dbRun, initAppDb } from "../db/appDb";
import { LEVEL_INCOME_DEPTH } from "../config/referral";

const MASTER_KEY = "referral_program_enabled";

export interface ReferralLevelRow {
  level: number;
  percentOfStake: number;
  enabled: boolean;
}

export interface ReferralLevelConfigPayload {
  referralProgramEnabled: boolean;
  levels: ReferralLevelRow[];
}

export async function getReferralProgramEnabled(): Promise<boolean> {
  await initAppDb();
  const row = await dbGet<{ setting_value: string }>(
    "SELECT setting_value FROM app_settings WHERE setting_key = ?",
    [MASTER_KEY]
  );
  const v = String(row?.setting_value ?? "1").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

export async function setReferralProgramEnabled(on: boolean): Promise<void> {
  await initAppDb();
  await dbRun("UPDATE app_settings SET setting_value = ? WHERE setting_key = ?", [on ? "1" : "0", MASTER_KEY]);
}

export async function getReferralLevelRows(): Promise<ReferralLevelRow[]> {
  await initAppDb();
  const rows = await dbAll<{ level_num: number; percent_of_stake: number; enabled: number }>(
    "SELECT level_num, percent_of_stake, enabled FROM referral_level_settings ORDER BY level_num ASC"
  );
  return rows.map((r) => ({
    level: r.level_num,
    percentOfStake: Number(r.percent_of_stake),
    enabled: Boolean(r.enabled)
  }));
}

export async function getReferralLevelConfigPayload(): Promise<ReferralLevelConfigPayload> {
  const [referralProgramEnabled, levels] = await Promise.all([
    getReferralProgramEnabled(),
    getReferralLevelRows()
  ]);
  return { referralProgramEnabled, levels };
}

export async function updateReferralLevelConfigPayload(input: ReferralLevelConfigPayload): Promise<void> {
  await initAppDb();
  await setReferralProgramEnabled(Boolean(input.referralProgramEnabled));
  for (const L of input.levels) {
    const lv = Math.floor(Number(L.level));
    if (lv < 1 || lv > LEVEL_INCOME_DEPTH) continue;
    const pct = Number(L.percentOfStake);
    if (!Number.isFinite(pct) || pct < 0 || pct > 1) {
      throw new Error(`Invalid percent for level ${lv} (must be 0–1, e.g. 0.001 = 0.1% of stake)`);
    }
    await dbRun(
      "UPDATE referral_level_settings SET percent_of_stake = ?, enabled = ? WHERE level_num = ?",
      [pct, L.enabled ? 1 : 0, lv]
    );
  }
}

/** Runtime: master switch + per-level percent (0 if disabled). */
export async function getEffectiveLevelPercents(): Promise<{ programEnabled: boolean; byLevel: Map<number, number> }> {
  const programEnabled = await getReferralProgramEnabled();
  const rows = await getReferralLevelRows();
  const byLevel = new Map<number, number>();
  for (const r of rows) {
    byLevel.set(r.level, programEnabled && r.enabled && r.percentOfStake > 0 ? r.percentOfStake : 0);
  }
  return { programEnabled, byLevel };
}
