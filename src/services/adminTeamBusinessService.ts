import { dbAll, initAppDb } from "../db/appDb";
import { formatAdminMobile } from "../utils/adminMobile";

type UserRefRow = {
  id: string | number;
  name: string;
  email: string;
  phone_country_code: string | null;
  phone_local: string | null;
  self_referral_code: string | null;
  referral_code: string | null;
};

export type AdminTeamBusinessRow = {
  rootUserId: string;
  rootName: string;
  rootEmail: string;
  rootMobile: string;
  selfReferralCode: string;
  /** All users in this tree (including root). */
  teamMembers: number;
  /** Sum of credited deposit amounts (USDT) for everyone in this tree. */
  totalDepositsUsdt: number;
};

function buildParentByChild(rows: UserRefRow[]): Map<string, string | null> {
  const codeToId = new Map<string, string>();
  for (const r of rows) {
    const c = String(r.self_referral_code ?? "").trim().toUpperCase();
    if (c) {
      codeToId.set(c, String(r.id));
    }
  }
  const parentByChild = new Map<string, string | null>();
  for (const r of rows) {
    const id = String(r.id);
    const ref = String(r.referral_code ?? "").trim().toUpperCase();
    if (!ref) {
      parentByChild.set(id, null);
      continue;
    }
    const pid = codeToId.get(ref);
    parentByChild.set(id, pid ?? null);
  }
  return parentByChild;
}

/** Top ancestor in the referral chain (cycle-safe). */
function rootOf(uid: string, parentByChild: Map<string, string | null>): string {
  const seen = new Set<string>();
  let cur = uid;
  while (true) {
    if (seen.has(cur)) {
      return cur;
    }
    seen.add(cur);
    const p = parentByChild.get(cur);
    if (p == null) {
      return cur;
    }
    cur = p;
  }
}

/**
 * Per **tree root** (user with no upline in DB): how many members and how much credited USDT
 * deposits (sum across the whole downline, including root).
 */
export async function getAdminTeamBusinessReport(): Promise<{ rows: AdminTeamBusinessRow[] }> {
  await initAppDb();
  const users = await dbAll<UserRefRow>(
    `SELECT id, name, email, phone_country_code, phone_local, self_referral_code, referral_code FROM users`
  );
  const parentByChild = buildParentByChild(users);
  const byId = new Map(users.map((u) => [String(u.id), u]));

  const depAgg = await dbAll<{ user_id: string | number; s: unknown }>(
    `SELECT user_id, COALESCE(SUM(amount), 0) AS s FROM deposits WHERE status = 'credited' GROUP BY user_id`
  );
  const depositByUser = new Map<string, number>();
  for (const d of depAgg) {
    depositByUser.set(String(d.user_id).trim(), Number(d.s ?? 0));
  }

  const bucket = new Map<string, { members: number; usdt: number }>();
  for (const u of users) {
    const uid = String(u.id);
    const root = rootOf(uid, parentByChild);
    const b = bucket.get(root) ?? { members: 0, usdt: 0 };
    b.members += 1;
    b.usdt += depositByUser.get(uid) ?? 0;
    bucket.set(root, b);
  }

  const rows: AdminTeamBusinessRow[] = [];
  for (const [rootId, b] of bucket) {
    const u = byId.get(rootId);
    if (!u) {
      continue;
    }
    rows.push({
      rootUserId: rootId,
      rootName: u.name,
      rootEmail: u.email,
      rootMobile: formatAdminMobile(u.phone_country_code, u.phone_local),
      selfReferralCode: String(u.self_referral_code ?? "").trim() || "—",
      teamMembers: b.members,
      totalDepositsUsdt: Number(b.usdt.toFixed(8))
    });
  }
  rows.sort((a, b) => b.totalDepositsUsdt - a.totalDepositsUsdt);
  return { rows };
}
