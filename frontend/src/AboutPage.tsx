import "./landing.css";
import "./about.css";
import { APP_NAME, SUPPORT_EMAIL, SUPPORT_TELEGRAM_URL } from "./appBrand";
import { BrandLogo } from "./BrandLogo";

type Props =
  | {
      embeddedInApp: true;
      onOpenTerms?: () => void;
      onOpenPrivacy?: () => void;
    }
  | {
      embeddedInApp?: false;
      onLogin: () => void;
      onRegister: () => void;
      onTryDemo: () => void;
      /** Return to landing (public About only). */
      onBackToHome?: () => void;
      onOpenTerms?: () => void;
      onOpenPrivacy?: () => void;
    };

const WHY_ITEMS = [
  {
    title: "Charts first",
    desc: "Live-style candles and clear timeframes so you can see context before placing a trade."
  },
  {
    title: "Simple flow",
    desc: "Direction, amount, and contract time in one place — rules are shown before you confirm."
  },
  {
    title: "Demo & live",
    desc: "Practice on demo with virtual funds; switch to a funded wallet when you are ready."
  },
  {
    title: "Web & mobile web",
    desc: "Use the same interface in your browser on phone or desktop — no install required for web."
  }
] as const;

const VALUE_ITEMS = [
  { title: "Clarity", desc: "We focus on readable charts and transparent trade rules in the app." },
  { title: "Control", desc: "You choose size and duration; outcomes follow the rules shown at entry." },
  { title: "Support", desc: "Reach us by email for account or technical questions." }
] as const;

export default function AboutPage(props: Props) {
  const embeddedInApp = props.embeddedInApp === true;
  const onOpenTerms = props.onOpenTerms;
  const onOpenPrivacy = props.onOpenPrivacy;
  const showLegalLinks = Boolean(onOpenTerms && onOpenPrivacy);
  const onBackToHome =
    !embeddedInApp && "onBackToHome" in props && typeof props.onBackToHome === "function"
      ? props.onBackToHome
      : undefined;

  return (
    <div
      className={`landing-page about-page about-page--qx landing-ot${embeddedInApp ? " about-page--embedded" : ""}`}
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

      <main className="about-main about-main--qx">
        <section className="about-qx-hero" aria-labelledby="about-qx-title">
          <p className="about-qx-hero-label">About us</p>
          <h1 id="about-qx-title" className="about-qx-hero-title">
            Who we are
          </h1>
          <p className="about-qx-hero-lead">
            {APP_NAME} is a web-based trading interface built around <strong>short-duration Up / Down</strong> contracts
            on forex-style symbols. We aim to keep the experience straightforward: charts, timing, and wallet actions in
            one place — similar in spirit to how leading platforms present their story, without promising returns on
            this page.
          </p>
        </section>

        <section className="about-qx-strip" aria-label="Highlights">
          <div className="about-qx-strip-inner">
            <div className="about-qx-stat">
              <span className="about-qx-stat-val">Web</span>
              <span className="about-qx-stat-label">Browser platform</span>
            </div>
            <div className="about-qx-stat">
              <span className="about-qx-stat-val">Demo</span>
              <span className="about-qx-stat-label">Practice balance</span>
            </div>
            <div className="about-qx-stat">
              <span className="about-qx-stat-val">FX-style</span>
              <span className="about-qx-stat-label">Charts &amp; quotes</span>
            </div>
            <div className="about-qx-stat">
              <span className="about-qx-stat-val">Wallet</span>
              <span className="about-qx-stat-label">Deposits &amp; withdrawals</span>
            </div>
            <div className="about-qx-stat">
              <span className="about-qx-stat-val">AI</span>
              <span className="about-qx-stat-label">Optional chart insight (live)</span>
            </div>
          </div>
        </section>

        <section className="about-qx-section" aria-labelledby="about-mission">
          <h2 id="about-mission" className="about-qx-h2">
            Our mission
          </h2>
          <p className="about-qx-prose">
            To give traders a <strong>clear, fast UI</strong> for directional trades with visible rules and timing — so you
            can learn on demo and move to live only when you choose. We do not provide personalised investment advice;
            markets carry risk.
          </p>
        </section>

        <section className="about-qx-section about-qx-section--muted" aria-labelledby="about-values">
          <h2 id="about-values" className="about-qx-h2">
            What we stand for
          </h2>
          <ul className="about-qx-value-grid">
            {VALUE_ITEMS.map((v) => (
              <li key={v.title} className="about-qx-value-card">
                <h3 className="about-qx-value-title">{v.title}</h3>
                <p className="about-qx-value-desc">{v.desc}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="about-qx-section" aria-labelledby="about-why">
          <h2 id="about-why" className="about-qx-h2">
            Why traders use {APP_NAME}
          </h2>
          <ul className="about-qx-why-grid">
            {WHY_ITEMS.map((item) => (
              <li key={item.title} className="about-qx-why-card">
                <h3 className="about-qx-why-title">{item.title}</h3>
                <p className="about-qx-why-desc">{item.desc}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="about-block" aria-labelledby="about-product">
          <h2 id="about-product">Product</h2>
          <ul className="about-list">
            <li>
              <strong>Forex pairs</strong> — trade direction on major FX symbols with live-style quotes and charting in
              the app.
            </li>
            <li>
              <strong>Up / Down contracts</strong> — fixed-duration, fixed-stake style: win/loss is determined at expiry
              against the rules shown before you confirm each trade.
            </li>
            <li>
              <strong>Wallet (live)</strong> — balance is held in the platform wallet currency shown in your account;
              deposits and withdrawals follow the flows and checks enabled for your jurisdiction or operator.
            </li>
            <li>
              <strong>Demo</strong> — same interface with practice balance; no real money at risk and no real payouts.
            </li>
            <li>
              <strong>Chart AI insight</strong> — optional on-chart hint (see{" "}
              <a href="#about-ai" className="about-inline-link">
                AI connection
              </a>
              ).
            </li>
          </ul>
        </section>

        <section className="about-qx-section about-qx-section--muted" aria-labelledby="about-ai">
          <h2 id="about-ai" className="about-qx-h2">
            Chart AI — connection &amp; billing
          </h2>
          <p className="about-qx-prose">
            The <strong>AI</strong> button on the live chart sends a <strong>short snapshot</strong> of chart context (for
            example symbol, timeframe, and recent price direction) to our servers. When AI is enabled, that request is
            processed using <strong>OpenAI</strong> (or a compatible API) — the same class of technology used for
            natural-language and signal-style responses. We do <strong>not</strong> use this feature to place trades for
            you; it only returns an <strong>educational bias hint</strong> on the chart for a limited time. It is{" "}
            <strong>not</strong> personalised investment advice and <strong>not</strong> a guarantee of market direction.
          </p>
          <ul className="about-list about-list--compact">
            <li>
              <strong>Live wallet only</strong> — AI insight is available when your account is on <strong>Live</strong>,
              not on Demo.
            </li>
            <li>
              <strong>Pay per use</strong> — each successful insight request debits a small fixed amount (typically{" "}
              <strong>₹1 INR</strong>) from your <strong>live wallet</strong>. If your live balance is below that amount,
              the feature cannot run.
            </li>
            <li>
              <strong>Operator configuration</strong> — whether AI is available at all depends on the server having a
              valid API key and settings maintained by the operator.
            </li>
            <li>
              <strong>Privacy</strong> — only the data needed to describe the current chart context is sent for that
              request. See our{" "}
              {onOpenPrivacy ? (
                <button type="button" className="about-inline-link about-inline-link--btn" onClick={onOpenPrivacy}>
                  Privacy Policy
                </button>
              ) : (
                <span className="about-inline-link about-inline-link--static">Privacy Policy</span>
              )}{" "}
              for how we handle personal data in general.
            </li>
          </ul>
        </section>

        <section className="about-block" aria-labelledby="about-income">
          <h2 id="about-income">How your live balance can change (income &amp; credits)</h2>
          <p className="about-income-intro">
            The following are the <strong>types of movements</strong> the platform records on live accounts, in line with
            backend and wallet rules. Exact amounts, rates, and eligibility appear in-app or in your statements —
            nothing here is a promise of profit.
          </p>
          <ul className="about-list">
            <li>
              <strong>Trading — contract settlement</strong> — winning Up/Down contracts credit your wallet per the
              payout rules applied to that trade; losing contracts reduce balance by the staked amount (and any fees
              shown in the app).
            </li>
            <li>
              <strong>Deposits</strong> — funds are credited to your live wallet after a deposit is completed and, where
              required, reviewed or confirmed through the platform&apos;s process.
            </li>
            <li>
              <strong>Referral / network (level income)</strong> — on eligible live activity, small share-based credits
              may be applied to uplines in your referral structure, as configured on the server. Rates and depth are
              system-defined; see your promotion area and ledger for what actually applies to you.
            </li>
            <li>
              <strong>Withdrawals</strong> — reduce your available balance when processed; processing rules and limits are
              shown in the withdrawal flow.
            </li>
          </ul>
        </section>

        <section className="about-qx-contact" aria-labelledby="about-contact">
          <h2 id="about-contact" className="about-qx-h2 about-qx-h2--center">
            Contact &amp; support
          </h2>
          <p className="about-qx-contact-text">
            Questions about your account or the platform? Write to us at{" "}
            <a href={`mailto:${SUPPORT_EMAIL}`} className="about-qx-mail">
              {SUPPORT_EMAIL}
            </a>
            , or join us on{" "}
            <a href={SUPPORT_TELEGRAM_URL} className="about-qx-mail" target="_blank" rel="noopener noreferrer">
              Telegram
            </a>
            .
          </p>
        </section>

        {embeddedInApp ? null : (
          <div className="about-cta-row about-cta-row--qx">
            <button type="button" className="landing-ot-btn-main" onClick={props.onTryDemo}>
              Try demo
            </button>
            <button type="button" className="landing-btn-outline" onClick={props.onRegister}>
              Register
            </button>
            <button type="button" className="landing-ot-btn-ghost" onClick={props.onLogin}>
              Log in
            </button>
          </div>
        )}
      </main>

      <footer className="about-footer about-footer--qx">
        {showLegalLinks ? (
          <p className="about-footer-legal">
            <button type="button" className="landing-footer-about-link" onClick={onOpenTerms}>
              Terms &amp; Conditions
            </button>
            <span className="about-footer-legal-sep" aria-hidden>
              ·
            </span>
            <button type="button" className="landing-footer-about-link" onClick={onOpenPrivacy}>
              Privacy Policy
            </button>
          </p>
        ) : null}
        <p>{APP_NAME} · Forex-style charts · Up / Down contracts · Demo &amp; live wallet</p>
        <p className="about-footer-contact">
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
