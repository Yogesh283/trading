import { APP_NAME } from "./appBrand";
import { BrandLogo } from "./BrandLogo";
import "./splash.css";

export default function SplashScreen() {
  return (
    <div className="splash-screen" role="presentation">
      <div className="splash-inner">
        <div className="splash-logo">
          <BrandLogo size={72} alt="" className="splash-logo-img" />
        </div>
        <h1 className="splash-title">{APP_NAME}</h1>
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
