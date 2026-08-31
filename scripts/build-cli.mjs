import { chmod, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputFile = resolve(repositoryRoot, "packages/cli/dist/ae.js");
// A release pipeline may pin this to an immutable source revision. Keeping the
// local default stable makes the checked-in download reproducible after the
// commit that adds it instead of creating a self-referential archive digest.
const buildRevision = process.env.AE_SOURCE_REVISION?.trim() || "development";

await mkdir(dirname(outputFile), { recursive: true });
await build({
  absWorkingDir: repositoryRoot,
  entryPoints: [resolve(repositoryRoot, "tools/ae/cli.ts")],
  outfile: outputFile,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  // Coinbase's SDK advertises Solana support through an optional dynamic peer.
  // Preserve that boundary instead of forcing every AE CLI install to ship the
  // SVM stack when AE's configured payment lane is Base USDC.
  external: ["@x402/svm", "@x402/svm/*"],
  sourcemap: false,
  legalComments: "none",
  define: { __AE_CLI_BUILD_REVISION__: JSON.stringify(buildRevision) },
  banner: { js: "#!/usr/bin/env node" },
  tsconfig: resolve(repositoryRoot, "tsconfig.json"),
});
await chmod(outputFile, 0o755);
