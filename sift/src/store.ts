/**
 * What Sift did, recorded per action.
 *
 * Deliberately small, and deliberately no send path: this records that a message was routed,
 * labelled, or that an owner was alerted, and holds the draft a person would send. It never sends
 * one, and it never writes to a system of record. Each record is keyed `${messageId}:${action}` so a
 * repeat run recognises its own work; the pipeline reserves that same key through `once()`, so a
 * retry cannot double-apply even across instances.
 */

export type RecordKind = "route" | "label" | "alert" | "set_deadline";

export interface ActedRecord {
  readonly id: string;
  readonly messageId: string;
  readonly action: string;
  readonly kind: RecordKind;
  readonly topic: string | null;
  readonly who: string | null;
  readonly summary: string;
  readonly detail: Readonly<Record<string, unknown>>;
}

export class SiftStore {
  private readonly records = new Map<string, ActedRecord>();

  add(record: ActedRecord): boolean {
    if (this.records.has(record.id)) return false;
    this.records.set(record.id, record);
    return true;
  }

  all(): readonly ActedRecord[] {
    return [...this.records.values()];
  }

  forMessage(messageId: string): readonly ActedRecord[] {
    return this.all().filter((r) => r.messageId === messageId);
  }

  routedTo(who: string): readonly ActedRecord[] {
    return this.all().filter((r) => r.who === who && (r.kind === "route" || r.kind === "alert"));
  }
}
