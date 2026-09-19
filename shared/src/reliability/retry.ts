export interface RetryOptions {
  attempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  /** Return false to fail fast on errors that retrying cannot fix (4xx, validation). */
  isRetryable?: (error: unknown) => boolean;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Retry with exponential backoff and full jitter. */
export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const {
    attempts = 4,
    baseDelayMs = 250,
    maxDelayMs = 10_000,
    isRetryable = () => true,
    sleep = defaultSleep,
  } = options;

  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt === attempts - 1 || !isRetryable(error)) break;
      const ceiling = Math.min(maxDelayMs, baseDelayMs * 2 ** attempt);
      await sleep(Math.random() * ceiling);
    }
  }
  throw lastError;
}
