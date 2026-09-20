# reckon, reads what the debtor writes back

**[reckon.visheshbaghel.com](https://reckon.visheshbaghel.com)**

Chasing an unpaid invoice is two jobs. **Sending the reminder** is a commodity, QuickBooks
bundles one inside an $85/mo plan, Chaser lists $180/mo for firms under $5M revenue.
**Reading the reply** is the other half: telling a promise-to-pay from a dispute, noticing that
someone says they already paid, spotting that the message reached the wrong person entirely.

**The reading half is not an untouched gap, and this repo should not pretend otherwise.**
Checked against Chaser's own pages on 2026-09-20: their Gmail and Outlook integrations state
that *"any replies to these chase emails land directly in your Gmail inbox while simultaneously
being logged within the corresponding customer history in Chaser"*, and their AI email generator
states that *"The AI reads each debtor's message, detects intent (promise-to-pay, dispute,
document request, etc.), and produces a courteous draft"*. Intent detection on inbound replies
is a shipping feature of an incumbent.

What that incumbent feature produces is **a draft for a person to send**. What this build
produces is **a typed decision that moves the chase state**, with no prose written and nothing
sent. Those are different outputs, and the second is the one this experiment is about:

- the reply becomes a class set, not a sentence;
- the class set drives a deterministic decision over a closed action enum;
- the confidence threshold belongs to the operator and is visible;
- every decision leaves an audit row, and the per-class accuracy is published with its `n`.

Sources: [Chaser · Gmail](https://www.chaserhq.com/integrations/gmail) ·
[Chaser · AI email generator](https://www.chaserhq.com/features/ai-email-generator) ·
[Chaser · email reminders](https://www.chaserhq.com/features/email)

**The design frame is retrofit.** Whatever the firm already runs keeps running and keeps
sending. Reckon reads what comes back and updates the chase state. **It sends nothing**, there
is no mail dependency, no send path, and no endpoint anywhere that accepts a destination.

## What it is

A self-built experiment on **synthetic data**. The firm, the customers, the fifteen invoices and
all seventy-two replies are invented. **No client data, no client names, no client results.**

A debtor reply arrives. The six stages from `@builds/shared` run: the reply is joined to its
invoice, judged across seven classes, decided on deterministically, applied as chase-state
changes and work items, handed to a person where a person is needed, and written to an audit
log row by row.

## The numbers

Measured on the 72 committed replies in `fixtures/replies.jsonl`, which were labelled **before**
the build. Full detail, per class and with every `n`, in [SCORECARD.md](./SCORECARD.md).

**There is no before/after claim anywhere in this repo.** No pre-baseline was taken, and
inventing one afterwards would be worse than having none. What is published is the system's own
accuracy on a frozen instrument, which needs no counterpart.

| figure | value |
|---|---|
| replies in the instrument | 72 (51 ordinary, 21 deliberate edge cases) |
| primary class correct, ordinary | 50 / 51 |
| primary class correct, hard | 15 / 21 |
| errors caught by the confidence gate, hard | 6 / 6 |
| errors caught by the confidence gate, ordinary | **0 / 1** |
| both classes asserted on genuinely two-class replies | 4 / 5 |
| cost per reply | 0.0084¢ |
| machine time per reply, median | 685 ms |
| model | `jev-1.13.0` via TypeSafe |

**There is deliberately no single accuracy figure.** The class distribution is imbalanced on
purpose, to look like a real chasing inbox: a system answering `noise` every time would score
25% and one headline number would flatter it on exactly the rare, expensive classes that matter.

**The one ordinary error was not caught, and that is the most useful line on this page.** It is
an out-of-office naming a live alternate contact, read as `noise` instead of `wrong_contact`.
`noise` takes no action, so nothing escalated and nobody would have looked. That is precisely
the case tie-break rule 3 exists for, and on the hard subset, where six errors happened, the
gate caught all six. Published rather than rounded away.

Any human-time figure on the sandbox is a **declared estimate**, held in one named constant,
rendered with the word "estimate", and never placed beside a measured figure.

## How the judgment is shaped

**Seven Nouls, one per class, not one Choice across seven labels.** Six of the 72 replies
carry two classes at once: paying part of a bill while disputing the rest, claiming payment
while offering to reissue. A pick-one answer manufactures a wrong answer on every one of them.

**A Noul returns a single probability and carries no confidence value**, so the gate is a
probability band per class: act, review, ignore. `dispute` and `claimed_payment` sit higher than
the rest, because their errors cost the most.

**Dates and amounts are components plus code assembly, not extraction.** Only 4 of the 12
`promise_to_pay` replies contain a numeral; the rest say "by Friday", "in the next cycle",
"before month end". Jev names the *kind* of time reference; code does the calendar arithmetic
against a fixed ledger date. When nothing fixes a date, **nothing is invented**, the promise is
recorded dateless and a person sets one. A guessed date silently resumes a chase.

**The decision is plain TypeScript.** No model chooses what happens. Reply text is untrusted
throughout and the action space is a closed enum, which matters because TypeSafe's own model
notes list adversarial steering as a *current* known weakness. There is no action that marks an
invoice paid; a claim of payment opens a check for a human.

Because only the probabilities are bought, moving the sandbox's threshold costs nothing: the
judgment is unchanged and only the policy re-runs.

## Running it

```bash
pnpm install
pnpm --filter @builds/reckon test        # 90 tests, no vendor key needed, no network
pnpm --filter @builds/reckon dev         # the sandbox on http://localhost:3002
```

The test suite runs with no key present and makes no network call: vendor accuracy is
*reported* by the scorecard, while code-deterministic behaviour is *asserted* by tests that
inject probabilities.

```bash
pnpm --filter @builds/reckon score           # buys 72 judgments, needs TYPESAFE_API_KEY
pnpm --filter @builds/reckon score --replay  # recompute from the committed run artifact
pnpm --filter @builds/reckon snapshot        # regenerate fixtures/fixtures.json from source
```

`score` is **outside the CI gate** and always will be: it needs a vendor key, and a gate that
cannot run without one is a gate that will not run.

### This build makes the repo gate real

`test` and `build` are `--if-present` in CI, and until now no package defined either, so a
green gate proved only that the repo typechecked. reckon ships the repo's first `test` script
and first `build` script. Its `typecheck` spans both the engine sources and the app's `.tsx`,
so the root `pnpm -r typecheck` cannot silently skip the UI.

### Two environment notes

**Cloning on macOS or ARM:** vitest 5 runs on rolldown, whose platform binding is an optional
dependency that pnpm resolves but does not link. `@rolldown/binding-linux-x64-gnu` is named
directly in `package.json` because CI and Vercel are both linux-x64; on another platform, add
the binding for yours.

**The `NODE_OPTIONS` on `dev`, `score` and `smoke`** are not superstition. Node's `fetch`
(undici) runs Happy Eyeballs by default. On a network whose resolver synthesizes NAT64
addresses (`64:ff9b::/96`) for A-only hosts while offering no IPv6 route, a VPN will do this, it races a dead IPv6 connection against the working IPv4 one and stalls until the request times
out. `curl` and Node's own `https` module with `family: 4` are both unaffected; only `fetch`
is. Turning the race off costs nothing on a dual-stack network. Local scripts only: the
deployed runtime never sees these flags.

When it does happen, the sandbox degrades exactly as designed, recorded judgments behind a
visible notice, never an error page, and the route logs the cause server-side so an outage,
a spent cap and a bad key stay distinguishable.

## Environment

See `.env.example`. Every variable is read through `src/env.ts`, which prefers a `RECKON_`
prefixed name and falls back to the unprefixed one, so the deploy can namespace its keys
while a local clone keeps using the names the TypeSafe SDK already expects.
`RECKON_TYPESAFE_API_KEY` is server-side only and is verified absent from the built client
bundle.

**The deploy runs the per-instance counter on purpose, and the Turso variables are unset.** A
serverless instance keeps its own spend counter and its own per-visitor tally, so neither is a
global ceiling; both reset on a cold start or a redeploy. That was worth measuring rather than
assuming, and the measurement is why it is fine:

| | |
|---|---|
| measured cost per judgment | 0.0084¢ |
| a visitor's full 25-call monthly allowance | 0.21¢ |
| calls needed to spend $1 | ~11,900 |
| calls needed to spend $10 | ~119,000 |

The fixed 72 replies cost nothing at all, since they ship with the page and call nothing. Only
the "write your own" tab spends. Setting the two Turso variables turns both counters into real
cross-instance ones with no code change, if that ever stops being true.

### Analytics

Vercel Web Analytics and Speed Insights are on. Both are cookieless and record page-level
counts, with no cross-site identifier and nothing tied to what anyone typed. Reply text, yours
or the fixtures', is never stored anywhere.

### The Turso adapter is written but unexercised

`src/store/turso.ts` implements `SpendCounter` and `IdempotencyStore` against a real database,
and has never run against one. It is kept so that setting two environment variables is the only
thing ever needed, but it should be read as untested code rather than a working fallback.

There is deliberately no mail variable, because there is no send path to configure.

## Layout

```
src/fixtures/   typed loader and schema; parse.ts is filesystem-free so the app can share it
src/questions.ts  seven Nouls plus the date and amount component questions
src/policy.ts   thresholds, the three bands, the five tie-break rules, the unsubscribe guard
src/resolve/    component answers to a date and an amount, in code
src/stages/     the decide stage, the only place that chooses what happens
src/pipeline.ts the six stages wired to @builds/shared
src/run.ts      the one entry point the scorecard and the sandbox both call
src/score.ts    precision, recall, catch rate, the threshold sweep
app/            the sandbox
fixtures/       the measurement instrument, frozen
runs/           every judgment bought, and the full sweep
```
