import {
  once,
  type ActionResult, type Classified, type Decision, type Escalation,
  type Extracted, type IdempotencyStore, type Pipeline, type RawInput,
} from "@builds/shared";
import { LEDGER_AS_OF } from "./clock";
import type { FixtureSet } from "./fixtures/load";
import type { Judgment } from "./jev";
import { DEFAULT_THRESHOLDS, type ClassScores, type Thresholds } from "./policy";
import type { JudgmentState } from "./questions";
import { decidePlan, type Plan } from "./stages/decide";
import { ChaseStore, ITEM_FOR_ACTION } from "./state";
import { REPLY_CLASSES, type ChaseAction, type Invoice, type Reply, type ReplyClass } from "./types";

/**
 * The six stages, wired.
 *
 * `classify` is the only stage that can reach the outside world, and it is supplied as a
 * function so the whole pipeline runs against injected probabilities in tests, against a live
 * request in the scorecard, and against a committed run artifact on the deploy, same code
 * each time.
 */

export type ReplyFields = {
  reply: Reply;
  invoice: Invoice;
  state: JudgmentState;
};

/** What `classify` must supply. A committed artifact and a live call both satisfy it. */
export type Judge = (reply: Reply, state: JudgmentState) => Promise<Judgment>;

export interface ReckonOptions {
  readonly fixtures: FixtureSet;
  readonly judge: Judge;
  readonly store: ChaseStore;
  readonly idempotency: IdempotencyStore;
  readonly thresholds?: Thresholds;
  readonly asOf?: string;
}

export class ReckonPipeline implements Pipeline<Reply, ReplyFields, ReplyClass, ChaseAction> {
  readonly thresholds: Thresholds;
  readonly asOf: string;

  /** Per-input working state. `decide` computes it; `act` and `escalate` read it. */
  private readonly plans = new Map<string, Plan>();
  private readonly judgments = new Map<string, Judgment>();
  private readonly fields = new Map<string, ReplyFields>();

  constructor(private readonly options: ReckonOptions) {
    this.thresholds = options.thresholds ?? DEFAULT_THRESHOLDS;
    this.asOf = options.asOf ?? LEDGER_AS_OF;
  }

  get store(): ChaseStore {
    return this.options.store;
  }

  judgmentFor(replyId: string): Judgment | undefined {
    return this.judgments.get(replyId);
  }

  planFor(replyId: string): Plan | undefined {
    return this.plans.get(replyId);
  }

  /** Code, not a model: the join, the arithmetic and the lookup all belong here. */
  async extract(input: RawInput<Reply>): Promise<Extracted<ReplyFields>> {
    const reply = input.payload;
    const invoice = this.options.fixtures.byInvoice.get(reply.invoice);
    if (!invoice) throw new Error(`reply ${reply.id} names invoice ${reply.invoice}, which is not in the ledger`);

    const fields: ReplyFields = {
      reply,
      invoice,
      state: {
        invoice: {
          number: invoice.invoiceNo,
          customer: invoice.customer,
          amount: invoice.amount,
          open_balance: invoice.openBalance,
          days_past_due: invoice.daysPastDue,
          terms: invoice.terms,
        },
        // Untrusted text. It is classified, never obeyed.
        reply: { subject: reply.subject, body: reply.body },
      },
    };

    this.fields.set(reply.id, fields);
    return { inputId: input.id, fields, confidence: 1 };
  }

  async classify(extracted: Extracted<ReplyFields>): Promise<Classified<ReplyClass>> {
    const { reply, state } = extracted.fields;
    const judgment = await this.options.judge(reply, state);
    this.judgments.set(reply.id, judgment);

    const plan = decidePlan({
      replyId: reply.id,
      body: reply.body,
      invoice: extracted.fields.invoice,
      scores: judgment.scores,
      date: judgment.date,
      amount: judgment.amount,
      thresholds: this.thresholds,
      asOf: this.asOf,
    });
    this.plans.set(reply.id, plan);

    return {
      inputId: extracted.inputId,
      probabilities: REPLY_CLASSES.map((label) => ({ label, probability: judgment.scores[label] })),
      asserted: plan.asserted,
      primary: plan.primary,
    };
  }

  async decide(classified: Classified<ReplyClass>): Promise<Decision<ChaseAction>> {
    const plan = this.requirePlan(classified.inputId);
    return {
      inputId: classified.inputId,
      actions: plan.effects.map((effect) => effect.action),
      escalate: plan.handoffs.length > 0,
      reason: plan.reason,
    };
  }

  /**
   * One action, once. The key is the reply and the action together, so a decision carrying two
   * actions cannot half-apply on a retry: each is reserved and released on its own.
   */
  async act(decision: Decision<ChaseAction>, action: ChaseAction): Promise<ActionResult> {
    const plan = this.requirePlan(decision.inputId);
    const effect = plan.effects.find((candidate) => candidate.action === action);
    if (!effect) throw new Error(`no effect planned for ${action} on ${decision.inputId}`);

    const fields = this.fields.get(decision.inputId);
    if (!fields) throw new Error(`no extracted fields for ${decision.inputId}`);

    const outcome = await once(this.options.idempotency, `${decision.inputId}:${action}`, async () => {
      if (effect.status) {
        this.store.setStatus({
          invoice: fields.invoice.invoiceNo,
          status: effect.status,
          because: effect.summary,
          replyId: decision.inputId,
          resumeOn: effect.resumeOn ?? null,
        });
      }
      const kind = ITEM_FOR_ACTION[action];
      if (kind) {
        this.store.addWorkItem({
          id: `${decision.inputId}:${kind}`,
          kind,
          invoice: fields.invoice.invoiceNo,
          replyId: decision.inputId,
          summary: effect.summary,
          detail: effect.detail,
        });
      }
      return true;
    });

    return outcome === true
      ? { inputId: decision.inputId, action, status: "done", detail: effect.summary }
      : { inputId: decision.inputId, action, status: "skipped", detail: "already applied" };
  }

  /** Everything a person needs to act without re-reading the mailbox. */
  async escalate(
    decision: Decision<ChaseAction>,
    extracted: Extracted<ReplyFields>,
    classified: Classified<ReplyClass>): Promise<Escalation> {
    const plan = this.requirePlan(decision.inputId);
    const { reply, invoice } = extracted.fields;

    return {
      inputId: decision.inputId,
      reason: plan.reason,
      context: {
        invoice: {
          number: invoice.invoiceNo,
          customer: invoice.customer,
          openBalance: invoice.openBalance,
          daysPastDue: invoice.daysPastDue,
        },
        reply: { id: reply.id, subject: reply.subject, body: reply.body },
        probabilities: Object.fromEntries(
          classified.probabilities.map((p) => [p.label, p.probability])) satisfies Record<string, number>,
        asserted: plan.asserted,
        reviewBand: plan.review,
        handoffs: plan.handoffs,
        ruleFired: plan.tieBreak ? `rule ${plan.tieBreak.rule}: ${plan.tieBreak.name}` : null,
      },
    };
  }

  private requirePlan(inputId: string): Plan {
    const plan = this.plans.get(inputId);
    if (!plan) throw new Error(`no plan for ${inputId}, classify must run before decide`);
    return plan;
  }
}

/** Convenience for callers that only hold probabilities, not a whole judgment. */
export const judgmentFromScores = (
  scores: ClassScores,
  overrides: Partial<Omit<Judgment, "scores">> = {}): Judgment => ({
  scores,
  date: { anchor: "none", weekday: "none", period: "none" },
  amount: { shape: "none", fraction: "none" },
  usage: { input_tokens: 0, output_tokens: 0 },
  model: "injected",
  costCents: 0,
  ...overrides,
});
