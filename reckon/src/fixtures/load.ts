import { readFileSync } from "node:fs";
import type { Reply } from "../types";
import { buildFixtureSet, parseAgingCsv, parseRepliesJsonl, type FixtureSet } from "./parse";

/**
 * Reading the fixture set from disk.
 *
 * Tests and scripts come through here. The sandbox does not: it imports the committed
 * `fixtures.json` snapshot instead, because a bundler has no filesystem and a serverless
 * function should not be reading authored files at request time. `snapshot.test.ts` asserts the
 * two agree, so the snapshot cannot drift away from the CSV and JSONL it is generated from.
 */

const read = (name: string): string =>
  readFileSync(new URL(`../../fixtures/${name}`, import.meta.url), "utf8");

export function loadFixtures(): FixtureSet {
  return buildFixtureSet(parseAgingCsv(read("ar-aging.csv")), parseRepliesJsonl(read("replies.jsonl")));
}

/**
 * The adversarial inputs, deliberately outside the scored 72. They share the reply shape so
 * they can run through the same pipeline, but they never enter `replies.jsonl` — mixing them
 * into the frozen set would change what the published number measures.
 */
export function loadAdversarial(): Reply[] {
  return parseRepliesJsonl(read("adversarial.jsonl"), "adversarial.jsonl");
}

export { buildFixtureSet, parseAgingCsv, parseRepliesJsonl, type FixtureSet } from "./parse";
