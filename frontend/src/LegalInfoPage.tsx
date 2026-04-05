import "./landing.css";
import "./about.css";
import { APP_NAME, LEGAL_LAST_UPDATED_ISO, SUPPORT_EMAIL, SUPPORT_TELEGRAM_URL } from "./appBrand";
import { BrandLogo } from "./BrandLogo";

export type LegalDocKind = "terms" | "privacy";

type Props =
  | {
      kind: LegalDocKind;
      embeddedInApp: true;
      onGoTerms: () => void;
      onGoPrivacy: () => void;
      onGoAbout: () => void;
    }
  | {
      kind: LegalDocKind;
      embeddedInApp?: false;
      onGoTerms: () => void;
      onGoPrivacy: () => void;
      onGoAbout: () => void;
      onLogin: () => void;
      onRegister: () => void;
      onTryDemo: () => void;
      /** Public legal pages: return to landing. */
      onBackToHome?: () => void;
    };

function LegalFooterLinks(props: { kind: LegalDocKind } & Pick<Props, "onGoTerms" | "onGoPrivacy" | "onGoAbout">) {
  const { kind, onGoTerms, onGoPrivacy, onGoAbout } = props;
  return (
    <p className="about-footer-legal">
      {kind === "terms" ? (
        <span className="about-footer-legal-current" aria-current="page">
          Terms
        </span>
      ) : (
        <button type="button" className="landing-footer-about-link" onClick={onGoTerms}>
          Terms
        </button>
      )}
      <span className="about-footer-legal-sep" aria-hidden>
        ·
      </span>
      {kind === "privacy" ? (
        <span className="about-footer-legal-current" aria-current="page">
          Privacy
        </span>
      ) : (
        <button type="button" className="landing-footer-about-link" onClick={onGoPrivacy}>
          Privacy
        </button>
      )}
      <span className="about-footer-legal-sep" aria-hidden>
        ·
      </span>
      <button type="button" className="landing-footer-about-link" onClick={onGoAbout}>
        About
      </button>
    </p>
  );
}

function formatLegalDate(iso: string): string {
  const [y, m, d] = iso.split("-").map((x) => parseInt(x, 10));
  if (!y || !m || !d) return iso;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC"
  });
}

export default function LegalInfoPage(props: Props) {
  const embedded = props.embeddedInApp === true;
  const { kind, onGoTerms, onGoPrivacy, onGoAbout } = props;
  const standaloneCta = embedded ? null : (props as Extract<Props, { embeddedInApp?: false }>);
  const onBackToHome =
    !embedded && "onBackToHome" in props && typeof props.onBackToHome === "function"
      ? props.onBackToHome
      : undefined;

  const title = kind === "terms" ? "Terms & Conditions" : "Privacy Policy";
  const eyebrow = kind === "terms" ? "Legal terms" : "Privacy & data";
  const effective = formatLegalDate(LEGAL_LAST_UPDATED_ISO);

  return (
    <div
      className={`landing-page about-page landing-ot legal-info-page${embedded ? " about-page--embedded" : ""}`}
      lang="en"
    >
      <header className={`about-top-bar${onBackToHome ? " about-top-bar--with-back" : ""}`}>
        {onBackToHome ? (
          <button type="button" className="about-back-btn" onClick={onBackToHome}>
            ← Home
          </button>
        ) : (
          <span className="about-top-bar-spacer" aria-hidden />
        )}
        <span className="about-top-brand">
          <BrandLogo size={32} className="about-top-logo" />
          <span>{APP_NAME}</span>
        </span>
        {onBackToHome ? <span className="about-top-bar-spacer" aria-hidden /> : null}
      </header>

      <main className="about-main">
        <div className="about-hero">
          <p className="about-eyebrow">{eyebrow}</p>
          <h1 className="about-title">{title}</h1>
          <p className="legal-doc-effective">
            <strong>Last updated:</strong> {effective}
          </p>
          <p className="legal-doc-intro">
            {kind === "terms"
              ? `These Terms & Conditions (“Terms”) govern your access to and use of ${APP_NAME} and related services. By registering or using the platform, you agree to them. If you do not agree, do not use the service.`
              : `This Privacy Policy explains how ${APP_NAME} (“we”, “us”) collects, uses, stores, and protects personal information when you use our website, web app, or related services. It should be read together with our Terms & Conditions. By using the service, you acknowledge this policy.`}
          </p>
        </div>

        {kind === "terms" ? (
          <>
            <section className="about-block" aria-labelledby="terms-accept">
              <h2 id="terms-accept">1. Acceptance</h2>
              <p className="about-income-intro">
                By creating an account, logging in, or using any part of {APP_NAME}, you confirm that you have read and
                accept these Terms and any policies referenced here (including the Privacy Policy). We may update these
                Terms; continued use after changes constitutes acceptance where permitted by law.
              </p>
            </section>
            <section className="about-block" aria-labelledby="terms-service">
              <h2 id="terms-service">2. The service</h2>
              <ul className="about-list">
                <li>
                  <strong>{APP_NAME}</strong> provides an online trading-style interface, including short-duration{" "}
                  <strong>directional contracts</strong> on quoted symbols, charting, and wallet features.
                </li>
                <li>
                  <strong>Demo mode</strong> uses simulated funds for practice. <strong>Live mode</strong> relates to
                  funded activity, deposits, withdrawals, and real balance movements as shown in-app.
                </li>
                <li>
                  Market quotes, payouts, fees, timeframes, and product rules are displayed in the application. Nothing on
                  this page overrides or adds to the trade confirmation screens.
                </li>
              </ul>
            </section>
            <section className="about-block" aria-labelledby="terms-eligibility">
              <h2 id="terms-eligibility">3. Eligibility &amp; account</h2>
              <ul className="about-list">
                <li>You must provide accurate registration information and keep credentials secure.</li>
                <li>
                  You may need to meet age, jurisdiction, and verification requirements imposed by us or applicable law.
                  We may refuse, suspend, or close accounts that breach these Terms or legal obligations.
                </li>
                <li>
                  One person should not operate multiple accounts to evade limits or abuse promotions unless we expressly
                  allow it in writing.
                </li>
              </ul>
            </section>
            <section className="about-block" aria-labelledby="terms-risk">
              <h2 id="terms-risk">4. Risk &amp; no advice</h2>
              <p className="about-income-intro">
                Trading and short-horizon contracts involve substantial risk of loss. Past or simulated performance does
                not guarantee future results. {APP_NAME} does <strong>not</strong> provide investment, tax, or legal
                advice. You are solely responsible for decisions and for understanding rules shown before each trade.
              </p>
            </section>
            <section className="about-block" aria-labelledby="terms-wallet">
              <h2 id="terms-wallet">5. Wallets, deposits &amp; withdrawals</h2>
              <ul className="about-list">
                <li>Live wallet balances and ledger entries follow the processes and currencies shown in the app.</li>
                <li>
                  Deposits and withdrawals may be subject to verification, limits, processing times, network fees, and
                  compliance checks.
                </li>
                <li>
                  Promotional, referral, or investment features (if available) have their own rules; conflicts are
                  resolved per in-app disclosures and these Terms.
                </li>
              </ul>
            </section>
            <section className="about-block" aria-labelledby="terms-prohibited">
              <h2 id="terms-prohibited">6. Prohibited conduct</h2>
              <p className="about-income-intro">You agree not to:</p>
              <ul className="about-list">
                <li>Use the service for fraud, money laundering, market manipulation, or unlawful activity.</li>
                <li>Attempt to interfere with systems, other users, or security (including probing, scraping, or overload).</li>
                <li>Misrepresent identity or use another person&apos;s account without permission.</li>
              </ul>
            </section>
            <section className="about-block" aria-labelledby="terms-liability">
              <h2 id="terms-liability">7. Limitation of liability</h2>
              <p className="about-income-intro">
                To the maximum extent permitted by law, {APP_NAME} and its operators are not liable for indirect,
                incidental, or consequential losses, loss of profits, or service interruptions. Nothing in these Terms
                excludes liability that cannot be excluded under applicable law.
              </p>
            </section>
            <section className="about-block" aria-labelledby="terms-contact">
              <h2 id="terms-contact">8. Contact</h2>
              <p className="about-income-intro">
                Questions about these Terms:{" "}
                <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
                {" · "}
                <a href={SUPPORT_TELEGRAM_URL} target="_blank" rel="noopener noreferrer">
                  Telegram
                </a>
              </p>
            </section>
          </>
        ) : (
          <>
            <section className="about-block" aria-labelledby="priv-scope">
              <h2 id="priv-scope">1. Scope &amp; who we are</h2>
              <p className="about-income-intro">
                This policy applies to personal data processed in connection with {APP_NAME} services accessed via the web
                or compatible clients. The operator responsible for the platform is identified in your account area or
                contact correspondence; privacy requests may be sent to{" "}
                <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> or via{" "}
                <a href={SUPPORT_TELEGRAM_URL} target="_blank" rel="noopener noreferrer">
                  Telegram
                </a>
                .
              </p>
            </section>
            <section className="about-block" aria-labelledby="priv-collect">
              <h2 id="priv-collect">2. Information we collect</h2>
              <ul className="about-list">
                <li>
                  <strong>Identity &amp; account</strong> — name, phone number (with country code), email if provided,
                  login identifiers, and password or OTP verification data.
                </li>
                <li>
                  <strong>Trading &amp; wallet</strong> — orders, balances, deposits, withdrawals, referral or promotion
                  activity, and related timestamps as recorded in our systems.
                </li>
                <li>
                  <strong>Support &amp; communications</strong> — messages you send to support, including ticket content
                  and metadata.
                </li>
                <li>
                  <strong>Technical &amp; usage</strong> — IP address, device/browser type, approximate location, session
                  tokens, timestamps, and logs for security, debugging, and abuse prevention.
                </li>
              </ul>
            </section>
            <section className="about-block" aria-labelledby="priv-use">
              <h2 id="priv-use">3. How we use your information</h2>
              <ul className="about-list">
                <li>To create and maintain your account, authenticate you, and provide the trading and wallet features.</li>
                <li>To process transactions, settle trades, and comply with financial crime and regulatory obligations.</li>
                <li>To detect, prevent, and investigate fraud, abuse, and security incidents.</li>
                <li>To improve reliability and performance of the platform (including aggregated or de-identified analytics).</li>
                <li>To send service-related notices (e.g. security alerts); marketing only where you have opted in where required.</li>
              </ul>
            </section>
            <section className="about-block" aria-labelledby="priv-cookies">
              <h2 id="priv-cookies">4. Cookies, storage &amp; similar technologies</h2>
              <p className="about-income-intro">
                We use browser storage (such as cookies or local storage) to keep you signed in, remember preferences,
                and protect sessions. You can control cookies in your browser; disabling essential cookies may prevent
                parts of the service from working.
              </p>
            </section>
            <section className="about-block" aria-labelledby="priv-legal">
              <h2 id="priv-legal">5. Legal bases &amp; retention</h2>
              <p className="about-income-intro">
                We process data as necessary to perform our contract with you, comply with law, and pursue legitimate
                interests (such as security and service improvement), balanced against your rights where applicable.
                Retention depends on legal requirements, dispute resolution, and operational need; some records may be
                kept longer where required by law (e.g. financial or tax records).
              </p>
            </section>
            <section className="about-block" aria-labelledby="priv-share">
              <h2 id="priv-share">6. Sharing &amp; processors</h2>
              <p className="about-income-intro">
                We do <strong>not</strong> sell your personal information. We may share data with trusted service
                providers (hosting, email/SMS delivery, payment or blockchain infrastructure, analytics) who process
                data on our instructions under appropriate safeguards. We may disclose information to law enforcement,
                regulators, or other parties when required by law or to protect rights, safety, and property.
              </p>
            </section>
            <section className="about-block" aria-labelledby="priv-transfer">
              <h2 id="priv-transfer">7. International transfers</h2>
              <p className="about-income-intro">
                Your data may be processed in countries where we or our providers operate. Where required, we use
                appropriate safeguards (such as contractual clauses) for cross-border transfers.
              </p>
            </section>
            <section className="about-block" aria-labelledby="priv-security">
              <h2 id="priv-security">8. Security</h2>
              <p className="about-income-intro">
                We apply reasonable technical and organisational measures to protect personal data. No method of
                transmission over the internet is 100% secure; you should use a strong password and protect your devices.
              </p>
            </section>
            <section className="about-block" aria-labelledby="priv-rights">
              <h2 id="priv-rights">9. Your rights</h2>
              <p className="about-income-intro">
                Depending on your location, you may have rights to access, correct, delete, or restrict processing of your
                personal data, to object to certain processing, or to lodge a complaint with a supervisory authority. To
                exercise rights, contact us at the email below; we may need to verify your identity. If you are in
                India, applicable rights under the Digital Personal Data Protection Act (where in force) may apply
                alongside this policy.
              </p>
            </section>
            <section className="about-block" aria-labelledby="priv-minors">
              <h2 id="priv-minors">10. Children</h2>
              <p className="about-income-intro">
                {APP_NAME} is not directed at children. You must meet the minimum age in your jurisdiction (typically
                18) to register. We do not knowingly collect data from minors; if you believe we have, contact us so we
                can delete it.
              </p>
            </section>
            <section className="about-block" aria-labelledby="priv-changes">
              <h2 id="priv-changes">11. Changes to this policy</h2>
              <p className="about-income-intro">
                We may update this Privacy Policy from time to time. The “Last updated” date at the top will change when
                we do; we may notify you through the app or by email for material changes where appropriate.
              </p>
            </section>
            <section className="about-block" aria-labelledby="priv-contact">
              <h2 id="priv-contact">12. Contact</h2>
              <p className="about-income-intro">
                For privacy questions or requests:{" "}
                <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
                {" · "}
                <a href={SUPPORT_TELEGRAM_URL} target="_blank" rel="noopener noreferrer">
                  Telegram
                </a>
              </p>
            </section>
          </>
        )}

        {standaloneCta ? (
          <div className="about-cta-row">
            <button type="button" className="landing-ot-btn-main" onClick={standaloneCta.onTryDemo}>
              Try demo
            </button>
            <button type="button" className="landing-btn-outline" onClick={standaloneCta.onRegister}>
              Register
            </button>
            <button type="button" className="landing-ot-btn-ghost" onClick={standaloneCta.onLogin}>
              Log in
            </button>
          </div>
        ) : null}
      </main>

      <footer className="about-footer">
        <LegalFooterLinks kind={kind} onGoTerms={onGoTerms} onGoPrivacy={onGoPrivacy} onGoAbout={onGoAbout} />
        <p>{APP_NAME}</p>
        <p className="about-footer-contact">
          Contact:{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
          {" · "}
          <a href={SUPPORT_TELEGRAM_URL} target="_blank" rel="noopener noreferrer">
            Telegram
          </a>
        </p>
      </footer>
    </div>
  );
}
