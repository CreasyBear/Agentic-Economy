import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, normalize, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const entries = [
  'src/modules/comparison/comparison.functions.ts',
  'src/modules/comparison/comparison.actions.ts',
  'src/modules/comparison/public.ts',
  'src/routes/api.compare.ts',
  'src/routes/compare.tsx',
] as const

const supportedTerminals = new Set([
  absolute('src/lib/server/bounded-request-body.ts'),
  absolute('src/lib/server/convex-source.ts'),
  absolute('src/modules/catalog/public.ts'),
  absolute('src/modules/common/action.ts'),
  absolute('src/modules/harness/action-tool.ts'),
])

const forbiddenFamilies = [
  /\/modules\/inquiries\//u,
  /\/modules\/demand\//u,
  /\/modules\/customer-request\//u,
  /\/modules\/action-invocation\//u,
  /\/modules\/agent-identity\//u,
  /\/modules\/provider-integrations\//u,
  /\/modules\/(?:booking|payment|paid-operation)\//u,
  /\/routes\/(?:api\.)?(?:requests|inquiry|booking|payment)/u,
] as const

describe('comparison public entry graph', () => {
  it('keeps the fixed POST adapter on the exact action and validated read harness', () => {
    const imports = importedSpecifiers(
      readFileSync('src/routes/api.compare.ts', 'utf8'),
    ).filter((specifier) => specifier.startsWith('@/modules/'))

    expect(imports).toEqual([
      '@/modules/comparison/comparison.actions',
      '@/modules/harness/action-tool',
    ])
    expect(readFileSync('src/routes/api.compare.ts', 'utf8')).not.toMatch(
      /findAction|listActions|actionId|toolName|allowWrites:\s*true/u,
    )
  })

  it('recursively fences direct, aliased and transitive effect owners', () => {
    expect(graphViolations(entries)).toEqual([])
  })

  it('detects aliased and transitive hostile imports rather than relying on vocabulary grep', () => {
    expect(sourceViolations(
      'fixture.ts',
      "import { submitInquiry as harmlessRead } from '@/modules/inquiries/inquiry.functions'",
    )).toContain('fixture.ts:forbidden:@/modules/inquiries/inquiry.functions')

    expect(sourceViolations(
      'fixture.ts',
      "export { run } from '@/modules/action-invocation/public'",
    )).toContain('fixture.ts:forbidden:@/modules/action-invocation/public')
  })

  it('keeps the registered structured output strict and effect-continuation free', async () => {
    const { comparisonCompareAction } = await import(
      '@/modules/comparison/comparison.actions'
    )
    expect(comparisonCompareAction.invocationContract?.safeContinuations).toEqual([
      'view_offering',
      'remove_selection',
      'compare',
      'change_priorities',
    ])
    expect(comparisonCompareAction.outputSchema.safeParse({
      kind: 'comparison',
      schemaVersion: 'offering-comparison:v1',
      priorities: [],
      selections: [],
      rows: [],
      refusedSelectionCount: 0,
      ordering: { kind: 'unranked', reason: 'insufficient_selections' },
      sourceHash: 'private',
    }).success).toBe(false)
  })
})

function graphViolations(start: readonly string[]): readonly string[] {
  const violations: string[] = []
  const visited = new Set<string>()
  const visit = (path: string) => {
    const resolved = absolute(path)
    if (visited.has(resolved) || supportedTerminals.has(resolved)) return
    visited.add(resolved)
    const source = readFileSync(resolved, 'utf8')
    violations.push(...sourceViolations(path, source))
    for (const dependency of localImports(resolved, source)) {
      visit(dependency)
    }
  }
  start.forEach(visit)
  return violations
}

function sourceViolations(path: string, source: string): readonly string[] {
  return importedSpecifiers(source)
    .filter((specifier) => forbiddenFamilies.some((family) => family.test(
      specifier.startsWith('@/')
        ? absolute(specifier.replace('@/', 'src/'))
        : normalize(specifier),
    )))
    .map((specifier) => `${path}:forbidden:${specifier}`)
}

function localImports(path: string, source: string): readonly string[] {
  return importedSpecifiers(source)
    .map((specifier) => resolveSpecifier(path, specifier))
    .filter((candidate): candidate is string => candidate !== undefined)
}

function importedSpecifiers(source: string): readonly string[] {
  return [
    ...source.matchAll(
      /(?:from\s+|import\s*\(\s*)['"]([^'"]+)['"]/gu,
    ),
  ].map((match) => match[1]!)
}

function resolveSpecifier(importer: string, specifier: string): string | undefined {
  if (!specifier.startsWith('.') && !specifier.startsWith('@/')) return undefined
  const base = specifier.startsWith('@/')
    ? resolve(specifier.replace('@/', 'src/'))
    : resolve(dirname(importer), specifier)
  return [
    `${base}.ts`,
    `${base}.tsx`,
    `${base}/index.ts`,
    `${base}/public.ts`,
    base,
  ].find((candidate) => existsSync(candidate) && statSync(candidate).isFile())
}

function absolute(path: string): string {
  return normalize(resolve(path))
}
