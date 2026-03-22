import "./landing.css";
import "./about.css";
import { APP_NAME } from "./appBrand";
import { BrandLogo } from "./BrandLogo";

type Props =
  | {
      /** Inside dashboard (demo or live) — return to trading view */
      embeddedInApp: true;
      onBack: () => void;
    }
  | {
      embeddedInApp?: false;
      onBack: () => void;
      onLogin: () => void;
      onRegister: () => void;
      onTryDemo: () => void;
    };

export default function AboutPage(props: Props) {
  const embeddedInApp = props.embeddedInApp === true;
  const onBack = props.onBack;
  return (
    <div
      className={`landing-page about-page landing-ot${embeddedInApp ? " about-page--embedded" : ""}`}
      lang="en"
    >
      <header className="about-top-bar">
        <button type="button" className="about-back" onClick={onBack}>
          {embeddedInApp ? "← Trading" : "← Back"}
        </button>
        <span className="about-top-brand">
          <BrandLogo size={32} className="about-top-logo" />
          <span>{APP_NAME}</span>
        </span>
      </header>

      <main className="about-main">
        <div className="about-hero">
          <p className="about-eyebrow">Platform overview</p>
          <h1 className="about-title">{APP_NAME}</h1>
          <p className="about-lead">
            {APP_NAME} is an online <strong>forex-style trading interface</strong> focused on short-duration{" "}
            <strong>Up / Down</strong> contracts: you take a view on whether price will finish above or below your
            entry when the contract time elapses. Outcomes, stakes, and any payout multiple are defined in the trading
            screens — not on this page. A <strong>demo mode</strong> uses simulated funds; a <strong>live wallet</strong>{" "}
            (after registration) reflects real credits and debits in line with deposits, withdrawals, trades, and any
            other programmes your account is eligible for.
          </p>
        </div>

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
          </ul>
        </section>

        <section className="about-block" aria-labelledby="about-income">
          <h2 id="about-income">How your live balance can change (income &amp; credits)</h2>
          <p className="about-income-intro">
            The following are the <strong>types of movements</strong> the platform records on live accounts, in line
            with backend and wallet rules. Exact amounts, rates, and eligibility appear in-app or in your statements —
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
              system-defined; see your referral area and ledger for what actually applies to you.
            </li>
            <li>
              <strong>Investment yield</strong> — if you hold an active investment product offered in the app, scheduled
              yield may be credited to your wallet on the cadence the product describes. This is not a guaranteed return;
              product terms and risk apply.
            </li>
            <li>
              <strong>Withdrawals</strong> — reduce your available balance when processed; processing rules and limits
              are shown in the withdrawal flow.
            </li>
          </ul>
        </section>

        {embeddedInApp ? (
          <div className="about-cta-row">
            <button type="button" className="landing-ot-btn-main" onClick={onBack}>
              Back to trading
            </button>
          </div>
        ) : (
          <div className="about-cta-row">
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

      <footer className="about-footer">
        <p>{APP_NAME} · Forex · Up / Down contracts · Demo &amp; live wallet</p>
      </footer>
    </div>
  );
}
