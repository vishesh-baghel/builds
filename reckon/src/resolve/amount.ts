/**
 * Turning what the model saw into an amount, in code.
 *
 * Two of the six `partial` replies state the amount only as a fraction, "half now", "the
 * undisputed portion". Asking a model to multiply is asking it to do the one thing it should
 * not be trusted with here, so Jev names the shape and this file does the arithmetic against
 * the open balance.
 *
 * Where no size can be fixed, "most of it", nothing is recorded and it goes to a person.
 * Recording a guessed number against a real balance is the worst available outcome.
 */

export type AmountShape = "none" | "stated_figure" | "fraction_of_balance";
export type AmountFraction = "none" | "half" | "third" | "quarter" | "most" | "unspecified";

export interface AmountComponents {
  readonly shape: AmountShape;
  readonly fraction: AmountFraction;
}

export interface ResolvedAmount {
  /** The amount being paid now, or null when no size can be fixed. */
  readonly amount: number | null;
  /** How it was worked out. Composed from the components, never written by a model. */
  readonly how: string;
}

const NONE: ResolvedAmount = { amount: null, how: "no amount could be worked out" };

const FRACTIONS: Partial<Record<AmountFraction, number>> = {
  half: 1 / 2,
  third: 1 / 3,
  quarter: 1 / 4,
};

/**
 * Finds a stated figure in the text.
 *
 * Handles the three forms the fixture set uses: `20k`, `21,000` and `$10,000`. Bare one- and
 * two-digit numbers are ignored on purpose, "net 60" and "invoice 4417" are not payments, and
 * a parser loose enough to catch every figure catches those too.
 */
export function parseStatedFigure(body: string): number | null {
  const thousands = /(?:\$\s*)?\b(\d{1,3}(?:\.\d+)?)\s*k\b/i.exec(body);
  if (thousands) {
    const value = Number(thousands[1]) * 1000;
    if (Number.isFinite(value) && value > 0) return value;
  }

  const grouped = /(?:\$\s*)?\b(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?)\b/.exec(body);
  if (grouped) {
    const value = Number(grouped[1]?.replace(/,/g, ""));
    if (Number.isFinite(value) && value > 0) return value;
  }

  const dollars = /\$\s*(\d+(?:\.\d{1,2})?)\b/.exec(body);
  if (dollars) {
    const value = Number(dollars[1]);
    if (Number.isFinite(value) && value > 0) return value;
  }

  return null;
}

export function resolvePartialAmount(
  components: AmountComponents,
  body: string,
  openBalance: number): ResolvedAmount {
  if (components.shape === "stated_figure") {
    const figure = parseStatedFigure(body);
    if (figure === null) return NONE;
    // A figure larger than what is owed is a misread, not a payment. Let a person look.
    if (figure > openBalance) {
      return { amount: null, how: `the figure in the message is larger than the ${openBalance} outstanding` };
    }
    return { amount: figure, how: "the figure stated in the message" };
  }

  if (components.shape === "fraction_of_balance") {
    const share = FRACTIONS[components.fraction];
    if (share === undefined) {
      return { amount: null, how: "a portion was described but not in a way that fixes a size" };
    }
    return {
      amount: Math.round(openBalance * share * 100) / 100,
      how: `'${components.fraction}', worked out against the ${openBalance} outstanding`,
    };
  }

  return NONE;
}
