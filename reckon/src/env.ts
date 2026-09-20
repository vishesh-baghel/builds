/**
 * Environment, read in one place.
 *
 * The deploy names its variables with a `RECKON_` prefix so one Vercel account can host
 * several builds off the same vendors without them reading each other's keys. Locally the
 * unprefixed names still work, because that is what the TypeSafe SDK and every other project
 * on this machine already use, and having to rename a key to run a script is friction with
 * nothing behind it.
 *
 * Prefixed wins where both are set.
 */
const read = (name: string): string | undefined => {
  const prefixed = process.env[`RECKON_${name}`];
  if (prefixed !== undefined && prefixed.trim() !== "") return prefixed;
  const plain = process.env[name];
  return plain !== undefined && plain.trim() !== "" ? plain : undefined;
};

export const typesafeApiKey = (): string | undefined => read("TYPESAFE_API_KEY");
export const hasTypesafeKey = (): boolean => typesafeApiKey() !== undefined;

export const tursoUrl = (): string | undefined => read("TURSO_DATABASE_URL");
export const tursoToken = (): string | undefined => read("TURSO_AUTH_TOKEN");

/** The whole demo's monthly ceiling, in cents. Overridable so a deploy can tighten it. */
export const capCents = (): number => {
  const raw = read("CAP_CENTS");
  const value = raw === undefined ? Number.NaN : Number(raw);
  return Number.isFinite(value) && value > 0 ? value : 2_500;
};
