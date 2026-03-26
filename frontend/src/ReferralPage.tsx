import { useCallback, useEffect, useState } from "react";
import { loadReferralSummary, type ReferralSummary } from "./api";
import "./funds.css";
import { BrandLogo } from "./BrandLogo";
import { formatInr } from "./fundsConfig";

type Props = {
  token: string;
  onBack: () => void;
};

function buildReferralLink(code: string): string {
  if (!code || code === "—") return "";
  const u = new URL(window.location.href);
  u.searchParams.set("ref", code);
  u.hash = "";
  return u.toString();
}

export default function ReferralPage({ token, onBack }: Props) {
  const [data, setData] = useState<ReferralSummary | null>(null);
  const [error, setError] = useState("");
  const [copyMsg, setCopyMsg] = useState("");

  const refresh = useCallback(async () => {
    setError("");
    try {
      const s = await loadReferralSummary(token);
      setData(s);
    } catch (e) {
      setData(null);
      setError(e instanceof Error ? e.message : "Load failed");
    }
  }, [token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const link = data ? buildReferralLink(data.selfReferralCode) : "";

  const copyLink = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopyMsg("Copied!");
      window.setTimeout(() => setCopyMsg(""), 2000);
    } catch {
      setCopyMsg("Copy failed — select & copy manually");
      window.setTimeout(() => setCopyMsg(""), 3000);
    }
  };

  const copyCode = async () => {
    if (!data?.selfReferralCode || data.selfReferralCode === "—") return;
    try {
      await navigator.clipboard.writeText(data.selfReferralCode);
      setCopyMsg("Code copied!");
      window.setTimeout(() => setCopyMsg(""), 2000);
    } catch {
      setCopyMsg("Copy failed");
      window.setTimeout(() => setCopyMsg(""), 2000);
    }
  };

  return (
    <div className="funds-page referral-page">
      <button type="button" className="funds-back" onClick={onBack}>
        ← Back
      </button>

      <div className="funds-card referral-card">
        <div className="funds-title-row investment-title-row">
          <BrandLogo size={40} />
          <h1>Promotion</h1>
        </div>
        <p className="funds-network">Share your link. Friends who register join your team — see their activity below.</p>

        {error ? <p className="referral-error">{error}</p> : null}
        {copyMsg ? <p className="referral-copy-toast">{copyMsg}</p> : null}

        {data ? (
          <>
            <section className="referral-section">
              <h2 className="referral-h2">Your promotion code</h2>
              <div className="referral-code-row">
                <code className="referral-code-big">{data.selfReferralCode}</code>
                <button type="button" className="referral-copy-btn" onClick={copyCode}>
                  Copy code
                </button>
              </div>
            </section>

            <section className="referral-section">
              <h2 className="referral-h2">Promotion link</h2>
              {link ? (
                <>
                  <div className="referral-link-box">
                    <input readOnly className="referral-link-input" value={link} aria-label="Promotion link" />
                  </div>
                  <button type="button" className="referral-copy-full" onClick={copyLink}>
                    Copy link
                  </button>
                </>
              ) : (
                <p className="muted">No promotion code on your account yet.</p>
              )}
            </section>

            <section className="referral-section">
              <h2 className="referral-h2">Referred by</h2>
              {data.inviter ? (
                <div className="referral-inviter">
                  <strong>{data.inviter.name}</strong>
                  <span className="muted">{data.inviter.email}</span>
                </div>
              ) : (
                <p className="muted">You signed up without a promotion code.</p>
              )}
            </section>

            <section className="referral-section referral-section--income">
              <h2 className="referral-h2">Your income (commissions)</h2>
              <p className="muted referral-commission-hint">
                Live wallet mein credit hota hai jab team binary trade, staking add, ya monthly investment ROI (upline)
                share. Demo par commission nahi. Binary/staking ke liye &quot;Promotion / level %&quot; alag hai; monthly
                investment ROI upline admin ke &quot;Investment ROI&quot; page se % of gross pool se split hota hai.
              </p>
              <div className="referral-table-wrap referral-income-table-wrap">
                <table className="referral-table referral-income-table">
                  <thead>
                    <tr>
                      <th>Source</th>
                      <th>Amount (INR)</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="referral-income-total">
                      <td>
                        <strong>Total earned</strong>
                      </td>
                      <td>
                        <strong>{formatInr(data.totalReferralCommissionInr ?? 0)}</strong>
                      </td>
                    </tr>
                    <tr>
                      <td>Trading (binary)</td>
                      <td>{formatInr(data.bettingCommissionInr ?? 0)}</td>
                    </tr>
                    <tr>
                      <td>Staking (investment add)</td>
                      <td>{formatInr(data.stakingCommissionInr ?? 0)}</td>
                    </tr>
                    <tr>
                      <td>Investment monthly ROI (upline)</td>
                      <td>{formatInr(data.investmentRoiCommissionInr ?? 0)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            <section className="referral-section referral-section--schedule">
              <h2 className="referral-h2">Level income when a stake is created</h2>
              <p className="muted referral-commission-hint">
                Same schedule for <strong>live binary bets</strong> and <strong>investment stake adds</strong>. Each row
                is the upline at that depth: level 1 is the direct inviter. You only receive a level if that upline
                exists in your referral chain.
                {!data.referralProgramEnabled ? (
                  <span className="referral-schedule-warn"> Referral program is off — no level payouts on stakes.</span>
                ) : null}
              </p>
              <div className="referral-table-wrap">
                <table className="referral-table referral-schedule-table">
                  <thead>
                    <tr>
                      <th>Level</th>
                      <th>Upline</th>
                      <th>Income (% of stake)</th>
                      <th title={`Example at ${formatInr(data.levelIncomeExampleStakeInr ?? 1000)} stake`}>
                        Income (example stake)
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data.betStakeLevelSchedule ?? []).length === 0 ? (
                      <tr>
                        <td colSpan={4} className="referral-table-empty">
                          No level schedule loaded.
                        </td>
                      </tr>
                    ) : (
                      (data.betStakeLevelSchedule ?? []).map((row) => (
                        <tr
                          key={row.level}
                          className={row.paysOut ? undefined : "referral-schedule-row--off"}
                        >
                          <td>{row.level}</td>
                          <td>{row.uplineLabel}</td>
                          <td>{row.percentLabel}</td>
                          <td>
                            {row.paysOut
                              ? formatInr(row.exampleIncomeInr)
                              : "—"}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <p className="muted referral-schedule-foot">
                Example column uses stake{" "}
                <strong>{formatInr(data.levelIncomeExampleStakeInr ?? 1000)}</strong> × level % = commission per trade
                for that depth.
              </p>
            </section>

            <section className="referral-section referral-section--schedule">
              <h2 className="referral-h2">Monthly investment ROI — upline share</h2>
              <p className="muted referral-commission-hint">
                When monthly yield is credited, each enabled level receives this fraction of the <strong>gross</strong>{" "}
                monthly return (before the investor’s net). Same “level 1 = direct inviter” rule.
              </p>
              <div className="referral-table-wrap">
                <table className="referral-table referral-schedule-table">
                  <thead>
                    <tr>
                      <th>Level</th>
                      <th>Upline</th>
                      <th>Income (% of gross monthly yield)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data.monthlyRoiLevelSchedule ?? []).length === 0 ? (
                      <tr>
                        <td colSpan={3} className="referral-table-empty">
                          No ROI level schedule loaded.
                        </td>
                      </tr>
                    ) : (
                      (data.monthlyRoiLevelSchedule ?? []).map((row) => (
                        <tr
                          key={row.level}
                          className={row.paysOut ? undefined : "referral-schedule-row--off"}
                        >
                          <td>{row.level}</td>
                          <td>{row.uplineLabel}</td>
                          <td>{row.percentLabel}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="referral-section">
              <h2 className="referral-h2">Team stats</h2>
              <div className="referral-stats">
                <div className="referral-stat">
                  <span className="referral-stat-value">{data.directCount}</span>
                  <span className="referral-stat-label">Direct</span>
                </div>
                <div className="referral-stat">
                  <span className="referral-stat-value">{data.totalTeamCount}</span>
                  <span className="referral-stat-label">Total downline</span>
                </div>
              </div>
            </section>

            <section className="referral-section">
              <h2 className="referral-h2">Your team (direct)</h2>
              <div className="referral-table-wrap">
                <table className="referral-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Joined</th>
                      <th>Live wallet</th>
                      <th>Deposits</th>
                      <th>Their code</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.directTeam.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="referral-table-empty">
                          Abhi koi direct referral nahi — upar se link share karo.
                        </td>
                      </tr>
                    ) : (
                      data.directTeam.map((m) => (
                        <tr key={m.id}>
                          <td>{m.name}</td>
                          <td className="referral-email">{m.email}</td>
                          <td className="referral-date">
                            {new Date(m.createdAt).toLocaleDateString(undefined, {
                              year: "numeric",
                              month: "short",
                              day: "numeric"
                            })}
                          </td>
                          <td title="Live trading wallet (INR)">{formatInr(m.liveWalletBalanceInr ?? 0)}</td>
                          <td title="Sum of credited on-chain deposits (USDT)">
                            {(m.totalDepositedUsdt ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })} USDT
                          </td>
                          <td>
                            <code className="referral-code-pill">{m.selfReferralCode}</code>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        ) : !error ? (
          <p className="muted">Loading…</p>
        ) : null}
      </div>
    </div>
  );
}
