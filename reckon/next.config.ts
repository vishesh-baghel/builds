import type { NextConfig } from "next";

/**
 * Nothing here reads the filesystem at request time. The page and the route handler both work
 * from `fixtures/fixtures.json` and `runs/run.json`, which are committed and bundled, so there
 * are no files to trace and no authored file opened inside a serverless function.
 */
const config: NextConfig = {
  // Next writes its own AGENTS.md and CLAUDE.md into this directory on `dev`. The repo already
  // has a CLAUDE.md that says what the rules are, and a generated one beside it would compete
  // with it for authority.
  agentRules: false,
};

export default config;
