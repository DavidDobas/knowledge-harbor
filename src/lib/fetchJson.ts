/**
 * Fetch JSON with uniform error handling. Returns null on network error, non-OK status,
 * or empty/invalid body — so callers can `if (!data) return;` instead of try/catch everywhere.
 */
export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(url, init);
    if (!res.ok) return null;
    const text = await res.text();
    if (!text.trim()) return null;
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}
