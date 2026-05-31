"use client";

import type { SourceType } from "@/lib/types";
import { SIDEBAR_WIDTH } from "@/lib/layout";

function tabAccentColor(type: SourceType | null, active: boolean): string {
  if (!active) return "transparent";
  if (type === "youtube") return "#E05252";
  if (type === "pdf") return "#5B6C8F";
  if (type === "note") return "#6B8F71";
  return "var(--border)";
}

function YouTubeTabIcon() {
  return (
    <span className="shrink-0 flex items-center justify-center rounded" style={{ width: 16, height: 12, background: "#FF0000" }}>
      <svg width="7" height="7" fill="white" viewBox="0 0 24 24">
        <path d="M8 5v14l11-7z" />
      </svg>
    </span>
  );
}

function PdfTabIcon() {
  return (
    <svg width="14" height="16" fill="none" viewBox="0 0 22 26" className="shrink-0">
      <path
        d="M3 1h11l6 6v18a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1z"
        fill="var(--background)"
        stroke="var(--border)"
        strokeWidth="1.5"
      />
      <path d="M14 1v6h6" stroke="var(--border)" strokeWidth="1.5" fill="none" />
      <text x="11" y="20" textAnchor="middle" style={{ fontFamily: "monospace", fontSize: "5px", fill: "#E05252", fontWeight: 700 }}>
        PDF
      </text>
    </svg>
  );
}

function NoteTabIcon() {
  return (
    <span className="shrink-0 flex items-center justify-center rounded" style={{ width: 16, height: 16, background: "#6B8F7122", border: "1px solid #6B8F7144" }}>
      <svg width="9" height="9" fill="none" stroke="#6B8F71" strokeWidth="2" viewBox="0 0 24 24">
        <path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
      </svg>
    </span>
  );
}

function TabTypeIcon({ type }: { type: SourceType | null }) {
  if (type === "youtube") return <YouTubeTabIcon />;
  if (type === "pdf") return <PdfTabIcon />;
  if (type === "note") return <NoteTabIcon />;
  return (
    <span className="shrink-0 rounded-full" style={{ width: 8, height: 8, background: "var(--border)" }} />
  );
}

export interface TabBarItem {
  id: string;
  label: string;
  sourceType: SourceType | null;
}

interface Props {
  tabs: TabBarItem[];
  activeTabId: string;
  onSelectTab: (id: string) => void;
  onCloseTab: (id: string) => void;
  onNewTab: () => void;
}

export default function TabBar({ tabs, activeTabId, onSelectTab, onCloseTab, onNewTab }: Props) {
  return (
    <header
      className="shrink-0 flex items-stretch border-b"
      style={{ background: "var(--sidebar-bg)", borderColor: "var(--border)", minHeight: 44 }}
    >
      {/* Brand — same width as the sidebar so tabs align with the center pane */}
      <div
        className="shrink-0 flex items-center px-4 border-r"
        style={{ borderColor: "var(--border)", width: SIDEBAR_WIDTH }}
      >
        <span
          className="type-serif font-semibold text-sm whitespace-nowrap"
          style={{ color: "var(--foreground)", letterSpacing: "-0.01em" }}
        >
          KnowledgeHarbor
        </span>
      </div>

      {/* Tabs */}
      <div className="flex-1 flex items-end min-w-0 overflow-x-auto workspace-tab-scroll">
        <div className="flex items-end h-full px-1 gap-0.5">
          {tabs.map((tab) => {
            const active = tab.id === activeTabId;
            const accent = tabAccentColor(tab.sourceType, active);
            return (
              <div
                key={tab.id}
                role="tab"
                aria-selected={active}
                className="workspace-tab group flex items-center gap-1.5 shrink-0 cursor-pointer select-none"
                style={{
                  maxWidth: 200,
                  minWidth: 120,
                  height: 34,
                  marginBottom: active ? 0 : 1,
                  paddingLeft: 10,
                  paddingRight: 6,
                  borderTop: `3px solid ${accent}`,
                  borderLeft: "1px solid var(--border)",
                  borderRight: "1px solid var(--border)",
                  borderBottom: active ? "1px solid var(--panel-bg)" : "1px solid var(--border)",
                  borderRadius: "6px 6px 0 0",
                  background: active ? "var(--panel-bg)" : "var(--background)",
                  position: "relative",
                  zIndex: active ? 2 : 1,
                  marginTop: active ? 0 : 2,
                }}
                onClick={() => onSelectTab(tab.id)}
                onMouseDown={(e) => {
                  if (e.button === 1) {
                    e.preventDefault();
                    onCloseTab(tab.id);
                  }
                }}
              >
                <TabTypeIcon type={tab.sourceType} />
                <span
                  className="flex-1 truncate text-xs"
                  style={{
                    color: active ? "var(--foreground)" : "var(--text-secondary)",
                    fontWeight: active ? 500 : 400,
                  }}
                  title={tab.label}
                >
                  {tab.label}
                </span>
                <button
                  type="button"
                  aria-label={`Close ${tab.label}`}
                  className="shrink-0 w-5 h-5 flex items-center justify-center rounded opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ color: "var(--muted)" }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onCloseTab(tab.id);
                  }}
                >
                  <svg width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
            );
          })}

          <button
            type="button"
            onClick={onNewTab}
            className="shrink-0 flex items-center gap-1 px-2.5 mb-1 rounded-md transition-opacity hover:opacity-70"
            style={{ height: 28, color: "var(--muted)", fontSize: "0.72rem" }}
          >
            <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M12 5v14M5 12h14" />
            </svg>
            New tab
          </button>
        </div>
      </div>
    </header>
  );
}
