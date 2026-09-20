import { describe, expect, it } from "vitest";
import { CHASE_ACTIONS, REPLY_CLASSES } from "../src/types";
import { DEFAULT_THRESHOLDS } from "../src/policy";
import { fixtures, replyById, runOne, scores } from "./helpers";

/**
 * Per-class behaviour, asserted over injected probabilities.
 *
 * No vendor call happens anywhere in this file. What the model would have said is not the
 * question here, what the code does with a given answer is.
 */

const CERTAIN = 0.97;

describe("every reply produces an asserted set and a reason naming the rule, AC #3", () => {
  it("names the classes and, when one fires, the tie-break rule", async () => {
    const { plan } = await runOne("r043", scores({ partial: CERTAIN, dispute: 0.94 }));
    expect(plan.asserted.every((label) => REPLY_CLASSES.includes(label))).toBe(true);
    expect(plan.reason.length).toBeGreaterThan(0);
    expect(plan.reason).toContain("pays part of it");

    const led = await runOne("r011", scores({ partial: 0.90, promise_to_pay: CERTAIN }));
    expect(led.plan.reason).toContain("rule 1");
    expect(led.plan.reason).toContain("money now beats money later");
  });

  it("says plainly when nothing cleared", async () => {
    const { plan } = await runOne("r055", scores({ noise: 0.5 }));
    expect(plan.asserted).toEqual([]);
    expect(plan.reason).toContain("Nothing cleared its threshold");
  });
});

describe("claimed_payment pauses and opens a reconciliation, AC #4", () => {
  it("holds the chase and raises a check, without touching the invoice", async () => {
    const { outcome, store, plan } = await runOne("r001", scores({ claimed_payment: CERTAIN }));

    expect(plan.asserted).toEqual(["claimed_payment"]);
    expect(outcome.results.map((r) => r.action).sort()).toEqual(["open_reconciliation", "pause_chase"]);
    expect(store.chaseState("4417").status).toBe("paused");

    const item = store.itemsFor("r001").find((i) => i.kind === "reconciliation");
    expect(item).toBeDefined();
    expect(item?.summary).toContain("4417");
  });

  it("has no action anywhere in the enum that could mark an invoice paid", () => {
    for (const action of CHASE_ACTIONS) {
      expect(action).not.toMatch(/paid|settle|close|clear/i);
    }
    expect(CHASE_ACTIONS).toHaveLength(8);
  });
});

describe("dispute stops the chase and escalates with the evidence, AC #5", () => {
  it("carries the invoice, the full reply, all seven probabilities and the reason", async () => {
    const s = scores({ dispute: CERTAIN });
    const { outcome, store } = await runOne("r036", s);

    expect(outcome.results.map((r) => r.action)).toEqual(["stop_chase"]);
    const reply = replyById("r036");
    expect(store.chaseState(reply.invoice).status).toBe("stopped");

    const escalation = outcome.escalation;
    expect(escalation).toBeDefined();
    const context = escalation?.context as Record<string, Record<string, unknown>>;
    expect(context["invoice"]?.["number"]).toBe(reply.invoice);
    expect(context["reply"]?.["body"]).toBe(reply.body);
    expect(Object.keys(context["probabilities"] ?? {}).sort()).toEqual([...REPLY_CLASSES].sort());
    expect(escalation?.reason).toContain("argues with the bill");
  });
});

describe("partial and dispute together produce both outcomes, AC #9", () => {
  it("records the partial and escalates the dispute in one run", async () => {
    const { outcome, store, plan } = await runOne(
      "r043",
      scores({ partial: CERTAIN, dispute: 0.94 }),
      { amount: { shape: "stated_figure", fraction: "none" } });

    expect(plan.asserted).toEqual(expect.arrayContaining(["partial", "dispute"]));
    expect(outcome.results.map((r) => r.action).sort()).toEqual(["record_partial", "stop_chase"]);

    const recorded = store.itemsFor("r043").find((i) => i.kind === "partial_payment");
    expect(recorded?.detail["amount"]).toBe(21_000);
    expect(outcome.escalation).toBeDefined();
    expect(outcome.escalation?.context["handoffs"]).toContain("Somebody is arguing with the bill. A person owns that.");
  });

  it("never collapses the two into one", async () => {
    const { plan } = await runOne("r043", scores({ partial: CERTAIN, dispute: 0.94 }));
    expect(plan.asserted.length).toBe(2);
  });
});

describe("promise_to_pay, AC #6", () => {
  it("pauses until the resolved date", async () => {
    const { store } = await runOne(
      "r013",
      scores({ promise_to_pay: CERTAIN }),
      { date: { anchor: "weekday", weekday: "friday", period: "none" } });
    const state = store.chaseState(replyById("r013").invoice);
    expect(state.status).toBe("paused");
    expect(state.resumeOn).toBe("2026-10-16");
  });

  it("records the promise with no date and escalates when nothing fixes one", async () => {
    const { outcome, store } = await runOne("r013", scores({ promise_to_pay: CERTAIN }));

    const item = store.itemsFor("r013").find((i) => i.kind === "promise");
    expect(item?.detail["date"]).toBeNull();
    expect(item?.summary).toContain("none is invented");
    expect(outcome.escalation?.context["handoffs"]).toContain("A promise with no date. A person agrees one.");
    expect(store.chaseState(replyById("r013").invoice).status).toBe("chasing");
  });

  it("flags a promise whose date has already gone by", async () => {
    // r019 is "Scheduled for 10/3.", the ledger sits at 2026-10-11.
    const { outcome, store } = await runOne(
      "r019",
      scores({ promise_to_pay: CERTAIN }),
      { date: { anchor: "day_of_month", weekday: "none", period: "none" } });

    // 10/3 is a Saturday, so the money would have landed Monday the 5th. Either way it is
    // behind the ledger date, which is what makes it a broken promise.
    const item = store.itemsFor("r019").find((i) => i.kind === "overdue_promise");
    expect(item).toBeDefined();
    expect(item?.detail["date"]).toBe("2026-10-05");
    expect(item?.summary).toContain("next working day");
    expect(item?.summary).toContain("2026-10-11");
    expect(outcome.escalation?.context["handoffs"]).toContain("The date they promised has already gone by.");
  });
});

describe("partial resolves its amount three ways, AC #8", () => {
  it("records a fraction worked out against the open balance", async () => {
    const { store } = await runOne(
      "r011",
      scores({ partial: CERTAIN }),
      { amount: { shape: "fraction_of_balance", fraction: "half" } });
    const balance = fixtures.byInvoice.get(replyById("r011").invoice)?.openBalance ?? 0;
    expect(store.itemsFor("r011").find((i) => i.kind === "partial_payment")?.detail["amount"]).toBe(balance / 2);
  });

  it("records nothing and escalates when no amount can be worked out", async () => {
    const { outcome, store } = await runOne("r011", scores({ partial: CERTAIN }));
    expect(store.itemsFor("r011").find((i) => i.kind === "partial_payment")?.detail["amount"]).toBeNull();
    expect(outcome.escalation).toBeDefined();
  });
});

describe("question pauses and hands over, AC #10", () => {
  it("stops chasing someone who is waiting on an answer", async () => {
    const { outcome, store } = await runOne("r024", scores({ question: CERTAIN }));
    const reply = replyById("r024");

    expect(outcome.results.map((r) => r.action)).toEqual(["pause_chase"]);
    expect(store.chaseState(reply.invoice).status).toBe("paused");
    expect(outcome.escalation?.context["reply"]).toMatchObject({ body: reply.body });
  });
});

describe("wrong_contact stops and asks a person to find the right one, AC #11", () => {
  it("names the reply to read, not an address the system guessed", async () => {
    const { outcome, store } = await runOne("r053", scores({ wrong_contact: CERTAIN }));
    const reply = replyById("r053");

    expect(store.chaseState(reply.invoice).status).toBe("stopped");
    const item = store.itemsFor("r053").find((i) => i.kind === "contact_correction");
    expect(item?.detail["readReply"]).toBe("r053");
    expect(item?.detail["assertedClass"]).toBe("wrong_contact");

    // r053 names "r.alvi@lakeshorect.org" in its body. Nothing must have lifted it out.
    const serialised = JSON.stringify(item);
    expect(serialised).not.toContain("r.alvi@");
    expect(outcome.escalation).toBeDefined();
  });
});

describe("noise neither pauses nor advances the chase, AC #12", () => {
  it("leaves chase state untouched", async () => {
    const { outcome, store } = await runOne("r055", scores({ noise: CERTAIN }));
    const reply = replyById("r055");

    expect(outcome.results).toEqual([]);
    expect(outcome.escalation).toBeUndefined();
    expect(store.chaseState(reply.invoice)).toMatchObject({ status: "chasing", resumeOn: null });
  });

  it("except on r072, where the unsubscribe guard fires, AC #15", async () => {
    const { outcome, store } = await runOne("r072", scores({ noise: CERTAIN }));
    const reply = replyById("r072");

    expect(outcome.results.map((r) => r.action)).toEqual(["stop_contacting"]);
    expect(store.chaseState(reply.invoice).status).toBe("suppressed");
    expect(store.itemsFor("r072").find((i) => i.kind === "stop_contacting")).toBeDefined();
  });
});

describe("the gate degrades toward a person, AC #13", () => {
  it("escalates when no class clears, whatever the highest probability was", async () => {
    const justUnder = DEFAULT_THRESHOLDS.act.question - 0.01;
    const { outcome, plan, store } = await runOne("r024", scores({ question: justUnder }));

    expect(plan.asserted).toEqual([]);
    expect(outcome.results).toEqual([]);
    expect(outcome.escalation).toBeDefined();
    expect(store.chaseState(replyById("r024").invoice).status).toBe("chasing");
  });

  it("escalates a review-band class without acting on it", async () => {
    const { outcome, plan } = await runOne(
      "r036",
      scores({ dispute: 0.5, noise: CERTAIN }));

    expect(plan.asserted).toEqual(["noise"]);
    expect(plan.review).toContain("dispute");
    expect(outcome.results).toEqual([]);
    expect(outcome.escalation?.reason).toContain("between the two lines");
  });

  it("acts at exactly the act threshold and only escalates a hair below it", async () => {
    const at = await runOne("r024", scores({ question: DEFAULT_THRESHOLDS.act.question }));
    expect(at.plan.asserted).toEqual(["question"]);

    const under = await runOne("r024", scores({ question: DEFAULT_THRESHOLDS.act.question - 0.001 }));
    expect(under.plan.asserted).toEqual([]);
    expect(under.plan.review).toEqual(["question"]);
  });
});
