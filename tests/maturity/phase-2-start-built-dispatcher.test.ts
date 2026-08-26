import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const artifactRoot = process.env.AE_P2_START_ARTIFACT_ROOT ?? process.cwd();

describe("Phase 2 built Start dispatcher", () => {
  it("loads the compiled dispatcher and reaches unchanged Clerk middleware fail-closed", () => {
    const output = execFileSync(
      "/Users/joelchan/.nvm/versions/node/v22.22.0/bin/node",
      [
        "tools/maturity/phase-2-start-built-dispatcher.mjs",
        "--artifact-root",
        resolve(artifactRoot),
        "--server-fn",
        "readCanonicalBaseUrlServer",
        "--expect-source-fixed",
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {
          ...process.env,
          AE_CANONICAL_BASE_URL: "https://agentic-economy.test",
        },
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 30_000,
      },
    );

    expect(output).toContain("START_BUILT_DISPATCHER_PASS");
    process.stdout.write("START_BUILT_DISPATCHER_PASS\n");
  }, 35_000);
});
