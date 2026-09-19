# @builds/shared

The spine every build plugs into. This package is deliberately boring and deliberately stable:
it is the part of a build nobody watching a demo can see, which is exactly why it should not be
rewritten each week.

## The pipeline

`extract` → `classify` → `decide` → `act` → `escalate` → `log`

`runPipeline` enforces one invariant: a `Decision` with `autoExecutable: false` never reaches
`act`. Low model confidence routes to a human with context attached, instead of guessing.

## The reliability primitives

| Primitive | Why it exists |
|---|---|
| `withRetry` | Vendor APIs fail mid-run. Exponential backoff with jitter, and fail-fast on errors retrying cannot fix. |
| `once` / `IdempotencyStore` | A side effect happens once — the reminder is not re-sent on retry or redeploy. |
| `AuditLog` | Every decision and its reason, reviewable by the owner. Not a black box. |
| `SpendCap` | A hard ceiling. A public demo a stranger can make expensive is not shippable. |

The in-memory implementations are for demos and tests. Production backends (KV, Durable Objects,
Postgres) are supplied per build.
