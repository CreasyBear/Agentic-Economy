import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { findFiles } from '@/lib/ui/contract-scans'

const productionAuthority = {
  semantics: 'src/modules/customer-request/public.ts',
  compilation: 'src/modules/customer-request/compiler.ts',
  preparation: 'src/modules/customer-request/preparation.ts',
  routing: 'src/modules/customer-request/kernel-router.ts',
  projection: 'src/modules/customer-request/customer-projection.ts',
  application: 'convex/customerRequestApplication.ts',
  persistence: 'convex/customerRequests.ts',
  submitHttp: 'src/lib/server/customer-request-api.ts',
  inspectHttp: 'src/lib/server/customer-request-inspect-api.ts',
  factsHttp: 'src/lib/server/customer-request-facts-api.ts',
  agentAuth: 'src/lib/server/customer-request-agent-auth.ts',
  agentHttp: 'src/lib/server/customer-request-agent-api.ts',
  optionsHttp: 'src/lib/server/customer-options-api.ts',
  humanUi: 'src/components/ae/customer-request/AeCustomerRequestWorkspace.tsx',
} as const

describe('CustomerRequest source completeness', () => {
  it('keeps every essential product responsibility in canonical production TypeScript', () => {
    for (const [responsibility, file] of Object.entries(productionAuthority)) {
      expect(readFileSync(file, 'utf8'), `${responsibility} authority missing at ${file}`).not.toHaveLength(0)
    }
    const application = source('application')
    expect(application).toContain('compileCustomerRequest')
    expect(application).toContain('prepareCustomerRequestAction')
    expect(application).toContain('createKernelCustomerRequestActionRouter')
    expect(application).toContain('createRegisteredRoutingKernel')
    expect(application).toContain('createConvexCustomerRequestPreparationStore')
  })

  it('keeps routes and UI on the shared projection instead of rebuilding product state', () => {
    expect(readFileSync('src/routes/api.requests.ts', 'utf8')).toMatch(/handleCustomerRequestPost/)
    expect(readFileSync('src/routes/api.requests.$requestRef.options.ts', 'utf8')).toMatch(/handleCustomerOptionsPost/)
    expect(readFileSync('src/routes/api.requests.$requestRef.ts', 'utf8')).toMatch(/handleCustomerRequestGet/)
    expect(readFileSync('src/routes/api.requests.$requestRef.facts.ts', 'utf8')).toMatch(/handleCustomerRequestFactsPost/)
    expect(readFileSync('src/routes/api.v1.requests.ts', 'utf8')).toMatch(/handleAgentCustomerRequestPost/)
    expect(readFileSync('src/routes/api.v1.requests.$requestRef.ts', 'utf8')).toMatch(/handleAgentCustomerRequestGet/)
    expect(readFileSync('src/routes/api.v1.requests.$requestRef.facts.ts', 'utf8')).toMatch(/handleAgentCustomerRequestFactsPost/)
    expect(readFileSync('src/routes/api.v1.requests.$requestRef.options.ts', 'utf8')).toMatch(/handleAgentCustomerOptionsPost/)
    const ui = source('humanUi')
    expect(ui).toContain("from '@/modules/customer-request/customer-projection'")
    expect(ui).toContain("fetch('/api/requests'")
    expect(ui).toContain('/options`')
    for (const route of [
      'src/routes/api.requests.ts', 'src/routes/api.requests.$requestRef.ts', 'src/routes/api.requests.$requestRef.facts.ts', 'src/routes/api.requests.$requestRef.options.ts',
      'src/routes/api.v1.requests.ts', 'src/routes/api.v1.requests.$requestRef.ts', 'src/routes/api.v1.requests.$requestRef.facts.ts', 'src/routes/api.v1.requests.$requestRef.options.ts',
    ]) {
      expect(readFileSync(route, 'utf8')).not.toMatch(/compileCustomerRequest|prepareCustomerRequestAction|createNeutralRoutingKernel/)
    }
  })

  it('keeps fixture and durable discovery aligned on the agent request contract', () => {
    const fixtureDiscovery = readFileSync('src/modules/discovery/internal/discovery-files.ts', 'utf8')
    const durableDiscovery = readFileSync('convex/discovery.ts', 'utf8')
    const requiredMarkers = [
      '/api/v1/requests',
      'customer_requests:create',
      'needs_information | ready_to_compare | preparing_options | options_ready',
      'Advanced routing kernel:',
      'Treat options as proposals only',
    ]

    for (const marker of requiredMarkers) {
      expect(fixtureDiscovery, `fixture discovery missing ${marker}`).toContain(marker)
      expect(durableDiscovery, `durable discovery missing ${marker}`).toContain(marker)
    }
  })

  it('fails if support directories acquire canonical Request behavior or production imports them', () => {
    const supportFiles = findFiles([
      { root: 'examples', includeExtensions: ['.ts', '.tsx', '.js', '.mjs', '.mts'] },
      { root: 'tools', includeExtensions: ['.ts', '.tsx', '.js', '.mjs', '.mts'] },
    ])
    const forbiddenOwnership = /(?:export\s+)?(?:async\s+)?function\s+(?:compileCustomerRequest|prepareCustomerRequestAction|projectCustomerRequest|createKernelCustomerRequestActionRouter)\b/
    expect(supportFiles.filter((file) => forbiddenOwnership.test(readFileSync(file, 'utf8')))).toEqual([])

    const productionFiles = findFiles([
      { root: 'src', includeExtensions: ['.ts', '.tsx'] },
      { root: 'convex', includeExtensions: ['.ts'], exclude: ['convex/_generated'] },
    ])
    const forbiddenImport = /from\s+['"](?:@\/)?(?:examples|tools|tests|\.planning)\//
    expect(productionFiles.filter((file) => forbiddenImport.test(readFileSync(file, 'utf8')))).toEqual([])
  })
})

function source(role: keyof typeof productionAuthority): string {
  return readFileSync(productionAuthority[role], 'utf8')
}
