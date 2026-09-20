import { NextResponse } from "next/server";
import { SpendCapExceededError, SpendCap } from "@builds/shared";
import { buildFixtureSet } from "../../../src/fixtures/parse";
import { judge, type Judgment } from "../../../src/jev";
import { jevClient } from "../../../src/jev";
import { SPEND_CAP_CENTS } from "../../../src/run";
import { readVisitor, withCookie } from "../../../lib/visitor";
import { backend } from "../../../src/store/turso";
import type { Invoice, Reply } from "../../../src/types";
import run from "../../../runs/run.json" with { type: "json" };
import snapshot from "../../../fixtures/fixtures.json" with { type: "json" };

/**
 * Buys one fresh judgment for one committed fixture.
 *
 * Note what this handler does **not** accept: no free text, no destination of any kind, no
 * threshold. The only input is an id that must already exist in the frozen fixture set, so the
 * widest thing a visitor can do is ask for a reply that is already committed to the repo.
 *
 * Every path returns 200 with a `source` field. A visitor who has run out of allowance, or a
 * month that has hit its ceiling, gets the recorded judgment and a notice — never an error
 * page, and never a recorded answer dressed up as a live one.
 */

const VISITOR_COOKIE = "reckon_vid";

type Recorded = Record<string, Judgment & { elapsedMs: number }>;
const recorded = (run as { date: string; judgments: Recorded }).judgments;

export interface JudgeResponse {
  readonly id: string;
  readonly judgment: Judgment;
  readonly source: "live" | "recorded";
  readonly why: string | null;
  readonly spentCents: number;
  readonly capCents: number;
  readonly persistent: boolean;
}

export async function POST(request: Request): Promise<NextResponse> {
  let id: unknown;
  try {
    ({ id } = (await request.json()) as { id?: unknown });
  } catch {
    return NextResponse.json({ error: "expected a JSON body" }, { status: 400 });
  }

  if (typeof id !== "string" || !/^r\d{3}$/.test(id)) {
    return NextResponse.json({ error: "id must name a committed fixture" }, { status: 400 });
  }

  const fixtures = buildFixtureSet(snapshot.invoices as Invoice[], snapshot.replies as Reply[]);
  const reply = fixtures.replies.find((candidate) => candidate.id === id);
  const invoice = reply ? fixtures.byInvoice.get(reply.invoice) : undefined;
  if (!reply || !invoice) {
    return NextResponse.json({ error: "no such fixture" }, { status: 404 });
  }

  const store = await backend();
  const visitor = readVisitor(request);

  const replay = (why: string, spentCents: number): NextResponse => {
    const judgment = recorded[id as string];
    if (!judgment) return NextResponse.json({ error: "no recorded judgment" }, { status: 500 });
    return withCookie(NextResponse.json({
      id, judgment, source: "recorded", why,
      spentCents, capCents: SPEND_CAP_CENTS, persistent: store.persistent,
    } satisfies JudgeResponse), visitor);
  };

  if (!process.env["TYPESAFE_API_KEY"]) {
    return replay("No vendor key on this deploy, so every judgment here is one already bought and committed.", await store.counter.spentCents());
  }
  if (await store.overLimit(visitor)) {
    return replay("You have used this month's allowance of live judgments. Showing recorded ones.", await store.counter.spentCents());
  }

  try {
    const judgment = await judge(id, {
      invoice: {
        number: invoice.invoiceNo, customer: invoice.customer, amount: invoice.amount,
        open_balance: invoice.openBalance, days_past_due: invoice.daysPastDue, terms: invoice.terms,
      },
      reply: { subject: reply.subject, body: reply.body },
    }, {
      client: jevClient(),
      cap: new SpendCap(store.counter, SPEND_CAP_CENTS),
      counter: store.counter,
    });

    return withCookie(NextResponse.json({
      id, judgment, source: "live", why: null,
      spentCents: await store.counter.spentCents(), capCents: SPEND_CAP_CENTS,
      persistent: store.persistent,
    } satisfies JudgeResponse), visitor);
  } catch (error) {
    if (error instanceof SpendCapExceededError) {
      return replay("This month's demo budget is spent. Showing the recorded run instead.", await store.counter.spentCents());
    }
    // Degrading to the recorded run is the right thing for the visitor and the wrong thing to
    // do silently: a handler that turns every vendor failure into a clean 200 with no trace
    // leaves nobody able to tell a cap from an outage from a bad key. The visitor still sees a
    // notice rather than an error; the operator gets the cause.
    console.error(`[judge] ${id} fell back to the recorded run:`, error);
    return replay("The vendor did not answer, so this is the recorded judgment.", await store.counter.spentCents());
  }
}
