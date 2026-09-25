import type { NextConfig } from "next";

/** The page replays a committed run file, bundled at build time; nothing is read at request time. */
const config: NextConfig = {
  // Next writes its own AGENTS.md and CLAUDE.md here on `dev`; the repo's CLAUDE.md is the authority.
  agentRules: false,
};

export default config;
