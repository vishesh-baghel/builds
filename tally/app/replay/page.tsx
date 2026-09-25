import type { Metadata } from "next";
import { Replay } from "./replay";
import "./replay.css";

export const metadata: Metadata = {
  title: "tally: run replay",
  description: "The committed run replayed item by item: each work item in the note, Drex's four answers, and the running total.",
};

export default function Page() {
  return (
    <div className="replay-root">
      <Replay />
    </div>
  );
}
