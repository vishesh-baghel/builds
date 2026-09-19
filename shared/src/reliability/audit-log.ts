/**
 * Every decision the system made, and why. This is what makes an automation reviewable by the
 * owner whose business it runs in — and what a demo shows to prove it is not a black box.
 */
export interface AuditEntry {
  readonly at: Date;
  readonly inputId: string;
  readonly stage: "extract" | "classify" | "decide" | "act" | "escalate";
  readonly summary: string;
  readonly data?: Record<string, unknown>;
}

export interface AuditLog {
  record(entry: AuditEntry): Promise<void>;
  list(inputId: string): Promise<readonly AuditEntry[]>;
}

export class InMemoryAuditLog implements AuditLog {
  private readonly entries: AuditEntry[] = [];

  async record(entry: AuditEntry): Promise<void> {
    this.entries.push(entry);
  }

  async list(inputId: string): Promise<readonly AuditEntry[]> {
    return this.entries.filter((e) => e.inputId === inputId);
  }
}
