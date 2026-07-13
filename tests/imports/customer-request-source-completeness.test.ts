import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { findFiles } from '@/lib/ui/contract-scans'

const productionAuthority = {
  semantics: 'src/modules/customer-request/evaluation.ts',
  compilation: 'src/modules/customer-request/compiler.ts',
  preparation: 'src/modules/customer-request/action-preparation.ts',
  preparationPersistence: 'convex/customerRequestV2Preparation.ts',
  preparationEgressState: 'convex/customerRequestV2PreparationEgressState.ts',
  preparationEgress: 'convex/customerRequestV2PreparationEgress.ts',
  approvalDomain: 'src/modules/customer-request/approval-grant-v2.ts',
  approvalPersistence: 'convex/customerRequestV2ApprovalGrant.ts',
  attemptDomain: 'src/modules/customer-request/action-attempt-v2.ts',
  attemptPersistence: 'convex/customerRequestV2ActionAttempt.ts',
  routing: 'src/modules/customer-request/kernel-router.ts',
  projection: 'src/modules/customer-request/customer-projection.ts',
  application: 'convex/customerRequestApplication.ts',
  persistence: 'convex/customerRequestV2.ts',
  submitHttp: 'src/lib/server/customer-request-api.ts',
  inspectHttp: 'src/lib/server/customer-request-inspect-api.ts',
  factsHttp: 'src/lib/server/customer-request-facts-api.ts',
  agentAuth: 'src/lib/server/customer-request-agent-auth.ts',
  agentHttp: 'src/lib/server/customer-request-agent-api.ts',
  optionsHttp: 'src/lib/server/customer-options-api.ts',
  approvalHttp: 'src/lib/server/customer-request-approval-api.ts',
  attemptHttp: 'src/lib/server/customer-request-action-attempt-api.ts',
  humanUi: 'src/components/ae/customer-request/AeCustomerRequestWorkspace.tsx',
} as const

describe('CustomerRequest source completeness', () => {
  it('keeps every essential product responsibility in canonical production TypeScript', () => {
    for (const [responsibility, file] of Object.entries(productionAuthority)) {
      expect(readFileSync(file, 'utf8'), `${responsibility} authority missing at ${file}`).not.toHaveLength(0)
    }
    const application = source('application')
    expect(application).toContain('compileCustomerRequest')
    expect(application).toContain('capabilitySupply.listEligible')
    expect(application).toContain('capabilityContractDocuments.getActiveExactInternal')
    expect(application).toContain('customerRequestV2.commitAggregate')
    expect(application).toContain('customerRequestV2Preparation.prepare')
    expect(application).toContain('customerRequestV2PreparationEgress.run')
    expect(application).toContain('customerRequestV2ApprovalGrant.issue')
    expect(application).toContain('customerRequestV2ActionAttempt.admit')
    expect(application).toContain('bindCustomerCapabilityDescriptor')
  })

  it('keeps the current Request path exact-V2-only and quarantines V1 authority', () => {
    const currentFiles = [
      'src/modules/customer-request/compiler.ts',
      'src/modules/customer-request/evaluation.ts',
      'src/modules/customer-request/semantic-interpreter.ts',
      'src/modules/customer-request/internal/convex-v2-schema.ts',
      'convex/customerRequestV2.ts',
      'src/modules/customer-request/action-preparation.ts',
      'convex/customerRequestV2Preparation.ts',
      'convex/customerRequestV2PreparationEgressState.ts',
      'convex/customerRequestV2PreparationEgress.ts',
      'src/modules/customer-request/approval-grant-v2.ts',
      'convex/customerRequestV2ApprovalGrant.ts',
      'src/modules/customer-request/action-attempt-v2.ts',
      'convex/customerRequestV2ActionAttempt.ts',
      'convex/customerRequestApplication.ts',
    ]
    const forbidden = /capabilityContractId|providerAffinity|provider_offer_ref|acceptedValues|customerRequestCapabilityContracts|customerRequestCapabilityContractRegistryAdapter|routingKernelBindings/
    for (const file of currentFiles) expect(readFileSync(file, 'utf8'), file).not.toMatch(forbidden)

    const application = readFileSync('convex/customerRequestApplication.ts', 'utf8')
    expect(application).not.toMatch(/legacy-compiler-v1|customerRequestCompilationStoreAdapter|commitRequestSnapshot|putRequestEvaluation/)
    expect(application).not.toMatch(/customerRequestPreparationAuthority|customerRequests\.prepare|prepareCustomerRequestAction/)
    expect(readFileSync('convex/customerRequestV2ApprovalGrant.ts', 'utf8'))
      .not.toMatch(/routingKernelAuthorizations|customerRequestPreparedActions|\bfetch\s*\(/)
    expect(readFileSync('convex/customerRequestV2ActionAttempt.ts', 'utf8'))
      .not.toMatch(/routingKernelExecutionClaims|routingKernelRootRuns|routingKernelLeafRuns|routingKernelStepReleases|routingKernelDisclosureAttempts|\bfetch\s*\(/)
    const approvalPersistence = source('approvalPersistence')
    expect(approvalPersistence).not.toContain('listEligibleCapabilitySupply')
    expect(approvalPersistence).toContain('getEligibleExactCapabilitySupply')
    expect(readFileSync('src/lib/server/customer-request-agent-api.ts', 'utf8'))
      .not.toMatch(/approvePreparedAction|admitApprovedAction/)
    const persistence = readFileSync('convex/customerRequestV2.ts', 'utf8')
    expect(persistence).toContain('historical_request_resubmit_required')
    expect(persistence).not.toMatch(/parseInt|Number\s*\([^)]*version/)
  })

  it('keeps routes and UI on the shared projection instead of rebuilding product state', () => {
    expect(readFileSync('src/routes/api.requests.ts', 'utf8')).toMatch(/handleCustomerRequestPost/)
    expect(readFileSync('src/routes/api.requests.$requestRef.options.ts', 'utf8')).toMatch(/handleCustomerOptionsPost/)
    expect(readFileSync('src/routes/api.requests.$requestRef.ts', 'utf8')).toMatch(/handleCustomerRequestGet/)
    expect(readFileSync('src/routes/api.requests.$requestRef.facts.ts', 'utf8')).toMatch(/handleCustomerRequestFactsPost/)
    expect(readFileSync('src/routes/api.requests.$requestRef.approval.ts', 'utf8')).toMatch(/handleCustomerRequestApprovalPost/)
    expect(readFileSync('src/routes/api.requests.$requestRef.attempts.ts', 'utf8')).toMatch(/handleCustomerRequestActionAttemptPost/)
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
      'src/routes/api.requests.$requestRef.approval.ts',
      'src/routes/api.requests.$requestRef.attempts.ts',
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
      'needs_information | needs_authorization | ready_to_compare | preparing_options | options_ready',
      'Advanced routing kernel:',
      'optionSet.ordering: recommended includes its objective, reasons, tradeoffs and influence status',
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
