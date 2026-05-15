import fs from "node:fs";

const path = process.argv[2] || "transactions.sql";
const uid = process.argv[3] || "0396";
const s = fs.readFileSync(path, "utf8");

const esc = uid.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const lineRe = new RegExp(
  "^\\('([^']+)',\\s*'" +
    esc +
    "',\\s*'([^']+)',\\s*([^,]+),\\s*([^,]+),\\s*([^,]+),\\s*(?:'([^']*)'|(NULL)),\\s*'[^']*'\\)(?:,|;)\\s*$"
);

const rows = [];
for (const line of s.split("\n")) {
  const m = line.match(lineRe);
  if (!m) continue;
  const ref = m[6] ?? (m[7] === "NULL" ? "" : "");
  rows.push({
    id: m[1],
    type: m[2],
    amount: Number(m[3]),
    before: Number(m[4]),
    after: Number(m[5]),
    ref
  });
}

console.log("file", path, "user", uid, "rows", rows.length);

const byType = {};
for (const r of rows) {
  byType[r.type] = (byType[r.type] || 0) + 1;
}
console.log("counts by txn_type", byType);

let sumAmt = 0;
for (const r of rows) sumAmt += r.amount;
console.log("sum(amount)", sumAmt.toFixed(4));

const settleRefs = new Map();
for (const r of rows) {
  if (r.type === "binary_settle_win" || r.type === "binary_settle_loss") {
    settleRefs.set(r.ref, (settleRefs.get(r.ref) || 0) + 1);
  }
}
const dupSettles = [...settleRefs.entries()].filter(([, c]) => c > 1);
console.log("duplicate settle rows (same reference_id)", dupSettles.length);
if (dupSettles.length) console.log("sample", dupSettles.slice(0, 5));

const byRef = new Map();
for (const r of rows) {
  if (!r.ref.startsWith("trade-")) continue;
  if (!byRef.has(r.ref)) byRef.set(r.ref, {});
  const o = byRef.get(r.ref);
  if (r.type === "binary_stake") o.stake = r.amount;
  if (r.type === "binary_stake_reversal") o.reversal = r.amount;
  if (r.type === "binary_settle_win") o.win = r.amount;
  if (r.type === "binary_settle_loss") o.loss = true;
}

let winMismatch = 0;
let winsChecked = 0;
const mismatchSamples = [];
for (const [ref, o] of byRef) {
  if (o.win == null) continue;
  winsChecked++;
  const stakeAbs = o.stake != null ? Math.abs(o.stake) : null;
  if (stakeAbs == null) {
    winMismatch++;
    if (mismatchSamples.length < 5) mismatchSamples.push({ ref, reason: "no_stake_row", o });
    continue;
  }
  const expected = stakeAbs * 1.8;
  if (Math.abs(o.win - expected) > 0.02) {
    winMismatch++;
    if (mismatchSamples.length < 8)
      mismatchSamples.push({ ref, stake: o.stake, win: o.win, expected, reversal: o.reversal });
  }
}
console.log("binary_settle_win with stake ref checked:", winsChecked, "win!=1.8*stake", winMismatch);
if (mismatchSamples.length) console.log("mismatch samples", mismatchSamples);

let badArith = 0;
for (const r of rows) {
  const x = Number((r.before + r.amount).toFixed(4));
  const y = Number(r.after.toFixed(4));
  if (Math.abs(x - y) > 0.03) badArith++;
}
console.log("before+amount!=after", badArith);
