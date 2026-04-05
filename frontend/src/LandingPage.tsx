import { useCallback, useEffect, useState, type ReactNode } from "react";
import "./landing.css";
import { APP_NAME, APK_DOWNLOAD_URL, SUPPORT_EMAIL } from "./appBrand";
import { ProductWordmark } from "./ProductWordmark";
import { BrandLogo } from "./BrandLogo";
import { isCapacitorNativeClient } from "./androidAppUpdate";
import { brandApkIcon, brandLogo, landingBrandI3, landingBrandI6, landingBrandI9 } from "./brandUrls";
import { LandingChartAiCandlesPreview } from "./LandingChartAiCandlesPreview";

const PILL_ITEMS = [
  "Forex & metals markets",
  "Modern platform",
  "Android APK",
  "Useful features",
  "Easy start",
  "Learning center",
  "Quick withdrawals",
  "Trusted experience"
];

/** Single APK download target — `APK_DOWNLOAD_URL` (see `appBrand.ts`). Use `ApkScrollLink` elsewhere on this page. */
function ApkDownloadLink({
  className,
  children,
  showBrandIcon = true
}: {
  className: string;
  children: ReactNode;
  /** When false, use your own icon (e.g. drawer row with branded slot). */
  showBrandIcon?: boolean;
}) {
  const external = /^https?:\/\//i.test(APK_DOWNLOAD_URL);
  return (
    <a
      href={APK_DOWNLOAD_URL}
      className={className}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
    >
      {showBrandIcon ? (
        <img src={brandApkIcon} alt="" width={22} height={22} className="landing-apk-btn-ico" />
      ) : null}
      {children}
    </a>
  );
}

const DI = "landing-drawer-ico";

function IcoTrading() {
  return (
    <svg className={DI} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M5 19h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M7 15l3-7 4 5 3-9 4 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IcoAbout() {
  return (
    <svg className={DI} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
      <path d="M12 16v-4M12 8h.01" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

function IcoHelp() {
  return (
    <svg className={DI} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
      <path
        d="M9.5 9.5a2.5 2.5 0 014.35 1.55c0 1.63-1.57 1.88-1.85 3.45H10"
        stroke="currentColor"
        strokeWidth="1.85"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="17" r="1" fill="currentColor" />
    </svg>
  );
}

function IcoDemo() {
  return (
    <svg className={DI} viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="5" width="18" height="14" rx="2.5" stroke="currentColor" strokeWidth="2" />
      <path d="M10 10l4 2.5-4 2.5V10z" fill="currentColor" stroke="currentColor" strokeWidth="1" strokeLinejoin="round" />
    </svg>
  );
}

function IcoReviews() {
  return (
    <svg className={DI} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 2.5l2.8 5.7 6.3.9-4.6 4.5 1.1 6.3L12 17.9l-5.6 3 1.1-6.3L3 9.1l6.3-.9L12 2.5z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IcoSignIn() {
  return (
    <svg className={DI} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M15 3h4v18h-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M11 12H3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M6 9l-3 3 3 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IcoRegister() {
  return (
    <svg className={DI} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="9" cy="8" r="3.5" stroke="currentColor" strokeWidth="2" />
      <path d="M4 20v-1a5 5 0 015-5h1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M19 15v6M16 18h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function IcoTryFree() {
  return (
    <svg className={DI} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 3l1.9 3.9L18 9l-4.1 1.1L12 14l-1.9-3.9L6 9l4.1-1.1L12 3z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M5 21h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity={0.35} />
    </svg>
  );
}

const DEMO_TILES = [
  {
    title: "Demo account for practice",
    desc: "After you sign in, use virtual funds on live-style charts — no card required.",
    cta: "Sign in for demo",
    action: "demo" as const
  },
  {
    title: "Learn before you risk",
    desc: "Practice timed trades: choose direction, stake, and see the result when the candle closes.",
    cta: "Log in for demo",
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
    title: "Up / Down on clear charts",
    desc: "Forex pairs with live-style candles — tap Up if you expect price higher at expiry, Down if lower."
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
  onAbout: () => void;
  onTerms: () => void;
  onPrivacy: () => void;
};

function LandingPage({ onTryDemo, onLogin, onRegister, onAbout, onTerms, onPrivacy }: Props) {
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

  const hideApkDownloadUi = isCapacitorNativeClient();

  return (
    <div className="landing-page landing-ot">
      <header className={`landing-nav landing-ot-nav${menuOpen ? " landing-drawer-open" : ""}`}>
        <div className="landing-nav-inner landing-nav-inner--bar">
          <div className="landing-nav-slot landing-nav-slot--brand">
            <span className="landing-brand">
              <BrandLogo size={40} className="landing-brand-logo" />
              <ProductWordmark className="landing-brand-text" size="compact" />
            </span>
          </div>
          <div className="landing-nav-slot landing-nav-slot--center landing-nav-desktop">
            <nav className="landing-nav-pill" aria-label="Main">
              <button type="button" className="landing-pill-link" onClick={() => scrollTo("ot-platform")}>
                Trading
              </button>
              {hideApkDownloadUi ? null : (
                <button
                  type="button"
                  className="landing-pill-link landing-pill-link--app"
                  onClick={() => scrollTo("landing-apk")}
                >
                  Download App
                </button>
              )}
              <button type="button" className="landing-pill-link" onClick={() => go(onAbout)}>
                About
              </button>
              <button type="button" className="landing-pill-link" onClick={() => scrollTo("ot-help")}>
                Help
              </button>
            </nav>
          </div>
          <div className="landing-nav-slot landing-nav-slot--end">
            <div className="landing-nav-desktop landing-nav-cta-bar">
              <button
                type="button"
                className="landing-lang-btn"
                aria-label="Language: English"
                title="English (UK)"
              >
                <span className="landing-lang-flag" aria-hidden>
                  🇬🇧
                </span>
              </button>
              <button type="button" className="landing-btn-signin" onClick={onLogin}>
                Sign in
              </button>
              <button type="button" className="landing-btn-tryfree" onClick={onTryDemo}>
                Try for free
              </button>
            </div>
            <button
              type="button"
              className="landing-menu-btn"
              aria-label="Open menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen(true)}
            >
              <span className="landing-menu-burger" aria-hidden />
            </button>
          </div>
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
                <button type="button" className="landing-drawer-item" onClick={() => scrollTo("ot-platform")}>
                  <span className="landing-drawer-item__ico" aria-hidden>
                    <IcoTrading />
                  </span>
                  <span className="landing-drawer-item__txt">Trading</span>
                </button>
                {hideApkDownloadUi ? null : (
                  <button
                    type="button"
                    className="landing-drawer-item"
                    onClick={() => scrollTo("landing-apk")}
                  >
                    <span className="landing-drawer-item__ico" aria-hidden>
                      <img src={brandApkIcon} alt="" width={22} height={22} className="landing-drawer-ico" />
                    </span>
                    <span className="landing-drawer-item__txt">Download App</span>
                  </button>
                )}
                <button type="button" className="landing-drawer-item" onClick={() => go(onAbout)}>
                  <span className="landing-drawer-item__ico" aria-hidden>
                    <IcoAbout />
                  </span>
                  <span className="landing-drawer-item__txt">About</span>
                </button>
                <button type="button" className="landing-drawer-item" onClick={() => scrollTo("ot-help")}>
                  <span className="landing-drawer-item__ico" aria-hidden>
                    <IcoHelp />
                  </span>
                  <span className="landing-drawer-item__txt">Help</span>
                </button>
                <button type="button" className="landing-drawer-item" onClick={() => scrollTo("ot-demo-grid")}>
                  <span className="landing-drawer-item__ico" aria-hidden>
                    <IcoDemo />
                  </span>
                  <span className="landing-drawer-item__txt">Explore demo</span>
                </button>
                <button type="button" className="landing-drawer-item" onClick={() => scrollTo("ot-reviews")}>
                  <span className="landing-drawer-item__ico" aria-hidden>
                    <IcoReviews />
                  </span>
                  <span className="landing-drawer-item__txt">Reviews</span>
                </button>
                <button type="button" className="landing-drawer-item" onClick={() => go(onLogin)}>
                  <span className="landing-drawer-item__ico" aria-hidden>
                    <IcoSignIn />
                  </span>
                  <span className="landing-drawer-item__txt">Sign in</span>
                </button>
                <button type="button" className="landing-drawer-item" onClick={() => go(onRegister)}>
                  <span className="landing-drawer-item__ico" aria-hidden>
                    <IcoRegister />
                  </span>
                  <span className="landing-drawer-item__txt">Register</span>
                </button>
                <button type="button" className="landing-drawer-item" onClick={() => go(onTryDemo)}>
                  <span className="landing-drawer-item__ico" aria-hidden>
                    <IcoTryFree />
                  </span>
                  <span className="landing-drawer-item__txt">Try for free</span>
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
         
          <h1 className="landing-ot-hero-title">
            Trade with clarity
            <br />
            <span className="landing-ot-hero-accent">Charts, timing, and control</span>
          </h1>
          <p className="landing-ot-hero-sub">
            Follow live-style candles on forex and metals, size your trades, and use demo to practice before funding your
            live wallet.
          </p>
          <div className="landing-ot-hero-cta">
            <button type="button" className="landing-ot-btn-main" onClick={onTryDemo}>
              Start now for $0
            </button>
            <button type="button" className="landing-ot-btn-ghost" onClick={() => scrollTo("landing-features")}>
              Learn more
            </button>
            {hideApkDownloadUi ? null : (
              <button
                type="button"
                className="landing-ot-btn-ghost landing-ot-btn-apk-highlight"
                onClick={() => scrollTo("landing-apk")}
              >
                Download Android APK
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Demo + register/login — high on page (second block after hero) */}
      <section className="landing-demo-block landing-demo-block--near-top" id="landing-demo-block">
        <div className="landing-demo-inner landing-demo-inner--brand">
          <div className="landing-demo-copy">
            <h2>Demo account — practice first</h2>
            <p>
              Log in or register first, then use the <strong>Demo</strong> toggle in the app for virtual money. When you
              are ready, fund your live wallet.
            </p>
            <button type="button" className="landing-btn-primary landing-btn-lg landing-demo-cta" onClick={onTryDemo}>
              Log in for Demo
            </button>
          </div>
          <div className="landing-demo-brand-visual">
            <img src={landingBrandI3} alt="" loading="lazy" decoding="async" />
          </div>
        </div>
      </section>

      <section className="landing-ot-final-cta landing-ot-final-cta--near-top">
        <h2>Start trading with confidence</h2>
        <button type="button" className="landing-ot-btn-main landing-ot-btn-xl" onClick={onRegister}>
          Register free
        </button>
        <button type="button" className="landing-ot-btn-ghost" onClick={onLogin}>
          Already have an account? Log in
        </button>
      </section>

      {hideApkDownloadUi ? null : (
        <section id="landing-apk" className="landing-ot-apk-band" aria-label="Android app download">
          <div className="landing-ot-apk-inner">
            <h2>Get the Android app</h2>
            <p>
              Download the {APP_NAME} APK for your phone — same web trading experience in an installable app. Use the
              button below (single download link). If your browser blocks the file, allow installs from this source in
              Android settings.
            </p>
            <ApkDownloadLink className="landing-ot-btn-main landing-ot-btn-xl">Download APK</ApkDownloadLink>
          </div>
        </section>
      )}

      {/* Horizontal feature pills — auto-scroll marquee (duplicate row for seamless loop) */}
      <section className="landing-ot-pills" aria-label="Highlights">
        <div className="landing-ot-pills-marquee">
          <div className="landing-ot-pills-track landing-ot-pills-track--marquee">
            {PILL_ITEMS.map((label) => (
              <span key={label} className="landing-ot-pill">
                {label}
              </span>
            ))}
            {PILL_ITEMS.map((label, i) => (
              <span key={`marquee-dup-${i}-${label}`} className="landing-ot-pill" aria-hidden="true">
                {label}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Trust band */}
      <section className="landing-ot-band">
        <div className="landing-ot-band-inner">
          <h2 className="landing-ot-band-title">Designed for traders who want clarity</h2>
          <p className="landing-ot-band-text">
            {APP_NAME} pairs candlestick charts with a focused trading flow and clear timing. Learn on demo — the same
            interface for live when you fund.
          </p>
        </div>
      </section>

      <section className="landing-ot-figure" aria-hidden>
        <div className="landing-ot-figure-inner">
          <img src={landingBrandI9} alt="" className="landing-ot-figure-img" loading="lazy" decoding="async" />
        </div>
      </section>

      {/* Platform + mock device */}
      <section className="landing-ot-split" id="ot-platform">
        <div className="landing-ot-split-copy">
          <h2 className="landing-ot-h2">Modern trading platform</h2>
          <p className="landing-ot-lead">Your financial decisions start here — charts, markets, and orders in one view.</p>
          <ul className="landing-ot-checks">
            <li>
              <strong>Directional trades</strong> on forex pairs — amount, direction, and time horizon in one flow
            </li>
            <li>Web app — responsive on phone and desktop</li>
            <li>Demo balance to practice without signup friction; live wallet after register</li>
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
            <img src={landingBrandI6} alt="" className="landing-ot-banner" loading="lazy" decoding="async" />
          </div>
        </div>
      </section>

      <LandingChartAiCandlesPreview />

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

      <section className="landing-ot-support" id="ot-help" aria-label="Help and support">
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
            { icon: "⇅", title: "Timed trades", desc: "Clear direction and countdown on forex candles" },
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

      <footer className="landing-footer">
        <div className="landing-footer-brand-row">
          <img src={brandLogo} width={44} height={44} alt={APP_NAME} className="landing-footer-logo-mark" decoding="async" />
        </div>
        <p>
          {APP_NAME} — forex-style charts and short-horizon trading. Markets are risky; you may lose your stake. Practice
          on demo first — not financial advice.
        </p>
        <p className="landing-footer-contact">
          Contact:{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="landing-footer-mail">
            {SUPPORT_EMAIL}
          </a>
        </p>
        <p className="landing-footer-about">
          <button type="button" className="landing-footer-about-link" onClick={onAbout}>
            About this project
          </button>
        </p>
        <p className="landing-footer-legal-row">
          <button type="button" className="landing-footer-about-link" onClick={onTerms}>
            Terms &amp; Conditions
          </button>
          <span className="landing-footer-legal-dot" aria-hidden>
            ·
          </span>
          <button type="button" className="landing-footer-about-link" onClick={onPrivacy}>
            Privacy Policy
          </button>
        </p>
      </footer>
    </div>
  );
}

export default LandingPage;
