/**
 * Retry an async function with exponential backoff.
 * Delays: attempt 1 → baseMs, attempt 2 → baseMs*2, attempt 3 → baseMs*4, …
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  { attempts = 3, baseMs = 1500 }: { attempts?: number; baseMs?: number } = {},
): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (i < attempts - 1) {
        await new Promise((r) => setTimeout(r, baseMs * Math.pow(2, i)));
      }
    }
  }
  throw lastError;
}
