import { connect } from "@tursodatabase/serverless";
import { InMemorySpendCounter, type SpendCounter } from "@builds/shared";
import { tursoToken, tursoUrl } from "../env";

/**
 * Persistence for what must survive a request: the spend counter, each visitor's allowance, and the
 * deploy's rolling ceiling on live calls.
 *
 * A cap held in one instance's memory is not a cap: two cold starts and the ceiling is two ceilings.
 * Turso because it is a pure-fetch client with no native binding. **Absent credentials is a
 * first-class state, not an error**: with none, everything falls back to per-instance memory and the
 * page says so. That is also the path a fresh clone and `pnpm dev` run on, so the fallback cannot rot.
 */

type Db = Awaited<ReturnType<typeof connect>>;

/** How many live judgments one browser may buy in a month before it is served replays. */
export const VISITOR_CALL_LIMIT = 25;
/** The deploy's own guardrail: at most this many live judgments in any rolling 24 hours (AC #36). */
export const INSTANCE_CEILING_24H = 500;
const DAY_MS = 24 * 60 * 60 * 1000;

export const monthKey = (at: Date): string => at.toISOString().slice(0, 7);

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS spend (window_key TEXT PRIMARY KEY, cents REAL NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS visits (visitor TEXT NOT NULL, window_key TEXT NOT NULL, calls INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (visitor, window_key))`,
  `CREATE TABLE IF NOT EXISTS live_calls (id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL)`,
];

let cached: Db | null = null;
let attempted = false;

export const tursoConfigured = (): boolean => Boolean(tursoUrl() && tursoToken());

async function tryDb(): Promise<Db | null> {
  if (cached) return cached;
  if (attempted || !tursoConfigured()) return null;
  attempted = true;
  try {
    const db = connect({ url: tursoUrl() as string, authToken: tursoToken() as string });
    for (const statement of SCHEMA) await db.run(statement);
    cached = db;
    return db;
  } catch {
    return null;
  }
}

class TursoSpendCounter implements SpendCounter {
  constructor(private readonly db: Db, private readonly window: string) {}
  async spentCents(): Promise<number> {
    const row = await this.db.get("SELECT cents FROM spend WHERE window_key = ?", this.window);
    return Number((row as { cents?: number } | undefined)?.cents ?? 0);
  }
  async add(cents: number): Promise<void> {
    // One statement, so two concurrent visitors cannot both read the old total and write the same
    // new one: a read-then-write here would let the cap leak past its ceiling.
    await this.db.run(
      `INSERT INTO spend (window_key, cents) VALUES (?, ?) ON CONFLICT(window_key) DO UPDATE SET cents = cents + excluded.cents`,
      this.window, cents);
  }
}

export interface LiveStore {
  readonly counter: SpendCounter;
  readonly persistent: boolean;
  /** Counts this visit against the visitor's allowance; true once it is used up. Fails closed. */
  overVisitorLimit(visitor: string): Promise<boolean>;
  /** Takes one slot of the rolling 24-hour ceiling; false, and nothing taken, when it is full. Fails closed. */
  reserveLiveCall(): Promise<boolean>;
  /** Live calls in the last 24 hours. */
  liveCallsToday(): Promise<number>;
}

/** Per-instance memory. Used with no Turso credentials, and by the tests. */
export function memoryStore(now: () => number = Date.now, limits = { visitor: VISITOR_CALL_LIMIT, ceiling: INSTANCE_CEILING_24H }): LiveStore {
  const counter = new InMemorySpendCounter();
  const visits = new Map<string, number>();
  let calls: number[] = [];
  const prune = () => { const cutoff = now() - DAY_MS; calls = calls.filter((t) => t > cutoff); };
  return {
    counter, persistent: false,
    async overVisitorLimit(visitor) {
      const key = `${visitor}:${monthKey(new Date(now()))}`;
      const used = (visits.get(key) ?? 0) + 1;
      visits.set(key, used);
      return used > limits.visitor;
    },
    async reserveLiveCall() {
      prune();
      if (calls.length >= limits.ceiling) return false;
      calls.push(now());
      return true;
    },
    async liveCallsToday() { prune(); return calls.length; },
  };
}

const memory = memoryStore();

export async function liveStore(): Promise<LiveStore> {
  const db = await tryDb();
  if (!db) return memory;
  const window = () => monthKey(new Date());
  return {
    counter: new TursoSpendCounter(db, window()),
    persistent: true,
    async overVisitorLimit(visitor) {
      try {
        await db.run(
          `INSERT INTO visits (visitor, window_key, calls) VALUES (?, ?, 1) ON CONFLICT(visitor, window_key) DO UPDATE SET calls = calls + 1`,
          visitor, window());
        const row = await db.get("SELECT calls FROM visits WHERE visitor = ? AND window_key = ?", visitor, window());
        return Number((row as { calls?: number } | undefined)?.calls ?? 0) > VISITOR_CALL_LIMIT;
      } catch {
        return true; // a rate limiter that fails open is not a rate limiter
      }
    },
    async reserveLiveCall() {
      try {
        const now = Date.now();
        await db.run("DELETE FROM live_calls WHERE at <= ?", now - DAY_MS);
        const inserted = await db.run("INSERT INTO live_calls (at) VALUES (?)", now);
        const row = await db.get("SELECT COUNT(*) AS n FROM live_calls WHERE at > ?", now - DAY_MS);
        if (Number((row as { n?: number } | undefined)?.n ?? 0) <= INSTANCE_CEILING_24H) return true;
        const id = (inserted as { lastInsertRowid?: number | bigint } | undefined)?.lastInsertRowid;
        if (id !== undefined) await db.run("DELETE FROM live_calls WHERE id = ?", Number(id));
        return false;
      } catch {
        return false;
      }
    },
    async liveCallsToday() {
      try {
        const row = await db.get("SELECT COUNT(*) AS n FROM live_calls WHERE at > ?", Date.now() - DAY_MS);
        return Number((row as { n?: number } | undefined)?.n ?? 0);
      } catch {
        return INSTANCE_CEILING_24H;
      }
    },
  };
}
