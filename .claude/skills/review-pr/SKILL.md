---
name: review-pr
description: builds repo only. Review an open GitHub pull request across independent lenses, verify each finding before reporting it, and post surviving findings as inline review comments. Use after opening a PR, or on any PR by number.
---

# Review PR

Stage 5 of the automated workflow. A **second agent** should review, because the agent that
wrote the code is biased toward believing it works.

This skill is that second agent **only when it runs in its own session.** `task-loop.sh`
launches it as a separate `claude -p` process for exactly that reason. If you find yourself
invoking it in the same session that just wrote the code, you are not reviewing — you are
re-reading your own reasoning and agreeing with it. Stop and let the driver do it:

```bash
scripts/loop/task-loop.sh <build> --review-only            # resolves the PR from the branch
scripts/loop/task-loop.sh <build> --review-only --pr 12    # or name it
```

Argument: a PR number, or nothing (resolve from the current branch).

## Step 0 — Resolve the PR

```bash
gh pr view <id> --json number,title,body,headRefName,state,files
gh pr diff <id> > /tmp/pr-<id>.diff
```

Also read the PRD the PR claims to implement. A review that does not check
the diff **against the stated acceptance criteria** is only a style pass.

Read `.claude/plans/<build>-handoff.md` if it exists, but treat it as a **claim, not
evidence**. It is the author's own account of what passed. Where it says a gate was green, the
diff and the PR body should show why you would believe that.

A **merged** PR is still worth reviewing — findings become follow-up tasks rather than change
requests. Say so in the verdict instead of asking for changes that can no longer be pushed to
that branch.

## Step 0b — CI, the plan, and which round this is

Three cheap checks before reading any code:

```bash
gh pr checks <id>
gh pr view <id> --json comments \
  --jq '[.comments[] | select(.body | startswith("[builds-review]"))] | length'
```

**CI.** A red gate is finding one, always, then review anyway, because the author needs
both. Read what green actually covers: the gate is `--if-present`, so it proves only what the
packages in the diff define. `reckon` ships a real suite; a build that ships none gets a green
gate for typechecking alone. Never report "CI is green" as evidence that untested code works.

**The plan.** The branch carries `.claude/plans/<build>-plan.md`. Read it against the PRD's
`AC:BEGIN` block *before* the code: does every acceptance criterion appear in some phase, and
does each phase name a command that would actually prove the ACs it claims? Nobody reviewed
the plan before the code was written — that is a deliberate choice, and this is where the
cost of it is paid. A plan that quietly dropped an AC is the cheapest defect to catch here
and the most expensive to catch after merge.

**Which round.** If the comment count is zero, this is round one: run the full pass below.
If it is non-zero, a previous round already reviewed this PR and new commits have arrived —
go to "Round two" at the end of this file instead, and do not repeat the full pass.

## Step 1 — Review across lenses

Run these as independent passes so findings from one do not anchor the next.

1. **Acceptance criteria** — is each AC actually satisfied, and is there a test proving it?
   An unticked-but-claimed AC is the most common real defect. "Proving" means an **assertion
   on the AC's functional outcome**: for every functional AC, name the test and the specific
   assertion that would fail if that AC were broken. A test that merely exercises the path
   does not count — reject assertions that only check no-throw/non-null, or that assert
   against a mock of the very code under test. The litmus test: would this assertion still
   pass with the feature reverted? If yes, it proves nothing.
2. **The four reliability primitives** — this is the lens that matters most in this repo.
   For every side-effecting action in the diff: is it idempotent, and is there a test that
   calls it twice and asserts one effect? For every vendor call: does it retry with backoff?
   For every decision: is there an audit entry with the input, the classification and the
   reason? Is the spend cap enforced, not merely imported? A missing one is a finding even
   when the tests are green.
3. **Spine reuse** — does the diff add a pipeline, result type, stage contract, or helper that
   `shared/src/` already provides? Every fork of the spine is a place where a fix has to be
   applied twice. Check against CLAUDE.md § "Reuse the spine before writing anything new".
4. **Blast radius of `shared/` changes** — if the diff touches `shared/`, does it break a
   consuming POC? `rg -ln` the import across the build directories and check each. A `shared` change whose
   PR only validated one POC is a finding on its own.
5. **Claims discipline** — did any client name, client data, client-derived number, real
   credential, or unbaselined "result" enter the diff or the README? This repo is public;
   this lens is a hard gate, not a nit.
6. **Correctness** — off-by-one, unhandled rejection, error paths, `await` forgotten in a
   loop, a `catch` that swallows, timezone handling in anything date-driven (invoice chasing
   is date-driven).
7. **Escalation path** — when the agent cannot decide, does a human actually get told, and is
   that path tested? A build that silently drops the hard cases looks better than it is.
8. **Scope & minimality** — did the diff change anything the ACs do not require, and what can
   be deleted? Report these in deletion shape (`delete:` / `stdlib:` / `yagni:` / `shrink:`),
   each with the replacement named. Code beyond the task's scope is a finding even when it is
   correct.

## Step 2 — Try to disprove every finding

Before a finding is reported, argue the case against it. Default to dropping it when
uncertain: a confident wrong finding costs more trust than a missed nit. For a finding to
survive it must have a concrete failure scenario — specific inputs or state producing a
specific wrong output. "This looks fragile" is not a finding.

Drop anything that is:

- Already covered by a test in the diff.
- A pre-existing condition the diff did not introduce (unless the diff makes it reachable).
- Style the toolchain already enforces — it runs in CI, so do not duplicate it by hand.
- A suggestion to **add** robustness, flexibility, config, or abstraction that no AC and no
  concrete failure scenario requires. Reviews that hunt for gaps are how over-engineering
  enters a codebase; this review verifies scope, it does not expand it.

The reliability-primitive lens is the deliberate exception: a missing primitive is a finding
even without a concrete failure scenario, because CLAUDE.md requires it outright.

## Step 3 — Post

Post surviving findings as **inline** comments so they land on the right line:

```bash
gh pr review <id> --comment \
  --body "..." # one call per finding is fine; use the API for exact line anchoring:
gh api repos/:owner/:repo/pulls/<id>/comments \
  -f body="<finding>" -f commit_id="$(gh pr view <id> --json headRefOid --jq .headRefOid)" \
  -f path="<file>" -F line=<n> -f side=RIGHT
```

Then one summary comment. **Start it with the literal tag `[builds-review]`** — `pr-babysit`
and `task-loop.sh` grep for that to tell a reviewed PR from an unreviewed one, and will
re-review a PR that lacks it:

```bash
gh pr comment <id> --body "[builds-review] ..."
```

Include what you reviewed, how many findings survived verification, and an explicit verdict —
`approve`, `changes-requested`, or `comment`.

The PR comments are the **entire deliverable**. Do not generate an HTML report, publish an
Artifact page, or write a separate report document — anything worth saying lands in the
inline comments or the summary comment.

Post the summary comment **even when nothing survived**. A silent review is indistinguishable
from a review that never ran, which is precisely the hole the tag closes. If nothing survived,
say so plainly and approve:

```bash
gh pr review <id> --approve --body "[builds-review] Nothing survived verification. <one line on what was checked>"
```

Note: GitHub refuses `--approve` on your own PR. When the author and reviewer are the same
account — which they are here — post the `[builds-review]` summary comment with an explicit
`verdict: approve` line instead, and say in it that a formal approval is not available to a
self-authored PR. Do not silently skip the summary.

Keep comments to what the author must act on. A review that posts twenty low-value comments
trains the author to skim all of them.

## After posting — findings are decisions, not edicts

Posting is not the end of the review. Every surviving finding must be **driven to an explicit
human decision and then applied by the author** — that is what the `/pr-babysit` loop does:
triage each `[builds-review]` comment, push a fix for the ones the human accepts, reply with
the reason and resolve the ones they reject. The reviewer only comments; it never pushes fixes
to the branch it reviewed. Never leave a finding silently accepted or silently dropped — an
unresolved review comment with no decision is the same failure as no review at all.


## Round two — verifying the previous round

A `pull_request.synchronize` event means the author pushed after a review. Your job is not to
review the PR again. It is to check whether the last round's findings were actually
addressed, and to review only what changed.

```bash
gh pr view <id> --json comments --jq '.comments[] | select(.body|startswith("[builds-review]")) | .body'
gh api repos/:owner/:repo/pulls/<id>/comments --jq '.[] | {id, path, line, body}'
gh pr diff <id> --name-only
```

For every finding from the previous round, reach one of three verdicts and name it:

- **addressed** — point at the commit or hunk that fixes it.
- **not addressed** — still live. Restate it in one line; do not re-argue it.
- **rejected by the author** — they replied with a reason. Judge the reason on its merits and
  say whether it holds. Do not relitigate a call a human made with an argument you have read.

Then review the new commits only, through the same lenses and with the same
try-to-disprove-it discipline. A fix that introduces a fresh defect is exactly what this
round exists to catch.

Post one `[builds-review]` summary comment for the round: the verdict on each prior finding
first, then anything new. **A finding that was neither addressed nor rejected must reappear
in every round until one or the other happens.** That is the mechanism that stops a finding
from being quietly dropped, and it is the reason rounds are cheap to run.
