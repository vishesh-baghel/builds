import { describe, expect, it } from "vitest";
import { draftFor } from "../src/stages/draft";
import { firmById, messageById } from "../src/fixtures";

const arch = firmById("arch");
const m = (id: string) => {
  const x = messageById(arch, id);
  if (!x) throw new Error(`no fixture ${id}`);
  return x;
};

describe("code-templated drafts (AC #9)", () => {
  it("fills a draft from the matched records and never from the message body", () => {
    const draft = draftFor(arch, m("a4"), "rfi"); // RFI-042, Harbor Point; body mentions rebar and the pour
    expect(draft).not.toBeNull();
    expect(draft?.body).toContain("Harbor Point Residences"); // looked-up project name
    expect(draft?.body).toContain("Sep 25"); // looked-up RFI-log due date
    expect(draft?.body.toLowerCase()).not.toContain("rebar"); // nothing lifted from the body
  });

  it("does not draft for a non-drafting class or a firm without an instrument", () => {
    expect(draftFor(arch, m("a11"), "invoice")).toBeNull();
    const law = firmById("law");
    const l1 = messageById(law, "l1");
    expect(l1 && draftFor(law, l1, "court")).toBeNull();
  });
});
