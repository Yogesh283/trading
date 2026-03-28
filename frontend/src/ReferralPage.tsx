import { useCallback, useEffect, useState } from "react";
import { loadReferralSummary, type ReferralSummary } from "./api";
import "./funds.css";
import { BrandLogo } from "./BrandLogo";
import { formatInr } from "./fundsConfig";

type Props = {
  token: string;
};

function buildReferralLink(code: string): string {
  if (!code || code === "—") return "";
  const u = new URL(window.location.href);
  u.searchParams.set("ref", code);
  u.hash = "";
  return u.toString();
}

export default function ReferralPage({ token }: Props) {
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
                  <span className="muted referral-inviter-mobile">{data.inviter.mobile}</span>
                </div>
              ) : (
                <p className="muted">You signed up without a promotion code.</p>
              )}
            </section>

            <section className="referral-section referral-section--total-earn" aria-labelledby="referral-total-earn-heading">
              <h2 className="referral-h2" id="referral-total-earn-heading">
                Total earnings
              </h2>
              <div className="referral-total-earn-card">
                <div className="referral-total-earn-hero">
                  <span className="referral-total-earn-label">Total (INR)</span>
                  <span className="referral-total-earn-value">
                    {formatInr(data.totalReferralCommissionInr ?? 0)}
                  </span>
                </div>
                <ul className="referral-total-earn-breakdown">
                  <li>
                    <span className="referral-total-earn-src">Trading (binary)</span>
                    <span className="referral-total-earn-amt">{formatInr(data.bettingCommissionInr ?? 0)}</span>
                  </li>
                  <li>
                    <span className="referral-total-earn-src">Staking (investment add)</span>
                    <span className="referral-total-earn-amt">{formatInr(data.stakingCommissionInr ?? 0)}</span>
                  </li>
                  <li>
                    <span className="referral-total-earn-src">Investment monthly ROI (upline)</span>
                    <span className="referral-total-earn-amt">
                      {formatInr(data.investmentRoiCommissionInr ?? 0)}
                    </span>
                  </li>
                </ul>
              </div>
            </section>

            <section className="referral-section referral-section--schedule">
              <h2 className="referral-h2">Trading level income</h2>
              {!data.referralProgramEnabled ? (
                <p className="muted referral-schedule-warn">
                  Referral program is off — no level payouts on trading amounts.
                </p>
              ) : null}
              <div className="referral-table-wrap">
                <table className="referral-table referral-schedule-table">
                  <thead>
                    <tr>
                      <th>Level</th>
                      <th>Upline</th>
                      <th>Income (% of trading amount)</th>
                      <th title="Total credited to your live wallet from this level (binary + staking)">
                        You received (INR)
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
                          <td>{formatInr(row.receivedInr ?? 0)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="referral-section referral-section--schedule">
              <h2 className="referral-h2">Monthly investment ROI Level Income</h2>
              <div className="referral-table-wrap">
                <table className="referral-table referral-schedule-table">
                  <thead>
                    <tr>
                      <th>Level</th>
                      <th>Upline</th>
                      <th>Income (% of gross monthly yield)</th>
                      <th title="Total credited to your live wallet from this level (monthly ROI upline)">
                        You received (INR)
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data.monthlyRoiLevelSchedule ?? []).length === 0 ? (
                      <tr>
                        <td colSpan={4} className="referral-table-empty">
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
                          <td>{formatInr(row.receivedInr ?? 0)}</td>
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
                      <th className="referral-col-email">Email</th>
                      <th className="referral-col-mobile">Mobile</th>
                      <th>Joined</th>
                      <th>Live wallet</th>
                      <th>Deposits</th>
                      <th>Their code</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.directTeam.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="referral-table-empty">
                          No direct referrals yet — share your promotion link above to grow your team.
                        </td>
                      </tr>
                    ) : (
                      data.directTeam.map((m) => (
                        <tr key={m.id}>
                          <td>{m.name}</td>
                          <td className="referral-email referral-col-email">{m.email}</td>
                          <td className="referral-mobile referral-col-mobile">{m.mobile}</td>
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
