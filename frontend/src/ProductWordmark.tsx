import { APP_NAME, APP_NAME_MARK_PRIMARY, APP_NAME_MARK_SECONDARY } from "./appBrand";

type Props = {
  className?: string;
  /** `splash` = large hero; `compact` = inherit parent sizing */
  size?: "default" | "splash" | "compact";
};

/** Two-colour brand: **IQFX** (gold) + **Pro** (light). */
export function ProductWordmark({ className = "", size = "default" }: Props) {
  const sz =
    size === "splash" ? " product-wordmark--splash" : size === "compact" ? " product-wordmark--compact" : "";
  return (
    <span className={`product-wordmark${sz} ${className}`.trim()} aria-label={APP_NAME}>
      <span className="product-wordmark-iqfx">{APP_NAME_MARK_PRIMARY}</span>
      <span className="product-wordmark-pro">{APP_NAME_MARK_SECONDARY}</span>
    </span>
  );
}
