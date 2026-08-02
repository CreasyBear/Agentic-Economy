import { createHash } from 'node:crypto'
import { existsSync, globSync, readFileSync, readdirSync } from 'node:fs'
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
    expect(source).not.toMatch(/createRegisteredRoutingKernel|listIntegrated|listRouteable|routingKernelTransport|providerTransport|dispatchProvider/)
  })

  it('deploys no V1 routing module except the bounded history readback', () => {
    const modules = readdirSync(join(root, 'convex'))
      .filter((entry) => /^routingKernel.*\.ts$/.test(entry))
      .sort()
    const generatedApi = readFileSync(join(root, 'convex/_generated/api.d.ts'), 'utf8')
    const generatedRoutingModules = [...generatedApi.matchAll(/import type \* as (routingKernel\w*) from/g)]
      .map((match) => match[1])

    expect(modules).toEqual(['routingKernelV1History.ts'])
    expect(generatedRoutingModules).toEqual(['routingKernelV1History'])
  })

  it('removes routing writers, dispatch, and cleanup without changing the historical schema', () => {
    const crons = readFileSync(join(root, 'convex/crons.ts'), 'utf8')
    const schema = readFileSync(join(root, 'src/modules/routing-kernel/internal/convex-schema.ts'), 'utf8')
    const currentRequest = [
      'convex/customerRequestApplication.ts',
      'convex/customerRequestV2.ts',
      'convex/capabilitySupply.ts',
    ].map((path) => readFileSync(join(root, path), 'utf8')).join('\n')

    expect(crons).not.toContain('routingKernel')
    expect(createHash('sha256').update(schema).digest('hex')).toBe('0d7b351813c594cb90351017da41a416b784fcd28ac4817023848b0985bd540b')
    expect(currentRequest).not.toMatch(/routingKernel|routing-kernel|createRegisteredRoutingKernel/)
  })

  it('leaves no support, tracer, example, or route bypass to the retired runtime', () => {
    const excluded = new Set([
      'tools/release/kernel-retirement-manifest.mjs',
      'tools/release/verify-kernel-retirement.mjs',
    ])
    const bypassPattern = /routingKernel(?:Admission|AgentGrants|Bindings|Evidence|HostedIncidentProof|IncidentControl|Store|StructuredPreparation|Tracer|Transport)|createRegisteredRoutingKernel|createNeutralRoutingKernel|handleRoutingKernel(?:Mcp|Http)Request|createKernelCustomerRequestActionRouter|createReferenceCapabilityBindings|modules\/customer-request\/kernel-router|modules\/routing-tracer|modules\/routing-kernel\/(?!retirement)/
    const bypasses = sourceFiles(root, ['tools', 'examples', 'src/routes', 'src/lib'])
      .filter((path) => !excluded.has(path.slice(root.length + 1)))
      .filter((path) => bypassPattern.test(readFileSync(path, 'utf8')))
      .map((path) => path.slice(root.length + 1))

    expect(bypasses).toEqual([])
  })

  it('allowlists every deployable source that can name V1 tables or dormant runtime entrypoints', () => {
    const allowed = new Set([
      'convex/routingKernelV1History.ts',
      'convex/schema.ts',
    ])
    const authorityPattern = /routingKernel[A-Z]\w*|createRegisteredRoutingKernel|createNeutralRoutingKernel|handleRoutingKernel(?:Mcp|Http)Request|createKernelCustomerRequestActionRouter|createReferenceCapabilityBindings|modules\/customer-request\/kernel-router|modules\/routing-tracer|modules\/routing-kernel\/(?!retirement)/
    const offenders = sourceFiles(root, ['convex', 'src/routes', 'src/lib/server'])
      .filter((path) => !path.includes('/_generated/') && !path.endsWith('.test.ts'))
      .filter((path) => !allowed.has(path.slice(root.length + 1)))
      .filter((path) => authorityPattern.test(readFileSync(path, 'utf8')))
      .map((path) => path.slice(root.length + 1))

    expect(offenders).toEqual([])
  })
})

function sourceFiles(base: string, directories: readonly string[]): string[] {
  return globSync(directories.map((directory) => join(base, directory, '**/*.{ts,tsx,mts,cts,js,mjs,cjs}'))).sort()
}
