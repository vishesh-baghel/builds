import { once } from "@builds/shared";
import type {
  ActionResult, Classified, Decision, Escalation,
  Extracted, IdempotencyStore, Pipeline, RawInput,
} from "@builds/shared";
import { INBOX_AS_OF } from "./clock";
import { matchProject, RFI_LOG, SUB_LOG, type Project } from "./fixtures/sor";
import type { Judgment } from "./jev";
import { DEFAULT_THRESHOLDS, type Thresholds } from "./policy";
import { stateFor, type JudgmentState } from "./questions";
import { decidePlan, type Plan } from "./stages/decide";
import { draftFor } from "./stages/draft";
import { derivePriority } from "./stages/priority";
import { SiftStore, type ActedRecord, type RecordKind } from "./store";
import type { Firm, Message, Priority, SiftAction } from "./types";

/**
 * The six stages, wired.
 *
 * `classify` is the only stage that reaches the outside world, and the judge is supplied as a
 * function so the whole pipeline runs against injected probabilities in tests, a live request in the
 * scorecard, and a committed run artifact on the deploy, the same code each time. `decide` reads the
 * plan; `act` runs each topic-qualified action through `once()` so a two-topic message writes two
 * records and a retry cannot double-apply.
 */

export interface MessageFields {
  readonly message: Message;
  readonly project: Project | null;
  readonly corroborated: boolean;
  readonly state: JudgmentState;
}

/** What `classify` must supply. A committed artifact and a live call both satisfy it. */
export type Judge = (message: Message, firm: Firm, state: JudgmentState) => Promise<Judgment>;

export interface SiftOptions {
  readonly firm: Firm;
  readonly judge: Judge;
  readonly store: SiftStore;
  readonly idempotency: IdempotencyStore;
  readonly thresholds?: Thresholds;
  readonly asOf?: string;
}

/** The clock is corroborated in code when the message names a logged RFI or submittal (each dated). */
const clockCorroborated = (firm: Firm, message: Message): boolean => {
  if (firm.id !== "arch") return message.corroborated === true;
  const text = `${message.subject} ${message.body}`;
  const inLog = Object.keys(RFI_LOG).some((n) => text.includes(n)) || Object.keys(SUB_LOG).some((n) => text.includes(n));
  return inLog || message.corroborated === true;
};

export class SiftPipeline implements Pipeline<Message, MessageFields, string, SiftAction> {
  readonly thresholds: Thresholds;
  readonly asOf: string;

  private readonly plans = new Map<string, Plan>();
  private readonly judgments = new Map<string, Judgment>();
  private readonly fields = new Map<string, MessageFields>();

  constructor(private readonly options: SiftOptions) {
    this.thresholds = options.thresholds ?? DEFAULT_THRESHOLDS;
    this.asOf = options.asOf ?? INBOX_AS_OF;
  }

  get store(): SiftStore { return this.options.store; }
  planFor(messageId: string): Plan | undefined { return this.plans.get(messageId); }
  judgmentFor(messageId: string): Judgment | undefined { return this.judgments.get(messageId); }

  async extract(input: RawInput<Message>): Promise<Extracted<MessageFields>> {
    const firm = this.options.firm;
    const message = input.payload;
    const project = firm.id === "arch" ? matchProject(`${message.subject} ${message.body}`) : null;
    const fields: MessageFields = {
      message, project, corroborated: clockCorroborated(firm, message), state: stateFor(firm, message),
    };
    this.fields.set(message.id, fields);
    return { inputId: input.id, fields, confidence: 1 };
  }

  async classify(extracted: Extracted<MessageFields>): Promise<Classified<string>> {
    const firm = this.options.firm;
    const { message, project, corroborated } = extracted.fields;
    const judgment = await this.options.judge(message, firm, extracted.fields.state);
    this.judgments.set(message.id, judgment);

    // The judged scores and clock replace the fixture's illustrative ones for the decision.
    const judged: Message = { ...message, p: judgment.scores, clock: judgment.clock };
    const deadline = message.deadline;
    const priorityOf = firm.id === "arch" && deadline != null
      ? (): Priority => derivePriority({ deadline, project, asOf: this.asOf })
      : undefined;

    const plan = decidePlan(judged, firm, this.thresholds, this.asOf, {
      corroborated, ...(priorityOf ? { priorityOf } : {}),
    });
    this.plans.set(message.id, plan);

    const classes = firm.classes.map((c) => c[0]);
    return {
      inputId: extracted.inputId,
      probabilities: classes.map((label) => ({ label, probability: judgment.scores[label] ?? 0 })),
      asserted: plan.asserted,
      primary: plan.asserted[0] ?? null,
    };
  }

  async decide(classified: Classified<string>): Promise<Decision<SiftAction>> {
    const plan = this.requirePlan(classified.inputId);
    return { inputId: classified.inputId, actions: [...plan.actions], escalate: plan.handoffs.length > 0, reason: plan.reason };
  }

  async act(decision: Decision<SiftAction>, action: SiftAction): Promise<ActionResult> {
    const plan = this.requirePlan(decision.inputId);
    const fields = this.fields.get(decision.inputId);
    if (!fields) throw new Error(`no extracted fields for ${decision.inputId}`);
    const firm = this.options.firm;

    const outcome = await once(this.options.idempotency, `${decision.inputId}:${action}`, async () => {
      this.store.add(this.recordFor(decision.inputId, action, plan, fields, firm));
      return true;
    });

    const summary = this.summaryFor(action, plan, firm);
    return outcome === true
      ? { inputId: decision.inputId, action, status: "done", detail: summary }
      : { inputId: decision.inputId, action, status: "skipped", detail: "already applied" };
  }

  async escalate(
    decision: Decision<SiftAction>,
    extracted: Extracted<MessageFields>,
    classified: Classified<string>): Promise<Escalation> {
    const plan = this.requirePlan(decision.inputId);
    const { message } = extracted.fields;
    return {
      inputId: decision.inputId,
      reason: plan.reason,
      context: {
        message: { id: message.id, from: message.from, subject: message.subject, body: message.body },
        probabilities: Object.fromEntries(classified.probabilities.map((p) => [p.label, p.probability])),
        clock: this.judgments.get(message.id)?.clock ?? message.clock,
        asserted: plan.asserted,
        reviewBand: plan.review,
        handoffs: plan.handoffs,
        deadline: message.deadline ?? null,
        priority: plan.priority,
      },
    };
  }

  private recordFor(messageId: string, action: SiftAction, plan: Plan, fields: MessageFields, firm: Firm): ActedRecord {
    const topic = action.startsWith("route:") || action.startsWith("label:") ? action.slice(6) : null;
    const outcome = topic ? plan.outcomes.find((o) => o.topic === topic) : undefined;
    const kind: RecordKind = action === "alert:owner" ? "alert" : action === "set_deadline" ? "set_deadline" : action.startsWith("label:") ? "label" : "route";
    const draft = action.startsWith("route:") && topic ? draftFor(firm, fields.message, topic) : null;
    return {
      id: `${messageId}:${action}`,
      messageId, action, kind, topic,
      who: kind === "alert" || kind === "set_deadline" ? firm.owner : outcome?.who ?? null,
      summary: this.summaryFor(action, plan, firm),
      detail: {
        ...(outcome ? { priority: outcome.priority, why: outcome.why } : {}),
        ...(draft ? { draft: draft.body } : {}),
      },
    };
  }

  private summaryFor(action: SiftAction, plan: Plan, firm: Firm): string {
    if (action === "alert:owner") return plan.alert?.why ?? `Deadline alert to ${firm.owner}.`;
    if (action === "set_deadline") return "A clock is running with no date; a person sets it.";
    const topic = action.slice(6);
    const outcome = plan.outcomes.find((o) => o.topic === topic);
    return outcome ? `${outcome.who ?? "labelled and left"}: ${outcome.why}` : action;
  }

  private requirePlan(messageId: string): Plan {
    const plan = this.plans.get(messageId);
    if (!plan) throw new Error(`no plan for ${messageId}, classify must run before decide`);
    return plan;
  }
}
