import { execFile } from "node:child_process";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
const temporary = await mkdtemp(join(tmpdir(), "ae-cli-package-"));
const packed = await run("npm", ["pack", "./packages/cli", "--json", "--pack-destination", temporary], {
  cwd: process.cwd(),
  maxBuffer: 10 * 1024 * 1024,
});
const packReport = JSON.parse(packed.stdout);
const filename = packReport[0]?.filename;
if (typeof filename !== "string") throw new Error("CLI package tarball was not created.");
const packageFiles = packReport[0]?.files?.map((file) => file.path) ?? [];
if (packageFiles.some((file) => file.startsWith("tools/") || file.endsWith(".ts"))) {
  throw new Error("CLI package contains repository TypeScript.");
}

const consumer = join(temporary, "consumer");
await run("npm", ["init", "-y"], { cwd: temporary });
await run("npm", ["install", "--ignore-scripts", join(temporary, filename)], {
  cwd: temporary,
  maxBuffer: 10 * 1024 * 1024,
});
const executable = join(temporary, "node_modules", ".bin", "ae");
const help = await run(executable, ["--help", "--json"], {
  cwd: temporary,
  env: { ...process.env, HOME: consumer },
});
const parsed = JSON.parse(help.stdout);
if (parsed.kind !== "HELP" || parsed.commands?.search === undefined) {
  throw new Error("Packed CLI did not expose the canonical command set.");
}
const installedPackage = JSON.parse(
  await readFile(join(temporary, "node_modules", "@agentic-economy", "cli", "package.json"), "utf8"),
);
if (installedPackage.bin?.ae !== "dist/ae.js") {
  throw new Error("Packed CLI bin does not point at the compiled executable.");
}
process.stdout.write("CLI_PACKAGE_PASS\n");
