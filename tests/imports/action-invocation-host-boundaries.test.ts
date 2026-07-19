import { readFileSync } from 'node:fs'
import { globSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const hostContractFiles = globSync(
  'src/modules/action-invocation/{host-seam,host-projection}.ts',
).sort()

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

describe('Action Invocation public host graph', () => {
  it('discovers the complete host contract allowlist', () => {
    expect(hostContractFiles).toEqual([
      'src/modules/action-invocation/host-projection.ts',
      'src/modules/action-invocation/host-seam.ts',
    ])
  })

  it.each(hostContractFiles)('%s contains no low-level lifecycle dependency', (path) => {
    expect(hostBoundaryViolations(readFileSync(path, 'utf8'))).toEqual([])
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
})
