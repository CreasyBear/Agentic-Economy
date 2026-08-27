import { readFileSync } from "node:fs";

import {
  findFiles,
  type ScanTarget,
  type ScanViolation,
} from "./contract-scans/file-discovery";

export { findFiles } from "./contract-scans/file-discovery";
export type { ScanTarget, ScanViolation } from "./contract-scans/file-discovery";
export {
  declaredGraphCycles,
  scanModuleBoundaries,
  scanRuntimeModuleConsumers,
  scanTestOnlyModuleBoundaries,
  validateModuleBoundaryManifest,
  type ModuleBoundaryScanOptions,
  type ModuleBoundaryScanResult,
  type ModuleImportObservation,
  type RuntimeConsumerScanResult,
  type TestBoundaryScanResult,
} from "./contract-scans/module-boundaries";

type PatternRule = {
  rule: string;
  message: string;
  pattern: RegExp;
};

const scannerUtilityPath = "src/lib/ui/contract-scans.ts";
const forbiddenHandshakeSpecifierPattern = [
  String.raw`handshake-cloud(?:\/[^'"]*)?`,
  String.raw`(?:customer-edge|agentic-endpoint-access|cloud-adapter|x402)(?:\/[^'"]*)?`,
  String.raw`handshake-protocol-kernel\/(?:x402-protected-tool|mcp|http|agentic-endpoint-middleware|agentic-endpoint-access|cloud-adapter|customer-edge|experimental)`,
  String.raw`@x402\/[^'"]+`,
  String.raw`viem(?:\/[^'"]*)?`,
  String.raw`@modelcontextprotocol\/[^'"]+`,
].join("|");
const forbiddenHandshakeImportPattern = new RegExp(
  String.raw`from\s+['"](?:${forbiddenHandshakeSpecifierPattern})['"]|` +
    String.raw`import\s*\(\s*['"](?:${forbiddenHandshakeSpecifierPattern})['"]\s*\)|` +
    String.raw`import\s+['"](?:${forbiddenHandshakeSpecifierPattern})['"]`,
);

export function scanBackupImports(
  targets: readonly ScanTarget[],
): readonly ScanViolation[] {
  return scanPatterns(targets, [
    {
      rule: "backup-import",
      message: "Runtime source cannot import or reference the backup repo.",
      pattern: /Agentic-Economy-Backup|\.\.\/Agentic-Economy-Backup/,
    },
    {
      rule: "planning-runtime-import",
      message: "Runtime source cannot import planning files.",
      pattern: /from\s+['"][^'"]*\.planning|import\s+['"][^'"]*\.planning/,
    },
    {
      rule: "forbidden-handshake-import",
      message:
        "Money and protocol SDK imports are quarantined to reviewed transport adapters.",
      pattern: forbiddenHandshakeImportPattern,
    },
  ]).filter((violation) => !isReviewedTransportSdkImport(violation));
}

export function scanPrivateImports(
  targets: readonly ScanTarget[],
): readonly ScanViolation[] {
  return scanPatterns(targets, [
    {
      rule: "module-private-import",
      message:
        "Routes and sibling modules must use module public seams, not internal files.",
      pattern:
        /from\s+['"][^'"]*(?:@\/|~\/|src\/)?modules\/[^'"]+\/internal\/[^'"]+['"]/,
    },
  ]).filter(
    (violation) =>
      !isAllowedConvexSchemaComposition(violation) &&
      !isAllowedModulePublicSeam(violation),
  );
}
export function scanRouteBoundaries(
  targets: readonly ScanTarget[],
): readonly ScanViolation[] {
  return scanPatterns(targets, [
    {
      rule: "route-convex-schema-import",
      message:
        "Routes cannot import Convex schema or generated document contracts.",
      pattern: /from\s+['"][^'"]*convex\/schema['"]/,
    },
    {
      rule: "route-owned-convex-transport",
      message:
        "Routes must call module source ports instead of owning Convex transport plumbing.",
      pattern: /from\s+['"]convex\/(?:browser|server)['"]/,
    },
    {
      rule: "route-private-module-import",
      message: "Routes must import module public seams only.",
      pattern:
        /from\s+['"][^'"]*(?:@\/|~\/|src\/)?modules\/[^'"]+\/internal\/[^'"]+['"]/,
    },
    {
      rule: "route-future-provider-import",
      message: "Phase 1 routes cannot import future provider SDKs.",
      pattern: /from\s+['"](?:stripe|openai|@ai-sdk\/[^'"]+|x402)['"]/,
    },
  ]);
}

export function scanTypeScriptStandards(
  targets: readonly ScanTarget[],
): readonly ScanViolation[] {
  return scanPatterns(
    targets,
    [
      {
        rule: "explicit-any",
        message: "Explicit any is not allowed in runtime TypeScript.",
        pattern: /:\s*any\b|<any\b|as\s+any\b/,
      },
      {
        rule: "unknown-double-cast",
        message: "Double casts through unknown are not allowed.",
        pattern: /as\s+unknown\s+as\b/,
      },
      {
        rule: "non-null-assertion",
        message: "Non-null assertions hide missing-state bugs.",
        pattern: /[A-Za-z0-9_$\]\)]!\s*(?:[;,\)\]\}]|$)/,
      },
      {
        rule: "convex-any-validator",
        message:
          "v.any() is not allowed outside a documented boundary adapter.",
        pattern: /\bv\.any\s*\(/,
      },
      {
        rule: "broad-status-string",
        message:
          "Status/result/source state fields must use literal unions, not broad strings.",
        pattern: /\b(?:status|result|sourceState)\s*:\s*string\b/,
      },
      {
        rule: "inexact-convex-return",
        message: "Convex functions must expose exact result contracts.",
        pattern: /returns\s*:\s*v\.any\s*\(|Promise\s*<\s*unknown\s*>/,
      },
      {
        rule: "hard-coded-source-csrf",
        message:
          "Runtime source writes must use source-write admission, not hard-coded CSRF literals.",
        pattern: /['"`]csrf-[^'"`]*['"`]|`csrf-\$\{/,
      },
      {
        rule: "client-exposed-source-write-secret",
        message:
          "Source write admission secrets must stay server-only and never use a VITE_ prefix.",
        pattern: /\bVITE_AE_SOURCE_WRITE_SECRET\b/,
      },
    ],
    ["src/routeTree.gen.ts", "convex/_generated"],
  ).filter((violation) => !isDocumentedJsonBoundary(violation));
}

function isDocumentedJsonBoundary(violation: ScanViolation): boolean {
  if (violation.rule !== "convex-any-validator") return false;
  return (
    (violation.file === "convex/capabilitySupply.ts" &&
      violation.excerpt.includes("v.any()") &&
      (violation.excerpt.includes(
        "runtime-validated adapter config boundary",
      ) ||
        violation.excerpt.includes(
          "runtime-validated capability publication boundary",
        ))) ||
    ((violation.file === "convex/capabilitySupplyOperations.ts" ||
      violation.file === "convex/capabilitySupplyOperationQueries.ts" ||
      violation.file === "convex/capabilitySupplyOperationKeyless.ts") &&
      violation.excerpt.includes("v.any()") &&
      violation.excerpt.includes("runtime-validated JsonValue boundary")) ||
    (violation.file ===
      "src/modules/capability-execution/internal/convex-schema.ts" &&
      violation.excerpt.includes("v.any()") &&
      violation.excerpt.includes("runtime-validated JsonValue boundary"))
  );
}

export function scanUiContract(
  targets: readonly ScanTarget[],
): readonly ScanViolation[] {
  return scanPatterns(
    targets,
    [
      {
        rule: "raw-color",
        message:
          "Product-owned routes and AE components must use semantic tokens, not raw colors.",
        pattern:
          /#[0-9a-fA-F]{3,8}\b|\brgb\(|\bhsl\(|\bbg-(?:blue|green|emerald|orange|red|purple|slate|gray)-\d{2,3}\b|\btext-(?:blue|green|emerald|orange|red|purple|slate|gray)-\d{2,3}\b|\bborder-(?:blue|green|emerald|orange|red|purple|slate|gray)-\d{2,3}\b/,
      },
      {
        rule: "space-utility",
        message: "Use gap utilities instead of space-x/space-y.",
        pattern: /\bspace-[xy]-/,
      },
      {
        rule: `transition-${"all"}`,
        message:
          "Use explicit transition properties, not the broad transition utility.",
        pattern: new RegExp(`\\btransition-${"all"}\\b`),
      },
      {
        rule: "hardcoded-layer",
        message:
          "Product-owned routes and AE components must use AE z-index tokens, not hardcoded Tailwind layers.",
        pattern: /\bz-(?:40|50|\d{3,})\b/,
      },
      {
        rule: "raw-overlay",
        message:
          "Overlays must use AE scrim tokens, not raw black opacity utilities.",
        pattern: /\bbg-black\/\d+\b/,
      },
      {
        rule: "generic-tailwind-shadow",
        message:
          "Product-owned routes and AE components must use AE shadows or hairlines, not generic Tailwind shadows.",
        pattern: /\bshadow-(?:sm|md|lg|xl|2xl)\b/,
      },
      {
        rule: "arbitrary-visual-token",
        message: "Arbitrary visual tokens belong in the token/component layer.",
        pattern: /\b(?:rounded|shadow|z|border-l)-\[/,
      },
      {
        rule: "route-local-scroll-listener",
        message:
          "Route-local scroll listeners are not part of the Phase 1 UI substrate.",
        pattern: /window\.addEventListener\s*\(\s*['"]scroll['"]/,
      },
    ],
    [scannerUtilityPath, "src/components/ui"],
  );
}

function scanPatterns(
  targets: readonly ScanTarget[],
  rules: readonly PatternRule[],
  extraExclusions: readonly string[] = [],
): readonly ScanViolation[] {
  const violations: ScanViolation[] = [];
  const files = findFiles(
    targets.map((target) => ({
      ...target,
      exclude: [...(target.exclude ?? []), ...extraExclusions],
    })),
  );

  for (const file of files) {
    const content = readFileSync(file, "utf8");
    const lines = content.split(/\r?\n/);

    for (const [index, line] of lines.entries()) {
      for (const rule of rules) {
        if (rule.pattern.test(line)) {
          violations.push({
            file,
            line: index + 1,
            rule: rule.rule,
            message: rule.message,
            excerpt: line.trim(),
          });
        }
      }
    }
  }

  return violations;
}

function isAllowedConvexSchemaComposition(violation: ScanViolation): boolean {
  return (
    violation.rule === "module-private-import" &&
    violation.file === "convex/schema.ts" &&
    /from\s+['"]\.\.\/src\/modules\/[^'"]+\/internal\/(?:schema|convex-schema)['"]/.test(
      violation.excerpt,
    )
  );
}

function isAllowedModulePublicSeam(violation: ScanViolation): boolean {
  if (violation.rule !== "module-private-import") {
    return false;
  }

  // `public.ts` is the general seam; `convex.ts` is the deliberately narrow,
  // runtime-safe seam for Convex hosts that must not pull Node/server barrels.
  const match = /^src\/modules\/([^/]+)\/(?:public|convex)\.ts$/.exec(
    violation.file,
  );
  if (match === null) {
    return false;
  }

  return (
    match[1] !== undefined &&
    /from\s+['"]\.\/internal\//.test(violation.excerpt)
  );
}

function isReviewedTransportSdkImport(violation: ScanViolation): boolean {
  if (violation.rule !== "forbidden-handshake-import") return false;
  if (
    violation.file ===
    "src/modules/capability-supply/internal/facilitator-discovery-client.ts"
  ) {
    return /from\s+['"]@x402\/extensions\/bazaar['"]/.test(
      violation.excerpt,
    );
  }
  if (
    violation.file ===
    "src/modules/capability-supply/internal/x402-evm-receipt-reader.ts"
  ) {
    return /from\s+['"](?:@x402\/evm|viem(?:\/[^'"]+)?)['"]/.test(
      violation.excerpt,
    );
  }
  const reviewedCapabilityTransportFiles = new Set([
    "src/modules/capability-supply/internal/cdp-x402-payment-signer.ts",
    "src/modules/capability-supply/internal/readiness-probe-mcp.ts",
    "src/modules/capability-supply/internal/route-transport-invoke.ts",
    "src/modules/capability-supply/internal/route-transport-mcp.ts",
    "src/modules/capability-supply/internal/route-transport-x402.ts",
    "src/modules/capability-supply/internal/x402-offer-receipt.ts",
    "src/modules/capability-supply/internal/x402-payment-signer.ts",
    "src/modules/capability-supply/internal/x402-settlement-verifier.ts",
  ]);
  if (reviewedCapabilityTransportFiles.has(violation.file)) {
    return /from\s+['"](?:@x402\/[^'"]+|@modelcontextprotocol\/sdk\/[^'"]+|viem(?:\/[^'"]+)?)['"]/.test(violation.excerpt);
  }
  if (
    violation.file ===
    "src/modules/capability-supply/internal/x402-payment-signer.ts"
  ) {
    return /from\s+['"](?:@x402\/(?:core|evm|extensions)\/[^'"]+|viem\/accounts)['"]/.test(
      violation.excerpt,
    );
  }
  if (
    violation.file ===
      "src/modules/capability-supply/internal/x402-settlement-verifier.ts" ||
    violation.file ===
      "src/modules/capability-supply/internal/x402-evm-receipt-reader.ts"
  ) {
    return /from\s+['"]viem['"]/.test(violation.excerpt);
  }
  if (
    violation.file ===
    "src/modules/capability-supply/internal/transport-adapters.ts"
  ) {
    return /from\s+['"](?:@x402\/core\/schemas|@modelcontextprotocol\/sdk\/types\.js)['"]/.test(
      violation.excerpt,
    );
  }
  if (
    violation.file ===
    "src/modules/capability-supply/route-transport-runtime.ts"
  ) {
    return /from\s+['"]@modelcontextprotocol\/sdk\/(?:client\/index|client\/streamableHttp|shared\/transport|types)\.js['"]/.test(
      violation.excerpt,
    );
  }
  if (
    violation.file ===
    "src/modules/capability-supply/internal/readiness-probe.ts"
  ) {
    return /from\s+['"]@modelcontextprotocol\/sdk\/(?:client\/index|client\/streamableHttp|shared\/transport|types)\.js['"]/.test(
      violation.excerpt,
    );
  }
  if (violation.file === "src/lib/mcp-protocol.ts") {
    return /from\s+['"]@modelcontextprotocol\/sdk\/types\.js['"]/.test(
      violation.excerpt,
    );
  }
  if (violation.file === "src/modules/money/internal/exact-amount.ts") {
    return /from\s+['"]@x402\/core\/utils['"]/.test(violation.excerpt);
  }
  // T6's adopted MCP host owns the protocol SDK construction at this exact server seam.
  return (
    violation.file === "src/lib/server/mcp-api.ts" &&
    /from\s+['"]@modelcontextprotocol\/sdk\/[^'"]+['"]/.test(violation.excerpt)
  );
}
