import { execFile } from "node:child_process";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { assertCliPackIntegrity } from "../tools/release/maturity-release-integrity.ts";

const run = promisify(execFile);
const temporary = await mkdtemp(join(tmpdir(), "ae-cli-package-"));
const packageManifest = JSON.parse(await readFile("packages/cli/package.json", "utf8"));
const packed = await run("npm", ["pack", "./packages/cli", "--json", "--ignore-scripts", "--pack-destination", temporary], {
  cwd: process.cwd(),
  maxBuffer: 10 * 1024 * 1024,
});
const packReport = JSON.parse(packed.stdout);
const verifiedPack = assertCliPackIntegrity(packageManifest, packReport);
const filename = verifiedPack.filename;

const consumer = join(temporary, "consumer");
await run("npm", ["init", "-y"], { cwd: temporary });
await run("npm", ["install", "--ignore-scripts", join(temporary, filename)], {
  cwd: temporary,
  maxBuffer: 10 * 1024 * 1024,
});
const executable = join(temporary, "node_modules", ".bin", "ae");
const help = await run(executable, ["--help", "--json"], {
  cwd: temporary,
  env: { ...process.env, AE_CONFIG_DIR: consumer },
});
const parsed = JSON.parse(help.stdout);
if (parsed.kind !== "HELP" || parsed.commands?.search === undefined) {
  throw new Error("Packed CLI did not expose the canonical command set.");
}
const installedPackage = JSON.parse(
  await readFile(join(temporary, "node_modules", "@agentic-economy", "cli", "package.json"), "utf8"),
);
if (installedPackage.name !== packageManifest.name || installedPackage.version !== packageManifest.version) {
  throw new Error("Packed CLI identity does not match its source manifest.");
}
if (installedPackage.bin?.ae !== packageManifest.bin?.ae) {
  throw new Error("Packed CLI bin does not point at the compiled executable.");
}
const [sourceExecutable, installedExecutable] = await Promise.all([
  readFile(join(process.cwd(), "packages", "cli", packageManifest.bin.ae)),
  readFile(join(temporary, "node_modules", "@agentic-economy", "cli", packageManifest.bin.ae)),
]);
if (!sourceExecutable.equals(installedExecutable)) {
  throw new Error("Packed CLI executable differs from the freshly built source artifact.");
}
process.stdout.write("CLI_PACKAGE_PASS\n");
