/**
 * Environment, read in one place. The deploy prefixes variables with `TALLY_` so one account can
 * host several builds without them reading each other's keys; locally the unprefixed names the
 * TypeSafe SDK already expects still work. Prefixed wins where both are set.
 */
const read = (name: string): string | undefined => {
  const prefixed = process.env[`TALLY_${name}`];
  if (prefixed !== undefined && prefixed.trim() !== "") return prefixed;
  const plain = process.env[name];
  return plain !== undefined && plain.trim() !== "" ? plain : undefined;
};

export const apiKey = (): string | undefined => read("TYPESAFE_API_KEY");

/** Drex serves the TypeSafe wire protocol here. */
export const baseURL = (): string => read("TYPESAFE_BASE_URL") ?? "https://drex.nace.ai";

export const model = (): string => read("TYPESAFE_DEFAULT_MODEL") ?? "drex-latest";

/** Hard ceiling on input tokens per run. */
export const tokenCap = (): number => {
  const value = Number(read("TOKEN_CAP"));
  return Number.isFinite(value) && value > 0 ? value : 30_000_000;
};
