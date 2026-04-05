import { useId } from "react";

type AiChartInsightIconProps = {
  className?: string;
  /** Chart toolbar only — uses `public/chart-ai-icon.png` (SVG elsewhere). */
  variant?: "default" | "chart";
};

/** Compact “AI chip” mark — label text lives beside this in the button (no tiny letters inside the icon). */
export function AiChartInsightIcon({ className, variant = "default" }: AiChartInsightIconProps) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  if (variant === "chart") {
    const src = `${import.meta.env.BASE_URL}chart-ai-icon.png`.replace(/\/{2,}/g, "/");
    return (
      <img
        src={src}
        alt=""
        className={[className, "chart-ai-insight-icon--bitmap"].filter(Boolean).join(" ")}
        aria-hidden
        draggable={false}
      />
    );
  }

  const gradId = `ai-chip-g-${uid}`;
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <defs>
        <linearGradient id={gradId} x1="4" y1="4" x2="20" y2="20" gradientUnits="userSpaceOnUse">
          <stop stopColor="#38bdf8" />
          <stop offset="1" stopColor="#a855f7" />
        </linearGradient>
      </defs>
      <rect x="3" y="3" width="18" height="18" rx="5" stroke={`url(#${gradId})`} strokeWidth="1.6" />
      {/* Sparkle / node hint — reads as “AI feature”, not duplicate “AI” text */}
      <path
        d="M12 7.5v2M12 14.5v2M7.5 12h2M14.5 12h2M9.2 9.2l1.4 1.4M13.4 13.4l1.4 1.4M9.2 14.8l1.4-1.4M13.4 10.6l1.4-1.4"
        stroke={`url(#${gradId})`}
        strokeWidth="1.15"
        strokeLinecap="round"
      />
      <circle cx="12" cy="12" r="1.35" fill={`url(#${gradId})`} />
    </svg>
  );
}
