/**
 * sift, shared-inbox triage.
 *
 * The engine, exported for the app, the scripts and the tests. The six stages compose from
 * `@builds/shared`; this barrel exposes the firm vocabulary, the policy, the pure decision and the
 * committed fixtures. Nothing here reaches the outside world; `jev.ts` and the pipeline do that.
 */
export * from "./types";
export * from "./clock";
export * from "./policy";
export * from "./stages/decide";
export * from "./fixtures";
