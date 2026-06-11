"use client";

/** Centered muted "Loading…" placeholder used while a panel fetches its data. */
export default function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex-1 flex items-center justify-center p-4">
      <p className="text-xs" style={{ color: "var(--muted)" }}>{label}</p>
    </div>
  );
}
