import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const srcDir = fileURLToPath(new URL("../src", import.meta.url));
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });

describe("no shared contract is re-forked (AC #31)", () => {
  it("declares none of Classified/Decision/ActionResult/PipelineOutcome in sift/src", () => {
    const re = /\b(interface|type)\s+(Classified|Decision|ActionResult|PipelineOutcome)\b/;
    const offenders = walk(srcDir).filter((p) => p.endsWith(".ts")).filter((p) => re.test(readFileSync(p, "utf8")));
    expect(offenders).toEqual([]);
  });
});

describe("no send path (AC #29)", () => {
  it("declares no mail transport in the dependency manifest", () => {
    const pkg = readFileSync(fileURLToPath(new URL("../package.json", import.meta.url)), "utf8");
    expect(pkg).not.toMatch(/nodemailer|resend|@sendgrid|postmark|mailgun/);
  });
});
