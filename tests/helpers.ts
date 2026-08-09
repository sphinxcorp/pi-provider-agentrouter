import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface TmpCtx {
  dir: string;
  cleanup: () => void;
}

/**
 * Create an isolated temp directory and point process.env.HOME at it so
 * settings.ts / fetch.ts read/write under this dir, not the real home.
 */
export function isolatedHome(): TmpCtx {
  const dir = mkdtempSync(join(tmpdir(), "ar-test-"));
  const orig = process.env.HOME;
  process.env.HOME = dir;
  return {
    dir,
    cleanup: () => {
      if (orig === undefined) delete process.env.HOME;
      else process.env.HOME = orig;
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

/** Restore process.env and global.fetch to a clean state between tests. */
export function resetEnv() {
  delete process.env.AGENT_ROUTER_API_KEY;
  delete process.env.AGENT_ROUTER_API_BASE;
  delete process.env.HOME;
}
