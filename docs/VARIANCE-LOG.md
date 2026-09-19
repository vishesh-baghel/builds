# Variance log

What differed between builds and between engagements. Kept because the honest input to any
future decision about generalizing this work is recorded variance, not guessed abstraction.

Add a row whenever a build needs something the shared spine could not supply as-is, or whenever
two clients wanted the same workflow differently.

| Date | Build / client | What varied | Handled by | Worth generalizing? |
|---|---|---|---|---|
| 2026-09-19 | reckon | `Classified` carried one `label` and one `confidence`. The workflow's judgment is multi-label: 6 of the 72 scored replies genuinely carry two classes at once, and collapsing them to one manufactures a wrong answer. | Widened `Classified` in `shared` to carry per-class probabilities, the asserted set and a derived `primary`. | |
| 2026-09-19 | reckon | `PipelineOutcome` was `acted` **or** `escalated`, exclusively. A dispute must stop the chase **and** reach a person; a claimed payment must pause the chase **and** open a reconciliation item. | `Decision` now carries a list of actions plus an `escalate` flag, `act` is called once per action with its own idempotency key, and `runPipeline` returns both results and the optional escalation. | |
| 2026-09-19 | reckon | `log` was documented as the sixth stage but did not exist: `Pipeline` had five methods, `AuditEntry.stage` was a five-value union, and `runPipeline` took no `AuditLog`. The spine documented a pipeline it could not record. | `runPipeline` accepts an `AuditLog` and writes one row per stage that ran; the stage union gained `"log"`. | |

## How to read this

- **Handled by** — a per-build implementation, a new option on a shared module, or a fork.
- **Worth generalizing?** — left blank until the same variance shows up a third time. Twice is
  a coincidence; three times is a requirement.
