import type { Metadata } from "next";
import { Replay } from "./replay";

export const metadata: Metadata = {
  title: "tally: run replay",
  description: "The committed run replayed item by item: each piece of work in the note, the four checks, and the running total.",
};

export default function Page() {
  return <Replay />;
}
