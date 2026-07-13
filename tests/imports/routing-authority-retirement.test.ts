import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const retiredAuthorityFiles = [
  'convex/clearance.ts',
  'convex/spikeHandshakeRuntime.ts',
  'src/modules/harness/agent-door.ts',
  'src/modules/harness/agent-tool-write-scope.ts',
  'src/modules/harness/query-authority-receipt.ts',
] as const

describe('routing authority retirement', () => {
  it('removes the duplicate Handshake and clearance execution authorities', () => {
    for (const path of retiredAuthorityFiles) {
      expect(existsSync(join(root, path)), path).toBe(false)
    }
    expect(sourceFiles(root, ['src/modules/clearance'])).toEqual([])
  })

  it('keeps executable source free of retired authority imports', () => {
    const matches = sourceFiles(root, ['src', 'convex'])
      .filter((path) => !path.endsWith('routing-authority-retirement.test.ts'))
      .flatMap((path) => {
        const source = readFileSync(path, 'utf8')
        return /(?:from\s+|import\s*\(|require\s*\()['"][^'"]*(?:handshake-protocol-kernel|modules\/clearance|query-authority-receipt|spikeHandshakeRuntime)/.test(source)
          ? [path.slice(root.length + 1)]
          : []
      })

    expect(matches).toEqual([])
  })

  it('keeps the public Convex router outside the legacy selector and dispatch graph', () => {
    const source = readFileSync(join(root, 'convex/http.ts'), 'utf8')
    const retirement = readFileSync(join(root, 'src/modules/routing-kernel/retirement.ts'), 'utf8')

    expect(source).toContain("from '@/modules/routing-kernel/retirement'")
    expect(retirement).toContain('routing_v1_retired')
    expect(retirement).toContain('/api/v1/requests')
    expect(source).not.toMatch(
      /createRegisteredRoutingKernel|routingDependencies|routingKernelTransport|routingKernelBindings|routingKernelAgentGrants|handleRoutingKernel(?:Http|Mcp)Request/,
    )
  })

  it('keeps V1 history readback bounded, query-only, and outside routing authority', () => {
    const source = readFileSync(join(root, 'convex/routingKernelV1History.ts'), 'utf8')

    expect(source).toContain('resolveAdminAuthority(')
    expect(source).toContain("'read_admin_readbacks'")
    expect(source).toContain('export const read = query({')
    expect(source).toContain('.take(MAXIMUM_CHILDREN + 1)')
    expect(source).not.toMatch(/\b(?:mutation|action|internalMutation|internalAction)\s*\(/)
    expect(source).not.toMatch(/\.collect\s*\(/)
    expect(source).not.toMatch(/ctx\.db\.(?:insert|patch|replace|delete)\s*\(/)
    expect(source).not.toMatch(/ctx\.scheduler|\bfetch\s*\(/)
    expect(source).not.toMatch(/createRegisteredRoutingKernel|listEligible|routingKernelTransport|providerTransport|dispatchProvider/)
  })
})

function sourceFiles(base: string, directories: readonly string[]): string[] {
  return directories.flatMap((directory) => walk(join(base, directory)))
}

function walk(directory: string): string[] {
  if (!existsSync(directory)) return []
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry)
    if (statSync(path).isDirectory()) return walk(path)
    return /\.(?:ts|tsx|mts|cts|js|mjs|cjs)$/.test(path) ? [path] : []
  })
}
