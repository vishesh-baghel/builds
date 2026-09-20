import { connect } from "@tursodatabase/serverless";
import {
  InMemoryIdempotencyStore, InMemorySpendCounter,
  type IdempotencyStore, type SpendCounter,
} from "@builds/shared";
import { tursoToken, tursoUrl } from "../env";

/**
 * Persistence for the two things that must survive a request.
 *
 * A spend cap held in one instance's memory is not a cap: two cold starts and the ceiling is
 * two ceilings. The same goes for an idempotency reservation. Turso because it is a pure-fetch
 * client with no native binding, which is what a serverless function wants.
 *
 * **Absent credentials is a first-class state, not an error.** With none, both fall back to the
 * per-instance implementations from `shared` and the page says which mode it is in. That is
 * also the path a fresh clone runs on and the path `pnpm dev` exercises every time, so the
 * degrade cannot rot unnoticed.
 */

export type Db = Awaited<ReturnType<typeof connect>>;

let cached: Db | null = null;
let attempted = false;

export const tursoConfigured = (): boolean => Boolean(tursoUrl() && tursoToken());

/** Never throws. Null means per-instance fallbacks and a visible notice. */
export async function tryDb(): Promise<Db | null> {
  if (cached) return cached;
  if (attempted) return null;
  attempted = true;
  if (!tursoConfigured()) return null;

  try {
    const db = connect({ url: tursoUrl() as string, authToken: tursoToken() as string });
    for (const statement of SCHEMA) await db.run(statement);
    cached = db;
    return db;
  } catch {
    return null;
  }
}

export const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS spend (
     window_key TEXT PRIMARY KEY,
     cents      REAL NOT NULL DEFAULT 0
   )`,
  `CREATE TABLE IF NOT EXISTS reservations (
     key        TEXT PRIMARY KEY,
     expires_at INTEGER NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS visits (
     visitor    TEXT NOT NULL,
     window_key TEXT NOT NULL,
     calls      INTEGER NOT NULL DEFAULT 0,
     PRIMARY KEY (visitor, window_key)
   )`,
];

/** One window per calendar month, matching how the budget is reasoned about. */
export const monthKey = (at: Date): string => at.toISOString().slice(0, 7);

export class TursoSpendCounter implements SpendCounter {
  constructor(private readonly db: Db, private readonly window: string) {}

  async spentCents(): Promise<number> {
    const row = await this.db.get("SELECT cents FROM spend WHERE window_key = ?", this.window);
    return Number((row as { cents?: number } | undefined)?.cents ?? 0);
  }

  async add(cents: number): Promise<void> {
    // One statement, so two concurrent visitors cannot both read the old total and write back
    // the same new one. A read-then-write here would let the cap leak past its ceiling.
    await this.db.run(
      `INSERT INTO spend (window_key, cents) VALUES (?, ?)
       ON CONFLICT(window_key) DO UPDATE SET cents = cents + excluded.cents`,
      this.window, cents,
    );
  }
}

export class TursoIdempotencyStore implements IdempotencyStore {
  constructor(private readonly db: Db) {}

  async reserve(key: string, ttlSeconds: number): Promise<boolean> {
    const now = Date.now();
    const expiresAt = now + ttlSeconds * 1000;
    await this.db.run("DELETE FROM reservations WHERE expires_at <= ?", now);
    await this.db.run("INSERT OR IGNORE INTO reservations (key, expires_at) VALUES (?, ?)", key, expiresAt);

    // Read back rather than trusting an affected-rows count: whoever's expiry is stored is
    // whoever won the insert, which is true regardless of what the driver reports.
    const row = await this.db.get("SELECT expires_at FROM reservations WHERE key = ?", key);
    return Number((row as { expires_at?: number } | undefined)?.expires_at) === expiresAt;
  }

  async release(key: string): Promise<void> {
    await this.db.run("DELETE FROM reservations WHERE key = ?", key);
  }
}

/** How many live judgments one browser may buy in a month before it is served replays. */
export const VISITOR_CALL_LIMIT = 25;

export interface Backend {
  readonly counter: SpendCounter;
  readonly idempotency: IdempotencyStore;
  readonly persistent: boolean;
  /** True when this visitor has used up their allowance. Always answers, never throws. */
  overLimit(visitor: string): Promise<boolean>;
}

const memoryCounter = new InMemorySpendCounter();
const memoryIdempotency = new InMemoryIdempotencyStore();
const memoryVisits = new Map<string, number>();

export async function backend(now: Date = new Date()): Promise<Backend> {
  const window = monthKey(now);
  const db = await tryDb();

  if (!db) {
    return {
      counter: memoryCounter,
      idempotency: memoryIdempotency,
      persistent: false,
      async overLimit(visitor: string) {
        const key = `${visitor}:${window}`;
        const used = (memoryVisits.get(key) ?? 0) + 1;
        memoryVisits.set(key, used);
        return used > VISITOR_CALL_LIMIT;
      },
    };
  }

  return {
    counter: new TursoSpendCounter(db, window),
    idempotency: new TursoIdempotencyStore(db),
    persistent: true,
    async overLimit(visitor: string) {
      try {
        await db.run(
          `INSERT INTO visits (visitor, window_key, calls) VALUES (?, ?, 1)
           ON CONFLICT(visitor, window_key) DO UPDATE SET calls = calls + 1`,
          visitor, window,
        );
        const row = await db.get(
          "SELECT calls FROM visits WHERE visitor = ? AND window_key = ?", visitor, window,
        );
        return Number((row as { calls?: number } | undefined)?.calls ?? 0) > VISITOR_CALL_LIMIT;
      } catch {
        // A rate limiter that fails open is not a rate limiter.
        return true;
      }
    },
  };
}
