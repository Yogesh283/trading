/** Images from frontend/public/brand/ (sync from src/Public/Img — run: npm run sync:brand) */
const b = import.meta.env.BASE_URL;

/** Single on-disk mark: `frontend/public/brand/IQ00Fx Logo.png` (used UI + favicon + APK sync). */
const BRAND_MARK_FILE = "IQ00Fx Logo.png";
const brandMarkPath = `brand/${encodeURIComponent(BRAND_MARK_FILE)}`;

/** Primary app mark — `BrandLogo`, landing footer, etc. */
export const brandLogo = `${b}${brandMarkPath}`;
/** Download / dock row — same main mark */
export const brandApkIcon = brandLogo;

/** Landing page visuals only (`public/brand/`). */
export const landingBrandI3 = `${b}brand/I3.png`;
export const landingBrandI6 = `${b}brand/I6.png`;
export const landingBrandI9 = `${b}brand/I9.png`;
/** Promo / hero video (place file at public/brand/v.mp4) */
export const brandHeroVideo = `${b}brand/v.mp4`;
