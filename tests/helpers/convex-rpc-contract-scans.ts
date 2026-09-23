import { readFileSync } from 'node:fs'
import { relative, resolve } from 'node:path'

import ts from 'typescript'

import { findFiles } from '@/lib/ui/contract-scans'

export type ConvexFunctionKind = 'query' | 'mutation' | 'action'
export type ConvexFunctionVisibility = 'public' | 'internal'

export type ConvexApiTriple = Readonly<{
  visibility: ConvexFunctionVisibility
  module: string
  method: string
  kind: ConvexFunctionKind
}>

export type ConvexApiTripleKey = `${ConvexFunctionVisibility}:${string}:${string}:${ConvexFunctionKind}`

export function convexApiTripleKey(triple: ConvexApiTriple): ConvexApiTripleKey {
  return `${triple.visibility}:${triple.module}:${triple.method}:${triple.kind}`
}

const REGISTRATION_KIND: Record<string, { kind: ConvexFunctionKind; visibility: ConvexFunctionVisibility }> = {
  query: { kind: 'query', visibility: 'public' },
  mutation: { kind: 'mutation', visibility: 'public' },
  action: { kind: 'action', visibility: 'public' },
  internalQuery: { kind: 'query', visibility: 'internal' },
  internalMutation: { kind: 'mutation', visibility: 'internal' },
  internalAction: { kind: 'action', visibility: 'internal' },
}

const STRING_REFERENCE_HELPERS = new Set([
  'makeFunctionReference',
  'sourceQuery',
  'sourceMutation',
  'sourceAction',
])

const HELPER_EXPECTED: Record<string, { kind: ConvexFunctionKind; visibility: ConvexFunctionVisibility }> = {
  sourceQuery: { kind: 'query', visibility: 'public' },
  sourceMutation: { kind: 'mutation', visibility: 'public' },
  sourceAction: { kind: 'action', visibility: 'public' },
}

/** Negative-test literals that intentionally do not exist on the generated API. */
export const FICTIONAL_STRING_REFERENCE_ALLOWLIST = new Set<string>([
  'undeclared:mutation',
  'test:must-not-run',
  'test:mutation',
  'test:query',
])

function sourceFile(path: string): ts.SourceFile {
  return ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true, scriptKindFor(path))
}

function scriptKindFor(path: string): ts.ScriptKind {
  if (path.endsWith('.tsx')) return ts.ScriptKind.TSX
  if (path.endsWith('.jsx')) return ts.ScriptKind.JSX
  return ts.ScriptKind.TS
}

function convexModuleIdFromPath(filePath: string): string {
  const rel = relative(resolve('convex'), resolve(filePath)).replace(/\.tsx?$/u, '')
  return rel.split(/[/\\]/u).join('/')
}

function isConvexApiSourceFile(filePath: string): boolean {
  const normalized = filePath.replace(/\\/gu, '/')
  if (!normalized.startsWith('convex/')) return false
  if (normalized.includes('/_generated/')) return false
  if (normalized.endsWith('.test.ts')) return false
  return normalized.endsWith('.ts')
}

export function scanConvexApiSurfaceFromSources(): readonly ConvexApiTriple[] {
  const files = findFiles([{ root: 'convex', includeExtensions: ['.ts'] }]).filter(isConvexApiSourceFile)
  const triples: ConvexApiTriple[] = []

  for (const file of files) {
    const moduleId = convexModuleIdFromPath(file)
    visitConvexRegistrations(sourceFile(file), moduleId, triples)
  }

  return sortTriples(dedupeTriples(triples))
}

function visitConvexRegistrations(
  file: ts.SourceFile,
  moduleId: string,
  triples: ConvexApiTriple[],
): void {
  const visit = (node: ts.Node): void => {
    if (ts.isVariableStatement(node)) {
      for (const declaration of node.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name) || declaration.initializer === undefined) continue
        const registration = registrationFromInitializer(declaration.initializer)
        if (registration === undefined) continue
        triples.push({
          visibility: registration.visibility,
          module: moduleId,
          method: declaration.name.text,
          kind: registration.kind,
        })
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(file)
}

function registrationFromInitializer(
  initializer: ts.Expression,
): { kind: ConvexFunctionKind; visibility: ConvexFunctionVisibility } | undefined {
  if (!ts.isCallExpression(initializer)) return undefined
  const callee = initializer.expression
  if (!ts.isIdentifier(callee)) return undefined
  if (/^httpAction(?:Generic)?$/u.test(callee.text)) return undefined
  const normalized = callee.text.replace(/Generic$/u, '')
  const mapped = REGISTRATION_KIND[normalized]
  return mapped === undefined ? undefined : mapped
}

function dedupeTriples(triples: readonly ConvexApiTriple[]): ConvexApiTriple[] {
  const seen = new Map<ConvexApiTripleKey, ConvexApiTriple>()
  for (const triple of triples) {
    seen.set(convexApiTripleKey(triple), triple)
  }
  return [...seen.values()]
}

export function sortTriples(triples: readonly ConvexApiTriple[]): ConvexApiTriple[] {
  return [...triples].sort((left, right) => {
    const moduleCompare = left.module.localeCompare(right.module)
    if (moduleCompare !== 0) return moduleCompare
    const methodCompare = left.method.localeCompare(right.method)
    if (methodCompare !== 0) return methodCompare
    const visibilityCompare = left.visibility.localeCompare(right.visibility)
    if (visibilityCompare !== 0) return visibilityCompare
    return left.kind.localeCompare(right.kind)
  })
}

export function parseFullApiModuleIdsFromGeneratedApi(): readonly string[] {
  const apiPath = resolve('convex/_generated/api.d.ts')
  const source = readFileSync(apiPath, 'utf8')
  const blockStart = source.indexOf('declare const fullApi: ApiFromModules<{')
  if (blockStart === -1) throw new Error('Could not locate fullApi block in convex/_generated/api.d.ts')
  const blockBodyStart = source.indexOf('{', blockStart) + 1
  const blockBodyEnd = source.indexOf('}>;', blockBodyStart)
  if (blockBodyEnd === -1) throw new Error('Could not close fullApi block in convex/_generated/api.d.ts')
  const body = source.slice(blockBodyStart, blockBodyEnd)
  const moduleIds: string[] = []
  const linePattern = /^\s*(?:"([^"]+)"|([A-Za-z0-9_]+))\s*:/gmu
  for (const line of body.split('\n')) {
    const match = linePattern.exec(line)
    linePattern.lastIndex = 0
    if (match === null) continue
    const moduleId = match[1] ?? match[2]
    if (moduleId !== undefined) moduleIds.push(moduleId)
  }
  return moduleIds.sort()
}

export function scannedModulesMissingFromGeneratedApi(
  triples: readonly ConvexApiTriple[],
): readonly string[] {
  const generatedModules = new Set(parseFullApiModuleIdsFromGeneratedApi())
  const scannedModules = new Set(triples.map((triple) => triple.module))
  return [...scannedModules]
    .filter((moduleId) => !generatedModules.has(moduleId))
    .sort()
}

export type StringConvexReference = Readonly<{
  file: string
  line: number
  helper: string
  literal: string
  module: string
  method: string
  expectedKind: ConvexFunctionKind
  expectedVisibility: ConvexFunctionVisibility | 'unspecified'
}>

export type UnresolvedStringReference = Readonly<{
  file: string
  line: number
  helper: string
  reason: string
  excerpt: string
}>

export type StringReferenceScanResult = Readonly<{
  references: readonly StringConvexReference[]
  unresolved: readonly UnresolvedStringReference[]
}>

const STRING_REFERENCE_SCAN_ROOTS = [
  { root: 'src', includeExtensions: ['.ts', '.tsx'] as const },
  { root: 'convex', includeExtensions: ['.ts'] as const },
  { root: 'tests', includeExtensions: ['.ts', '.tsx'] as const },
] as const

export function scanStringConvexReferences(): StringReferenceScanResult {
  const files = findFiles([...STRING_REFERENCE_SCAN_ROOTS])
  const references: StringConvexReference[] = []
  const unresolved: UnresolvedStringReference[] = []

  for (const file of files) {
    if (file.replace(/\\/gu, '/').includes('/tests/helpers/convex-rpc-contract-scans.ts')) continue
    scanStringReferencesInFile(sourceFile(file), file, references, unresolved)
  }

  return {
    references: references.sort((left, right) => {
      const fileCompare = left.file.localeCompare(right.file)
      if (fileCompare !== 0) return fileCompare
      return left.line - right.line
    }),
    unresolved: unresolved.sort((left, right) => {
      const fileCompare = left.file.localeCompare(right.file)
      if (fileCompare !== 0) return fileCompare
      return left.line - right.line
    }),
  }
}

function scanStringReferencesInFile(
  file: ts.SourceFile,
  filePath: string,
  references: StringConvexReference[],
  unresolved: UnresolvedStringReference[],
): void {
  const skipHelperBodies = filePath.replace(/\\/gu, '/').endsWith('src/lib/server/convex-source.ts')
  const moduleStringConstants = collectModuleStringConstants(file)

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const helperName = callHelperName(node.expression)
      if (helperName !== undefined && STRING_REFERENCE_HELPERS.has(helperName)) {
        if (skipHelperBodies && isHelperFactoryDefinition(node)) {
          ts.forEachChild(node, visit)
          return
        }
        const literal = resolveStringLikeExpression(node.arguments[0], moduleStringConstants)
        if (literal === undefined) {
          unresolved.push({
            file: filePath,
            line: lineOf(file, node),
            helper: helperName,
            reason: 'no resolvable string first argument',
            excerpt: node.getText(file).slice(0, 120),
          })
        } else {
          const parsed = parseModuleMethodLiteral(literal)
          if (parsed === undefined) {
            unresolved.push({
              file: filePath,
              line: lineOf(file, node),
              helper: helperName,
              reason: `unrecognized module/method literal "${literal}"`,
              excerpt: literal,
            })
          } else {
            const expectation = expectedReferenceShape(helperName, node)
            if (expectation === undefined) {
              unresolved.push({
                file: filePath,
                line: lineOf(file, node),
                helper: helperName,
                reason: 'makeFunctionReference missing query|mutation|action type argument',
                excerpt: node.getText(file).slice(0, 120),
              })
            } else {
              references.push({
                file: filePath,
                line: lineOf(file, node),
                helper: helperName,
                literal,
                module: parsed.module,
                method: parsed.method,
                expectedKind: expectation.kind,
                expectedVisibility: expectation.visibility,
              })
            }
          }
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(file)
}

function isHelperFactoryDefinition(node: ts.CallExpression): boolean {
  let current: ts.Node = node
  while (current.parent !== undefined) {
    if (ts.isFunctionDeclaration(current) && current.name !== undefined && ts.isIdentifier(current.name)) {
      if (STRING_REFERENCE_HELPERS.has(current.name.text)) return true
    }
    if (ts.isArrowFunction(current)) {
      const parent = current.parent
      if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) {
        if (STRING_REFERENCE_HELPERS.has(parent.name.text)) return true
      }
    }
    current = current.parent
  }
  return false
}

function callHelperName(expression: ts.LeftHandSideExpression): string | undefined {
  if (ts.isIdentifier(expression)) return expression.text
  return undefined
}

function collectModuleStringConstants(file: ts.SourceFile): ReadonlyMap<string, string> {
  const constants = new Map<string, string>()
  for (const statement of file.statements) {
    if (!ts.isVariableStatement(statement)) continue
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || declaration.initializer === undefined) continue
      const value = readStringLiteralValue(declaration.initializer)
      if (value !== undefined) constants.set(declaration.name.text, value)
    }
  }
  return constants
}

function resolveStringLikeExpression(
  expression: ts.Expression | undefined,
  constants: ReadonlyMap<string, string>,
): string | undefined {
  if (expression === undefined) return undefined
  const direct = readStringLiteralValue(expression)
  if (direct !== undefined) return direct
  if (ts.isIdentifier(expression)) return constants.get(expression.text)
  return undefined
}

function readStringLiteralValue(expression: ts.Expression): string | undefined {
  if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) {
    return expression.text
  }
  return undefined
}

function parseModuleMethodLiteral(literal: string): { module: string; method: string } | undefined {
  const colon = literal.indexOf(':')
  if (colon > 0) {
    return { module: literal.slice(0, colon), method: literal.slice(colon + 1) }
  }
  const dot = literal.indexOf('.')
  if (dot > 0) {
    return { module: literal.slice(0, dot), method: literal.slice(dot + 1) }
  }
  return undefined
}

function expectedReferenceShape(
  helper: string,
  node: ts.CallExpression,
): { kind: ConvexFunctionKind; visibility: ConvexFunctionVisibility | 'unspecified' } | undefined {
  const helperDefault = HELPER_EXPECTED[helper]
  if (helperDefault !== undefined) return helperDefault

  const kind = readTypeLiteralArgument(node, 0, ['query', 'mutation', 'action'] as const)
  if (kind === undefined) return undefined
  const visibility = readTypeLiteralArgument(node, 3, ['public', 'internal'] as const) ?? 'unspecified'
  return { kind, visibility }
}

function readTypeLiteralArgument<const Allowed extends readonly string[]>(
  node: ts.CallExpression,
  index: number,
  allowed: Allowed,
): Allowed[number] | undefined {
  const typeArguments = node.typeArguments
  if (typeArguments === undefined || typeArguments.length <= index) return undefined
  const typeNode = typeArguments.at(index)
  if (typeNode === undefined || !ts.isLiteralTypeNode(typeNode) || !ts.isStringLiteral(typeNode.literal)) {
    return undefined
  }
  const text = typeNode.literal.text
  return (allowed as readonly string[]).includes(text) ? (text as Allowed[number]) : undefined
}

function lineOf(file: ts.SourceFile, node: ts.Node): number {
  return file.getLineAndCharacterOfPosition(node.getStart(file, false)).line + 1
}

export type StringReferenceViolation = Readonly<{
  file: string
  line: number
  literal: string
  message: string
}>

export function validateStringReferencesAgainstSurface(
  surface: readonly ConvexApiTriple[],
  scan: StringReferenceScanResult,
): Readonly<{
  violations: readonly StringReferenceViolation[]
  skippedOutsideGeneratedApi: readonly StringConvexReference[]
  skippedFictional: readonly StringConvexReference[]
}> {
  const byModuleMethod = new Map<string, ConvexApiTriple[]>()
  for (const triple of surface) {
    const key = `${triple.module}:${triple.method}`
    const bucket = byModuleMethod.get(key) ?? []
    bucket.push(triple)
    byModuleMethod.set(key, bucket)
  }

  const violations: StringReferenceViolation[] = []
  const skippedOutsideGeneratedApi: StringConvexReference[] = []
  const skippedFictional: StringConvexReference[] = []

  for (const reference of scan.references) {
    if (FICTIONAL_STRING_REFERENCE_ALLOWLIST.has(reference.literal)) {
      skippedFictional.push(reference)
      continue
    }

    const matches = byModuleMethod.get(`${reference.module}:${reference.method}`)
    if (matches === undefined || matches.length === 0) {
      skippedOutsideGeneratedApi.push(reference)
      continue
    }

    const kindMatches = matches.filter((triple) => triple.kind === reference.expectedKind)
    if (kindMatches.length === 0) {
      const actual = matches.map((triple) => `${triple.visibility}:${triple.kind}`).join(', ')
      violations.push({
        file: reference.file,
        line: reference.line,
        literal: reference.literal,
        message: `${reference.helper} expects kind "${reference.expectedKind}" but surface has [${actual}]`,
      })
      continue
    }

    if (reference.expectedVisibility !== 'unspecified') {
      const visibilityMatches = kindMatches.filter((triple) => triple.visibility === reference.expectedVisibility)
      if (visibilityMatches.length === 0) {
        const actual = kindMatches.map((triple) => triple.visibility).join(', ')
        violations.push({
          file: reference.file,
          line: reference.line,
          literal: reference.literal,
          message: `${reference.helper} expects visibility "${reference.expectedVisibility}" but surface has [${actual}]`,
        })
      }
    } else if (reference.helper === 'makeFunctionReference') {
      const publicMatches = kindMatches.filter((triple) => triple.visibility === 'public')
      if (publicMatches.length === 0 && kindMatches.every((triple) => triple.visibility === 'internal')) {
        // Internal-only targets are valid for makeFunctionReference without an explicit visibility type.
        continue
      }
      if (publicMatches.length === 0) {
        violations.push({
          file: reference.file,
          line: reference.line,
          literal: reference.literal,
          message: `makeFunctionReference kind "${reference.expectedKind}" does not match any public surface entry`,
        })
      }
    }
  }

  return { violations, skippedOutsideGeneratedApi, skippedFictional }
}

export function formatTripleDiff(
  expected: readonly ConvexApiTriple[],
  actual: readonly ConvexApiTriple[],
): string {
  const expectedKeys = new Set(expected.map(convexApiTripleKey))
  const actualKeys = new Set(actual.map(convexApiTripleKey))

  const added = actual.filter((triple) => !expectedKeys.has(convexApiTripleKey(triple)))
  const removed = expected.filter((triple) => !actualKeys.has(convexApiTripleKey(triple)))

  const changed: string[] = []
  for (const triple of actual) {
    const conflicting = expected.filter(
      (candidate) =>
        candidate.module === triple.module &&
        candidate.method === triple.method &&
        convexApiTripleKey(candidate) !== convexApiTripleKey(triple),
    )
    for (const prior of conflicting) {
      if (!actualKeys.has(convexApiTripleKey(prior)) && !changed.includes(`${convexApiTripleKey(prior)} -> ${convexApiTripleKey(triple)}`)) {
        changed.push(`${convexApiTripleKey(prior)} -> ${convexApiTripleKey(triple)}`)
      }
    }
  }

  const lines: string[] = []
  if (added.length > 0) {
    lines.push('Added triples:')
    for (const triple of sortTriples(added)) lines.push(`  + ${convexApiTripleKey(triple)}`)
  }
  if (removed.length > 0) {
    lines.push('Removed triples:')
    for (const triple of sortTriples(removed)) lines.push(`  - ${convexApiTripleKey(triple)}`)
  }
  if (changed.length > 0) {
    lines.push('Changed triples (same module.method, different kind or visibility):')
    for (const entry of changed.sort()) lines.push(`  ~ ${entry}`)
  }
  return lines.join('\n')
}
