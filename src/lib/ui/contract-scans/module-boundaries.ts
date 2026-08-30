import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import ts from 'typescript'

import type {
  ModuleBoundaryManifest,
  ModuleName,
  RuntimeBoundaryException,
  RuntimeImporter,
} from '@/modules/module-boundaries'
import { findFiles, type ScanViolation } from './file-discovery'

export type ModuleBoundaryScanOptions = Readonly<{
  manifest: ModuleBoundaryManifest
  moduleRoot?: string
  sourceFiles?: readonly string[]
}>

export type ModuleImportObservation = Readonly<{
  from: ModuleName
  to: ModuleName
  importer: string
  entry: string
  allowed: boolean
  exceptionId?: string
}>

export type ModuleBoundaryScanResult = Readonly<{
  violations: readonly ScanViolation[]
  moduleCount: number
  importCount: number
  crossModuleImportCount: number
  allowedEdgeCount: number
  exceptionCount: number
  cycles: readonly (readonly ModuleName[])[]
  usedRuntimeExceptionIds: readonly string[]
  observedCrossModuleImports: readonly ModuleImportObservation[]
}>

export type TestBoundaryScanResult = Readonly<{
  violations: readonly ScanViolation[]
  whiteBoxImportCount: number
  usedTestExceptionIds: readonly string[]
  requiredWhiteBoxImports: readonly Readonly<{ importer: string; to: ModuleName; entry: string }>[]
}>

export type RuntimeConsumerScanResult = Readonly<{
  violations: readonly ScanViolation[]
  consumerImportCount: number
  usedRuntimeExceptionIds: readonly string[]
  requiredConsumerExceptions: readonly Readonly<{
    from: 'adapter' | 'convex'
    importer: string
    to: ModuleName
    entry: string
  }>[]
}>

type Compiler = Readonly<{
  options: ts.CompilerOptions
  host: ts.CompilerHost
}>

type ModuleScanState = {
  importCount: number
  crossModuleImportCount: number
  declarations: ReadonlyMap<ModuleName, ModuleBoundaryManifest['modules'][number]>
  usedRuntimeExceptionIds: Set<string>
  observedCrossModuleImports: Map<string, ModuleImportObservation>
  violations: ScanViolation[]
}

function compiler(): Compiler {
  const configPath = ts.findConfigFile(process.cwd(), ts.sys.fileExists, 'tsconfig.json')
  if (configPath === undefined) throw new Error('tsconfig.json not found')
  const config = ts.readConfigFile(configPath, ts.sys.readFile)
  if (config.error !== undefined) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'))
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, dirname(configPath))
  return { options: parsed.options, host: ts.createCompilerHost(parsed.options, true) }
}

function sourceFile(path: string): ts.SourceFile {
  return ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true, scriptKindFor(path))
}

function resolvedImport(
  imported: string,
  importer: string,
  config: Compiler,
): string | undefined {
  const resolved = ts.resolveModuleName(imported, importer, config.options, config.host).resolvedModule
  return resolved === undefined ? undefined : normalizeResolvedTypeScriptFile(resolved.resolvedFileName)
}

export function scanModuleBoundaries(options: ModuleBoundaryScanOptions): ModuleBoundaryScanResult {
  const moduleRoot = resolve(options.moduleRoot ?? 'src/modules')
  const sourceFiles = (options.sourceFiles ?? findFiles([
    { root: moduleRoot, includeExtensions: ['.ts', '.tsx'] },
  ])).map((file) => resolve(file))
  const config = compiler()
  const state: ModuleScanState = {
    importCount: 0,
    crossModuleImportCount: 0,
    declarations: new Map(options.manifest.modules.map((declaration) => [declaration.name, declaration])),
    usedRuntimeExceptionIds: new Set<string>(),
    observedCrossModuleImports: new Map<string, ModuleImportObservation>(),
    violations: [...validateModuleBoundaryManifest(options.manifest, moduleRoot)],
  }

  for (const importer of sourceFiles) scanSourceFileImports(importer, moduleRoot, config, options.manifest, state)

  for (const exception of options.manifest.temporaryRuntimeExceptions.filter(({ from }) => from !== 'adapter' && from !== 'convex')) {
    if (state.usedRuntimeExceptionIds.has(exception.id)) continue
    state.violations.push(moduleViolation(
      join(moduleRoot, exception.from, exception.importer),
      1,
      'module-unused-exception',
      `Temporary exception ${exception.id} matches no current runtime import.`,
      `${exception.from}/${exception.importer} -> ${exception.to}/${exception.entry}`,
    ))
  }

  return {
    violations: state.violations,
    moduleCount: options.manifest.modules.length,
    importCount: state.importCount,
    crossModuleImportCount: state.crossModuleImportCount,
    allowedEdgeCount: options.manifest.modules.reduce((count, declaration) => count + declaration.allowedDependencies.length, 0),
    exceptionCount: options.manifest.temporaryRuntimeExceptions.length,
    cycles: declaredGraphCycles(options.manifest),
    usedRuntimeExceptionIds: [...state.usedRuntimeExceptionIds].sort(),
    observedCrossModuleImports: [...state.observedCrossModuleImports.values()],
  }
}

function scanSourceFileImports(
  importer: string,
  moduleRoot: string,
  config: Compiler,
  manifest: ModuleBoundaryManifest,
  state: ModuleScanState,
): void {
  const importerModule = moduleForFile(importer, moduleRoot)
  if (importerModule === undefined) return
  for (const imported of staticModuleSpecifiers(sourceFile(importer))) {
    state.importCount += 1
    const targetFile = resolvedImport(imported.specifier, importer, config)
    if (targetFile === undefined) continue
    const targetModule = moduleForFile(targetFile, moduleRoot)
    if (targetModule === undefined || targetModule === importerModule) continue
    state.crossModuleImportCount += 1
    const importerEntry = moduleEntry(moduleRoot, importerModule, importer)
    const targetEntry = moduleEntry(moduleRoot, targetModule, targetFile)
    const exception = matchingRuntimeException(manifest.temporaryRuntimeExceptions, importerModule, targetModule, importerEntry, targetEntry)
    const allowed = exception !== undefined || (
      state.declarations.get(importerModule)?.allowedDependencies.includes(targetModule) === true
      && state.declarations.get(targetModule)?.entrySurfaces.includes(targetEntry) === true
    )
    state.observedCrossModuleImports.set(`${importerModule}/${importerEntry}->${targetModule}/${targetEntry}`, {
      from: importerModule,
      to: targetModule,
      importer: importerEntry,
      entry: targetEntry,
      allowed,
      ...(exception === undefined ? {} : { exceptionId: exception.id }),
    })
    if (exception !== undefined) {
      state.usedRuntimeExceptionIds.add(exception.id)
      continue
    }
    const declaration = state.declarations.get(importerModule)
    const targetDeclaration = state.declarations.get(targetModule)
    if (declaration === undefined || targetDeclaration === undefined) continue
    if (!targetDeclaration.entrySurfaces.includes(targetEntry)) state.violations.push(moduleViolation(importer, imported.line, 'module-undeclared-entry', `Module ${importerModule} imports undeclared ${targetModule} entry ${targetEntry}.`, imported.specifier))
    if (declaration.allowedDependencies.includes(targetModule)) continue
    const testOnly = manifest.testOnlyWhiteBoxExceptions.some((candidate) => candidate.to === targetModule && candidate.entry === targetEntry)
    state.violations.push(moduleViolation(
      importer,
      imported.line,
      testOnly ? 'module-test-exception-at-runtime' : 'module-forbidden-edge',
      testOnly
        ? `Runtime module ${importerModule} cannot use test-only ${targetModule}/${targetEntry}.`
        : `Target graph forbids ${importerModule} -> ${targetModule}.`,
      imported.specifier,
    ))
  }
}

export function validateModuleBoundaryManifest(
  manifest: ModuleBoundaryManifest,
  moduleRoot = resolve('src/modules'),
): readonly ScanViolation[] {
  const moduleNames = manifest.modules.map(({ name }) => name)
  const declared = new Set(moduleNames)
  const actual = new Set(readdirSync(moduleRoot).filter((entry) => statSync(join(moduleRoot, entry)).isDirectory()))
  return [
    ...validateModuleDeclarations(manifest, moduleRoot, moduleNames, declared, actual),
    ...declaredGraphCycles(manifest).map((cycle) => manifestViolation('module-cycle', `Declared target graph cycle: ${cycle.join(' -> ')}.`)),
    ...validateExceptionIdentity(manifest),
    ...validateRuntimeExceptions(manifest, declared),
    ...validateTestExceptions(manifest, declared),
  ]
}

function validateModuleDeclarations(
  manifest: ModuleBoundaryManifest,
  moduleRoot: string,
  moduleNames: readonly ModuleName[],
  declared: ReadonlySet<ModuleName>,
  actual: ReadonlySet<string>,
): ScanViolation[] {
  const violations = duplicates(moduleNames).map((name) => manifestViolation('module-duplicate', `Duplicate module declaration: ${name}.`))
  for (const name of moduleNames) {
    if (!actual.has(name)) violations.push(manifestViolation('module-unknown', `Unknown module declaration: ${name}.`))
  }
  for (const name of actual) {
    if (!declared.has(name as ModuleName)) violations.push(manifestViolation('module-missing', `Top-level source module is not declared: ${name}.`))
  }
  for (const declaration of manifest.modules) {
    for (const duplicate of duplicates(declaration.entrySurfaces)) violations.push(manifestViolation('module-duplicate-entry', `Duplicate ${declaration.name} entry: ${duplicate}.`))
    for (const dependency of declaration.allowedDependencies) {
      if (!declared.has(dependency)) violations.push(manifestViolation('module-unknown-dependency', `${declaration.name} names unknown dependency ${dependency}.`))
    }
    for (const duplicate of duplicates(declaration.allowedDependencies)) violations.push(manifestViolation('module-duplicate-dependency', `Duplicate ${declaration.name} dependency: ${duplicate}.`))
    for (const entry of declaration.entrySurfaces) {
      if (!ts.sys.fileExists(join(moduleRoot, declaration.name, entry))) violations.push(manifestViolation('module-unknown-entry', `Declared ${declaration.name} entry does not exist: ${entry}.`))
    }
  }
  return violations
}

function validateExceptionIdentity(manifest: ModuleBoundaryManifest): ScanViolation[] {
  const ids = [
    ...manifest.temporaryRuntimeExceptions.map(({ id }) => id),
    ...manifest.testOnlyWhiteBoxExceptions.map(({ id }) => id),
  ]
  const scopes = manifest.temporaryRuntimeExceptions.map(({ from, to, importer, entry }) => `${from}:${importer}->${to}/${entry}`)
  return [
    ...duplicates(ids).map((id) => manifestViolation('module-duplicate-exception', `Duplicate boundary exception id: ${id}.`)),
    ...duplicates(scopes).map((scope) => manifestViolation('module-duplicate-exception-scope', `Multiple runtime exceptions own the same scope: ${scope}.`)),
  ]
}

function validateRuntimeExceptions(manifest: ModuleBoundaryManifest, declared: ReadonlySet<ModuleName>): ScanViolation[] {
  const violations: ScanViolation[] = []
  for (const exception of manifest.temporaryRuntimeExceptions) {
    if (exception.owner.trim() === '' || exception.removalTask.trim() === '') violations.push(manifestViolation('module-malformed-exception', `Runtime exception ${exception.id} requires an owner and removal task.`))
    if (!(['T3', 'T4', 'T5', 'T6', 'T7'] as const).includes(exception.removalTask)) violations.push(manifestViolation('module-malformed-exception', `Runtime exception ${exception.id} has invalid removal task ${exception.removalTask}.`))
    if (exception.removalTask === 'T3') violations.push(manifestViolation('module-expired-exception', `Runtime exception ${exception.id} expired in T3.`))
    if (!(declared.has(exception.from as ModuleName) || exception.from === 'adapter' || exception.from === 'convex') || !declared.has(exception.to)) violations.push(manifestViolation('module-malformed-exception', `Runtime exception ${exception.id} names an unknown module.`))
    if (exception.importer.trim() === '' || exception.entry.trim() === '' || /[*?]/u.test(exception.importer + exception.entry)) violations.push(manifestViolation('module-malformed-exception', `Runtime exception ${exception.id} must have exact importer and entry paths.`))
  }
  return violations
}

function validateTestExceptions(manifest: ModuleBoundaryManifest, declared: ReadonlySet<ModuleName>): ScanViolation[] {
  const scopes = manifest.testOnlyWhiteBoxExceptions.flatMap(({ importers, to, entry }) => importers.map((importer) => `${importer}->${to}/${entry}`))
  const violations = duplicates(scopes).map((scope) => manifestViolation('module-duplicate-test-exception-scope', `Multiple test exceptions own the same scope: ${scope}.`))
  for (const exception of manifest.testOnlyWhiteBoxExceptions) {
    if (exception.importers.length === 0 || duplicates(exception.importers).length > 0 || exception.importers.some((importer) => !importer.startsWith('tests/') || /[*?]/u.test(importer)) || exception.owner.trim() === '' || exception.entry.trim() === '' || /[*?]/u.test(exception.entry) || !declared.has(exception.to)) {
      violations.push(manifestViolation('module-malformed-test-exception', `Test exception ${exception.id} must name exact tests/ importers, owner, and entry.`))
    }
  }
  return violations
}

export function scanTestOnlyModuleBoundaries(
  manifest: ModuleBoundaryManifest,
  testFiles: readonly string[] = findFiles([{ root: 'tests', includeExtensions: ['.ts', '.tsx'] }]),
  moduleRoot = resolve('src/modules'),
): TestBoundaryScanResult {
  const config = compiler()
  const declarations = new Map(manifest.modules.map((declaration) => [declaration.name, declaration]))
  const usedTestExceptionIds = new Set<string>()
  const usedTestExceptionScopes = new Set<string>()
  const violations: ScanViolation[] = []
  const requiredWhiteBoxImports = new Map<string, Readonly<{ importer: string; to: ModuleName; entry: string }>>()
  let whiteBoxImportCount = 0

  for (const testFile of testFiles.map((file) => resolve(file))) {
    const importer = relative(process.cwd(), testFile).split(sep).join('/')
    for (const imported of staticModuleSpecifiers(sourceFile(testFile))) {
      const targetFile = resolvedImport(imported.specifier, testFile, config)
      if (targetFile === undefined) continue
      const targetModule = moduleForFile(targetFile, moduleRoot)
      if (targetModule === undefined) continue
      const entry = moduleEntry(moduleRoot, targetModule, targetFile)
      if (declarations.get(targetModule)?.entrySurfaces.includes(entry) === true) continue
      whiteBoxImportCount += 1
      requiredWhiteBoxImports.set(`${importer}->${targetModule}/${entry}`, { importer, to: targetModule, entry })
      const exception = manifest.testOnlyWhiteBoxExceptions.find((candidate) => candidate.importers.includes(importer) && candidate.to === targetModule && candidate.entry === entry)
      if (exception === undefined) {
        violations.push(moduleViolation(testFile, imported.line, 'module-unowned-test-import', `Test import requires an exact white-box exception for ${targetModule}/${entry}.`, imported.specifier))
      } else {
        usedTestExceptionIds.add(exception.id)
        usedTestExceptionScopes.add(`${importer}->${targetModule}/${entry}`)
      }
    }
  }
  for (const exception of manifest.testOnlyWhiteBoxExceptions) {
    for (const importer of exception.importers) {
      const scope = `${importer}->${exception.to}/${exception.entry}`
      if (!usedTestExceptionScopes.has(scope)) violations.push(moduleViolation(importer, 1, 'module-unused-test-exception', `Test exception ${exception.id} has an unused exact importer scope.`, `${exception.to}/${exception.entry}`))
    }
  }
  return {
    violations,
    whiteBoxImportCount,
    usedTestExceptionIds: [...usedTestExceptionIds].sort(),
    requiredWhiteBoxImports: [...requiredWhiteBoxImports.values()],
  }
}

export function scanRuntimeModuleConsumers(
  manifest: ModuleBoundaryManifest,
  sourceFiles: readonly string[] = [
    ...findFiles([{ root: 'src', includeExtensions: ['.ts', '.tsx'] }]),
    ...findFiles([{ root: 'convex', includeExtensions: ['.ts'] }]),
  ],
  moduleRoot = resolve('src/modules'),
): RuntimeConsumerScanResult {
  const config = compiler()
  const declarations = new Map(manifest.modules.map((declaration) => [declaration.name, declaration]))
  const usedRuntimeExceptionIds = new Set<string>()
  const requiredConsumerExceptions = new Map<string, Readonly<{ from: 'adapter' | 'convex'; importer: string; to: ModuleName; entry: string }>>()
  const violations: ScanViolation[] = []
  let consumerImportCount = 0

  for (const sourcePath of sourceFiles.map((file) => resolve(file))) {
    if (moduleForFile(sourcePath, moduleRoot) !== undefined) continue
    const from = sourcePath.startsWith(resolve('convex') + sep) ? 'convex' : 'adapter'
    const importer = relative(process.cwd(), sourcePath).split(sep).join('/')
    if (
      importer === 'src/lib/ui/contract-scans.ts'
      || importer.startsWith('src/lib/ui/contract-scans/')
      || importer === 'src/routeTree.gen.ts'
      || importer.startsWith('convex/_generated/')
    ) continue
    for (const imported of staticModuleSpecifiers(sourceFile(sourcePath))) {
      const targetFile = resolvedImport(imported.specifier, sourcePath, config)
      if (targetFile === undefined) continue
      const targetModule = moduleForFile(targetFile, moduleRoot)
      if (targetModule === undefined) continue
      consumerImportCount += 1
      const entry = moduleEntry(moduleRoot, targetModule, targetFile)
      if (declarations.get(targetModule)?.entrySurfaces.includes(entry) === true) continue
      const exception = matchingRuntimeException(manifest.temporaryRuntimeExceptions, from, targetModule, importer, entry)
      if (exception !== undefined) {
        usedRuntimeExceptionIds.add(exception.id)
        continue
      }
      requiredConsumerExceptions.set(`${from}:${importer}->${targetModule}/${entry}`, { from, importer, to: targetModule, entry })
      const testOnly = manifest.testOnlyWhiteBoxExceptions.some((candidate) => candidate.to === targetModule && candidate.entry === entry)
      violations.push(moduleViolation(sourcePath, imported.line, testOnly ? 'module-test-exception-at-runtime' : 'module-undeclared-consumer-entry', `${from} consumer imports undeclared ${targetModule} entry ${entry}.`, imported.specifier))
    }
  }
  for (const exception of manifest.temporaryRuntimeExceptions.filter(({ from }) => from === 'adapter' || from === 'convex')) {
    if (!usedRuntimeExceptionIds.has(exception.id)) violations.push(moduleViolation(exception.importer, 1, 'module-unused-exception', `Temporary consumer exception ${exception.id} matches no current runtime import.`, `${exception.from}:${exception.importer} -> ${exception.to}/${exception.entry}`))
  }
  return {
    violations,
    consumerImportCount,
    usedRuntimeExceptionIds: [...usedRuntimeExceptionIds].sort(),
    requiredConsumerExceptions: [...requiredConsumerExceptions.values()],
  }
}

export function declaredGraphCycles(manifest: ModuleBoundaryManifest): readonly (readonly ModuleName[])[] {
  const graph = new Map(manifest.modules.map(({ name, allowedDependencies }) => [name, allowedDependencies]))
  const visiting = new Set<ModuleName>()
  const visited = new Set<ModuleName>()
  const stack: ModuleName[] = []
  const cycles = new Map<string, readonly ModuleName[]>()
  const visit = (module: ModuleName): void => {
    if (visited.has(module)) return
    if (visiting.has(module)) {
      const cycle = [...stack.slice(stack.indexOf(module)), module]
      const body = cycle.slice(0, -1)
      const canonical = body.map((_, index) => [...body.slice(index), ...body.slice(0, index)].join(' -> ')).sort()[0]
      if (canonical !== undefined) cycles.set(canonical, cycle)
      return
    }
    visiting.add(module)
    stack.push(module)
    for (const dependency of graph.get(module) ?? []) visit(dependency)
    stack.pop()
    visiting.delete(module)
    visited.add(module)
  }
  for (const module of graph.keys()) visit(module)
  return [...cycles.values()]
}

function staticModuleSpecifiers(source: ts.SourceFile): readonly Readonly<{ specifier: string; line: number }>[] {
  const imports: Readonly<{ specifier: string; line: number }>[] = []
  const record = (literal: ts.StringLiteralLike): void => {
    imports.push({ specifier: literal.text, line: source.getLineAndCharacterOfPosition(literal.getStart(source)).line + 1 })
  }
  source.forEachChild((node) => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier !== undefined && ts.isStringLiteralLike(node.moduleSpecifier)) record(node.moduleSpecifier)
    else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference) && node.moduleReference.expression !== undefined && ts.isStringLiteralLike(node.moduleReference.expression)) record(node.moduleReference.expression)
  })
  return imports
}

function scriptKindFor(file: string): ts.ScriptKind {
  return file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
}

function normalizeResolvedTypeScriptFile(file: string): string {
  return resolve(file.replace(/\.d\.ts$/u, '.ts'))
}

function moduleForFile(file: string, moduleRoot: string): ModuleName | undefined {
  const path = relative(moduleRoot, file).split(sep).join('/')
  if (path.startsWith('../') || path === '..' || !path.includes('/')) return undefined
  const [module] = path.split('/')
  return module === undefined || module === '' ? undefined : module as ModuleName
}

function moduleEntry(moduleRoot: string, module: ModuleName, file: string): string {
  return relative(join(moduleRoot, module), file).split(sep).join('/')
}

function matchingRuntimeException(
  exceptions: readonly RuntimeBoundaryException[],
  from: RuntimeImporter,
  to: ModuleName,
  importer: string,
  entry: string,
): RuntimeBoundaryException | undefined {
  return exceptions.find((candidate) => candidate.from === from && candidate.to === to && candidate.importer === importer && candidate.entry === entry)
}

function duplicates(values: readonly string[]): readonly string[] {
  const seen = new Set<string>()
  const duplicate = new Set<string>()
  for (const value of values) {
    if (seen.has(value)) duplicate.add(value)
    seen.add(value)
  }
  return [...duplicate].sort()
}

function moduleViolation(file: string, line: number, rule: string, message: string, excerpt: string): ScanViolation {
  return { file: relative(process.cwd(), file).split(sep).join('/'), line, rule, message, excerpt }
}

function manifestViolation(rule: string, message: string): ScanViolation {
  return { file: 'src/modules/module-boundaries.ts', line: 1, rule, message, excerpt: message }
}
