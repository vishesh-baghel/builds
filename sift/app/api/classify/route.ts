import { NextResponse } from "next/server";
import { SpendCap } from "@builds/shared";
import { classifyFixture } from "../../../lib/classify";
import { servedMessage } from "../../../lib/firms";
import { readVisitor, withCookie } from "../../../lib/visitor";
import { capCents, hasTypesafeKey } from "../../../src/env";
import { jevClient, judge } from "../../../src/jev";
import { stateFor } from "../../../src/questions";
import { INSTANCE_CEILING_24H, liveStore } from "../../../src/store/turso";

/**
 * Judges one committed message live. The request names a firm and a message and nothing else; the
 * key stays on the server; every limit serves the committed judgment behind a notice.
 */
export async function POST(request: Request): Promise<NextResponse> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "expected a JSON body" }, { status: 400 });
  }
  const store = await liveStore();
  const visitor = readVisitor(request);
  const result = await classifyFixture(raw, {
    hasKey: hasTypesafeKey(),
    store, visitor, capCents: capCents(),
    lookup: servedMessage,
    judge: async (message, firm) => {
      const j = await judge(message.id, firm, stateFor(firm, message), {
        client: jevClient(), cap: new SpendCap(store.counter, capCents()), counter: store.counter,
      });
      return { scores: j.scores, clock: j.clock, model: j.model };
    },
  });
  return withCookie(NextResponse.json(result.body, { status: result.status }), visitor);
}

/** What the page shows beside the live results: whether live judging is on, and what it has cost. */
export async function GET(): Promise<NextResponse> {
  const store = await liveStore();
  return NextResponse.json({
    live: hasTypesafeKey(),
    persistent: store.persistent,
    spentCents: await store.counter.spentCents(),
    capCents: capCents(),
    liveCallsToday: await store.liveCallsToday(),
    ceiling: INSTANCE_CEILING_24H,
  });
}
