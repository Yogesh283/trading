import { APP_NAME } from "./appBrand";
import { brandLogo } from "./brandUrls";

type Props = {
  size?: number;
  className?: string;
  alt?: string;
};

/** App logo (synced from src/Public/Img/logo.png → public/brand/) */
export function BrandLogo({ size = 32, className = "", alt = APP_NAME }: Props) {
  return (
    <img
      src={brandLogo}
      alt={alt}
      width={size}
      height={size}
      className={`brand-logo-img ${className}`.trim()}
      decoding="async"
    />
  );
}
