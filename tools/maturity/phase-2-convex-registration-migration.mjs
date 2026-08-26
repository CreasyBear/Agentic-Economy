import { createHash } from "node:crypto";
import { existsSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";

const TOOL_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const ORDINARY_BUILDERS = new Set([
  "query",
  "mutation",
  "action",
  "internalQuery",
  "internalMutation",
  "internalAction",
  "httpAction",
]);

const GENERIC_BUILDERS = new Set([
  "queryGeneric",
  "mutationGeneric",
  "actionGeneric",
  "internalQueryGeneric",
  "internalMutationGeneric",
  "internalActionGeneric",
  "httpActionGeneric",
]);

const DEFAULT_CLASSIFICATIONS = resolve(
  TOOL_ROOT,
  ".planning/maturity-execution/contracts/phase-2-convex-registration-classifications.json",
);
const DEFAULT_OUTPUT = resolve(
  TOOL_ROOT,
  ".planning/maturity-execution/contracts/phase-2-convex-registration-migration.json",
);
const DEFAULT_RUNTIME_INVENTORY = resolve(
  TOOL_ROOT,
  ".planning/maturity-execution/contracts/phase-2-protected-surfaces.json",
);

const RUNTIME_SURFACE_FAMILIES = [
  "serverFunctions",
  "publicConvex",
  "convexHttpActions",
  "convexHttpRoutes",
  "crons",
  "backgroundFamilies",
];

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function portable(path) {
  return path.split(sep).join("/");
}

function runtimeSurfaceRefs(document) {
  return new Set(
    RUNTIME_SURFACE_FAMILIES.flatMap((family) =>
      (document?.[family] ?? []).map((surface) => surface.ref),
    ),
  );
}

function digestProjectSource(sourcePath) {
  if (typeof sourcePath !== "string" || isAbsolute(sourcePath)) return null;
  const target = resolve(TOOL_ROOT, sourcePath);
  const relativeTarget = relative(TOOL_ROOT, target);
  if (
    relativeTarget === "" ||
    relativeTarget === ".." ||
    relativeTarget.startsWith(`..${sep}`) ||
    isAbsolute(relativeTarget) ||
    !existsSync(target)
  ) {
    return null;
  }
  const canonicalTarget = realpathSync.native(target);
  const canonicalRelative = relative(TOOL_ROOT, canonicalTarget);
  if (
    canonicalRelative === ".." ||
    canonicalRelative.startsWith(`..${sep}`) ||
    isAbsolute(canonicalRelative)
  ) {
    return null;
  }
  return sha256(readFileSync(canonicalTarget));
}

function projectRoot(projectPath) {
  let current = dirname(projectPath);
  while (true) {
    if (existsSync(resolve(current, "package.json"))) return current;
    const parent = dirname(current);
    if (parent === current) return dirname(projectPath);
    current = parent;
  }
}

function importBindings(sourceFile) {
  const bindings = new Map();
  for (const statement of sourceFile.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteralLike(statement.moduleSpecifier)
    )
      continue;
    const named = statement.importClause?.namedBindings;
    if (named === undefined || !ts.isNamedImports(named)) continue;
    for (const element of named.elements) {
      bindings.set(element.name.text, {
        importedName: element.propertyName?.text ?? element.name.text,
        localName: element.name.text,
        module: statement.moduleSpecifier.text,
      });
    }
  }
  return bindings;
}

function variableDeclarations(sourceFile) {
  const declarations = new Map();
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (
        ts.isIdentifier(declaration.name) &&
        declaration.initializer !== undefined
      ) {
        declarations.set(declaration.name.text, declaration);
      }
    }
  }
  return declarations;
}

function canonicalBuilder(binding) {
  if (
    binding.module === "convex/server" &&
    GENERIC_BUILDERS.has(binding.importedName)
  ) {
    return {
      canonicalName: binding.importedName,
      canonicalModule: "convex/server",
      resolution:
        binding.localName === binding.importedName ? "direct" : "import_alias",
    };
  }
  if (
    /(?:^|\/)_generated\/server$/u.test(binding.module) &&
    ORDINARY_BUILDERS.has(binding.importedName)
  ) {
    return {
      canonicalName: binding.importedName,
      canonicalModule: binding.module,
      resolution:
        binding.localName === binding.importedName ? "direct" : "import_alias",
    };
  }
  return undefined;
}

function visibilityFor(kind) {
  if (kind === "httpAction" || kind === "httpActionGeneric") return "http";
  return kind.startsWith("internal") ? "internal" : "public";
}

function unwrap(expression) {
  let current = expression;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isTypeAssertionExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

function identityFactoryParameter(declaration) {
  if (
    !ts.isVariableDeclaration(declaration) ||
    declaration.initializer === undefined
  )
    return undefined;
  const initializer = unwrap(declaration.initializer);
  if (!ts.isArrowFunction(initializer) && !ts.isFunctionExpression(initializer))
    return undefined;
  const parameter = initializer.parameters[0];
  if (
    initializer.parameters.length !== 1 ||
    parameter === undefined ||
    !ts.isIdentifier(parameter.name)
  ) {
    return undefined;
  }
  if (
    ts.isIdentifier(initializer.body) &&
    initializer.body.text === parameter.name.text
  ) {
    return parameter.name.text;
  }
  if (
    ts.isBlock(initializer.body) &&
    initializer.body.statements.length === 1
  ) {
    const statement = initializer.body.statements[0];
    if (
      statement !== undefined &&
      ts.isReturnStatement(statement) &&
      statement.expression !== undefined &&
      ts.isIdentifier(statement.expression) &&
      statement.expression.text === parameter.name.text
    )
      return parameter.name.text;
  }
  return undefined;
}

function resolveRegistrarExpression(expression, context, seen = new Set()) {
  const current = unwrap(expression);
  if (ts.isIdentifier(current)) {
    const imported = context.imports.get(current.text);
    if (imported !== undefined) return canonicalBuilder(imported);
    const local = context.locals.get(current.text);
    if (local === undefined || seen.has(local)) return undefined;
    seen.add(local);
    const resolved = resolveRegistrarExpression(
      local.initializer,
      context,
      seen,
    );
    if (resolved === undefined) return undefined;
    return {
      ...resolved,
      resolution: resolved.resolution === "factory" ? "factory" : "local_alias",
    };
  }
  if (
    ts.isCallExpression(current) &&
    current.arguments.length === 1 &&
    ts.isIdentifier(current.expression)
  ) {
    const factory = context.locals.get(current.expression.text);
    if (
      factory === undefined ||
      identityFactoryParameter(factory) === undefined
    )
      return undefined;
    const resolved = resolveRegistrarExpression(
      current.arguments[0],
      context,
      seen,
    );
    return resolved === undefined
      ? undefined
      : { ...resolved, resolution: "factory" };
  }
  return undefined;
}

function registeredKindFromType(checker, symbol, declaration) {
  const type = checker.getTypeOfSymbolAtLocation(symbol, declaration);
  const alias = type.aliasSymbol?.getName();
  if (alias === "PublicHttpAction") return "httpAction";
  if (
    alias !== "RegisteredQuery" &&
    alias !== "RegisteredMutation" &&
    alias !== "RegisteredAction"
  ) {
    return undefined;
  }
  const text = checker.typeToString(
    type,
    declaration,
    ts.TypeFormatFlags.NoTruncation,
  );
  const visibility = /<\s*["']internal["']/u.test(text) ? "internal" : "public";
  if (alias === "RegisteredQuery")
    return visibility === "internal" ? "internalQuery" : "query";
  if (alias === "RegisteredMutation")
    return visibility === "internal" ? "internalMutation" : "mutation";
  return visibility === "internal" ? "internalAction" : "action";
}

function createProgram(projectPath) {
  const configResult = ts.readConfigFile(projectPath, ts.sys.readFile);
  if (configResult.error !== undefined) {
    throw new Error(
      ts.flattenDiagnosticMessageText(configResult.error.messageText, "\n"),
    );
  }
  const parsed = ts.parseJsonConfigFileContent(
    configResult.config,
    ts.sys,
    dirname(projectPath),
    undefined,
    projectPath,
  );
  if (parsed.errors.length > 0) {
    throw new Error(
      parsed.errors
        .map((error) =>
          ts.flattenDiagnosticMessageText(error.messageText, "\n"),
        )
        .join("\n"),
    );
  }
  return ts.createProgram(parsed.fileNames, parsed.options);
}

function normalizedRealPath(path) {
  return portable(realpathSync.native(resolve(path)));
}

function inventorySourceFiles(program, sourceRoot) {
  const portableRoot = `${normalizedRealPath(sourceRoot)}/`;
  return program.getSourceFiles().filter((sourceFile) => {
    const path = normalizedRealPath(sourceFile.fileName);
    return (
      !sourceFile.isDeclarationFile &&
      !path.includes("/node_modules/") &&
      !path.includes("/_generated/") &&
      !/\.(?:test|spec)\.tsx?$/u.test(path) &&
      path.startsWith(portableRoot)
    );
  });
}

function assertInventoryDiagnosticsClean(program, sourceRoot) {
  const sourceFiles = new Set(inventorySourceFiles(program, sourceRoot));
  const diagnostics = [
    ...program.getSyntacticDiagnostics(),
    ...program.getSemanticDiagnostics(),
  ].filter(
    (diagnostic) =>
      diagnostic.file !== undefined && sourceFiles.has(diagnostic.file),
  );
  if (diagnostics.length === 0) return;
  const message = diagnostics
    .map((diagnostic) => {
      const file = diagnostic.file;
      const location =
        file === undefined || diagnostic.start === undefined
          ? ""
          : (() => {
              const point = file.getLineAndCharacterOfPosition(
                diagnostic.start,
              );
              return `${portable(file.fileName)}:${point.line + 1}:${point.character + 1}: `;
            })();
      return `${location}TS${diagnostic.code} ${ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")}`;
    })
    .join("\n");
  throw new Error(`registration_inventory_diagnostic:\n${message}`);
}

export function collectConvexRegistrationInventory(options = {}) {
  const requestedProjectPath =
    options.projectPath ?? resolve(TOOL_ROOT, "tsconfig.json");
  const projectPath = isAbsolute(requestedProjectPath)
    ? requestedProjectPath
    : resolve(TOOL_ROOT, requestedProjectPath);
  const root = projectRoot(projectPath);
  const program = createProgram(projectPath);
  const checker = program.getTypeChecker();
  const sourceRoot =
    options.sourceRoot === undefined
      ? options.projectPath === undefined
        ? resolve(root, "convex")
        : dirname(projectPath)
      : resolve(root, options.sourceRoot);
  assertInventoryDiagnosticsClean(program, sourceRoot);
  const rows = [];
  const unresolved = [];
  const duplicates = [];

  for (const sourceFile of inventorySourceFiles(program, sourceRoot)) {
    const imports = importBindings(sourceFile);
    const locals = variableDeclarations(sourceFile);
    const file = portable(
      relative(root, normalizedRealPath(sourceFile.fileName)),
    );
    const moduleSymbol = checker.getSymbolAtLocation(sourceFile);
    if (moduleSymbol === undefined) continue;
    const exportedByDeclaration = new Map();
    for (const exportSymbol of checker.getExportsOfModule(moduleSymbol)) {
      const target =
        (exportSymbol.flags & ts.SymbolFlags.Alias) !== 0
          ? checker.getAliasedSymbol(exportSymbol)
          : exportSymbol;
      const declaration =
        target.valueDeclaration ??
        target.declarations?.find((candidate) =>
          ts.isVariableDeclaration(candidate),
        );
      if (
        declaration === undefined ||
        !ts.isVariableDeclaration(declaration) ||
        declaration.initializer === undefined ||
        declaration.getSourceFile() !== sourceFile
      )
        continue;
      const existing = exportedByDeclaration.get(declaration) ?? [];
      existing.push({
        exportName: exportSymbol.getName(),
        exportSymbol,
        target,
      });
      exportedByDeclaration.set(declaration, existing);
    }

    for (const [declaration, exportedSymbols] of exportedByDeclaration) {
      const sortedExports = [...exportedSymbols].sort((left, right) =>
        left.exportName.localeCompare(right.exportName),
      );
      const firstExport = sortedExports[0];
      if (firstExport === undefined) continue;
      const initializer = unwrap(declaration.initializer);
      const registrarExpression = ts.isCallExpression(initializer)
        ? initializer.expression
        : initializer;
      const builder = resolveRegistrarExpression(registrarExpression, {
        imports,
        locals,
      });
      const typedKind = registeredKindFromType(
        checker,
        firstExport.target,
        declaration,
      );
      if (builder === undefined && typedKind === undefined) continue;
      const declarationName = ts.isIdentifier(declaration.name)
        ? declaration.name.text
        : firstExport.exportName;
      const sourceSpan = {
        start: declaration.getStart(sourceFile),
        end: declaration.end,
      };
      const declarationSource = declaration.getText(sourceFile);
      const initializerSource = declaration.initializer.getText(sourceFile);
      const declarationIdentity = sha256(
        `${file}:${declarationName}:${sourceSpan.start}:${sourceSpan.end}`,
      );
      if (sortedExports.length > 1) {
        duplicates.push({
          declarationIdentity,
          file,
          exportNames: sortedExports.map((entry) => entry.exportName),
        });
      }
      if (builder === undefined) {
        unresolved.push({
          id: `${file}:${firstExport.exportName}`,
          file,
          exportName: firstExport.exportName,
          inferredRegistrationKind: typedKind,
          declarationSha256: sha256(declarationSource),
          reason: "registered_export_registrar_provenance_unresolved",
        });
        continue;
      }
      const exportName = firstExport.exportName;
      const registrationKind = builder.canonicalName;
      rows.push({
        id: `${file}:${exportName}`,
        file,
        exportName,
        registrationKind,
        visibility: visibilityFor(registrationKind),
        builder,
        registrarSymbolId: sha256(
          `${builder.canonicalModule}:${builder.canonicalName}`,
        ),
        declarationSha256: sha256(declarationSource),
        initializerSha256: sha256(initializerSource),
        sourceSpan,
        symbolId: declarationIdentity,
      });
    }
  }

  rows.sort((left, right) => left.id.localeCompare(right.id));
  unresolved.sort((left, right) => left.id.localeCompare(right.id));
  duplicates.sort((left, right) =>
    left.declarationIdentity.localeCompare(right.declarationIdentity),
  );
  const inventory = {
    schemaVersion: 1,
    analysisScope: "registration_identity_only",
    rows,
    unresolved,
    duplicates,
    counts: {
      direct: rows.length,
      files: new Set(rows.map((row) => row.file)).size,
      public: rows.filter((row) => row.visibility === "public").length,
      internal: rows.filter((row) => row.visibility === "internal").length,
      http: rows.filter((row) => row.visibility === "http").length,
      ordinary: rows.filter((row) =>
        ORDINARY_BUILDERS.has(row.registrationKind),
      ).length,
      generic: rows.filter((row) => GENERIC_BUILDERS.has(row.registrationKind))
        .length,
      aliases: rows.filter(
        (row) =>
          row.builder.resolution === "import_alias" ||
          row.builder.resolution === "local_alias",
      ).length,
      factories: rows.filter((row) => row.builder.resolution === "factory")
        .length,
      unresolved: unresolved.length,
      duplicate: duplicates.length,
    },
  };
  return Object.freeze({
    ...inventory,
    digest: sha256(`${JSON.stringify(inventory)}\n`),
  });
}

function expectedCounts(inventory) {
  return {
    direct: inventory.rows.length,
    files: new Set(inventory.rows.map((row) => row.file)).size,
    public: inventory.rows.filter((row) => row.visibility === "public").length,
    internal: inventory.rows.filter((row) => row.visibility === "internal")
      .length,
    http: inventory.rows.filter((row) => row.visibility === "http").length,
    ordinary: inventory.rows.filter((row) =>
      ORDINARY_BUILDERS.has(row.registrationKind),
    ).length,
    generic: inventory.rows.filter((row) =>
      GENERIC_BUILDERS.has(row.registrationKind),
    ).length,
    aliases: inventory.rows.filter(
      (row) =>
        row.builder.resolution === "import_alias" ||
        row.builder.resolution === "local_alias",
    ).length,
    factories: inventory.rows.filter(
      (row) => row.builder.resolution === "factory",
    ).length,
    unresolved: inventory.unresolved.length,
    duplicate: inventory.duplicates.length,
  };
}

export function validateConvexRegistrationInventory(inventory, options = {}) {
  const diagnostics = [];
  const { digest, ...digestInput } = inventory;
  const expectedDigest = sha256(`${JSON.stringify(digestInput)}\n`);
  if (digest !== expectedDigest) {
    diagnostics.push({
      code: "inventory_digest_mismatch",
      message: `declared=${String(digest)} actual=${expectedDigest}`,
    });
  }
  for (const row of inventory.unresolved ?? []) {
    diagnostics.push({
      code: "unresolved_registration",
      rowId: row.id,
      message: row.reason,
    });
  }
  for (const duplicate of inventory.duplicates ?? []) {
    diagnostics.push({
      code: "duplicate_export_identity",
      rowId: duplicate.exportNames?.[0],
      message: `duplicate exports: ${(duplicate.exportNames ?? []).join(", ")}`,
    });
  }
  const recomputed = expectedCounts(inventory);
  if (JSON.stringify(inventory.counts) !== JSON.stringify(recomputed)) {
    diagnostics.push({
      code: "declared_count_mismatch",
      message: `declared=${JSON.stringify(inventory.counts)} actual=${JSON.stringify(recomputed)}`,
    });
  }
  if (options.runtimeRows !== undefined) {
    const joined = new Set(
      options.runtimeRows.flatMap((row) => row.registrationIds ?? []),
    );
    for (const row of inventory.rows) {
      if (!joined.has(row.id)) {
        diagnostics.push({
          code: "missing_runtime_row",
          rowId: row.id,
          message: "registration has no runtime-row join",
        });
      }
    }
  }
  if (options.requireClassified === true) {
    const classificationDocument = options.classifications;
    const classificationRows = classificationDocument?.rows;
    if (
      classificationDocument?.format !==
        "phase-2-convex-registration-classifications:v1" ||
      classificationRows === undefined ||
      classificationRows === null ||
      Array.isArray(classificationRows) ||
      typeof classificationRows !== "object"
    ) {
      diagnostics.push({
        code: "classification_contract_invalid",
        message: "classification contract format or rows are invalid",
      });
    } else {
      if (classificationDocument.inventoryDigest !== inventory.digest) {
        diagnostics.push({
          code: "classification_inventory_digest_mismatch",
          message: `declared=${String(classificationDocument.inventoryDigest)} actual=${inventory.digest}`,
        });
      }
      const { contractDigest, ...classificationDigestInput } =
        classificationDocument;
      const expectedClassificationDigest = sha256(
        `${JSON.stringify(classificationDigestInput)}\n`,
      );
      if (contractDigest !== expectedClassificationDigest) {
        diagnostics.push({
          code: "classification_contract_digest_mismatch",
          message: `declared=${String(contractDigest)} actual=${expectedClassificationDigest}`,
        });
      }
      const sourceDigests = classificationDocument.sourceDigests;
      if (
        sourceDigests === undefined ||
        sourceDigests === null ||
        Array.isArray(sourceDigests) ||
        typeof sourceDigests !== "object" ||
        Object.keys(sourceDigests).length === 0
      ) {
        diagnostics.push({
          code: "classification_contract_invalid",
          message: "classification sourceDigests are missing or invalid",
        });
      } else {
        for (const [sourcePath, declaredDigest] of Object.entries(
          sourceDigests,
        )) {
          const actualDigest = digestProjectSource(sourcePath);
          if (
            actualDigest === null ||
            typeof declaredDigest !== "string" ||
            declaredDigest !== actualDigest
          ) {
            diagnostics.push({
              code: "classification_source_digest_mismatch",
              rowId: sourcePath,
              message: `declared=${String(declaredDigest)} actual=${String(actualDigest)}`,
            });
          }
        }
      }
      const acceptedRuntimeRefs =
        options.runtimeSurfaceRefs === undefined
          ? null
          : new Set(options.runtimeSurfaceRefs);
      if (acceptedRuntimeRefs === null) {
        diagnostics.push({
          code: "classification_runtime_inventory_missing",
          message:
            "classified validation requires the frozen runtime surface namespace",
        });
      }
      const inventoryIds = inventory.rows.map((row) => row.id);
      const classifiedIds = Object.keys(classificationRows).sort();
      const missing = inventoryIds.filter(
        (id) => classificationRows[id] === undefined,
      );
      const extra = classifiedIds.filter((id) => !inventoryIds.includes(id));
      for (const id of missing) {
        diagnostics.push({
          code: "classification_missing",
          rowId: id,
          message: "row is unclassified",
        });
      }
      for (const id of extra) {
        diagnostics.push({
          code: "classification_extra",
          rowId: id,
          message: "unknown registration row",
        });
      }
      for (const row of inventory.rows) {
        const metadata = classificationRows[row.id];
        if (metadata === undefined) continue;
        const validClassification =
          metadata.classification === "protected" ||
          metadata.classification === "public_exemption" ||
          metadata.classification === "narrow_system_exemption" ||
          metadata.classification === "dev_only";
        const requiredStrings = [
          metadata.binding,
          metadata.adapterMode,
          metadata.policyReference,
          metadata.ownerLeaf,
          metadata.ownedFile,
          metadata.rollbackUnit,
        ];
        const structural =
          metadata.handlerContract !== null &&
          typeof metadata.handlerContract === "object" &&
          typeof metadata.handlerContract.location === "string" &&
          typeof metadata.handlerContract.closureClass === "string" &&
          Array.isArray(metadata.handlerContract.capabilities);
        const arrays =
          Array.isArray(metadata.runtimeRefs) &&
          Array.isArray(metadata.edgeRefs) &&
          Array.isArray(metadata.testCases) &&
          Array.isArray(metadata.unresolvedReasons) &&
          Array.isArray(metadata.migrationObligations);
        const baselineMatches =
          metadata.baselineDigests?.declarationSha256 ===
            row.declarationSha256 &&
          metadata.baselineDigests?.initializerSha256 ===
            row.initializerSha256 &&
          metadata.baselineDigests?.registrarSymbolId ===
            row.registrarSymbolId &&
          metadata.baselineDigests?.symbolId === row.symbolId;
        if (
          !validClassification ||
          requiredStrings.some(
            (value) => typeof value !== "string" || value.length === 0,
          ) ||
          !structural ||
          !arrays ||
          !baselineMatches ||
          metadata.ownedFile !== row.file
        ) {
          diagnostics.push({
            code: "classification_row_invalid",
            rowId: row.id,
            message: "classification metadata is incomplete or inconsistent",
          });
          continue;
        }
        if (metadata.unresolvedReasons.length > 0) {
          diagnostics.push({
            code: "classification_unresolved",
            rowId: row.id,
            message: metadata.unresolvedReasons.join("; "),
          });
        }
        const dormantInternal =
          row.visibility === "internal" &&
          metadata.binding === "workload_account" &&
          metadata.adapterMode === "protected_workload_account" &&
          metadata.runtimeRefReason ===
            "no accepted production ancestor; registration must fail closed until a server-derived workload snapshot is supplied and is driven directly by its planned actual-registration test";
        if (
          metadata.runtimeRefs.length === 0 &&
          metadata.classification !== "dev_only" &&
          !dormantInternal
        ) {
          diagnostics.push({
            code: "missing_runtime_row",
            rowId: row.id,
            message: "non-dev registration has no reviewed runtime join",
          });
        }
        if (acceptedRuntimeRefs !== null) {
          for (const runtimeRef of metadata.runtimeRefs) {
            if (
              typeof runtimeRef !== "string" ||
              !acceptedRuntimeRefs.has(runtimeRef)
            ) {
              diagnostics.push({
                code: "classification_runtime_ref_unknown",
                rowId: row.id,
                message: `runtime ref is absent from the frozen namespace: ${String(runtimeRef)}`,
              });
            }
          }
        }
        if (metadata.testCases.length === 0) {
          diagnostics.push({
            code: "classification_test_missing",
            rowId: row.id,
            message: "registration has no actual-handler or planned test case",
          });
        }
      }
    }
  }
  return { ok: diagnostics.length === 0, diagnostics, counts: recomputed };
}

export function buildConvexRegistrationMigrationContract(
  inventory,
  classifications,
) {
  const rows = inventory.rows.map((row) => ({
    ...row,
    ...classifications.rows[row.id],
  }));
  const classified = rows.filter(
    (row) =>
      Array.isArray(row.unresolvedReasons) &&
      row.unresolvedReasons.length === 0,
  ).length;
  const migrationObligationRows = rows.filter(
    (row) =>
      Array.isArray(row.migrationObligations) &&
      row.migrationObligations.length > 0,
  ).length;
  const migrationObligationReasons = rows.reduce(
    (total, row) => total + (row.migrationObligations?.length ?? 0),
    0,
  );
  const contract = {
    format: "phase-2-convex-registration-migration:v1",
    analysisScope: inventory.analysisScope,
    inventoryDigest: inventory.digest,
    classificationInventoryDigest: classifications.inventoryDigest,
    sourceDigests: classifications.sourceDigests,
    counts: {
      ...inventory.counts,
      classified,
      classificationUnresolved: rows.length - classified,
      migrationObligationRows,
      migrationObligationReasons,
    },
    unresolved: inventory.unresolved,
    duplicates: inventory.duplicates,
    rows,
  };
  return { ...contract, digest: sha256(`${JSON.stringify(contract)}\n`) };
}

function argumentValue(argv, flag, fallback) {
  const index = argv.indexOf(flag);
  if (index === -1) return fallback;
  const value = argv[index + 1];
  if (value === undefined || value.startsWith("--"))
    throw new Error(`${flag}_value_missing`);
  return resolve(TOOL_ROOT, value);
}

function cli() {
  const argv = process.argv.slice(2);
  const inventory = collectConvexRegistrationInventory();
  const requireClassified = argv.includes("--require-classified");
  const classificationPath = argumentValue(
    argv,
    "--classifications",
    DEFAULT_CLASSIFICATIONS,
  );
  const classifications =
    requireClassified || argv.includes("--write")
      ? JSON.parse(readFileSync(classificationPath, "utf8"))
      : undefined;
  const runtimeInventory = requireClassified
    ? JSON.parse(
        readFileSync(
          argumentValue(
            argv,
            "--runtime-inventory",
            DEFAULT_RUNTIME_INVENTORY,
          ),
          "utf8",
        ),
      )
    : undefined;
  const validation = validateConvexRegistrationInventory(inventory, {
    requireClassified,
    classifications,
    runtimeSurfaceRefs:
      runtimeInventory === undefined
        ? undefined
        : runtimeSurfaceRefs(runtimeInventory),
  });
  let contract;
  if (classifications !== undefined) {
    contract = buildConvexRegistrationMigrationContract(
      inventory,
      classifications,
    );
    if (argv.includes("--write")) {
      const output = argumentValue(argv, "--output", DEFAULT_OUTPUT);
      writeFileSync(output, `${JSON.stringify(contract, null, 2)}\n`);
    }
    if (argv.includes("--check")) {
      const output = argumentValue(argv, "--output", DEFAULT_OUTPUT);
      const expected = JSON.parse(readFileSync(output, "utf8"));
      if (JSON.stringify(expected) !== JSON.stringify(contract)) {
        validation.diagnostics.push({
          code: "migration_contract_drift",
          message:
            "generated migration contract differs from committed contract",
        });
      }
    }
  }
  const classified = contract?.counts.classified ?? 0;
  const summary = [
    `registrations=${inventory.rows.length}`,
    `files=${inventory.counts.files}`,
    `public=${inventory.counts.public}`,
    `internal=${inventory.counts.internal}`,
    `http=${inventory.counts.http}`,
    `ordinary=${inventory.counts.ordinary}`,
    `generic=${inventory.counts.generic}`,
    `classified=${classified}`,
    `unresolved=${
      inventory.counts.unresolved +
      validation.diagnostics.filter(
        (row) =>
          row.code === "classification_unresolved" ||
          row.code === "classification_missing" ||
          row.code === "missing_runtime_row",
      ).length
    }`,
    `duplicate=${inventory.counts.duplicate}`,
  ].join(" ");
  process.stdout.write(`${summary}\n`);
  if (!validation.ok || validation.diagnostics.length > 0) {
    process.stderr.write(
      `${JSON.stringify(validation.diagnostics, null, 2)}\n`,
    );
    process.exitCode = 1;
  }
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) cli();
