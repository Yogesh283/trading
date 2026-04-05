import { useCallback, useEffect, useState } from "react";
import { loadReferralSummary, type ReferralSummary } from "./api";
import "./funds.css";
import { BrandLogo } from "./BrandLogo";
import { useGlobalAlert } from "./GlobalAlertContext";

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
  const { showAlert } = useGlobalAlert();
  const [data, setData] = useState<ReferralSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);

  const refresh = useCallback(async () => {
    setSummaryLoading(true);
    try {
      const s = await loadReferralSummary(token);
      setData(s);
    } catch (e) {
      setData(null);
      showAlert(e instanceof Error ? e.message : "Load failed", "error");
    } finally {
      setSummaryLoading(false);
    }
  }, [token, showAlert]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const link = data ? buildReferralLink(data.selfReferralCode) : "";

  const copyLink = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      showAlert("Copied!", "info");
    } catch {
      showAlert("Copy failed — select & copy manually", "error");
    }
  };

  const copyCode = async () => {
    if (!data?.selfReferralCode || data.selfReferralCode === "—") return;
    try {
      await navigator.clipboard.writeText(data.selfReferralCode);
      showAlert("Code copied!", "info");
    } catch {
      showAlert("Copy failed", "error");
    }
  };

  return (
    <div className="funds-page referral-page">
      <div className="funds-card referral-card">
        <div className="funds-title-row promotion-title-row">
          <BrandLogo size={40} />
          <h1>Promotion</h1>
          <button
            type="button"
            className="promotion-refresh-btn"
            onClick={() => void refresh()}
            disabled={summaryLoading}
            title="Refresh promotion data"
            aria-busy={summaryLoading}
          >
            {summaryLoading ? "…" : "Refresh"}
          </button>
        </div>

        {data ? (
          <>
            <section className="referral-section">
              <h2 className="referral-h2">Your referral code</h2>
              <div className="referral-code-row">
                <code className="referral-code-big">{data.selfReferralCode}</code>
                <button type="button" className="referral-copy-btn" onClick={copyCode}>
                  Copy code
                </button>
              </div>
            </section>

            <section className="referral-section">
              <h2 className="referral-h2">Referral link</h2>
              {link ? (
                <>
                  <div className="referral-link-box">
                    <input readOnly className="referral-link-input" value={link} aria-label="Referral link" />
                  </div>
                  <button type="button" className="referral-copy-full" onClick={copyLink}>
                    Copy link
                  </button>
                </>
              ) : (
                <p className="muted">No referral code on your account yet.</p>
              )}
            </section>
          </>
        ) : summaryLoading ? (
          <p className="promotion-loading muted">Loading…</p>
        ) : (
          <p className="promotion-error muted" role="status">
            Could not load promotion data. Tap <strong>Refresh</strong> to try again.
          </p>
        )}
      </div>
    </div>
  );
}
