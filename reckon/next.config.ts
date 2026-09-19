import type { NextConfig } from "next";

/**
 * Nothing here reads the filesystem at request time. The page and the route handler both work
 * from `fixtures/fixtures.json` and `runs/run.json`, which are committed and bundled, so there
 * are no files to trace and no authored file opened inside a serverless function.
 */
const config: NextConfig = {};

export default config;
