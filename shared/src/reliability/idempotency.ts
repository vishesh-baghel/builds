/**
 * Stops a side effect from happening twice — the invoice reminder sent once, not on every
 * retry or redeploy. Backend is per-build (KV, Durable Object, Postgres); the contract is not.
 */
export interface IdempotencyStore {
  /** True if this key was newly reserved; false if it was already used. */
  reserve(key: string, ttlSeconds: number): Promise<boolean>;
  release(key: string): Promise<void>;
}

export async function once<T>(
  store: IdempotencyStore,
  key: string,
  fn: () => Promise<T>,
  ttlSeconds = 86_400,
): Promise<T | { skipped: true }> {
  if (!(await store.reserve(key, ttlSeconds))) return { skipped: true };
  try {
    return await fn();
  } catch (error) {
    // The effect did not land — let a later attempt try again.
    await store.release(key);
    throw error;
  }
}

/** In-memory implementation. Fine for demos and tests; never for multi-instance production. */
export class InMemoryIdempotencyStore implements IdempotencyStore {
  private readonly keys = new Map<string, number>();

  async reserve(key: string, ttlSeconds: number): Promise<boolean> {
    const now = Date.now();
    const existing = this.keys.get(key);
    if (existing !== undefined && existing > now) return false;
    this.keys.set(key, now + ttlSeconds * 1000);
    return true;
  }

  async release(key: string): Promise<void> {
    this.keys.delete(key);
  }
}
