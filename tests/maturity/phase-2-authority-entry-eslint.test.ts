import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import parser from "@typescript-eslint/parser";
import { Linter } from "eslint";
import { describe, expect, it } from "vitest";

import phase2AuthorityEntryRule from "../../tools/eslint-rules/phase-2-authority-entry.mjs";
import { runFoundationAuthorityEntryLint } from "../../tools/eslint-rules/run-phase-2-authority-entry.mjs";

const FIXTURE_ROOT = "tests/fixtures/phase-2-authority-entry-foundation";
const EXPECTED = {
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
} as const;
const SAFE = [
  "alias.ts",
  "factory.ts",
  "registered.ts",
  "safe-all-path.ts",
  "typed.ts",
  "protected-run-mutation-allowed-literal-target.ts",
] as const;

const DYNAMIC_TARGET_REGISTRATION =
  "tests/fixtures/phase-2-authority-entry-foundation/protected-run-mutation-allowed-dynamic-target.ts:protectedAllowedDynamicTarget";
const LITERAL_TARGET_REGISTRATION =
  "tests/fixtures/phase-2-authority-entry-foundation/protected-run-mutation-allowed-literal-target.ts:protectedAllowedLiteralTarget";
const UNLISTED_TARGET_REGISTRATION =
  "tests/fixtures/phase-2-authority-entry-foundation/protected-run-mutation-unlisted-literal-target.ts:protectedUnlistedLiteralTarget";
const capabilityContracts = {
  [DYNAMIC_TARGET_REGISTRATION]: ["runMutation"],
  [LITERAL_TARGET_REGISTRATION]: ["runMutation"],
  [UNLISTED_TARGET_REGISTRATION]: ["runMutation"],
};
const targetContracts = {
  [DYNAMIC_TARGET_REGISTRATION]: ["convex/agentAccessPolicy.ts:upsertGrant"],
  [LITERAL_TARGET_REGISTRATION]: ["convex/agentAccessPolicy.ts:upsertGrant"],
  [UNLISTED_TARGET_REGISTRATION]: ["convex/agentAccessPolicy.ts:upsertGrant"],
};

function signature(message: Linter.LintMessage): string {
  if (message.messageId === "unlistedCapability") {
    return `unlistedCapability:${message.message.match(/capability '([^']+)'/u)?.[1] ?? "missingCapability"}`;
  }
  if (message.messageId === "unsupportedCapabilityAlias") {
    return `unsupportedCapabilityAlias:${message.message.match(/capability '([^']+)'/u)?.[1] ?? "missingCapability"}`;
  }
  if (message.messageId === "dynamicCapabilityTarget") {
    return `dynamicCapabilityTarget:${message.message.match(/uses ([^ ]+) with/u)?.[1] ?? "missingCapability"}`;
  }
  if (message.messageId === "unlistedCapabilityTarget") {
    const match = message.message.match(/uses ([^ ]+) target '([^']+)'/u);
    return `unlistedCapabilityTarget:${match?.[1] ?? "missingCapability"}:${match?.[2] ?? "missingTarget"}`;
  }
  return message.messageId ?? "missingMessageId";
}

async function lintFixture(file: string): Promise<string[]> {
  const linter = new Linter({ configType: "flat" });
  const filename = resolve(FIXTURE_ROOT, file);
  const source = await readFile(filename, "utf8");
  const messages = linter.verify(
    source,
    [
      {
        files: ["**/*.ts"],
        languageOptions: { parser },
        plugins: {
          ae: {
            rules: { "phase-2-authority-entry": phase2AuthorityEntryRule },
          },
        },
        rules: {
          "ae/phase-2-authority-entry": [
            "error",
            { capabilityContracts, targetContracts },
          ],
        },
      },
    ],
    { filename },
  );
  return messages
    .filter((message) => message.ruleId === "ae/phase-2-authority-entry")
    .map(signature)
    .sort();
}

describe("Phase 2 authority-entry ESLint boundary", () => {
  it("requires exact capability and registrar diagnostics across the hostile corpus", async () => {
    await expect(runFoundationAuthorityEntryLint()).resolves.toEqual({
      diagnostics: 26,
      format: "phase-2-authority-entry-eslint:v1",
      safe: 6,
      unsafe: 24,
    });
  });

  it("drives the installed TypeScript parser and bounded rule directly for every fixture", async () => {
    for (const file of SAFE) {
      await expect(lintFixture(file)).resolves.toEqual([]);
    }
    for (const [file, expected] of Object.entries(EXPECTED)) {
      await expect(lintFixture(file)).resolves.toEqual([...expected].sort());
    }
  });
});
