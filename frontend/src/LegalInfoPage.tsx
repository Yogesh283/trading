import "./landing.css";
import "./about.css";
import { APP_NAME, SUPPORT_EMAIL } from "./appBrand";
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

export default function LegalInfoPage(props: Props) {
  const embedded = props.embeddedInApp === true;
  const { kind, onGoTerms, onGoPrivacy, onGoAbout } = props;
  const standaloneCta = embedded ? null : (props as Extract<Props, { embeddedInApp?: false }>);

  const title = kind === "terms" ? "Terms & Conditions" : "Privacy Policy";
  const eyebrow = kind === "terms" ? "Legal terms" : "Privacy & data";

  const effective = new Date().toLocaleDateString("en-GB", { year: "numeric", month: "long", day: "numeric" });

  return (
    <div
      className={`landing-page about-page landing-ot legal-info-page${embedded ? " about-page--embedded" : ""}`}
      lang="en"
    >
      <header className="about-top-bar">
        <span className="about-top-brand">
          <BrandLogo size={32} className="about-top-logo" />
          <span>{APP_NAME}</span>
        </span>
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
              : `This Privacy Policy explains how ${APP_NAME} collects, uses, stores, and protects personal information when you use our website and apps. It should be read together with our Terms & Conditions.`}
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
              </p>
            </section>
          </>
        ) : (
          <>
            <section className="about-block" aria-labelledby="priv-collect">
              <h2 id="priv-collect">1. Information we may collect</h2>
              <ul className="about-list">
                <li>
                  <strong>Account data</strong> — name, mobile number, country code, and credentials needed to register
                  and sign in.
                </li>
                <li>
                  <strong>Activity data</strong> — trading and wallet transactions, support tickets, device/browser
                  metadata, and logs for security and operations.
                </li>
                <li>
                  <strong>Technical data</strong> — IP address, approximate location, cookies or local storage tokens
                  used to keep you signed in or remember preferences.
                </li>
              </ul>
            </section>
            <section className="about-block" aria-labelledby="priv-use">
              <h2 id="priv-use">2. How we use information</h2>
              <ul className="about-list">
                <li>To provide, secure, and improve the platform (authentication, fraud prevention, support).</li>
                <li>To process deposits, withdrawals, and wallet movements in line with our processes.</li>
                <li>To meet legal, regulatory, and tax obligations where applicable.</li>
                <li>To send service-related notices; marketing only where you have opted in where required.</li>
              </ul>
            </section>
            <section className="about-block" aria-labelledby="priv-legal">
              <h2 id="priv-legal">3. Legal bases &amp; retention</h2>
              <p className="about-income-intro">
                We process data as needed to perform our contract with you, comply with law, and pursue legitimate
                interests (such as security and product improvement) balanced where required against your rights.
                Retention periods depend on legal requirements, dispute resolution, and operational need; some records may
                be kept longer where the law requires.
              </p>
            </section>
            <section className="about-block" aria-labelledby="priv-share">
              <h2 id="priv-share">4. Sharing</h2>
              <p className="about-income-intro">
                We do not sell your personal information. We may share data with service providers (hosting, analytics,
                communications) under confidentiality obligations, and with authorities when legally required or to protect
                rights and safety.
              </p>
            </section>
            <section className="about-block" aria-labelledby="priv-security">
              <h2 id="priv-security">5. Security</h2>
              <p className="about-income-intro">
                We use reasonable technical and organisational measures to protect data. No online service is completely
                secure; you should use a strong password and protect your devices.
              </p>
            </section>
            <section className="about-block" aria-labelledby="priv-rights">
              <h2 id="priv-rights">6. Your rights</h2>
              <p className="about-income-intro">
                Depending on your region, you may have rights to access, correct, delete, or restrict processing of your
                personal data, or to object to certain uses. Contact us at the email below; we may need to verify your
                identity before acting.
              </p>
            </section>
            <section className="about-block" aria-labelledby="priv-changes">
              <h2 id="priv-changes">7. Changes</h2>
              <p className="about-income-intro">
                We may update this Privacy Policy from time to time. The “Last updated” date at the top will change when
                we do; material changes may be communicated through the app or by email where appropriate.
              </p>
            </section>
            <section className="about-block" aria-labelledby="priv-contact">
              <h2 id="priv-contact">8. Contact</h2>
              <p className="about-income-intro">
                Privacy questions:{" "}
                <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
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
        </p>
      </footer>
    </div>
  );
}
