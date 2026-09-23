import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

/** The demo's surface, checked by reading the source rather than by trusting it (AC #29, #32). */
const root = fileURLToPath(new URL("..", import.meta.url));
const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? walk(p) : [p];
});
const sources = ["app", "components", "lib"].flatMap((d) => walk(join(root, d))).filter((p) => /\.(ts|tsx)$/.test(p));

describe("no free-text input anywhere in the UI or the route (AC #32)", () => {
  it("has no textarea, text input or editable region", () => {
    for (const p of sources) expect(readFileSync(p, "utf8"), p).not.toMatch(/<textarea|type="text"|type='text'|contentEditable/i);
  });
});

describe("no send path (AC #29)", () => {
  it("no route handler or library reads a destination address or a free message body", () => {
    for (const p of sources) expect(readFileSync(p, "utf8"), p).not.toMatch(/\b(nodemailer|resend|sendgrid|postmark|mailgun|smtp)\b/i);
  });
});
