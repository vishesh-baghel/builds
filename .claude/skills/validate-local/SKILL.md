---
name: validate-local
description: builds repo only. Run the repo gate — typecheck, test, build — scoped to the blast radius of the change, from the current worktree. Use before pushing, or any time you need real evidence rather than an impression.
---

# Validate local

Stage 4 of the automated workflow. Runs the same gate CI runs, from **this worktree**, scoped
to what actually changed.

## Step 0 — The worktree must be installed

A fresh worktree has no `node_modules` and every command below fails in a way that looks like
a code error but is not:

```bash
pnpm install --frozen-lockfile
```

`task-loop.sh` already does this when it creates the worktree. Run it yourself only if
`node_modules/` is missing.

## Step 1 — Scope the run to the blast radius

Full-workspace validation is cheap here compared to what it protects, but a targeted run that
actually covers the change beats a broad one you cut short.

| Change shape | Run |
|---|---|
| One POC, no `shared/` change | `pnpm --filter <poc> typecheck && pnpm --filter <poc> test && pnpm --filter <poc> build` |
| Anything under `shared/` | the full gate below — **always**, no exceptions |
| Docs, README, PRD only | `pnpm -r typecheck` as a sanity check; say plainly that no tests were relevant |
| New dependency added | full `pnpm -r`, plus confirm `pnpm-lock.yaml` is committed |

**A `shared/` change validated against one POC is the classic silent break in this repo.**
`shared` is consumed by every build; list the consumers before you decide scope:

```bash
rg -ln "@builds/shared|\.\./shared" --glob '!node_modules' .
```

State which scope you chose and why before running it.

## Step 2 — Run it, capturing output

Always `tee`. Always foreground.

```bash
pnpm -r typecheck            2>&1 | tee /tmp/validate-typecheck.log && \
pnpm -r --if-present test    2>&1 | tee /tmp/validate-test.log && \
pnpm -r --if-present build   2>&1 | tee /tmp/validate-build.log
```

**`tee` masks the exit code.** `$?` after a pipeline is `tee`'s status, not the command's —
check `${PIPESTATUS[0]}`, or read the log for the failure rather than trusting a silent 0.
That masking is how a red gate gets reported as green.

**`test` and `build` are `--if-present` and currently match no package.** They pass without
running anything. A green gate today means "it typechecks" — say that plainly in your report
rather than implying suites ran.

**Run in the FOREGROUND and block on it — never background it and end your turn.** A
backgrounded command is killed when the turn that spawned it ends: the suite never runs, and
the run looks "in progress" while nothing is happening. Wait for it, then read the log.

Read the log file back. **Never re-run a command to inspect a failure** — you already have the
output.

## Step 3 — Triage failures

For each failure decide, from the captured log:

- **Real regression** → fix, re-verify that package only.
- **Fixture drift** → a fixture in `<build-name>/src/fixtures/` no longer matches the shape the code
  expects. Fix whichever is actually wrong; do not edit the fixture just to make the test
  pass, that is how a test stops proving anything.
- **Environment** → missing install, wrong Node version (needs >= 20), a stale `dist/` from a
  previous build. Fix the environment, do not "fix" the test.
- **A test that needs a credential** → that test should have been a fixture test. It will fail
  in CI too. Say so rather than papering over it locally.

Iterate until green, or until you can state precisely why a residual failure is not caused by
this change.

## Step 4 — Check what the gate does not catch

The gate proves the code compiles and the tests pass. It does not prove the build is honest.
Before reporting green, confirm by reading, not by running:

- Every side-effecting action goes through `shared/src/reliability/idempotency.ts`.
- Every vendor call goes through `retry.ts`.
- Every decision writes an `audit-log.ts` entry.
- The spend cap is set and enforced, not just imported.
- No real credential, client name, or client-derived number entered the diff.

A gate-green build missing one of these is not validated, it is only compiled.

## Step 5 — Report

Emit a short verdict: scope chosen and why, commands run, pass/fail counts, anything
knowingly skipped, and the log paths. Silence about a skipped check reads as coverage that did
not happen — always say what you did not run.
