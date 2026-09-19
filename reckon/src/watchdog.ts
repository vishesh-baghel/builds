import type { Clock } from "./clock";
import { formatDay } from "./clock";
import { ChaseStore, type WorkItem } from "./state";

/**
 * The promise watchdog.
 *
 * A promise to pay pauses the chase until a date. Nothing in the pipeline notices when that
 * date arrives and no money did — which is the exact failure the build exists to stop, so it
 * cannot be left to a human remembering. This sweeps the paused invoices against an injected
 * clock and raises an overdue-promise item for each one whose date has gone by.
 *
 * Injected clock, not `Date.now()`: this is tested by advancing time, never by waiting for it.
 */
export function sweepOverduePromises(store: ChaseStore, clock: Clock): readonly WorkItem[] {
  const today = formatDay(clock.now());
  const raised: WorkItem[] = [];

  for (const state of store.paused()) {
    if (state.resumeOn === null || state.resumeOn > today) continue;

    const item: WorkItem = {
      // Keyed on the date as well as the invoice, so a second sweep on the same day is a no-op
      // while a later broken promise on the same invoice still raises its own item.
      id: `${state.invoice}:overdue_promise:${state.resumeOn}`,
      kind: "overdue_promise",
      invoice: state.invoice,
      replyId: state.replyId ?? state.invoice,
      summary: `Promised ${state.resumeOn}; it is now ${today} and nothing arrived`,
      detail: { invoice: state.invoice, promisedOn: state.resumeOn, sweptOn: today },
    };

    store.addWorkItem(item);
    store.resumeChasing(state.invoice, `the promise of ${state.resumeOn} was not kept`);
    raised.push(item);
  }

  return raised;
}
