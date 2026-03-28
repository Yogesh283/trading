type Props = {
  onClick: () => void;
  className?: string;
  disabled?: boolean;
  title?: string;
  "aria-label"?: string;
};

/** Circular refresh control (green, top-right style) — use with `global-refresh-fab` / `global-refresh-fab--sm` in CSS. */
export default function GlobalRefreshButton({
  onClick,
  className = "",
  disabled = false,
  title = "Refresh",
  "aria-label": ariaLabel = "Refresh"
}: Props) {
  return (
    <button
      type="button"
      className={`global-refresh-fab ${className}`.trim()}
      disabled={disabled}
      onClick={onClick}
      title={title}
      aria-label={ariaLabel}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
        <path
          d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
