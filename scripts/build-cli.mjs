import { chmod, mkdir } from "node:fs/promises";

import { build } from "esbuild";

await mkdir("packages/cli/dist", { recursive: true });
await build({
  entryPoints: ["tools/ae/cli.ts"],
  outfile: "packages/cli/dist/ae.js",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  sourcemap: false,
  legalComments: "none",
  banner: { js: "#!/usr/bin/env node" },
  tsconfig: "tsconfig.json",
});
await chmod("packages/cli/dist/ae.js", 0o755);
