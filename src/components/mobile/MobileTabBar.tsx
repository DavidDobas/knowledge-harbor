"use client";

import type { ReactNode } from "react";

interface Tab {
  id: string;
  label: string;
}

interface Props {
  tabs: Tab[];
  active: string;
  onChange: (id: string) => void;
}

const TAB_ICONS: Record<string, ReactNode> = {
  transcript: (
    <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M4 6h16M4 12h16M4 18h10" />
    </svg>
  ),
  notes: (
    <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  ),
  threads: (
    <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  ),
};

export default function MobileTabBar({ tabs, active, onChange }: Props) {
  return (
    <div className="mobile-tab-bar shrink-0 flex px-3">
      {tabs.map((t) => {
        const isActive = t.id === active;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            className="mobile-touch-target flex-1 flex flex-col items-center gap-1 py-3 relative transition-colors"
            style={{
              color: isActive ? "var(--foreground)" : "var(--muted)",
            }}
          >
            <span className="flex items-center gap-1.5">
              {TAB_ICONS[t.id]}
              <span
                className="type-serif text-sm"
                style={{ fontWeight: isActive ? 600 : 400 }}
              >
                {t.label}
              </span>
            </span>
            {isActive && <span className="mobile-tab-indicator" />}
          </button>
        );
      })}
    </div>
  );
}
