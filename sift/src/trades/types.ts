/**
 * A firm's rules, stated once: who owns each kind of message, how its priority is set, and what the
 * model is told each kind means. Everything that differs between trades lives in one of these, so
 * the extract, route and decide stages stay the same code for every firm.
 *
 * The labels in each firm's instrument were written against its rules, so what a scorecard measures
 * is whether the judgment, the join and the date parse land a message where the rules say it belongs.
 */

/**
 * Who a topic goes to.
 *
 * `owner` is the principal. `slot` is one of the three people named on the matched project row
 * (`coordinator`, `lead`, `reviewer`, whatever each firm calls them); with no matched project it goes
 * to a person to decide. `person` is one fixed member of staff. `none` labels it and leaves it with
 * nobody. `ask` hands it to a person because none of the usual kinds fit.
 */
export type Owner =
  | { readonly to: "owner" }
  | { readonly to: "slot"; readonly slot: "coordinator" | "lead" | "reviewer" }
  | { readonly to: "person"; readonly name: string }
  | { readonly to: "none" }
  | { readonly to: "ask" };

export interface TopicRule {
  readonly owner: Owner;
  /** How a reason string names the kind, as the start of a sentence: "An RFI", "A court notice". */
  readonly noun: string;
  /** The yes/no criteria the model is asked, written from the labelling rules before any run. */
  readonly criteria: { readonly true: string; readonly false: string };
}

export interface TradeRules {
  readonly topics: Readonly<Record<string, TopicRule>>;
  /** Labelled and left: always low priority (pitches, internal mail). */
  readonly low: readonly string[];
  /** A date in one of these is somebody's calendar, not a response clock: no alert, no raised priority. */
  readonly datesAreNotClocks: readonly string[];
  /** A dated item of this kind is never below high (a regulator, a court). */
  readonly datedFloorHigh: readonly string[];
  /** Undated, this kind is high until the firm's log has it, and normal once it has. */
  readonly unloggedHigh: readonly string[];
  /** Undated, this kind is high on a repeat ask and normal on a first one. */
  readonly repeatHigh: readonly string[];
  /**
   * The hard messages that are expected to disagree with these rules even under a perfect judgment,
   * each one a gap recorded in the firm's fixtures README. Ordinary messages may never disagree.
   */
  readonly knownGaps: readonly string[];
}
