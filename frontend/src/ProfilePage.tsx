import type { AuthUser } from "./api";
import { BrandLogo } from "./BrandLogo";
import { formatInr } from "./fundsConfig";

function userMobileOrContact(u: AuthUser): string {
  if (u.phoneCountryCode && u.phoneLocal) {
    return `+${u.phoneCountryCode} ${u.phoneLocal}`;
  }
  const em = u.email ?? "";
  if (em && !em.endsWith("@m.iqfxpro.local")) {
    return em;
  }
  return "—";
}

function fmtBal(n: number | null): string {
  return n == null ? "—" : formatInr(n);
}

export default function ProfilePage(props: {
  user: AuthUser;
  accountWallet: "demo" | "live" | "bonus";
  demoBal: number | null;
  bonusBal: number | null;
  liveBal: number | null;
}) {
  const { user, accountWallet, demoBal, bonusBal, liveBal } = props;

  return (
    <main className="mobile-dash-page profile-page">
      <div className="mobile-dash-page__inner">
        <div className="profile-page__head">
          <BrandLogo size={48} />
          <h1 className="mobile-dash-page__title">Profile</h1>
        </div>
        <p className="mobile-dash-page__muted">Your account details and wallet balances.</p>

        <section className="profile-page__card" aria-labelledby="profile-account-heading">
          <h2 id="profile-account-heading" className="profile-page__card-title">
            Account
          </h2>
          <dl className="profile-page__dl">
            <div className="profile-page__row">
              <dt>Name</dt>
              <dd>{user.name?.trim() || "—"}</dd>
            </div>
            <div className="profile-page__row">
              <dt>Mobile</dt>
              <dd>{userMobileOrContact(user)}</dd>
            </div>
          </dl>
        </section>

        <section className="profile-page__card" aria-labelledby="profile-funds-heading">
          <h2 id="profile-funds-heading" className="profile-page__card-title">
            Funds
          </h2>
          <dl className="profile-page__dl">
            <div className="profile-page__row">
              <dt>Live (INR)</dt>
              <dd>{fmtBal(liveBal)}</dd>
            </div>
            <div className="profile-page__row">
              <dt>Demo (INR)</dt>
              <dd>{fmtBal(demoBal)}</dd>
            </div>
            <div className="profile-page__row">
              <dt>Bonus (INR)</dt>
              <dd>{fmtBal(bonusBal)}</dd>
            </div>
            <div className="profile-page__row">
              <dt>Active for trading</dt>
              <dd>
                {accountWallet === "live" ? "Live" : accountWallet === "bonus" ? "Bonus" : "Demo"}
              </dd>
            </div>
          </dl>
        </section>
      </div>
    </main>
  );
}
