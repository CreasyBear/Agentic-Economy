#!/usr/bin/env node

import { ESLint } from "eslint";

const FIXTURE_ROOT = "tests/fixtures/phase-2-authority-entry-foundation";
const SAFE_FIXTURES = [
  "alias.ts",
  "factory.ts",
  "registered.ts",
  "safe-all-path.ts",
  "typed.ts",
  "protected-run-mutation-allowed-literal-target.ts",
];
const EXPECTED_UNSAFE = {
  "alternate-branch.ts": ["rawRegistrar"],
  "catch-finally.ts": ["rawRegistrar"],
  "dynamic-mode.ts": ["dynamicRegistrarNamespace"],
  "dynamic-registrar-selection.ts": ["dynamicRegistrarSelection"],
  "dynamic-target.ts": ["rawRegistrar"],
  "early-return.ts": ["rawRegistrar"],
  "escaped-handler.ts": ["rawRegistrar"],
  "pre-boundary-capabilities.ts": [
    "rawRegistrar",
    "rawRegistrar",
    "rawRegistrar",
  ],
  "protected-alias-capability.ts": ["unlistedCapability:db_write"],
  "protected-context-escape.ts": ["escapedContext"],
  "protected-db-alias.ts": ["unsupportedCapabilityAlias:db"],
  "protected-db-write.ts": ["unlistedCapability:db_write"],
  "protected-escaped-handler.ts": ["unsupportedHandlerShape"],
  "protected-factory-capability.ts": ["unlistedCapability:db_write"],
  "protected-fetch.ts": ["unlistedCapability:network_fetch"],
  "protected-fetch-alias.ts": ["unsupportedCapabilityAlias:network_fetch"],
  "protected-global-fetch.ts": ["unsupportedNetworkCall"],
  "protected-run-action.ts": ["unlistedCapability:runAction"],
  "protected-run-mutation-dynamic-target.ts": [
    "unlistedCapability:runMutation",
  ],
  "protected-run-mutation-allowed-dynamic-target.ts": [
    "dynamicCapabilityTarget:runMutation",
  ],
  "protected-run-mutation-unlisted-literal-target.ts": [
    "unlistedCapabilityTarget:runMutation:convex/rateLimit.ts:admit",
  ],
  "protected-run-query.ts": ["unlistedCapability:runQuery"],
  "protected-scheduler.ts": ["unlistedCapability:scheduler"],
  "unchecked-args.ts": ["rawRegistrar"],
};

function phase2Messages(result) {
  return result.messages.filter(
    (message) => message.ruleId === "ae/phase-2-authority-entry",
  );
}

function diagnosticSignature(message) {
  if (message.messageId === "unlistedCapability") {
    const capability = message.message.match(/capability '([^']+)'/u)?.[1];
    return `unlistedCapability:${capability ?? "missingCapability"}`;
  }
  if (message.messageId === "unsupportedCapabilityAlias") {
    const capability = message.message.match(/capability '([^']+)'/u)?.[1];
    return `unsupportedCapabilityAlias:${capability ?? "missingCapability"}`;
  }
  if (message.messageId === "dynamicCapabilityTarget") {
    const capability = message.message.match(/uses ([^ ]+) with/u)?.[1];
    return `dynamicCapabilityTarget:${capability ?? "missingCapability"}`;
  }
  if (message.messageId === "unlistedCapabilityTarget") {
    const match = message.message.match(/uses ([^ ]+) target '([^']+)'/u);
    return `unlistedCapabilityTarget:${match?.[1] ?? "missingCapability"}:${match?.[2] ?? "missingTarget"}`;
  }
  return message.messageId ?? "missingMessageId";
}

export async function runFoundationAuthorityEntryLint() {
  const eslint = new ESLint({ cwd: process.cwd() });
  const safeResults = await eslint.lintFiles(
    SAFE_FIXTURES.map((file) => `${FIXTURE_ROOT}/${file}`),
  );
  const unsafeResults = await eslint.lintFiles(
    Object.keys(EXPECTED_UNSAFE).map((file) => `${FIXTURE_ROOT}/${file}`),
  );
  const unexpectedSafe = safeResults.flatMap((result) =>
    phase2Messages(result).map((message) => ({
      filePath: result.filePath,
      message,
    })),
  );
  const diagnosticMismatches = unsafeResults.flatMap((result) => {
    const fixture = result.filePath.slice(result.filePath.lastIndexOf("/") + 1);
    const expected = [...(EXPECTED_UNSAFE[fixture] ?? [])].sort();
    const actual = phase2Messages(result).map(diagnosticSignature).sort();
    return JSON.stringify(actual) === JSON.stringify(expected)
      ? []
      : [{ filePath: result.filePath, expected, actual }];
  });
  if (unexpectedSafe.length > 0 || diagnosticMismatches.length > 0) {
    const failure = {
      format: "phase-2-authority-entry-eslint:v1",
      unexpectedSafe,
      diagnosticMismatches,
    };
    throw new Error(
      `authority_entry_foundation_lint_failed:${JSON.stringify(failure)}`,
    );
  }
  return Object.freeze({
    format: "phase-2-authority-entry-eslint:v1",
    safe: safeResults.length,
    unsafe: unsafeResults.length,
    diagnostics: unsafeResults.reduce(
      (total, result) => total + phase2Messages(result).length,
      0,
    ),
  });
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 1 || args[0] !== "--foundation") {
    throw new Error("phase2_authority_entry_mode_must_be_foundation");
  }
  const result = await runFoundationAuthorityEntryLint();
  process.stdout.write(`${JSON.stringify(result)}\n`);
  process.stdout.write(
    `PHASE2_AUTHORITY_ENTRY_FOUNDATION_PASS safe=${result.safe} unsafe=${result.unsafe} diagnostics=${result.diagnostics}\n`,
  );
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  main().catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? error.stack : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}
