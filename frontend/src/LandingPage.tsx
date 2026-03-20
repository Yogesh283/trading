import { useCallback, useEffect, useState } from "react";
import "./landing.css";
import { APP_NAME } from "./appBrand";
import { BrandLogo } from "./BrandLogo";

const PILL_ITEMS = [
  "Modern platform",
  "Useful features",
  "Easy start",
  "Learning center",
  "Quick withdrawals",
  "Trusted experience"
];

const DEMO_TILES = [
  {
    title: "Demo account for practice",
    desc: "Trade with virtual funds. Reset anytime — no card required to try the charts.",
    cta: "Try demo",
    action: "demo" as const
  },
  {
    title: "Learn before you risk",
    desc: "Explore timeframes, stakes, and outcomes in a safe environment.",
    cta: "Open demo",
    action: "demo" as const
  },
  {
    title: "You choose amount & duration",
    desc: "Flexible trade sizes and expiry-style timing so you stay in control.",
    cta: "See platform",
    action: "register" as const
  },
  {
    title: "Negative balance protection",
    desc: "On demo you never owe the platform. Live: only risk what you deposit.",
    cta: "Learn more",
    action: "features" as const
  }
];

const SUPPORT_COLS = [
  {
    title: "24/7 support",
    desc: "Help when you need it — account, deposits, and platform questions."
  },
  {
    title: "Clear charts",
    desc: "Live-style price feed and candlesticks so you can read the market."
  },
  {
    title: "Strategies & practice",
    desc: "Build habits on demo, then move to live funding when you are ready."
  }
];

const TESTIMONIALS = [
  {
    initial: "R",
    name: "Rahul K.",
    title: "Easy to start",
    text: "I used the demo for a week before adding funds. The interface is clean and fast."
  },
  {
    initial: "S",
    name: "Sarah M.",
    title: "Smooth experience",
    text: "Charts load quickly and I like having demo and live in one place after signup."
  },
  {
    initial: "J",
    name: "James T.",
    title: "Good for learning",
    text: "Practice mode helped me understand timing without pressure. Support replied same day."
  }
];

type Props = {
  onTryDemo: () => void;
  onLogin: () => void;
  onRegister: () => void;
};

export default function LandingPage({ onTryDemo, onLogin, onRegister }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [tIndex, setTIndex] = useState(0);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [menuOpen]);

  const go = (fn: () => void) => {
    setMenuOpen(false);
    fn();
  };

  const scrollTo = useCallback((id: string) => {
    setMenuOpen(false);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const tileAction = (a: (typeof DEMO_TILES)[0]["action"]) => {
    if (a === "demo") onTryDemo();
    else if (a === "register") onRegister();
    else scrollTo("landing-features");
  };

  return (
    <div className="landing-page landing-ot">
      <header className={`landing-nav landing-ot-nav${menuOpen ? " landing-drawer-open" : ""}`}>
        <div className="landing-nav-inner">
          <span className="landing-brand">
            <BrandLogo size={40} className="landing-brand-logo" />
            <span className="landing-brand-text">{APP_NAME}</span>
          </span>
          <button
            type="button"
            className="landing-menu-btn"
            aria-label="Open menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(true)}
          >
            <span className="landing-menu-burger" aria-hidden />
          </button>
          <nav className="landing-nav-links landing-nav-desktop" aria-label="Main">
            <button type="button" className="landing-link" onClick={() => scrollTo("ot-platform")}>
              Platform
            </button>
            <button type="button" className="landing-link" onClick={() => scrollTo("ot-demo-grid")}>
              Demo
            </button>
            <button type="button" className="landing-link" onClick={() => scrollTo("ot-reviews")}>
              Reviews
            </button>
            <button type="button" className="landing-link" onClick={onLogin}>
              Log in
            </button>
            <button type="button" className="landing-btn-outline" onClick={onRegister}>
              Register
            </button>
            <button type="button" className="landing-btn-primary" onClick={onTryDemo}>
              Start for $0
            </button>
          </nav>
        </div>
        {menuOpen ? (
          <div
            className="landing-drawer-backdrop"
            role="presentation"
            onClick={() => setMenuOpen(false)}
          >
            <nav
              className="landing-drawer"
              role="dialog"
              aria-label="Menu"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="landing-drawer-head">
                <div className="landing-drawer-head-left">
                  <BrandLogo size={28} className="landing-drawer-logo" />
                  <span className="landing-drawer-title">Menu</span>
                </div>
                <button
                  type="button"
                  className="landing-drawer-close"
                  aria-label="Close"
                  onClick={() => setMenuOpen(false)}
                >
                  ×
                </button>
              </div>
              <div className="landing-drawer-links">
                <button type="button" onClick={() => { scrollTo("ot-platform"); }}>
                  Platform
                </button>
                <button type="button" onClick={() => { scrollTo("ot-demo-grid"); }}>
                  Demo
                </button>
                <button type="button" onClick={() => { scrollTo("ot-reviews"); }}>
                  Reviews
                </button>
                <button type="button" onClick={() => go(onLogin)}>
                  Log in
                </button>
                <button type="button" onClick={() => go(onRegister)}>
                  Register
                </button>
                <button type="button" onClick={() => go(onTryDemo)}>
                  Start for $0
                </button>
              </div>
            </nav>
          </div>
        ) : null}
      </header>

      {/* Hero — Olymptrade-style: headline + $0 CTA */}
      <section className="landing-ot-hero" aria-label="Intro">
        <div className="landing-ot-hero-glow" aria-hidden />
        <div className="landing-ot-hero-inner">
          <p className="landing-ot-hero-label">Online trading platform</p>
          <h1 className="landing-ot-hero-title">
            Build confidence
            <br />
            <span className="landing-ot-hero-accent">with every trade</span>
          </h1>
          <p className="landing-ot-hero-sub">
            Practice on a full demo, then fund your live wallet when you are ready. No cost to explore.
          </p>
          <div className="landing-ot-hero-cta">
            <button type="button" className="landing-ot-btn-main" onClick={onTryDemo}>
              Start now for $0
            </button>
            <button type="button" className="landing-ot-btn-ghost" onClick={() => scrollTo("landing-features")}>
              Learn more
            </button>
          </div>
        </div>
      </section>

      {/* Horizontal feature pills */}
      <section className="landing-ot-pills" aria-label="Highlights">
        <div className="landing-ot-pills-track">
          {PILL_ITEMS.map((label) => (
            <span key={label} className="landing-ot-pill">
              {label}
            </span>
          ))}
        </div>
      </section>

      {/* Trust band */}
      <section className="landing-ot-band">
        <div className="landing-ot-band-inner">
          <h2 className="landing-ot-band-title">Designed for traders who want clarity</h2>
          <p className="landing-ot-band-text">
            {APP_NAME} combines a simple workflow with live-style charts. Demo first — live when you choose.
          </p>
        </div>
      </section>

      {/* Platform + mock device */}
      <section className="landing-ot-split" id="ot-platform">
        <div className="landing-ot-split-copy">
          <h2 className="landing-ot-h2">Modern trading platform</h2>
          <p className="landing-ot-lead">Your financial decisions start here — charts, markets, and orders in one view.</p>
          <ul className="landing-ot-checks">
            <li>Web app — responsive on phone and desktop</li>
            <li>Demo balance to practice without signup friction</li>
            <li>Register to unlock live wallet & deposits</li>
          </ul>
          <div className="landing-ot-split-btns">
            <button type="button" className="landing-ot-btn-main" onClick={onTryDemo}>
              Try on web
            </button>
            <button type="button" className="landing-btn-outline" onClick={onRegister}>
              Create account
            </button>
          </div>
        </div>
        <div className="landing-ot-split-visual" aria-hidden>
          <div className="landing-ot-banner-wrap">
            <img src="/brand/banner2.jpeg" alt="" className="landing-ot-banner" />
          </div>
        </div>
      </section>

      <section className="landing-ot-subband">
        <h2 className="landing-ot-h2 landing-ot-center">Care, reliability & usability</h2>
        <p className="landing-ot-center-text">
          Explore risk-free on demo, then use the same interface for live trading with clear risk rules.
        </p>
      </section>

      {/* Demo grid — OT-style cards */}
      <section className="landing-ot-demo-section" id="ot-demo-grid">
        <h2 className="landing-ot-h2 landing-ot-center">Explore trading with practice tools</h2>
        <div className="landing-ot-demo-grid">
          {DEMO_TILES.map((tile) => (
            <article key={tile.title} className="landing-ot-demo-card">
              <h3>{tile.title}</h3>
              <p>{tile.desc}</p>
              <button type="button" className="landing-ot-link-btn" onClick={() => tileAction(tile.action)}>
                {tile.cta} →
              </button>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-ot-legal-strip">
        <p>
          <strong>Trade responsibly.</strong> Markets move fast — losses are possible. This platform is for
          education and trading; use demo to learn. Not financial advice.
        </p>
      </section>

      <section className="landing-ot-support">
        <h2 className="landing-ot-h2 landing-ot-center">On your way to confident trading</h2>
        <div className="landing-ot-support-grid">
          {SUPPORT_COLS.map((col) => (
            <div key={col.title} className="landing-ot-support-card">
              <h3>{col.title}</h3>
              <p>{col.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="landing-ot-withdraw">
        <div className="landing-ot-withdraw-inner">
          <h2 className="landing-ot-h2">Quick withdrawals</h2>
          <p>
            Request withdrawals from your live balance according to platform rules. Demo funds are virtual only.
          </p>
          <button type="button" className="landing-ot-btn-main" onClick={onRegister}>
            Open live account
          </button>
        </div>
      </section>

      <section className="landing-ot-stats">
        <div className="landing-ot-stats-grid">
          {[
            { n: "$10+", label: "Low barrier to fund (USDT)" },
            { n: "24/7", label: "Markets on demo & live feed" },
            { n: "Demo", label: "Practice before deposit" },
            { n: "Web", label: "No install required" }
          ].map((s) => (
            <div key={s.label} className="landing-ot-stat">
              <strong>{s.n}</strong>
              <span>{s.label}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="landing-ot-global">
        <h2 className="landing-ot-h2 landing-ot-center">{APP_NAME} for traders everywhere</h2>
        <p className="landing-ot-center-text">Access from your browser. Same experience on mobile and desktop.</p>
      </section>

      {/* Testimonials */}
      <section className="landing-ot-reviews" id="ot-reviews" aria-label="Reviews">
        <h2 className="landing-ot-h2 landing-ot-center">What traders say</h2>
        <div className="landing-ot-review-card">
          <div className="landing-ot-review-avatar" aria-hidden>
            {TESTIMONIALS[tIndex].initial}
          </div>
          <p className="landing-ot-review-title">{TESTIMONIALS[tIndex].title}</p>
          <p className="landing-ot-review-text">&ldquo;{TESTIMONIALS[tIndex].text}&rdquo;</p>
          <p className="landing-ot-review-name">— {TESTIMONIALS[tIndex].name}</p>
          <div className="landing-ot-review-nav">
            <button
              type="button"
              aria-label="Previous"
              onClick={() => setTIndex((i) => (i - 1 + TESTIMONIALS.length) % TESTIMONIALS.length)}
            >
              ‹
            </button>
            <span>
              {tIndex + 1} / {TESTIMONIALS.length}
            </span>
            <button
              type="button"
              aria-label="Next"
              onClick={() => setTIndex((i) => (i + 1) % TESTIMONIALS.length)}
            >
              ›
            </button>
          </div>
        </div>
      </section>

      {/* Feature grid (existing id for Learn more scroll) */}
      <section className="landing-features" id="landing-features">
        <h2 className="landing-section-title">Everything in one place</h2>
        <div className="landing-feature-grid">
          {[
            { icon: "📱", title: "Modern platform", desc: "Clean charts and fast UI" },
            { icon: "🎓", title: "Learning center", desc: "Grow skills at your pace" },
            { icon: "🛡️", title: "Demo first", desc: "Virtual funds, refillable" },
            { icon: "⚡", title: "Easy start", desc: "Register in minutes" },
            { icon: "📊", title: "Live prices", desc: "Forex-style pairs & candles" },
            { icon: "💳", title: "Live wallet", desc: "Deposit when you are ready" }
          ].map((f) => (
            <div key={f.title} className="landing-feature-card">
              <span className="landing-feature-icon">{f.icon}</span>
              <h3>{f.title}</h3>
              <p>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="landing-demo-block" id="landing-demo-block">
        <div className="landing-demo-inner">
          <div>
            <h2>Demo account — designed for practice</h2>
            <p>
              Try the full flow without risk. When you are comfortable, create an account and fund your live wallet.
            </p>
          </div>
          <button type="button" className="landing-btn-primary landing-btn-lg" onClick={onTryDemo}>
            Start demo now
          </button>
        </div>
      </section>

      <section className="landing-ot-final-cta">
        <h2>Start trading with confidence</h2>
        <button type="button" className="landing-ot-btn-main landing-ot-btn-xl" onClick={onRegister}>
          Register free
        </button>
        <button type="button" className="landing-ot-btn-ghost" onClick={onLogin}>
          Already have an account? Log in
        </button>
      </section>

      <footer className="landing-footer">
        <p>
          {APP_NAME} — educational & trading demo. Financial instruments carry risk. You may lose your stake. Practice
          on demo first.
        </p>
      </footer>
    </div>
  );
}
