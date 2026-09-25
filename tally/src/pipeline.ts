import {
  once, runPipeline,
  type ActionResult, type AuditLog, type Classified, type Decision, type Escalation, type Extracted,
  type IdempotencyStore, type Pipeline, type PipelineOutcome, type RawInput,
} from "@builds/shared";
import type { Judgment } from "./drex";
import { VERDICTS, type Verdict, type WorkOrder } from "./fixtures";
import type { WorkItem } from "./item";
import { decideItem, type ItemDecision, type Thresholds } from "./policy";

/**
 * One work item through the shared six stages.
 *
 * extract: code prepares the item (split, rate line, price, drafted line, invoice check).
 * classify: Drex's verdict probabilities. decide: `decideItem`, pure code.
 * act: record the drafted line, once per order and rate code. escalate: hand it to a person.
 * log: the shared audit trail. Nothing is ever issued to a system of record.
 */
export type ItemPayload = { readonly order: WorkOrder; readonly item: WorkItem };
type Fields = WorkItem & { readonly alreadyInvoiced: boolean };
export type Action = "draft_line";

export interface DraftedLine {
  readonly orderId: string;
  readonly itemId: string;
  readonly line: string;
  readonly cents: number;
  readonly clause: string;
}

export interface ItemPipelineDeps {
  /** Live runs pass the Drex call; scoring passes a lookup into committed judgments. */
  readonly judge: (item: WorkItem, order: WorkOrder) => Promise<Judgment>;
  readonly thresholds: Thresholds;
  readonly idempotency: IdempotencyStore;
  readonly drafts: DraftedLine[];
  readonly humanQueue: Escalation[];
}

export function itemPipeline(deps: ItemPipelineDeps) {
  const judgments = new Map<string, Judgment>();
  const decisions = new Map<string, ItemDecision>();
  const items = new Map<string, Fields>();

  const pipeline: Pipeline<ItemPayload, Fields, Verdict, Action> = {
    async extract(input: RawInput<ItemPayload>): Promise<Extracted<Fields>> {
      const { order, item } = input.payload;
      const fields = { ...item, alreadyInvoiced: item.code !== null && order.invoice.some((l) => l.code === item.code) };
      items.set(input.id, fields);
      return { inputId: input.id, fields, confidence: 1 };
    },

    async classify(extracted: Extracted<Fields>): Promise<Classified<Verdict>> {
      const fields = extracted.fields;
      const order = orders.get(extracted.inputId)!;
      const j = await deps.judge(fields, order);
      judgments.set(extracted.inputId, j);
      const probabilities = VERDICTS.map((label) => ({ label, probability: j.verdict[label] }));
      const primary = VERDICTS.reduce((a, b) => (j.verdict[b] > j.verdict[a] ? b : a));
      return { inputId: extracted.inputId, probabilities, asserted: [primary], primary };
    },

    async decide(_classified: Classified<Verdict>, extracted: Extracted<Fields>): Promise<Decision<Action>> {
      const fields = extracted.fields;
      const decision = decideItem(fields, judgments.get(extracted.inputId)!, deps.thresholds, fields.alreadyInvoiced);
      decisions.set(extracted.inputId, decision);
      return {
        inputId: extracted.inputId,
        actions: decision.outcome === "recovered" ? ["draft_line"] : [],
        escalate: decision.outcome === "human",
        reason: decision.reason,
      };
    },

    async act(decision: Decision<Action>, action: Action): Promise<ActionResult> {
      const fields = items.get(decision.inputId)!;
      // One drafted line per order and rate code, however many times the run is replayed.
      const result = await once(deps.idempotency, `${fields.orderId}:${fields.code}`, async () => {
        deps.drafts.push({ orderId: fields.orderId, itemId: fields.id, line: fields.draftedLine!, cents: fields.priceCents, clause: fields.clause });
        return "drafted";
      });
      return typeof result === "string"
        ? { inputId: decision.inputId, action, status: "done", detail: fields.draftedLine! }
        : { inputId: decision.inputId, action, status: "skipped", detail: "already drafted for this order" };
    },

    async escalate(decision: Decision<Action>, extracted: Extracted<Fields>): Promise<Escalation> {
      const j = judgments.get(decision.inputId)!;
      const escalation: Escalation = {
        inputId: decision.inputId,
        reason: decision.reason,
        context: { text: extracted.fields.text, draftedLine: extracted.fields.draftedLine, verdict: j.verdict, covered: j.covered, unsupported: j.unsupported, evidence: j.evidence },
      };
      deps.humanQueue.push(escalation);
      return escalation;
    },
  };

  const orders = new Map<string, WorkOrder>();

  return {
    async run(order: WorkOrder, item: WorkItem, at: Date, audit: AuditLog): Promise<PipelineOutcome & { decision: ItemDecision; judgment: Judgment }> {
      orders.set(item.id, order);
      const outcome = await runPipeline(pipeline, { id: item.id, source: "work-order", receivedAt: at, payload: { order, item } }, audit);
      return { ...outcome, decision: decisions.get(item.id)!, judgment: judgments.get(item.id)! };
    },
  };
}
