import { chmod, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputFile = resolve(repositoryRoot, "packages/cli/dist/ae.js");

await mkdir(dirname(outputFile), { recursive: true });
await build({
  absWorkingDir: repositoryRoot,
  entryPoints: [resolve(repositoryRoot, "tools/ae/cli.ts")],
  outfile: outputFile,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  sourcemap: false,
  legalComments: "none",
  banner: { js: "#!/usr/bin/env node" },
  tsconfig: resolve(repositoryRoot, "tsconfig.json"),
});
await chmod(outputFile, 0o755);
