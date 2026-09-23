/**
 * sift, shared-inbox triage.
 *
 * The engine, exported for the app, the scripts and the tests. The six stages compose from
 * `@builds/shared`; this barrel exposes the firm vocabulary, the policy, the pure decision, the
 * committed fixtures, the systems of record, and the headless pipeline. Only `jev.ts` and the live
 * route reach the outside world.
 */
export * from "./types";
export * from "./clock";
export * from "./policy";
export * from "./stages/decide";
export * from "./stages/extract";
export * from "./stages/route";
export * from "./triage";
export * from "./fixtures/schema";
export * from "./fixtures/instrument";
export * from "./stages/draft";
export * from "./fixtures";
export { MERIDIAN, PROJECTS, RFI_LOG, SUB_LOG } from "./fixtures/sor";
export * from "./questions";
export * from "./jev";
export * from "./store";
export * from "./pipeline";
export * from "./view";
