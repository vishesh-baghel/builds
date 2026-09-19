# builds

Working automations for the messy, multi-system back-office work that eats owner-led service
firms' weeks. One build a week, each wired into tools a business already runs, each with a
number attached.

> **What these are.** Every build in this repo is a **self-built experiment running on synthetic
> or my own data**. Any number quoted is measured from my own workflow, never a client's. No
> client results appear here unless a client has consented in writing and is named as the source.

## Layout

```
shared/   the spine every build plugs into — pipeline stages, reliability primitives
<build-name>/   one top-level directory per build, named for the build
docs/     the variance log, the build template, the loop runbook
```

Each build is a top-level `<build-name>/` directory and carries its own README with the baseline number, the
stack it uses, and what it deliberately does not do.

## How the builds are put together

The engineering spine stays constant so each build is a variation, not a new project. What
varies per build is the visible surface: the AI product integrated, the deploy target, and the
system of record it wires into.

Every build composes the same six stages from `shared`:

`extract` → `classify` → `decide` → `act` → `escalate` → `log`

and every build that touches the outside world uses the reliability primitives — idempotency on
side-effecting actions, retry with backoff on vendor API failure, an audit log of every decision,
and a hard spend cap. A demo that only shows the happy path is not finished.

## Stack

TypeScript throughout. Deploy target varies per build (Vercel, Cloudflare Workers) — see each
build's README. No no-code tooling: the glue is code.

## How the work gets done

Intake, planning, implementation, validation and review run as Claude Code loops committed to
this repo — `.claude/skills/` for the stages, `scripts/loop/` for the drivers that chain them
headlessly. `docs/LOOP-RUNBOOK.md` explains the whole chain and why each stage is shaped the
way it is.
