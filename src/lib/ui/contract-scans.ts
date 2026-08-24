import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import ts from "typescript";

import type {
  ModuleBoundaryManifest,
  ModuleName,
  RuntimeBoundaryException,
  RuntimeImporter,
} from "@/modules/module-boundaries";

export type ScanTarget = {
  root: string;
  includeExtensions?: readonly string[];
  exclude?: readonly string[];
};

export type ScanViolation = {
  file: string;
  line: number;
  rule: string;
  message: string;
  excerpt: string;
};

export type ModuleBoundaryScanOptions = Readonly<{
  manifest: ModuleBoundaryManifest;
  moduleRoot?: string;
  sourceFiles?: readonly string[];
}>;

export type ModuleBoundaryScanResult = Readonly<{
  violations: readonly ScanViolation[];
  moduleCount: number;
  importCount: number;
  crossModuleImportCount: number;
  allowedEdgeCount: number;
  exceptionCount: number;
  cycles: readonly (readonly ModuleName[])[];
  usedRuntimeExceptionIds: readonly string[];
  observedCrossModuleImports: readonly ModuleImportObservation[];
}>;

export type ModuleImportObservation = Readonly<{
  from: ModuleName;
  to: ModuleName;
  importer: string;
  entry: string;
  allowed: boolean;
  exceptionId?: string;
}>;

export type TestBoundaryScanResult = Readonly<{
  violations: readonly ScanViolation[];
  whiteBoxImportCount: number;
  usedTestExceptionIds: readonly string[];
  requiredWhiteBoxImports: readonly Readonly<{
    importer: string;
    to: ModuleName;
    entry: string;
  }>[];
}>;

export type RuntimeConsumerScanResult = Readonly<{
  violations: readonly ScanViolation[];
  consumerImportCount: number;
  usedRuntimeExceptionIds: readonly string[];
  requiredConsumerExceptions: readonly Readonly<{
    from: 'adapter' | 'convex';
    importer: string;
    to: ModuleName;
    entry: string;
  }>[];
}>;

type PatternRule = {
  rule: string;
  message: string;
  pattern: RegExp;
};

const defaultExtensions = [
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".css",
  ".md",
  ".json",
  ".fixture",
] as const;
const ignoredDirectories = new Set([
  ".git",
  ".planning",
  ".codex",
  ".agents",
  "coverage",
  "dist",
  "node_modules",
  "playwright-report",
  "test-results",
]);

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

export function findFiles(targets: readonly ScanTarget[]): readonly string[] {
  const files: string[] = [];

  for (const target of targets) {
    collectFiles(target.root, target, files);
  }

  return files.sort();
}

/**
 * Resolve and validate static imports with the same TypeScript compiler API
 * and path aliases used by the application build.
 */
export function scanModuleBoundaries(
  options: ModuleBoundaryScanOptions,
): ModuleBoundaryScanResult {
  const moduleRoot = resolve(options.moduleRoot ?? "src/modules");
  const sourceFiles = (options.sourceFiles ?? findFiles([
    { root: moduleRoot, includeExtensions: [".ts", ".tsx"] },
  ])).map((file) => resolve(file));
  const manifestViolations = validateModuleBoundaryManifest(
    options.manifest,
    moduleRoot,
  );
  const config = readTypeScriptConfig();
  const host = ts.createCompilerHost(config.options, true);
  const declarations = new Map(
    options.manifest.modules.map((declaration) => [declaration.name, declaration]),
  );
  const usedRuntimeExceptionIds = new Set<string>();
  const observedCrossModuleImports = new Map<string, ModuleImportObservation>();
  const violations: ScanViolation[] = [...manifestViolations];
  let importCount = 0;
  let crossModuleImportCount = 0;

  for (const importer of sourceFiles) {
    const importerModule = moduleForFile(importer, moduleRoot);
    if (importerModule === undefined) continue;
    const source = readFileSync(importer, "utf8");
    const sourceFile = ts.createSourceFile(
      importer,
      source,
      ts.ScriptTarget.Latest,
      true,
      scriptKindFor(importer),
    );

    for (const imported of staticModuleSpecifiers(sourceFile)) {
      importCount += 1;
      const resolvedImport = ts.resolveModuleName(
        imported.specifier,
        importer,
        config.options,
        host,
      ).resolvedModule;
      if (resolvedImport === undefined) continue;
      const targetFile = normalizeResolvedTypeScriptFile(resolvedImport.resolvedFileName);
      const targetModule = moduleForFile(targetFile, moduleRoot);
      if (targetModule === undefined || targetModule === importerModule) continue;
      crossModuleImportCount += 1;
      const importerEntry = relative(
        join(moduleRoot, importerModule),
        importer,
      ).split(sep).join("/");
      const targetEntry = relative(
        join(moduleRoot, targetModule),
        targetFile,
      ).split(sep).join("/");
      const exception = matchingRuntimeException(
        options.manifest.temporaryRuntimeExceptions,
        importerModule,
        targetModule,
        importerEntry,
        targetEntry,
      );
      const observationKey = `${importerModule}/${importerEntry}->${targetModule}/${targetEntry}`;
      observedCrossModuleImports.set(observationKey, {
        from: importerModule,
        to: targetModule,
        importer: importerEntry,
        entry: targetEntry,
        allowed: exception !== undefined || (
          declarations.get(importerModule)?.allowedDependencies.includes(targetModule) === true &&
          declarations.get(targetModule)?.entrySurfaces.includes(targetEntry) === true
        ),
        ...(exception === undefined ? {} : { exceptionId: exception.id }),
      });
      if (exception !== undefined) {
        usedRuntimeExceptionIds.add(exception.id);
        continue;
      }

      const declaration = declarations.get(importerModule);
      const targetDeclaration = declarations.get(targetModule);
      if (declaration === undefined || targetDeclaration === undefined) continue;
      if (!targetDeclaration.entrySurfaces.includes(targetEntry)) {
        violations.push(moduleViolation(
          importer,
          imported.line,
          "module-undeclared-entry",
          `Module ${importerModule} imports undeclared ${targetModule} entry ${targetEntry}.`,
          imported.specifier,
        ));
      }
      if (!declaration.allowedDependencies.includes(targetModule)) {
        const testOnly = options.manifest.testOnlyWhiteBoxExceptions.some(
          (candidate) => candidate.to === targetModule && candidate.entry === targetEntry,
        );
        violations.push(moduleViolation(
          importer,
          imported.line,
          testOnly ? "module-test-exception-at-runtime" : "module-forbidden-edge",
          testOnly
            ? `Runtime module ${importerModule} cannot use test-only ${targetModule}/${targetEntry}.`
            : `Target graph forbids ${importerModule} -> ${targetModule}.`,
          imported.specifier,
        ));
      }
    }
  }

  for (const exception of options.manifest.temporaryRuntimeExceptions.filter(({ from }) => from !== "adapter" && from !== "convex")) {
    if (!usedRuntimeExceptionIds.has(exception.id)) {
      violations.push(moduleViolation(
        join(moduleRoot, exception.from, exception.importer),
        1,
        "module-unused-exception",
        `Temporary exception ${exception.id} matches no current runtime import.`,
        `${exception.from}/${exception.importer} -> ${exception.to}/${exception.entry}`,
      ));
    }
  }

  const cycles = declaredGraphCycles(options.manifest);
  return {
    violations,
    moduleCount: options.manifest.modules.length,
    importCount,
    crossModuleImportCount,
    allowedEdgeCount: options.manifest.modules.reduce(
      (count, declaration) => count + declaration.allowedDependencies.length,
      0,
    ),
    exceptionCount: options.manifest.temporaryRuntimeExceptions.length,
    cycles,
    usedRuntimeExceptionIds: [...usedRuntimeExceptionIds].sort(),
    observedCrossModuleImports: [...observedCrossModuleImports.values()],
  };
}

export function validateModuleBoundaryManifest(
  manifest: ModuleBoundaryManifest,
  moduleRoot = resolve("src/modules"),
): readonly ScanViolation[] {
  const violations: ScanViolation[] = [];
  const moduleNames = manifest.modules.map(({ name }) => name);
  const declared = new Set(moduleNames);
  const actual = new Set(
    readdirSync(moduleRoot)
      .filter((entry) => statSync(join(moduleRoot, entry)).isDirectory()),
  );

  for (const duplicate of duplicates(moduleNames)) {
    violations.push(manifestViolation("module-duplicate", `Duplicate module declaration: ${duplicate}.`));
  }
  for (const name of moduleNames) {
    if (!actual.has(name)) {
      violations.push(manifestViolation("module-unknown", `Unknown module declaration: ${name}.`));
    }
  }
  for (const name of actual) {
    if (!declared.has(name as ModuleName)) {
      violations.push(manifestViolation("module-missing", `Top-level source module is not declared: ${name}.`));
    }
  }
  for (const declaration of manifest.modules) {
    for (const duplicate of duplicates(declaration.entrySurfaces)) {
      violations.push(manifestViolation("module-duplicate-entry", `Duplicate ${declaration.name} entry: ${duplicate}.`));
    }
    for (const dependency of declaration.allowedDependencies) {
      if (!declared.has(dependency)) {
        violations.push(manifestViolation("module-unknown-dependency", `${declaration.name} names unknown dependency ${dependency}.`));
      }
    }
    for (const duplicate of duplicates(declaration.allowedDependencies)) {
      violations.push(manifestViolation("module-duplicate-dependency", `Duplicate ${declaration.name} dependency: ${duplicate}.`));
    }
    for (const entry of declaration.entrySurfaces) {
      if (!ts.sys.fileExists(join(moduleRoot, declaration.name, entry))) {
        violations.push(manifestViolation("module-unknown-entry", `Declared ${declaration.name} entry does not exist: ${entry}.`));
      }
    }
  }

  for (const cycle of declaredGraphCycles(manifest)) {
    violations.push(manifestViolation("module-cycle", `Declared target graph cycle: ${cycle.join(" -> ")}.`));
  }

  const exceptionIds = [
    ...manifest.temporaryRuntimeExceptions.map(({ id }) => id),
    ...manifest.testOnlyWhiteBoxExceptions.map(({ id }) => id),
  ];
  for (const duplicate of duplicates(exceptionIds)) {
    violations.push(manifestViolation("module-duplicate-exception", `Duplicate boundary exception id: ${duplicate}.`));
  }
  const runtimeScopes = manifest.temporaryRuntimeExceptions.map(
    ({ from, to, importer, entry }) => `${from}:${importer}->${to}/${entry}`,
  );
  for (const duplicate of duplicates(runtimeScopes)) {
    violations.push(manifestViolation("module-duplicate-exception-scope", `Multiple runtime exceptions own the same scope: ${duplicate}.`));
  }
  for (const exception of manifest.temporaryRuntimeExceptions) {
    if (exception.owner.trim() === "" || exception.removalTask.trim() === "") {
      violations.push(manifestViolation("module-malformed-exception", `Runtime exception ${exception.id} requires an owner and removal task.`));
    }
    if (!(["T3", "T4", "T5", "T6", "T7"] as const).includes(exception.removalTask)) {
      violations.push(manifestViolation("module-malformed-exception", `Runtime exception ${exception.id} has invalid removal task ${exception.removalTask}.`));
    }
    if (!(declared.has(exception.from as ModuleName) || exception.from === "adapter" || exception.from === "convex") || !declared.has(exception.to)) {
      violations.push(manifestViolation("module-malformed-exception", `Runtime exception ${exception.id} names an unknown module.`));
    }
    if (exception.importer.trim() === "" || exception.entry.trim() === "" || /[*?]/u.test(exception.importer + exception.entry)) {
      violations.push(manifestViolation("module-malformed-exception", `Runtime exception ${exception.id} must have exact importer and entry paths.`));
    }
  }
  const testScopes = manifest.testOnlyWhiteBoxExceptions.flatMap(
    ({ importers, to, entry }) => importers.map((importer) => `${importer}->${to}/${entry}`),
  );
  for (const duplicate of duplicates(testScopes)) {
    violations.push(manifestViolation("module-duplicate-test-exception-scope", `Multiple test exceptions own the same scope: ${duplicate}.`));
  }
  for (const exception of manifest.testOnlyWhiteBoxExceptions) {
    if (exception.importers.length === 0 || duplicates(exception.importers).length > 0 || exception.importers.some((importer) => !importer.startsWith("tests/") || /[*?]/u.test(importer)) || exception.owner.trim() === "" || exception.entry.trim() === "" || /[*?]/u.test(exception.entry) || !declared.has(exception.to)) {
      violations.push(manifestViolation("module-malformed-test-exception", `Test exception ${exception.id} must name exact tests/ importers, owner, and entry.`));
    }
  }
  return violations;
}

/** Enforce exact, test-owned exceptions for imports outside declared surfaces. */
export function scanTestOnlyModuleBoundaries(
  manifest: ModuleBoundaryManifest,
  testFiles: readonly string[] = findFiles([
    { root: "tests", includeExtensions: [".ts", ".tsx"] },
  ]),
  moduleRoot = resolve("src/modules"),
): TestBoundaryScanResult {
  const config = readTypeScriptConfig();
  const host = ts.createCompilerHost(config.options, true);
  const declarations = new Map(
    manifest.modules.map((declaration) => [declaration.name, declaration]),
  );
  const usedTestExceptionIds = new Set<string>();
  const violations: ScanViolation[] = [];
  const requiredWhiteBoxImports = new Map<string, Readonly<{
    importer: string;
    to: ModuleName;
    entry: string;
  }>>();
  let whiteBoxImportCount = 0;

  for (const testFile of testFiles.map((file) => resolve(file))) {
    const sourceFile = ts.createSourceFile(
      testFile,
      readFileSync(testFile, "utf8"),
      ts.ScriptTarget.Latest,
      true,
      scriptKindFor(testFile),
    );
    const importer = relative(process.cwd(), testFile).split(sep).join("/");
    for (const imported of staticModuleSpecifiers(sourceFile)) {
      const resolvedImport = ts.resolveModuleName(
        imported.specifier,
        testFile,
        config.options,
        host,
      ).resolvedModule;
      if (resolvedImport === undefined) continue;
      const targetFile = normalizeResolvedTypeScriptFile(resolvedImport.resolvedFileName);
      const targetModule = moduleForFile(targetFile, moduleRoot);
      if (targetModule === undefined) continue;
      const entry = relative(join(moduleRoot, targetModule), targetFile).split(sep).join("/");
      if (declarations.get(targetModule)?.entrySurfaces.includes(entry) === true) continue;
      whiteBoxImportCount += 1;
      requiredWhiteBoxImports.set(`${importer}->${targetModule}/${entry}`, {
        importer,
        to: targetModule,
        entry,
      });
      const exception = manifest.testOnlyWhiteBoxExceptions.find(
        (candidate) => candidate.importers.includes(importer) && candidate.to === targetModule && candidate.entry === entry,
      );
      if (exception === undefined) {
        violations.push(moduleViolation(
          testFile,
          imported.line,
          "module-unowned-test-import",
          `Test import requires an exact white-box exception for ${targetModule}/${entry}.`,
          imported.specifier,
        ));
      } else {
        usedTestExceptionIds.add(exception.id);
      }
    }
  }

  for (const exception of manifest.testOnlyWhiteBoxExceptions) {
    if (!usedTestExceptionIds.has(exception.id)) {
      violations.push(moduleViolation(
        exception.importers[0] ?? "tests",
        1,
        "module-unused-test-exception",
        `Test exception ${exception.id} matches no current white-box import.`,
        `${exception.to}/${exception.entry}`,
      ));
    }
  }
  return {
    violations,
    whiteBoxImportCount,
    usedTestExceptionIds: [...usedTestExceptionIds].sort(),
    requiredWhiteBoxImports: [...requiredWhiteBoxImports.values()],
  };
}

/** Inspect route/lib/component and Convex consumers of declared module entries. */
export function scanRuntimeModuleConsumers(
  manifest: ModuleBoundaryManifest,
  sourceFiles: readonly string[] = [
    ...findFiles([{ root: "src", includeExtensions: [".ts", ".tsx"] }]),
    ...findFiles([{ root: "convex", includeExtensions: [".ts"] }]),
  ],
  moduleRoot = resolve("src/modules"),
): RuntimeConsumerScanResult {
  const config = readTypeScriptConfig();
  const host = ts.createCompilerHost(config.options, true);
  const declarations = new Map(
    manifest.modules.map((declaration) => [declaration.name, declaration]),
  );
  const usedRuntimeExceptionIds = new Set<string>();
  const requiredConsumerExceptions = new Map<string, Readonly<{
    from: 'adapter' | 'convex';
    importer: string;
    to: ModuleName;
    entry: string;
  }>>();
  const violations: ScanViolation[] = [];
  let consumerImportCount = 0;

  for (const sourcePath of sourceFiles.map((file) => resolve(file))) {
    if (moduleForFile(sourcePath, moduleRoot) !== undefined) continue;
    const from = sourcePath.startsWith(resolve("convex") + sep) ? "convex" : "adapter";
    const importer = relative(process.cwd(), sourcePath).split(sep).join("/");
    if (importer === "src/lib/ui/contract-scans.ts" || importer === "src/routeTree.gen.ts" || importer.startsWith("convex/_generated/")) continue;
    const sourceFile = ts.createSourceFile(
      sourcePath,
      readFileSync(sourcePath, "utf8"),
      ts.ScriptTarget.Latest,
      true,
      scriptKindFor(sourcePath),
    );
    for (const imported of staticModuleSpecifiers(sourceFile)) {
      const resolvedImport = ts.resolveModuleName(imported.specifier, sourcePath, config.options, host).resolvedModule;
      if (resolvedImport === undefined) continue;
      const targetFile = normalizeResolvedTypeScriptFile(resolvedImport.resolvedFileName);
      const targetModule = moduleForFile(targetFile, moduleRoot);
      if (targetModule === undefined) continue;
      consumerImportCount += 1;
      const entry = relative(join(moduleRoot, targetModule), targetFile).split(sep).join("/");
      if (declarations.get(targetModule)?.entrySurfaces.includes(entry) === true) continue;
      const exception = matchingRuntimeException(
        manifest.temporaryRuntimeExceptions,
        from,
        targetModule,
        importer,
        entry,
      );
      if (exception !== undefined) {
        usedRuntimeExceptionIds.add(exception.id);
        continue;
      }
      requiredConsumerExceptions.set(`${from}:${importer}->${targetModule}/${entry}`, {
        from,
        importer,
        to: targetModule,
        entry,
      });
      const testOnly = manifest.testOnlyWhiteBoxExceptions.some(
        (candidate) => candidate.to === targetModule && candidate.entry === entry,
      );
      violations.push(moduleViolation(
        sourcePath,
        imported.line,
        testOnly ? "module-test-exception-at-runtime" : "module-undeclared-consumer-entry",
        `${from} consumer imports undeclared ${targetModule} entry ${entry}.`,
        imported.specifier,
      ));
    }
  }

  for (const exception of manifest.temporaryRuntimeExceptions.filter(({ from }) => from === "adapter" || from === "convex")) {
    if (!usedRuntimeExceptionIds.has(exception.id)) {
      violations.push(moduleViolation(
        exception.importer,
        1,
        "module-unused-exception",
        `Temporary consumer exception ${exception.id} matches no current runtime import.`,
        `${exception.from}:${exception.importer} -> ${exception.to}/${exception.entry}`,
      ));
    }
  }
  return {
    violations,
    consumerImportCount,
    usedRuntimeExceptionIds: [...usedRuntimeExceptionIds].sort(),
    requiredConsumerExceptions: [...requiredConsumerExceptions.values()],
  };
}

export function declaredGraphCycles(
  manifest: ModuleBoundaryManifest,
): readonly (readonly ModuleName[])[] {
  const graph = new Map(
    manifest.modules.map(({ name, allowedDependencies }) => [name, allowedDependencies]),
  );
  const visiting = new Set<ModuleName>();
  const visited = new Set<ModuleName>();
  const stack: ModuleName[] = [];
  const cycles = new Map<string, readonly ModuleName[]>();

  const visit = (module: ModuleName): void => {
    if (visited.has(module)) return;
    if (visiting.has(module)) {
      const start = stack.indexOf(module);
      const cycle = [...stack.slice(start), module];
      const body = cycle.slice(0, -1);
      const rotations = body.map((_, index) => [...body.slice(index), ...body.slice(0, index)]);
      const canonical = rotations.map((rotation) => rotation.join(" -> ")).sort()[0];
      if (canonical !== undefined) cycles.set(canonical, cycle);
      return;
    }
    visiting.add(module);
    stack.push(module);
    for (const dependency of graph.get(module) ?? []) visit(dependency);
    stack.pop();
    visiting.delete(module);
    visited.add(module);
  };
  for (const module of graph.keys()) visit(module);
  return [...cycles.values()];
}

function readTypeScriptConfig(): Readonly<{ options: ts.CompilerOptions }> {
  const configPath = ts.findConfigFile(process.cwd(), ts.sys.fileExists, "tsconfig.json");
  if (configPath === undefined) throw new Error("tsconfig.json not found");
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  if (config.error !== undefined) {
    throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, "\n"));
  }
  return ts.parseJsonConfigFileContent(config.config, ts.sys, dirname(configPath));
}

function staticModuleSpecifiers(sourceFile: ts.SourceFile): readonly Readonly<{ specifier: string; line: number }>[] {
  const imports: Readonly<{ specifier: string; line: number }>[] = [];
  const record = (literal: ts.StringLiteralLike): void => {
    imports.push({
      specifier: literal.text,
      line: sourceFile.getLineAndCharacterOfPosition(literal.getStart(sourceFile)).line + 1,
    });
  };
  sourceFile.forEachChild((node) => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier !== undefined && ts.isStringLiteralLike(node.moduleSpecifier)) {
      record(node.moduleSpecifier);
    } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference) && node.moduleReference.expression !== undefined && ts.isStringLiteralLike(node.moduleReference.expression)) {
      record(node.moduleReference.expression);
    }
  });
  return imports;
}

function scriptKindFor(file: string): ts.ScriptKind {
  return file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
}

function normalizeResolvedTypeScriptFile(file: string): string {
  return resolve(file.replace(/\.d\.ts$/u, ".ts"));
}

function moduleForFile(file: string, moduleRoot: string): ModuleName | undefined {
  const path = relative(moduleRoot, file).split(sep).join("/");
  if (path.startsWith("../") || path === "..") return undefined;
  if (!path.includes("/")) return undefined;
  const [module] = path.split("/");
  return module === undefined || module === "" ? undefined : module as ModuleName;
}

function matchingRuntimeException(
  exceptions: readonly RuntimeBoundaryException[],
  from: RuntimeImporter,
  to: ModuleName,
  importer: string,
  entry: string,
): RuntimeBoundaryException | undefined {
  return exceptions.find((candidate) => candidate.from === from && candidate.to === to && candidate.importer === importer && candidate.entry === entry);
}

function duplicates(values: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  const duplicate = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicate.add(value);
    seen.add(value);
  }
  return [...duplicate].sort();
}

function moduleViolation(file: string, line: number, rule: string, message: string, excerpt: string): ScanViolation {
  return { file: relative(process.cwd(), file).split(sep).join("/"), line, rule, message, excerpt };
}

function manifestViolation(rule: string, message: string): ScanViolation {
  return { file: "src/modules/module-boundaries.ts", line: 1, rule, message, excerpt: message };
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

function collectFiles(root: string, target: ScanTarget, files: string[]): void {
  let stats;
  try {
    stats = statSync(root);
  } catch {
    return;
  }

  if (isExcluded(root, target.exclude ?? [])) {
    return;
  }

  if (stats.isFile()) {
    if (
      hasAllowedExtension(root, target.includeExtensions ?? defaultExtensions)
    ) {
      files.push(root);
    }
    return;
  }

  if (!stats.isDirectory()) {
    return;
  }

  const basename = root.split("/").at(-1) ?? root;
  if (ignoredDirectories.has(basename)) {
    return;
  }

  for (const entry of readdirSync(root)) {
    collectFiles(join(root, entry), target, files);
  }
}

function hasAllowedExtension(
  file: string,
  extensions: readonly string[],
): boolean {
  return extensions.some((extension) => file.endsWith(extension));
}

function isExcluded(file: string, exclusions: readonly string[]): boolean {
  const normalized = relative(process.cwd(), file).replaceAll("\\", "/");
  return exclusions.some(
    (exclude) => normalized === exclude || normalized.startsWith(`${exclude}/`),
  );
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
