import { NextResponse } from "next/server";
import { SpendCap, SpendCapExceededError } from "@builds/shared";
import { readReplyText, isProblem, MAX_REPLY_CHARS } from "../../../lib/limits";
import { readVisitor, withCookie } from "../../../lib/visitor";
import { buildFixtureSet } from "../../../src/fixtures/parse";
import { jevClient, judge, type Judgment } from "../../../src/jev";
import { backend } from "../../../src/store/turso";
import type { Invoice, Reply } from "../../../src/types";
import snapshot from "../../../fixtures/fixtures.json" with { type: "json" };

/**
 * Judges a reply the visitor wrote, against a committed invoice.
 *
 * This is the one place a stranger's text reaches the vendor, and it exists because a sandbox
 * that only ever replays committed fixtures reads as hardcoded. It is deliberately the
 * narrowest possible opening:
 *
 * - the text is length-capped and never stored, here or anywhere;
 * - the invoice must be one already in the committed ledger — no numbers a visitor invents;
 * - the same per-visitor allowance and the same hard spend cap as the fixture path;
 * - the text enters Jev `state` as data and is classified. It is never an instruction, and the
 *   action enum is closed in code, so nothing it says can widen what the system may do;
 * - **no replay fallback.** A recorded run holds no judgment for text nobody has written
 *   before, and inventing one would be the exact dishonesty this endpoint exists to disprove.
 *   When it cannot judge, it says so.
 *
 * Nothing classified here touches the published number. The measured figures are the frozen 72
 * and only the frozen 72.
 */

export interface ClassifyResponse {
  readonly judgment: Judgment;
  readonly invoice: string;
  readonly measured: false;
}

export interface ClassifyError {
  readonly error: string;
  readonly retryable: boolean;
}

export async function POST(request: Request): Promise<NextResponse> {
  let body: { text?: unknown; invoice?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "expected a JSON body", retryable: false } satisfies ClassifyError, { status: 400 });
  }

  const text = readReplyText(body.text);
  if (isProblem(text)) {
    return NextResponse.json({ error: text.problem, retryable: false } satisfies ClassifyError, { status: 400 });
  }

  const fixtures = buildFixtureSet(snapshot.invoices as Invoice[], snapshot.replies as Reply[]);
  const invoice = typeof body.invoice === "string" ? fixtures.byInvoice.get(body.invoice) : undefined;
  if (!invoice) {
    return NextResponse.json({ error: "pick an invoice from the committed ledger", retryable: false } satisfies ClassifyError, { status: 400 });
  }

  if (!process.env["TYPESAFE_API_KEY"]) {
    return NextResponse.json({
      error: "This deploy has no vendor key, so it cannot judge new text. The committed replies still work.",
      retryable: false,
    } satisfies ClassifyError, { status: 503 });
  }

  const store = await backend();
  const visitor = readVisitor(request);

  if (await store.overLimit(visitor)) {
    return withCookie(NextResponse.json({
      error: "You have used this month's allowance of live judgments. The committed replies still work.",
      retryable: false,
    } satisfies ClassifyError, { status: 429 }), visitor);
  }

  try {
    const judgment = await judge("visitor", {
      invoice: {
        number: invoice.invoiceNo, customer: invoice.customer, amount: invoice.amount,
        open_balance: invoice.openBalance, days_past_due: invoice.daysPastDue, terms: invoice.terms,
      },
      // Untrusted text. It is classified, never obeyed.
      reply: { subject: `RE: Invoice ${invoice.invoiceNo}`, body: text },
    }, {
      client: jevClient(),
      cap: new SpendCap(store.counter, Number(process.env["RECKON_CAP_CENTS"] ?? 2_500)),
      counter: store.counter,
    });

    return withCookie(NextResponse.json({
      judgment, invoice: invoice.invoiceNo, measured: false,
    } satisfies ClassifyResponse), visitor);
  } catch (error) {
    if (error instanceof SpendCapExceededError) {
      return withCookie(NextResponse.json({
        error: "This month's demo budget is spent, so no new text can be judged. The committed replies still work.",
        retryable: false,
      } satisfies ClassifyError, { status: 429 }), visitor);
    }
    console.error("[classify] vendor call failed:", error);
    return withCookie(NextResponse.json({
      error: "The judgment service did not answer. Try again in a moment.",
      retryable: true,
    } satisfies ClassifyError, { status: 502 }), visitor);
  }
}

export { MAX_REPLY_CHARS };
