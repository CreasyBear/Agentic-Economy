import { readFileSync } from "node:fs";

import parser from "@typescript-eslint/parser";

import phase2AuthorityEntryRule from "./tools/eslint-rules/phase-2-authority-entry.mjs";

const classifications = JSON.parse(
  readFileSync(
    new URL(
      "./.planning/maturity-execution/contracts/phase-2-convex-registration-classifications.json",
      import.meta.url,
    ),
    "utf8",
  ),
);

const capabilityContracts = Object.fromEntries(
  Object.entries(classifications.rows).map(([registration, metadata]) => [
    registration,
    metadata.handlerContract.capabilities,
  ]),
);
const targetContracts = Object.fromEntries(
  Object.entries(classifications.rows).map(([registration, metadata]) => [
    registration,
    metadata.handlerContract.targets,
  ]),
);

const dynamicTargetFixture =
  "tests/fixtures/phase-2-authority-entry-foundation/protected-run-mutation-allowed-dynamic-target.ts:protectedAllowedDynamicTarget";
const literalTargetFixture =
  "tests/fixtures/phase-2-authority-entry-foundation/protected-run-mutation-allowed-literal-target.ts:protectedAllowedLiteralTarget";
const unlistedTargetFixture =
  "tests/fixtures/phase-2-authority-entry-foundation/protected-run-mutation-unlisted-literal-target.ts:protectedUnlistedLiteralTarget";
capabilityContracts[dynamicTargetFixture] = ["runMutation"];
capabilityContracts[literalTargetFixture] = ["runMutation"];
capabilityContracts[unlistedTargetFixture] = ["runMutation"];
targetContracts[dynamicTargetFixture] = [
  "convex/agentAccessPolicy.ts:upsertGrant",
];
targetContracts[literalTargetFixture] = [
  "convex/agentAccessPolicy.ts:upsertGrant",
];
targetContracts[unlistedTargetFixture] = [
  "convex/agentAccessPolicy.ts:upsertGrant",
];

export default [
  {
    ignores: [
      "convex/_generated/**",
      ".vercel/**",
      "dist/**",
      "node_modules/**",
    ],
  },
  {
    files: [
      "convex/**/*.ts",
      "tests/fixtures/phase-2-authority-entry-foundation/**/*.ts",
    ],
    languageOptions: {
      parser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
    },
    plugins: {
      ae: {
        rules: {
          "phase-2-authority-entry": phase2AuthorityEntryRule,
        },
      },
    },
    rules: {
      "ae/phase-2-authority-entry": [
        "error",
        {
          capabilityContracts,
          targetContracts,
        },
      ],
    },
  },
];
