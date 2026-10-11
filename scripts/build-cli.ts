import { execFileSync } from "node:child_process";
import { chmod, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputFile = resolve(repositoryRoot, "packages/cli/dist/ae.js");
// A release pipeline may pin this to an immutable source revision; otherwise
// report the checked-out commit so `ae --version` names a real revision.
const gitRevision = () => {
  try {
    return execFileSync("git", ["rev-parse", "--short=12", "HEAD"], {
      cwd: repositoryRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
};
const buildRevision = process.env.AE_SOURCE_REVISION?.trim() || gitRevision() || "development";

await mkdir(dirname(outputFile), { recursive: true });
await build({
  absWorkingDir: repositoryRoot,
  entryPoints: [resolve(repositoryRoot, "tools/ae/cli.ts")],
  outfile: outputFile,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  loader: { ".md": "text" },
  // Coinbase's SDK advertises Solana support through an optional dynamic peer.
  // Preserve that boundary instead of forcing every AE CLI install to ship the
  // SVM stack when AE's configured payment lane is Base USDC.
  // TanStack Start injects these subpath specifiers through its Vite plugin at
  // build time. They are not declared in start-server-core's "imports" map and
  // can never resolve in an esbuild CLI bundle, so any transitive reach into
  // @tanstack/react-start breaks the build. The CLI never executes a request
  // handler, so excluding them is correct rather than cosmetic.
  external: [
    "@x402/svm",
    "@x402/svm/*",
    "#tanstack-router-entry",
    "#tanstack-start-entry",
    "tanstack-start-manifest:v",
  ],
  sourcemap: false,
  legalComments: "none",
  define: { __AE_CLI_BUILD_REVISION__: JSON.stringify(buildRevision) },
  banner: { js: "#!/usr/bin/env node\nimport { createRequire as _createRequire } from 'node:module'; globalThis.require ??= _createRequire(import.meta.url);" },
  tsconfig: resolve(repositoryRoot, "tsconfig.json"),
});
await chmod(outputFile, 0o755);
