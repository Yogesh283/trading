import { FormEvent, useCallback, useEffect, useState } from "react";
import { createSupportTicket, loadSupportTickets, type SupportTicket } from "./api";
import "./funds.css";
import { BrandLogo } from "./BrandLogo";

type Props = {
  token: string;
};

export default function HelpTicketPage({ token }: Props) {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState("");

  const refresh = useCallback(async () => {
    setError("");
    try {
      const list = await loadSupportTickets(token);
      setTickets(list);
    } catch (e) {
      setTickets([]);
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSuccess("");
    setError("");
    setSubmitting(true);
    try {
      const t = await createSupportTicket(token, subject.trim(), body.trim());
      setTickets((prev) => [t, ...prev]);
      setSubject("");
      setBody("");
      setSuccess(`Ticket created: ${t.id}. Our team will review it.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create ticket");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="funds-page referral-page help-ticket-page">
      <div className="funds-card referral-card">
        <div className="funds-title-row investment-title-row">
          <BrandLogo size={40} />
          <h1>Help &amp; support</h1>
        </div>
        <p className="funds-network">
          Create a support ticket with your question or issue. You will receive a ticket ID — keep it for reference.
        </p>

        {error ? <p className="referral-error">{error}</p> : null}
        {success ? <p className="referral-copy-toast">{success}</p> : null}

        <form className="help-ticket-form" onSubmit={onSubmit}>
          <label className="help-ticket-label">
            Subject
            <input
              className="help-ticket-input"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              maxLength={200}
              placeholder="Brief summary"
              required
              autoComplete="off"
            />
          </label>
          <label className="help-ticket-label">
            Message
            <textarea
              className="help-ticket-textarea"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={8000}
              rows={6}
              placeholder="Describe your issue in detail"
              required
            />
          </label>
          <button type="submit" className="help-ticket-submit" disabled={submitting}>
            {submitting ? "Sending…" : "Generate ticket"}
          </button>
        </form>

        <section className="referral-section">
          <h2 className="referral-h2">Your tickets</h2>
          {loading ? (
            <p className="muted">Loading…</p>
          ) : tickets.length === 0 ? (
            <p className="muted">No tickets yet.</p>
          ) : (
            <ul className="help-ticket-list">
              {tickets.map((t) => (
                <li key={t.id} className="help-ticket-item">
                  <div className="help-ticket-item-head">
                    <code className="help-ticket-id">{t.id}</code>
                    <span className={`help-ticket-status help-ticket-status--${t.status}`}>{t.status}</span>
                  </div>
                  <strong className="help-ticket-subj">{t.subject}</strong>
                  <p className="help-ticket-body">{t.body}</p>
                  <time className="help-ticket-time" dateTime={t.createdAt}>
                    {new Date(t.createdAt).toLocaleString(undefined, {
                      dateStyle: "medium",
                      timeStyle: "short"
                    })}
                  </time>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
