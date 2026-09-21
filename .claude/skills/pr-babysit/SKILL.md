---
name: pr-babysit
description: builds repo only. Watch an open GitHub PR — review it if nobody has, poll CI checks and review comments, address what comes in, push fixes, and resolve threads. Use inside /loop to tend a PR until it is ready to merge.
---

# PR babysit

Stage 6 of the automated workflow. This is a **time-based loop**: one iteration does one sweep
of the PR and returns. Drive it with `/loop /pr-babysit`, or run it once by hand.

Argument: a PR number, or nothing (resolve from the current branch).

## One iteration

### 1. Read the PR state

```bash
gh pr view <id> --json number,state,title,reviewDecision,mergeStateStatus,comments
gh pr checks <id>
gh api repos/:owner/:repo/pulls/<id>/comments --jq '.[] | select(.in_reply_to_id == null) | {id, path, line, body}'
```

If the PR is already `MERGED` or `CLOSED`, say so in one line and stop the loop
(`ScheduleWakeup` with `stop: true`, or tell the user to press Esc).

### 2. Review it first, if nobody has

This loop **responds** to review comments. It does not, by itself, produce any — so a PR
nobody reviewed will sail through it looking perfectly healthy. Check before assuming silence
means approval:

```bash
gh pr view <id> --json comments \
  --jq '[.comments[] | select(.body | startswith("[builds-review]"))] | length'
```

If that is `0`, the PR has never been reviewed from our side. Run the review **as its own
process**, not inline — a review sharing this session's context is not a second opinion:

```bash
scripts/loop/task-loop.sh <build> --review-only --pr <id>
```

Wait for it in the foreground, then re-read the comments and carry on with this iteration. Do
it once; the `[builds-review]` tag stops later iterations from re-reviewing.

If you cannot resolve a build name for the PR, invoke the `review-pr` skill directly and say in
your summary that the review ran in-session, so the user knows to weigh it accordingly.

### 3. Handle CI

Only act on a **failed** check. A pending run is not a signal to do anything — report "still
running" and pick a longer interval next iteration rather than burning a turn.

On failure, pull the failing job's log and diagnose from it:

```bash
gh run list --branch "$(git branch --show-current)" --limit 3
gh run view <run-id> --log-failed 2>&1 | tee /tmp/ci-<id>.log
```

Fix minimally: this is a PR under review, not a place to refactor. Re-verify locally with the
narrowest command that covers the fix before pushing. **Never re-run CI to inspect a failure
you already have the log for.**

### 4. Handle review comments

For each unresolved comment:

- **Clear and actionable** → make the change, then reply on the thread saying what you did,
  then resolve it:
  ```bash
  gh api repos/:owner/:repo/pulls/<id>/comments/<comment-id>/replies \
    -f body="Fixed in <sha>: <what changed>"
  ```
  Resolving a thread needs the GraphQL mutation `resolveReviewThread` with the thread id from
  `gh api graphql`; if that is unavailable, reply with `Resolved: <reason>` and say in your
  summary that threads were answered but not formally resolved.
- **Ambiguous, or architecturally significant** → do not guess. Reply asking the specific
  question, leave the thread open, and surface it to the user in your iteration summary.
- **Disagreement** → if the comment is based on a wrong premise, say so with evidence rather
  than complying. Leave the thread open for the human to settle.

Never resolve a thread you did not actually address.

### 5. Push

```bash
git push
```

One commit per iteration is fine here — the single-commit rule applies to a session's feature
work, not to review-response commits, which are more readable separated.

### 6. Merge gate

Merge only when **all** of these hold:

- Every CI check is green.
- No unresolved comments remain.
- The PR carries a `[builds-review]` summary with an `approve` verdict.
- The local gate still passes for anything you changed in this loop.

Even then, **merging is not automatic by default**. Report "ready to merge" and wait, unless
the user has set `BUILDS_AUTO_MERGE=1` in the environment for this loop. Merging is
outward-facing and effectively irreversible on `main`, so it stays a deliberate act.

When cleared:

```bash
gh pr merge <id> --squash --delete-branch
```

Squash, not merge-commit: one build's work reads as one commit in this repo's history.

### 7. Constraints

- Irreversible or outward-facing actions — pushing, closing, merging — only proceed when they
  continue something this conversation already authorized.
- Never re-run a command to inspect a failure; `tee` and read back.
- Never push a fix that weakens a test to make CI green. If the test is wrong, say why in the
  thread and let the human call it.
- The claims-discipline rules apply to review replies too: no client names, no real numbers
  that were not baselined, in a public PR thread.

### 8. Pick the next interval

End each iteration by saying what you observed and rescheduling accordingly:

- CI running, or comments actively arriving → check back in ~5–10 minutes.
- Quiet, waiting on a human reviewer → 30–60 minutes.
- Merged, closed, or blocked on a question only the user can answer → stop the loop.

Do not poll a quiet PR every minute. The loop costs tokens per iteration whether or not
anything changed.
