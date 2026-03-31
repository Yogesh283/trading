/** Images from frontend/public/brand/ (sync from src/Public/Img — run: npm run sync:brand) */
const b = import.meta.env.BASE_URL;

/** Primary app mark — `public/brand/logof.png` */
export const brandLogo = `${b}brand/logof.png`;
/** Android APK marketing / dock icon — `public/brand/apkl.png` */
export const brandApkIcon = `${b}brand/apkl.png`;
export const brandBanner1 = `${b}brand/banner1.jpeg`;
export const brandBanner2 = `${b}brand/banner2.jpeg`;
export const brandBanner3 = `${b}brand/banner3.jpeg`;
/** Promo / hero video (place file at public/brand/v.mp4) */
export const brandHeroVideo = `${b}brand/v.mp4`;
