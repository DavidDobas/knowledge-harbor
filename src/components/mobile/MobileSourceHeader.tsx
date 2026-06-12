"use client";

interface Props {
  onBack: () => void;
}

/** Shared top bar for all mobile source screens (YouTube, Notes, etc.). */
export default function MobileSourceHeader({ onBack }: Props) {
  return (
    <header className="mobile-safe-top shrink-0 border-b px-4" style={{ borderColor: "var(--border)" }}>
      <div className="mobile-header-row gap-3">
        <button
          type="button"
          onClick={onBack}
          className="mobile-touch-target shrink-0 flex items-center justify-center"
          style={{ color: "var(--accent)" }}
          aria-label="Back to library"
        >
          <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <h1 className="type-serif font-semibold text-lg" style={{ color: "var(--foreground)" }}>
          Knowledge Harbor
        </h1>
      </div>
    </header>
  );
}
