import { BrandLogo } from "./BrandLogo";
import { ProductWordmark } from "./ProductWordmark";
import "./splash.css";

export default function SplashScreen() {
  return (
    <div className="splash-screen" role="presentation">
      <div className="splash-inner">
        <div className="splash-logo">
          <BrandLogo size={112} alt="" className="splash-logo-img" />
        </div>
        <h1 className="splash-title">
          <ProductWordmark size="splash" />
        </h1>
        <p className="splash-tagline">Your future in your hands</p>
        <div className="splash-loader">
          <span className="splash-dot" />
          <span className="splash-dot" />
          <span className="splash-dot" />
        </div>
      </div>
    </div>
  );
}
