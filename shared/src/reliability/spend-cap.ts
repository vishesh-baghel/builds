/**
 * A hard ceiling on model and vendor spend. Public demos are rate-limited and capped by
 * construction; a build that can be made expensive by a stranger is not shippable.
 */
export class SpendCapExceededError extends Error {
  constructor(public readonly capCents: number) {
    super(`spend cap of ${capCents} cents reached`);
    this.name = "SpendCapExceededError";
  }
}

export interface SpendCounter {
  /** Total spent in the current window, in cents. */
  spentCents(): Promise<number>;
  add(cents: number): Promise<void>;
}

export class SpendCap {
  constructor(
    private readonly counter: SpendCounter,
    private readonly capCents: number,
  ) {}

  async guard<T>(estimatedCents: number, fn: () => Promise<T>): Promise<T> {
    if ((await this.counter.spentCents()) + estimatedCents > this.capCents) {
      throw new SpendCapExceededError(this.capCents);
    }
    const result = await fn();
    await this.counter.add(estimatedCents);
    return result;
  }
}

export class InMemorySpendCounter implements SpendCounter {
  private total = 0;
  async spentCents(): Promise<number> { return this.total; }
  async add(cents: number): Promise<void> { this.total += cents; }
}
