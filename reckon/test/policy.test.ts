import { describe, expect, it } from "vitest";
import {
  DEFAULT_THRESHOLDS, TIE_BREAKS, assertedFrom, bandFor, derivePrimary,
  renderHumanTimeEstimate, reviewBandFrom, wantsNoContact, HUMAN_MINUTES_PER_REPLY,
  SECONDARY_CREDIT_EXCLUDES,
} from "../src/policy";
import { REPLY_CLASSES } from "../src/types";
import { scores } from "./helpers";

const T = DEFAULT_THRESHOLDS;

describe("the three bands, AC #13", () => {
  it("puts a class at its act threshold in the act band, and a hair below it in review", () => {
    expect(bandFor("question", T.act.question, T)).toBe("act");
    expect(bandFor("question", T.act.question - 0.001, T)).toBe("review");
  });

  it("puts a class at the review threshold in review, and below it in ignore", () => {
    expect(bandFor("question", T.review, T)).toBe("review");
    expect(bandFor("question", T.review - 0.001, T)).toBe("ignore");
  });

  it("holds dispute and claimed_payment to a higher bar than the rest", () => {
    for (const risky of ["dispute", "claimed_payment"] as const) {
      for (const ordinary of ["question", "noise", "wrong_contact", "promise_to_pay"] as const) {
        expect(T.act[risky]).toBeGreaterThan(T.act[ordinary]);
      }
    }
  });

  it("asserts nothing when every class sits in the review band", () => {
    const middling = scores(Object.fromEntries(REPLY_CLASSES.map((l) => [l, 0.5])));
    expect(assertedFrom(middling, T)).toEqual([]);
    expect(reviewBandFrom(middling, T)).toEqual([...REPLY_CLASSES]);
    expect(derivePrimary([], middling).primary).toBeNull();
  });
});

describe("the five tie-break rules, AC #14", () => {
  it("rule 1: money now beats money later", () => {
    const s = scores({ partial: 0.90, promise_to_pay: 0.96 });
    const asserted = assertedFrom(s, T);
    expect(asserted).toEqual(expect.arrayContaining(["partial", "promise_to_pay"]));

    const { primary, tieBreak } = derivePrimary(asserted, s);
    expect(primary).toBe("partial");
    expect(tieBreak?.rule).toBe(1);
    // Both still hold. A tie-break chooses what leads, never what is discarded.
    expect(asserted).toContain("promise_to_pay");
  });

  it("rule 2: a promise to reply is not a promise to pay", () => {
    const s = scores({ question: 0.85, promise_to_pay: 0.93 });
    const { primary, tieBreak } = derivePrimary(assertedFrom(s, T), s);
    expect(primary).toBe("question");
    expect(tieBreak?.rule).toBe(2);
  });

  it("rule 3: an actionable redirect outranks an auto-reply", () => {
    const s = scores({ wrong_contact: 0.82, noise: 0.95 });
    const { primary, tieBreak } = derivePrimary(assertedFrom(s, T), s);
    expect(primary).toBe("wrong_contact");
    expect(tieBreak?.rule).toBe(3);
  });

  it("rule 4: acknowledging the email is not acknowledging the debt", () => {
    const s = scores({ noise: 0.85, claimed_payment: 0.91 });
    const { primary, tieBreak } = derivePrimary(assertedFrom(s, T), s);
    expect(primary).toBe("noise");
    expect(tieBreak?.rule).toBe(4);
  });

  it("rule 5: disputing the terms is still a dispute", () => {
    const s = scores({ dispute: 0.90, question: 0.97 });
    const { primary, tieBreak } = derivePrimary(assertedFrom(s, T), s);
    expect(primary).toBe("dispute");
    expect(tieBreak?.rule).toBe(5);
  });

  it("carries all five, numbered 1 to 5, over classes that exist", () => {
    expect(TIE_BREAKS.map((t) => t.rule)).toEqual([1, 2, 3, 4, 5]);
    for (const rule of TIE_BREAKS) {
      expect(REPLY_CLASSES).toContain(rule.winner);
      expect(REPLY_CLASSES).toContain(rule.loser);
    }
  });

  it("leaves the highest-probability class leading when no rule applies", () => {
    const s = scores({ dispute: 0.91, wrong_contact: 0.96 });
    const { primary, tieBreak } = derivePrimary(assertedFrom(s, T), s);
    expect(primary).toBe("wrong_contact");
    expect(tieBreak).toBeNull();
  });
});

describe("the unsubscribe guard, AC #15", () => {
  it("fires on the committed unsubscribe reply and on its common phrasings", () => {
    for (const body of [
      "Please remove me from this distribution list.",
      "unsubscribe",
      "Stop emailing me about this.",
      "Take me off your list please",
      "We would like to opt out of these reminders.",
    ]) {
      expect(wantsNoContact(body)).toBe(true);
    }
  });

  it("does not fire on ordinary replies", () => {
    for (const body of [
      "We processed this on the 14th - check with your office.",
      "Can you remove the duplicate line from the invoice?",
      "Paying the undisputed portion now - 21,000.",
    ]) {
      expect(wantsNoContact(body)).toBe(false);
    }
  });
});

describe("the human-time figure is a declared estimate, AC #28", () => {
  it("renders with the word estimate wherever it appears", () => {
    expect(renderHumanTimeEstimate()).toContain("estimate");
    expect(renderHumanTimeEstimate(9)).toContain("estimate");
    expect(renderHumanTimeEstimate(9)).toContain("9");
  });

  it("lives in one named constant", () => {
    expect(HUMAN_MINUTES_PER_REPLY).toBeGreaterThan(0);
    expect(renderHumanTimeEstimate()).toContain(String(HUMAN_MINUTES_PER_REPLY));
  });
});

describe("noise earns no secondary credit, AC #25", () => {
  it("is the class excluded from also-credit", () => {
    expect(SECONDARY_CREDIT_EXCLUDES).toContain("noise");
  });
});
