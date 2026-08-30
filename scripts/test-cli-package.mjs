import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { access, mkdir, mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { assertCliPackIntegrity } from "../tools/release/release-integrity.ts";

const run = promisify(execFile);
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const expectedFiles = ["README.md", "dist/ae.js", "package.json"];
const expectedCommands = [
  "account",
  "call",
  "cancel",
  "compare",
  "connect",
  "doctor",
  "fund",
  "history",
  "inspect",
  "inspect-plan",
  "manifest",
  "recover",
  "request",
  "revoke",
  "search",
  "status",
  "supply",
  "wait",
];

async function runNode(version, args, options) {
  return run(
    "npm",
    ["exec", "--yes", `--package=node@${version}`, "--", "node", ...args],
    { ...options, maxBuffer: 10 * 1024 * 1024 },
  );
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function listPackageFiles(root, relative = "") {
  const files = [];
  for (const entry of await readdir(join(root, relative), { withFileTypes: true })) {
    const path = join(relative, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listPackageFiles(root, path)));
    } else {
      files.push(path);
    }
  }
  return files.sort();
}

const suppliedTarball = process.env.AE_CLI_PACKAGE_TARBALL;
const suppliedDigest = process.env.AE_CLI_PACKAGE_EXPECTED_SHA256;
const mode = suppliedTarball ? "prepacked" : "workspace-pack";

assert(
  suppliedTarball || suppliedDigest === undefined,
  "AE_CLI_PACKAGE_TARBALL is required when AE_CLI_PACKAGE_EXPECTED_SHA256 is set.",
);
if (mode === "prepacked") {
  assert(
    typeof suppliedDigest === "string" && /^[0-9a-f]{64}$/.test(suppliedDigest),
    "AE_CLI_PACKAGE_EXPECTED_SHA256 must be a lowercase 64-character SHA-256 digest in prepacked mode.",
  );
}

const temporary = await mkdtemp(join(tmpdir(), "ae-cli-package-"));

try {
  const sourceManifest = JSON.parse(
    await readFile(resolve(repositoryRoot, "packages/cli/package.json"), "utf8"),
  );
  let tarball;
  let digest;

  if (mode === "prepacked") {
    tarball = resolve(suppliedTarball);
    let artifactStat;
    try {
      artifactStat = await stat(tarball);
    } catch {
      throw new Error(`Prepacked CLI tarball does not exist: ${tarball}`);
    }
    assert(artifactStat.isFile(), `Prepacked CLI tarball is not a file: ${tarball}`);
    digest = createHash("sha256").update(await readFile(tarball)).digest("hex");
    assert(
      digest === suppliedDigest,
      `Prepacked CLI tarball digest mismatch for ${tarball}: expected ${suppliedDigest}, received ${digest}.`,
    );
  } else {
    const packed = await run(
      "npm",
      [
        "pack",
        "--workspace",
        "@agentic-economy/cli",
        "--json",
        "--pack-destination",
        temporary,
      ],
      { cwd: repositoryRoot, maxBuffer: 10 * 1024 * 1024 },
    );
    const packReport = JSON.parse(packed.stdout);
    const verifiedPack = assertCliPackIntegrity(sourceManifest, packReport);
    assert(
      packReport.length === 1,
      `Expected one packed CLI artifact, received ${packReport.length}.`,
    );

    const artifact = packReport[0];
    const filename = verifiedPack.filename;
    assert(typeof filename === "string", "CLI package tarball was not created.");
    const packedFiles = (artifact.files ?? []).map((file) => file.path).sort();
    assert(
      JSON.stringify(packedFiles) === JSON.stringify(expectedFiles),
      `CLI tarball files must be exactly ${expectedFiles.join(", ")}; received ${packedFiles.join(", ")}.`,
    );
    assert(artifact.name === sourceManifest.name, "Packed name does not match the CLI manifest.");
    assert(
      artifact.version === sourceManifest.version,
      "Packed version does not match the CLI manifest.",
    );

    tarball = join(temporary, filename);
    digest = createHash("sha256").update(await readFile(tarball)).digest("hex");
  }

  const consumer = join(temporary, "consumer");
  await mkdir(consumer);
  await run("npm", ["init", "-y"], { cwd: consumer });
  await run("npm", ["install", "--ignore-scripts", tarball], {
    cwd: consumer,
    maxBuffer: 10 * 1024 * 1024,
  });

  const installedRoot = join(consumer, "node_modules", "@agentic-economy", "cli");
  const packageFiles = await listPackageFiles(installedRoot);
  assert(
    JSON.stringify(packageFiles) === JSON.stringify(expectedFiles),
    `Installed CLI files must be exactly ${expectedFiles.join(", ")}; received ${packageFiles.join(", ")}.`,
  );
  const installedExecutable = join(installedRoot, "dist", "ae.js");
  const linkedExecutable = join(consumer, "node_modules", ".bin", "ae");
  await access(linkedExecutable, constants.X_OK);
  const executableMode = (await stat(installedExecutable)).mode;
  assert((executableMode & 0o111) !== 0, "Installed CLI bundle is not executable.");
  const firstLine = (await readFile(installedExecutable, "utf8")).split("\n", 1)[0];
  assert(firstLine === "#!/usr/bin/env node", `Unexpected CLI shebang: ${firstLine}`);

  const installedManifest = JSON.parse(await readFile(join(installedRoot, "package.json"), "utf8"));
  assert(installedManifest.name === sourceManifest.name, "Installed package name does not match source.");
  assert(installedManifest.version === sourceManifest.version, "Installed package version does not match source.");
  assert(installedManifest.bin?.ae === "dist/ae.js", "Installed CLI bin mapping is not dist/ae.js.");
  assert(installedManifest.engines?.node === ">=20", "Installed CLI must declare Node >=20.");
  assert(
    installedManifest.publishConfig?.access === "public",
    "Installed CLI must declare public npm access.",
  );
  assert(
    installedManifest.exports !== undefined && Object.keys(installedManifest.exports).length === 0,
    "Installed CLI must expose no programmatic package exports.",
  );

  const importProbe = [
    "const specifiers = ['@agentic-economy/cli', '@agentic-economy/cli/dist/ae.js'];",
    "for (const specifier of specifiers) {",
    "  try { await import(specifier); process.exitCode = 1; }",
    "  catch (error) { if (error?.code !== 'ERR_PACKAGE_PATH_NOT_EXPORTED') throw error; }",
    "}",
    "if (process.exitCode) throw new Error('CLI package unexpectedly exposed a library import');",
  ].join("\n");
  await run(process.execPath, ["--input-type=module", "--eval", importProbe], { cwd: consumer });

  for (const nodeMajor of [20, 22]) {
    const runtime = await runNode(nodeMajor, ["--version"], { cwd: consumer });
    assert(
      runtime.stdout.trim().startsWith(`v${nodeMajor}.`),
      `Expected Node ${nodeMajor}, received ${runtime.stdout.trim()}.`,
    );
    const help = await runNode(nodeMajor, [installedExecutable, "--help", "--json"], {
      cwd: consumer,
    });
    const parsed = JSON.parse(help.stdout);
    assert(parsed.kind === "HELP", `Node ${nodeMajor} CLI help did not return HELP.`);
    const commands = Object.keys(parsed.commands ?? {}).sort();
    assert(
      JSON.stringify(commands) === JSON.stringify(expectedCommands),
      `Node ${nodeMajor} command set mismatch: ${commands.join(", ")}.`,
    );
    process.stdout.write(`CLI_PACKAGE_NODE_${nodeMajor}=${runtime.stdout.trim()} HELP_PASS\n`);
  }

  process.stdout.write(`CLI_PACKAGE_MODE=${mode}\n`);
  process.stdout.write(`CLI_PACKAGE_FILES=${packageFiles.join(",")}\n`);
  process.stdout.write(`CLI_PACKAGE_SHA256=${digest}\n`);
  process.stdout.write("CLI_PACKAGE_IMPORTS=BLOCKED\n");
  process.stdout.write("CLI_PACKAGE_PASS\n");
} finally {
  await rm(temporary, { recursive: true, force: true });
}
