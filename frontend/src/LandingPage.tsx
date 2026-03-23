import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import "./landing.css";
import { APP_NAME, APK_DOWNLOAD_URL } from "./appBrand";
import { BrandLogo } from "./BrandLogo";
import { brandBanner1, brandBanner2, brandBanner3, brandHeroVideo, brandLogo } from "./brandUrls";

const PILL_ITEMS = [
  "Up / Down binary trades",
  "Modern platform",
  "Android APK",
  "Useful features",
  "Easy start",
  "Learning center",
  "Quick withdrawals",
  "Trusted experience"
];

function ApkDownloadLink({ className, children }: { className: string; children: ReactNode }) {
  const external = /^https?:\/\//i.test(APK_DOWNLOAD_URL);
  return (
    <a
      href={APK_DOWNLOAD_URL}
      className={className}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : { download: true })}
    >
      {children}
    </a>
  );
}

const DEMO_TILES = [
  {
    title: "Demo account for practice",
    desc: "Try Up and Down on live-style charts with virtual funds — no card required.",
    cta: "Try demo",
    action: "demo" as const
  },
  {
    title: "Learn before you risk",
    desc: "Practice binary-style timing: choose direction, stake, and see the result when the candle closes.",
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
};

export default function LandingPage({ onTryDemo, onLogin, onRegister, onAbout }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [tIndex, setTIndex] = useState(0);
  const cinematicVideoRef = useRef<HTMLVideoElement>(null);
  const [cinematicPlaying, setCinematicPlaying] = useState(false);

  const playCinematicVideo = useCallback(async () => {
    const el = cinematicVideoRef.current;
    if (!el) return;
    try {
      el.muted = true;
      el.currentTime = 0;
      await el.play();
      setCinematicPlaying(true);
    } catch {
      setCinematicPlaying(false);
    }
  }, []);

  /** Video poora chalne ke baad band + dubara sirf Play se start */
  const handleCinematicEnded = useCallback(() => {
    setCinematicPlaying(false);
    const el = cinematicVideoRef.current;
    if (el) {
      el.pause();
      el.currentTime = 0;
    }
  }, []);

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
        <div className="landing-nav-inner landing-nav-inner--bar">
          <div className="landing-nav-slot landing-nav-slot--brand">
            <span className="landing-brand">
              <BrandLogo size={40} className="landing-brand-logo" />
              <span className="landing-brand-text">{APP_NAME}</span>
            </span>
          </div>
          <div className="landing-nav-slot landing-nav-slot--center landing-nav-desktop">
            <nav className="landing-nav-pill" aria-label="Main">
              <button type="button" className="landing-pill-link" onClick={() => scrollTo("ot-platform")}>
                Trading
              </button>
              <ApkDownloadLink className="landing-pill-link landing-pill-link--app">Download App</ApkDownloadLink>
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
                <button type="button" onClick={() => { scrollTo("ot-platform"); }}>
                  Trading
                </button>
                <ApkDownloadLink className="landing-drawer-link">Download App</ApkDownloadLink>
                <button type="button" onClick={() => go(onAbout)}>
                  About
                </button>
                <button type="button" onClick={() => { scrollTo("ot-help"); }}>
                  Help
                </button>
                <button type="button" onClick={() => { scrollTo("ot-demo-grid"); }}>
                  Explore demo
                </button>
                <button type="button" onClick={() => { scrollTo("ot-reviews"); }}>
                  Reviews
                </button>
                <button type="button" className="landing-cta-highlight landing-cta-highlight--login" onClick={() => go(onLogin)}>
                  Sign in
                </button>
                <button type="button" className="landing-cta-highlight landing-cta-highlight--register" onClick={() => go(onRegister)}>
                  Register
                </button>
                <button type="button" className="landing-cta-highlight landing-cta-highlight--start" onClick={() => go(onTryDemo)}>
                  Try for free
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
          <p className="landing-ot-hero-label landing-ot-hero-label--with-logo">
            <img src={brandLogo} alt="" width={28} height={28} className="landing-ot-hero-logo" decoding="async" />
            <span>Forex charts · binary-style Up / Down</span>
          </p>
          <h1 className="landing-ot-hero-title">
            Predict direction
            <br />
            <span className="landing-ot-hero-accent">Up or Down — timed trades</span>
          </h1>
          <p className="landing-ot-hero-sub">
            Choose <strong>Up</strong> if you think price will finish above entry when time runs out, or{" "}
            <strong>Down</strong> if you expect it below. Practice free on demo; go live when you are ready.
          </p>
          <div className="landing-ot-hero-cta">
            <button type="button" className="landing-ot-btn-main" onClick={onTryDemo}>
              Start now for $0
            </button>
            <button type="button" className="landing-ot-btn-ghost" onClick={() => scrollTo("landing-features")}>
              Learn more
            </button>
            <ApkDownloadLink className="landing-ot-btn-ghost">Download Android APK</ApkDownloadLink>
          </div>
        </div>
      </section>

      {/* Cinematic — brand video v.mp4; tap Play to start (poster until then) */}
      <section className="landing-ot-cinematic" aria-label="Trading workspace">
        <div className="landing-ot-cinematic-inner">
          <video
            ref={cinematicVideoRef}
            className="landing-ot-cinematic-img landing-ot-cinematic-video"
            muted
            playsInline
            poster={brandBanner1}
            preload="metadata"
            aria-label="Trading platform preview video"
            onPlay={() => setCinematicPlaying(true)}
            onEnded={handleCinematicEnded}
          >
            <source src={brandHeroVideo} type="video/mp4" />
          </video>
          {!cinematicPlaying ? (
            <div className="landing-cinematic-play-overlay">
              <button
                type="button"
                className="landing-cinematic-play-btn"
                onClick={() => void playCinematicVideo()}
                aria-label="Play preview video"
              >
                <span className="landing-cinematic-play-triangle" aria-hidden />
              </button>
            </div>
          ) : null}
        </div>
      </section>

      {/* Demo + register/login — high on page (second block after hero) */}
      <section className="landing-demo-block landing-demo-block--near-top" id="landing-demo-block">
        <div className="landing-demo-inner landing-demo-inner--brand">
          <div className="landing-demo-copy">
            <h2>Demo account — practice Up &amp; Down</h2>
            <p>
              Try the same Up / Down flow and chart timing with virtual money. When you are comfortable, register and
              fund your live wallet.
            </p>
            <button type="button" className="landing-btn-primary landing-btn-lg landing-demo-cta" onClick={onTryDemo}>
              Start demo now
            </button>
          </div>
          <div className="landing-demo-brand-visual">
            <img src={brandBanner3} alt="" loading="lazy" decoding="async" />
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

      <section id="landing-apk" className="landing-ot-apk-band" aria-label="Android app download">
        <div className="landing-ot-apk-inner">
          <h2>Get the Android app</h2>
          <p>
            Download the {APP_NAME} APK for your phone — same web trading experience in an installable app. If your
            browser blocks the file, use &quot;Download APK&quot; in the menu above or allow installs from this source
            in Android settings.
          </p>
          <ApkDownloadLink className="landing-ot-btn-main landing-ot-btn-xl">Download APK</ApkDownloadLink>
        </div>
      </section>

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
            {APP_NAME} pairs clear candlestick charts with simple <strong>Up / Down</strong> decisions and a visible
            countdown. Learn the flow on demo — same buttons and timing on live.
          </p>
        </div>
      </section>

      {/* Binary Up / Down — how it connects to the product */}
      <section className="landing-ot-binary" id="ot-binary" aria-labelledby="landing-binary-heading">
        <h2 id="landing-binary-heading" className="landing-ot-h2 landing-ot-center">
          How binary-style Up / Down works here
        </h2>
        <p className="landing-ot-center-text landing-ot-binary-lead">
          Not sure about complex orders? Here you only connect your view on price to two actions — aligned with the
          in-app <strong>Up</strong> and <strong>Down</strong> trade buttons.
        </p>
        <div className="landing-ot-binary-steps">
          <article className="landing-ot-binary-card">
            <span className="landing-ot-binary-step">1</span>
            <h3>Pick the market</h3>
            <p>Select a forex pair and timeframe. The chart shows live-style ticks and candles.</p>
          </article>
          <article className="landing-ot-binary-card">
            <span className="landing-ot-binary-step">2</span>
            <h3>Tap Up or Down</h3>
            <p>
              <span className="landing-ot-binary-tag landing-ot-binary-tag--up">Up</span> — you expect the price at
              close to be <strong>above</strong> your entry.{" "}
              <span className="landing-ot-binary-tag landing-ot-binary-tag--down">Down</span> — you expect it{" "}
              <strong>below</strong>.
            </p>
          </article>
          <article className="landing-ot-binary-card">
            <span className="landing-ot-binary-step">3</span>
            <h3>Timer decides</h3>
            <p>When the countdown hits zero, the platform compares price to your entry — win or loss is settled by the rules shown in the app (e.g. payout multiple on wins).</p>
          </article>
        </div>
        <p className="landing-ot-binary-foot">
          Trading carries risk; you can lose your stake. Use demo to understand Up / Down and timing before depositing.
        </p>
      </section>

      {/* Platform + mock device */}
      <section className="landing-ot-split" id="ot-platform">
        <div className="landing-ot-split-copy">
          <h2 className="landing-ot-h2">Modern trading platform</h2>
          <p className="landing-ot-lead">Your financial decisions start here — charts, markets, and orders in one view.</p>
          <ul className="landing-ot-checks">
            <li>Binary-style <strong>Up / Down</strong> on forex pairs — amount, direction, and expiry in one flow</li>
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
            <img src={brandBanner2} alt="" className="landing-ot-banner" />
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
            { icon: "⇅", title: "Up / Down trades", desc: "Binary-style direction + timer on forex candles" },
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
          {APP_NAME} — forex-style charts with binary Up / Down trades. Markets are risky; you may lose your stake.
          Practice on demo first — not financial advice.
        </p>
        <p className="landing-footer-about">
          <button type="button" className="landing-footer-about-link" onClick={onAbout}>
            About this project
          </button>
        </p>
      </footer>
    </div>
  );
}
