/**
 * AC #28: grep the built client bundle for the vendor key and any vendor token. Run after a build.
 *
 *   pnpm --filter @builds/sift build && pnpm --filter @builds/sift check:bundle
 *
 * Reads the key from the environment or `.env.local` only to search for it; it is never printed.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const envFile = join(root, ".env.local");
const fromFile = existsSync(envFile)
  ? Object.fromEntries(readFileSync(envFile, "utf8").split("\n").map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)).filter((m): m is RegExpMatchArray => m !== null).map((m) => [m[1], (m[2] ?? "").replace(/^["']|["']$/g, "")]))
  : {};
const secrets = ["SIFT_TYPESAFE_API_KEY", "TYPESAFE_API_KEY", "SIFT_TURSO_AUTH_TOKEN", "TURSO_AUTH_TOKEN"]
  .map((k) => process.env[k] ?? fromFile[k]).filter((v): v is string => typeof v === "string" && v.length >= 8);
const names = ["TYPESAFE_API_KEY", "TURSO_AUTH_TOKEN", "typesafeApiKey", "tursoToken"];

const staticDir = join(root, ".next", "static");
if (!existsSync(staticDir)) { console.error("no .next/static: run the build first"); process.exit(1); }
const walk = (d: string): string[] => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
const files = walk(staticDir);

const hits: string[] = [];
for (const f of files) {
  const text = readFileSync(f, "utf8");
  if (secrets.some((s) => text.includes(s))) hits.push(`${f}: contains a secret value`);
  for (const n of names) if (text.includes(n)) hits.push(`${f}: names ${n}`);
}
if (hits.length) { console.error(hits.join("\n")); process.exit(1); }
console.log(`checked ${files.length} client files against ${secrets.length} secret values and ${names.length} names: clean`);
