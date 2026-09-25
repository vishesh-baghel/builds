import { ARCH } from "./arch";
import { CPA } from "./cpa";
import { GC } from "./gc";
import { LAW } from "./law";
import { MED } from "./med";
import { PROP } from "./prop";
import { REC } from "./rec";
import type { TradeRules } from "./types";

export type { Owner, TopicRule, TradeRules } from "./types";

/** Every firm's rules, by firm id. Each one's instrument was labelled against them. */
export const RULES: Readonly<Record<string, TradeRules>> = {
  arch: ARCH, law: LAW, prop: PROP, med: MED, cpa: CPA, gc: GC, rec: REC,
};

export function rulesFor(firmId: string): TradeRules {
  const rules = RULES[firmId];
  if (!rules) throw new Error(`no rules for firm ${firmId}`);
  return rules;
}
