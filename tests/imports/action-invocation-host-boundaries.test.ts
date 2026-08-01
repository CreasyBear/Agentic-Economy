import { existsSync, readFileSync } from 'node:fs'
import { globSync } from 'node:fs'
import { dirname, normalize, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const hostContractFiles = globSync('src/modules/action-invocation/hosts/**/*.ts').sort()
const productionSourceFiles = globSync([
  'src/**/*.ts',
  'src/**/*.tsx',
  'convex/**/*.ts',
]).sort()
const publicTerminals = new Set([
  normalize(resolve('src/modules/action-invocation/application-service.ts')),
  normalize(resolve('src/modules/action-invocation/contracts.ts')),
])

function hostBoundaryViolations(source: string): readonly string[] {
  const violations = []
  const imports = [...source.matchAll(/from\s+['"]([^'"]+)['"]/gu)].map((match) => match[1]!)
  if (imports.some((path) =>
    /\/internal\/|dynamic-published-adapter|route-transport|payment|credential/iu.test(path))) {
    violations.push('low_level_import_or_rule')
  }
  if (/\b(acquire|executeAcquired|reconcile|leaseOwner|effectGeneration)\s*\(/u.test(source)) {
    violations.push('low_level_command')
  }
  return violations
}

function localImports(path: string, source: string): readonly string[] {
  return [...source.matchAll(/from\s+['"](\.[^'"]+)['"]/gu)]
    .map((match) => {
      const base = resolve(dirname(path), match[1]!)
      return [base, `${base}.ts`, `${base}/index.ts`].find(existsSync)
    })
    .filter((candidate): candidate is string => candidate !== undefined)
    .map(normalize)
}

function graphViolations(entries: readonly string[]): readonly string[] {
  const violations: string[] = []
  const visited = new Set<string>()
  const visit = (path: string) => {
    const absolute = normalize(resolve(path))
    if (visited.has(absolute) || publicTerminals.has(absolute)) return
    visited.add(absolute)
    const source = readFileSync(absolute, 'utf8')
    violations.push(...hostBoundaryViolations(source).map((value) => `${path}:${value}`))
    for (const dependency of localImports(absolute, source)) visit(dependency)
  }
  entries.forEach(visit)
  return violations
}

describe('Action Invocation public host graph', () => {
  it('discovers every actual host entry', () => {
    expect(hostContractFiles).toEqual([])
  })

  it('recursively keeps the actual host graph above the public application boundary', () => {
    expect(graphViolations(hostContractFiles)).toEqual([])
  })

  it('detects an aliased violating host fixture', () => {
    const violating = `
      import type { DynamicPublishedActionInvocationAdapter as PublicLooking }
        from './dynamic-published-adapter'
      export const host = (adapter: PublicLooking) =>
        adapter.executeAcquired({ effectGeneration: 1 })
    `
    expect(hostBoundaryViolations(violating)).toContain('low_level_import_or_rule')
    expect(hostBoundaryViolations(violating)).toContain('low_level_command')
  })

  it('detects a future host entry that aliases a low-level lifecycle dependency', () => {
    expect(graphViolations([])).toEqual([])
    expect(hostBoundaryViolations(`
      import { createDynamicPublishedActionInvocationAdapter as application } from '../dynamic-published-adapter'
      export const host = application
    `)).toContain('low_level_import_or_rule')
  })

  it('keeps the development provider-operation fixture outside production graphs', () => {
    const violations = productionSourceFiles.filter((path) => {
      const source = readFileSync(path, 'utf8')
      return /provider-operation-fixture|tools\/dev\/fixtures\/provider-operation/u.test(source)
    })

    expect(violations).toEqual([])
    expect(existsSync('src/modules/provider-operation-fixture')).toBe(false)
    expect(existsSync('tools/dev/fixtures/provider-operation')).toBe(true)
  })
})
