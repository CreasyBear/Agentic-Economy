import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { findFiles } from '@/lib/ui/contract-scans'
import { CUSTOMER_REQUEST_AGENT_ENTRYPOINT } from '@/modules/customer-request/agent-contract'

const productionAuthority = {
  publicContract: 'src/modules/customer-request/agent-contract.ts',
  hostedJourney: 'src/modules/customer-request/hosted-agent-journey.ts',
  semantics: 'src/modules/customer-request/evaluation.ts',
  compilation: 'src/modules/customer-request/compiler.ts',
  preparation: 'src/modules/customer-request/action-preparation.ts',
  preparationPersistence: 'convex/customerRequestV2Preparation.ts',
  preparationEgressState: 'convex/customerRequestV2PreparationEgressState.ts',
  preparationEgress: 'convex/customerRequestV2PreparationEgress.ts',
  routing: 'src/modules/customer-request/route-mandate.ts',
  projection: 'src/modules/customer-request/customer-projection.ts',
  application: 'convex/customerRequestApplication.ts',
  persistence: 'convex/customerRequestV2.ts',
  submitHttp: 'src/lib/server/customer-request-api.ts',
  inspectHttp: 'src/lib/server/customer-request-inspect-api.ts',
  factsHttp: 'src/lib/server/customer-request-facts-api.ts',
  agentAuth: 'src/lib/server/customer-request-agent-auth.ts',
  agentHttp: 'src/lib/server/customer-request-agent-api.ts',
  releaseReadback: 'src/modules/customer-request/release-readback.ts',
  releaseHttp: 'src/lib/server/customer-request-release-readback-api.ts',
  optionsHttp: 'src/lib/server/customer-options-api.ts',
  humanUi: 'src/components/ae/customer-request/AeCustomerRequestWorkspace.tsx',
} as const

describe('CustomerRequest source completeness', () => {
  it('keeps every essential product responsibility in canonical production TypeScript', () => {
    for (const [responsibility, file] of Object.entries(productionAuthority)) {
      expect(readFileSync(file, 'utf8'), `${responsibility} authority missing at ${file}`).not.toHaveLength(0)
    }
    const application = source('application')
    const applicationGraph = readFileSync('src/modules/customer-request/application/interpret-compile/graph.ts', 'utf8')
    const preparation = readFileSync('src/modules/customer-request/application/authorize-preparation/authorize.ts', 'utf8')
    expect(application).toContain('interpretCompileCommitApplication')
    expect(application).toContain('internal.capabilitySupply.listRouteable')
    expect(application).toContain('internal.capabilityContractDocuments.getActiveExactInternal')
    expect(application).toContain('internal.customerRequestV2.commitAggregate')
    expect(application).toContain('prepareCompare')
    expect(application).toContain('authorizePreparationApplication')
    expect(preparation).toContain('runPreparationEgress')
    expect(applicationGraph).toContain('bindCustomerCapabilityDescriptor')
  })

  it('uses the generated internal rate-limit mutation reference', () => {
    const application = readFileSync('convex/customerRequestApplication.ts', 'utf8')
    expect(application).toContain('ctx.runMutation(internal.rateLimit.admit')
    expect(application).not.toContain('makeFunctionReference')
    expect(application).not.toContain('rateLimit:admit')
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
      'convex/customerRequestApplication.ts',
    ]
    const forbidden = /capabilityContractId|providerAffinity|provider_offer_ref|acceptedValues|customerRequestCapabilityContracts|customerRequestCapabilityContractRegistryAdapter|routingKernelBindings/
    for (const file of currentFiles) expect(readFileSync(file, 'utf8'), file).not.toMatch(forbidden)

    const application = readFileSync('convex/customerRequestApplication.ts', 'utf8')
    expect(application).not.toMatch(/customerRequestCompilationStoreAdapter|commitRequestSnapshot|putRequestEvaluation/)
    expect(application).not.toMatch(/customerRequestPreparationAuthority|customerRequests\.prepare|prepareCustomerRequestAction/)
    expect(readFileSync('src/lib/server/customer-request-agent-api.ts', 'utf8'))
      .not.toMatch(/approvePreparedAction|admitApprovedAction/)
    const persistence = readFileSync('convex/customerRequestV2.ts', 'utf8')
    expect(persistence).not.toContain('historical_request_resubmit_required')
    expect(persistence).not.toMatch(/parseInt|Number\s*\([^)]*version/)
  })

  it('keeps historical V1 Request state out of the deployed write API', () => {
    const retiredConvexModules = [
      'convex/customerRequestCapabilityContracts.ts',
      'convex/customerRequestCapabilityContractRegistryAdapter.ts',
      'convex/customerRequestCompilationStoreAdapter.ts',
      'convex/customerRequestStoreAdapter.ts',
      'convex/customerRequests.ts',
      'convex/customerRequestPreparationAuthority.ts',
      'convex/customerRequestPreparationAuthorityStoreAdapter.ts',
    ]
    for (const file of retiredConvexModules) expect(existsSync(file), `${file} remains deployable`).toBe(false)

    const generatedApi = readFileSync('convex/_generated/api.d.ts', 'utf8')
    for (const moduleName of [
      'customerRequestCapabilityContracts',
      'customerRequestCapabilityContractRegistryAdapter',
      'customerRequestCompilationStoreAdapter',
      'customerRequestStoreAdapter',
      'customerRequests',
      'customerRequestPreparationAuthority',
      'customerRequestPreparationAuthorityStoreAdapter',
    ]) expect(generatedApi, `${moduleName} remains in the deployed Convex API`).not.toContain(moduleName)

    const devSeed = readFileSync('convex/devSeed.ts', 'utf8')
    expect(devSeed).not.toMatch(
      /registerSandboxSupply|from ['"]\.\/customerRequestCapabilityContracts['"]|from ['"]\.\/routingKernelBindings['"]|\bsandboxBindings\b/,
    )
    expect(devSeed).toMatch(/registerSandboxV2Supply|sandboxV2Bindings/)
  })

  it('keeps retired V2 approval and execution authority out of production while preserving history', () => {
    const retiredProductionFiles = [
      'src/routes/api.requests.$requestRef.approval.ts',
      'src/routes/api.requests.$requestRef.attempts.ts',
      'src/lib/server/customer-request-approval-api.ts',
      'src/lib/server/customer-request-action-attempt-api.ts',
      'convex/customerRequestV2ApprovalGrant.ts',
      'convex/customerRequestV2ActionAttempt.ts',
      'convex/customerRequestV2ProviderExecution.ts',
      'convex/customerRequestV2ProviderReconciliation.ts',
      'src/modules/customer-request/approval-grant-v2.ts',
      'src/modules/customer-request/action-attempt-v2.ts',
      'src/modules/customer-request/provider-execution-v2.ts',
      'src/modules/customer-request/provider-reconciliation-v2.ts',
    ]
    for (const file of retiredProductionFiles) {
      expect(existsSync(file), `${file} remains production-reachable`).toBe(false)
    }

    const generatedApi = readFileSync('convex/_generated/api.d.ts', 'utf8')
    for (const moduleName of [
      'customerRequestV2ApprovalGrant',
      'customerRequestV2ActionAttempt',
      'customerRequestV2ProviderExecution',
      'customerRequestV2ProviderReconciliation',
    ]) expect(generatedApi, `${moduleName} remains in the deployed Convex API`).not.toContain(moduleName)

    const retiredIdentifiers = /approvePreparedAction|admitApprovedAction|handleCustomerRequestApprovalPost|handleCustomerRequestActionAttemptPost|issueApprovalGrantV2|admitActionAttemptV2|releaseProviderInvocationV2|recordProviderOutcomeV2|reconcileProviderOutcomeV2|ApprovalGrantV2|ActionAttemptV2|ProviderInvocationEnvelopeV2|ProviderOutcomeV2|ActionAttemptResolutionV2/
    expect(readFileSync('convex/customerRequestApplication.ts', 'utf8')).not.toMatch(retiredIdentifiers)
    expect(readFileSync('src/modules/customer-request/agent-contract.ts', 'utf8')).not.toMatch(retiredIdentifiers)
    expect(readFileSync('src/modules/customer-request/public.ts', 'utf8')).not.toMatch(retiredIdentifiers)
    expect(readFileSync('src/modules/customer-request/runtime.ts', 'utf8')).not.toMatch(retiredIdentifiers)
    expect(readFileSync('src/routeTree.gen.ts', 'utf8')).not.toMatch(
      /api\/requests\/\$requestRef\/(?:approval|attempts)/,
    )

    const runtimeFiles = findFiles([
      { root: 'src', includeExtensions: ['.ts', '.tsx'] },
      { root: 'convex', includeExtensions: ['.ts'], exclude: ['convex/_generated'] },
    ]).filter((file) => file !== 'src/modules/customer-request/internal/convex-v2-schema.ts'
      && !file.endsWith('.test.ts'))
    expect(runtimeFiles.filter((file) => retiredIdentifiers.test(readFileSync(file, 'utf8')))).toEqual([])

    const historicalAuthorityTables = [
      'customerRequestV2ApprovalGrants',
      'customerRequestV2ApprovalGrantCommands',
      'customerRequestV2ActionAttempts',
      'customerRequestV2ActionAuthorityBudgets',
      'customerRequestV2ApprovalGrantConsumptions',
      'customerRequestV2ActionAttemptIdempotencyClaims',
      'customerRequestV2ActionAttemptSpendReservations',
      'customerRequestV2ActionAttemptDataReservations',
      'customerRequestV2ProviderReleaseGrants',
      'customerRequestV2ActionDisclosureGrants',
      'customerRequestV2ActionAttemptReleases',
      'customerRequestV2ProviderOutcomes',
      'customerRequestV2ProviderRootRuns',
      'customerRequestV2ProviderLeafRuns',
      'customerRequestV2ProviderProtocolEvidence',
      'customerRequestV2ProviderReconciliationObservations',
      'customerRequestV2ActionAttemptResolutions',
      'customerRequestV2ProviderReconciliationCommands',
      'customerRequestV2ActionAttemptAdmissionCommands',
    ] as const
    for (const file of runtimeFiles) {
      const runtimeSource = readFileSync(file, 'utf8')
      for (const table of historicalAuthorityTables) {
        expect(runtimeSource, `${file} reaches retired authority table ${table}`).not.toContain(table)
      }
    }

    const historicalSchema = readFileSync('src/modules/customer-request/internal/convex-v2-schema.ts', 'utf8')
    for (const table of historicalAuthorityTables) {
      expect(historicalSchema, `${table} history was removed`).toContain(`${table}: defineTable`)
    }
  })

  it('keeps routes and UI on the shared projection instead of rebuilding product state', () => {
    expect(readFileSync('src/routes/api.requests.ts', 'utf8')).toMatch(/handleBrowserCustomerRequestPost/)
    expect(readFileSync('src/routes/api.requests.$requestRef.options.ts', 'utf8')).toMatch(/handleBrowserCustomerOptionsPost/)
    expect(readFileSync('src/routes/api.requests.$requestRef.ts', 'utf8')).toMatch(/handleBrowserCustomerRequestGet/)
    expect(readFileSync('src/routes/api.requests.$requestRef.facts.ts', 'utf8')).toMatch(/handleBrowserCustomerRequestFactsPost/)
    expect(readFileSync('src/routes/api.requests.$requestRef.messages.ts', 'utf8')).toMatch(/handleBrowserCustomerRequestMessagePost/)
    const browserHttp = readFileSync('src/lib/server/customer-request-browser-api.ts', 'utf8')
    for (const handler of [
      'handleCustomerRequestPost', 'handleCustomerOptionsPost', 'handleCustomerRequestGet',
      'handleCustomerRequestFactsPost', 'handleCustomerRequestMessagePost',
    ]) expect(browserHttp).toContain(handler)
    expect(browserHttp).not.toMatch(/confirmRoute|runRoute|cancelRoute|reportRouteProblem/)
    expect(readFileSync('src/routes/api.requests.$requestRef.confirmation.ts', 'utf8'))
      .toMatch(/handleBrowserCustomerRequestConfirmationPost/)
    const browserLifecycle = readFileSync('src/lib/server/customer-request-browser-lifecycle-api.ts', 'utf8')
    for (const handler of [
      'handleCustomerRequestConfirmationPost', 'handleCustomerRequestRunPost',
      'handleCustomerRequestCancelPost', 'handleCustomerRequestProblemPost',
      'handleCustomerRequestEvidenceGet',
    ]) expect(browserLifecycle).toContain(handler)
    expect(existsSync('src/routes/api.requests.$requestRef.approval.ts')).toBe(false)
    expect(existsSync('src/routes/api.requests.$requestRef.attempts.ts')).toBe(false)
    expect(readFileSync('src/routes/api.v1.requests.ts', 'utf8')).toMatch(/handleAgentCustomerRequestPost/)
    expect(readFileSync('src/routes/api.v1.requests.$requestRef.ts', 'utf8')).toMatch(/handleAgentCustomerRequestGet/)
    expect(readFileSync('src/routes/api.v1.requests.$requestRef.facts.ts', 'utf8')).toMatch(/handleAgentCustomerRequestFactsPost/)
    expect(readFileSync('src/routes/api.v1.requests.$requestRef.messages.ts', 'utf8')).toMatch(/handleAgentCustomerRequestMessagePost/)
    expect(readFileSync('src/routes/api.v1.requests.$requestRef.options.ts', 'utf8')).toMatch(/handleAgentCustomerOptionsPost/)
    expect(existsSync('src/routes/api.v1.requests.$requestRef.authorization.ts')).toBe(false)
    expect(existsSync('src/routes/api.v1.requests.$requestRef.approval.ts')).toBe(false)
    const agentHttp = source('agentHttp')
    expect(agentHttp).not.toMatch(/authorizePreparation|approvePreparedAction|admitApprovedAction|operation:\s*['"]approve/)
    const ui = source('humanUi')
    expect(ui).toContain("from '@/modules/customer-request/customer-projection'")
    expect(ui).toContain('const replacing = editingRevision !== undefined')
    expect(ui).toContain('const endpoint = replacing')
    expect(ui).toContain('fetch(endpoint, requestInit)')
    expect(ui).toContain('projectCustomerRequestDecisionRecords(state.projection)')
    expect(ui).toContain(": '/api/requests'")
    expect(ui).toContain('/messages`')
    expect(ui).toContain("mode: 'replace'")
    expect(ui).toContain("method: 'GET'")
    expect(ui).toContain('ACTIVE_REQUEST_STORAGE_KEY')
    expect(ui).toContain('/options`')
    const publicHome = readFileSync('src/routes/index.tsx', 'utf8')
    expect(publicHome).toContain('projectConsumerPlan')
    expect(publicHome).toContain('customerRequestPlanPreviewAction')
    expect(publicHome).not.toContain('AeHomeComposer')
    for (const route of [
      'src/routes/api.requests.ts', 'src/routes/api.requests.$requestRef.ts', 'src/routes/api.requests.$requestRef.facts.ts', 'src/routes/api.requests.$requestRef.messages.ts', 'src/routes/api.requests.$requestRef.options.ts',
      'src/routes/api.v1.requests.ts', 'src/routes/api.v1.requests.$requestRef.ts', 'src/routes/api.v1.requests.$requestRef.facts.ts', 'src/routes/api.v1.requests.$requestRef.messages.ts', 'src/routes/api.v1.requests.$requestRef.options.ts',
    ]) {
      expect(readFileSync(route, 'utf8')).not.toMatch(/compileCustomerRequest|prepareCustomerRequestAction|createNeutralRoutingKernel/)
    }
  })

  it('keeps fixture and durable discovery aligned on the agent request contract', () => {
    const discoveryFiles = readFileSync('src/modules/discovery/internal/discovery-files.ts', 'utf8')
    const durableDiscovery = readFileSync('convex/discovery.ts', 'utf8')
    const publicContract = source('publicContract')
    const publicComprehension = readFileSync('src/modules/customer-request/public-comprehension.ts', 'utf8')
    const requestSchema = readFileSync('src/modules/customer-request/public-contract-schema.ts', 'utf8')
    const requiredMarkers = [
      'schema=',
    ]

    for (const marker of requiredMarkers) {
      expect(discoveryFiles, `shared discovery owner missing ${marker}`).toContain(marker)
    }
    expect(publicContract).toContain(
      `export const CUSTOMER_REQUEST_AGENT_SCOPE = '${CUSTOMER_REQUEST_AGENT_ENTRYPOINT.requiredScope}' as const`
    )
    expect(discoveryFiles).toContain('CUSTOMER_REQUEST_MACHINE_COMPREHENSION_LINES')
    for (const marker of [
      'CUSTOMER_REQUEST_AGENT_ENTRYPOINT',
      'CUSTOMER_REQUEST_AGENT_SCOPE',
      'CUSTOMER_REQUEST_NAVIGATION_RELATION_VALUES',
      'CUSTOMER_REQUEST_STATE_VALUES',
    ]) {
      expect(discoveryFiles, `shared discovery owner missing ${marker}`).toContain(marker)
    }
    expect(durableDiscovery).toMatch(
      /buildOfferingLlmsTxt\(await publicOfferingSupplyForDiscovery\(ctx\.db\)/
    )
    expect(durableDiscovery).toContain('return { body: result.body, urls: [...result.urls] }')
    for (const marker of ['/confirmation', '/run', '/evidence', '/problems', '/cancellation']) {
      expect(requestSchema, `Request schema missing ${marker}`).toContain(marker)
    }
    expect(publicComprehension).toContain('labelled AE sandbox businesses')
    expect(publicComprehension).toContain('separateApprovalBeforeStart')
    // `/mcp` is the current MCP host endpoint (T6), no longer retired routing-v1 vocabulary.
    expect(`${discoveryFiles}\n${durableDiscovery}`).not.toMatch(/Advanced routing kernel:|\.well-known\/ae-routing|\/v1\/route/)
  })

  it('binds hosted proof to the platform-owned revision after source gates', () => {
    const releaseReadback = source('releaseReadback')
    expect(releaseReadback).toContain('VERCEL_GIT_COMMIT_SHA')
    expect(releaseReadback).toContain('VERCEL_DEPLOYMENT_ID')
    expect(releaseReadback).not.toMatch(/AE_RELEASE_SOURCE_REVISION|AE_KERNEL_PROOF_MANIFEST/)
    expect(source('releaseHttp')).toContain('authenticateCustomerRequestAgent')
    expect(readFileSync('src/routes/api.v1.release.ts', 'utf8')).toContain('handleAgentCustomerRequestReleaseGet')
    expect(readFileSync('src/routes/api.v1.requests.ts', 'utf8'))
      .toContain(`createFileRoute('${CUSTOMER_REQUEST_AGENT_ENTRYPOINT.path}')`)
    expect(releaseReadback).toContain('CUSTOMER_REQUEST_AGENT_ENTRYPOINT')

    const workflow = readFileSync('.github/workflows/kernel-release-gate.yml', 'utf8')
    expect(workflow.match(/npm install --global npm@11\.5\.1/g)).toHaveLength(2)
    expect(workflow).not.toMatch(/kernel-proof|PROOF_MANIFEST|\.mjs|\.mts/)
    expect(workflow).toContain('CONVEX_DEPLOY_KEY: ${{ secrets.CONVEX_DEPLOY_KEY }}')
    expect(workflow).toContain('npx convex deploy --message "GitHub ${AE_RELEASE_SOURCE_REVISION}"')
    expect(workflow).toContain("npx convex run sandboxAcceptanceSupply:seedLabelledSandboxSupply '{\"includeComparisonOptions\":false}' --prod")
    expect(workflow).toContain('npx convex run capabilitySupply:queryCapabilityGraph')
    expect(workflow).toContain('Labelled sandbox capability publications did not become route-ready.')
    expect(workflow).toContain('needs: source-proof')
    expect(workflow).toContain("cancel-in-progress: ${{ github.event_name == 'pull_request' }}")
    expect(workflow).toContain('merge_group:')
    expect(workflow).toContain('actions/upload-artifact@')
    expect(workflow).toContain('npm exec -- tsx tools/release/deploy-customer-request-git-source.ts')
    expect(workflow).not.toMatch(/deployment="\$\(tsx /)
    expect(workflow).not.toMatch(/vercel deploy|--meta=.*githubCommitSha/)
    expect(workflow).toContain('AE_RELEASE_SOURCE_REVISION: ${{ github.sha }}')
    const sourceGate = workflow.indexOf('Run source release contract')
    const checkoutGuard = workflow.indexOf('Refuse a checkout other than the triggering revision')
    const endpointDeploy = workflow.indexOf('Deploy the dual-compatible exact clean source revision')
    const convexDeploy = workflow.indexOf('Deploy the exact-revision Convex schema and functions')
    const supplyMigration = workflow.indexOf('Register labelled sandbox acceptance supply')
    const hostedReadback = workflow.indexOf('Verify exact deployed human and agent Request lifecycle')
    expect(sourceGate).toBeLessThan(endpointDeploy)
    expect(checkoutGuard).toBeLessThan(endpointDeploy)
    expect(endpointDeploy).toBeLessThan(convexDeploy)
    expect(convexDeploy).toBeLessThan(supplyMigration)
    expect(supplyMigration).toBeLessThan(hostedReadback)
    expect(workflow).toContain('npm run test:release:hosted')
    expect(workflow.indexOf('Frozen dependency install for independent readback')).toBeLessThan(endpointDeploy)

    const packageJson = readFileSync('package.json', 'utf8')
    expect(packageJson).toContain('"test:release:hosted:readback": "tsx tools/release/verify-customer-request-release-credential.ts"')
    expect(packageJson).toContain('"gate:release": "npm run test:release:source"')
    expect(packageJson).toContain('npm run check:convex-codegen')
    expect(packageJson).toContain('npm run test:eval:report')
    expect(packageJson).not.toContain('AE_KERNEL_PROOF_MANIFEST_JSON')
  })

  it('makes handlers and hosted proof consume one canonical Request wire contract', () => {
    const contract = source('publicContract')
    const journey = source('hostedJourney')
    const journeyRun = readFileSync('src/modules/customer-request/hosted-agent-journey/run.ts', 'utf8')
    const journeyRuntime = readFileSync('src/modules/customer-request/hosted-agent-journey/runtime.ts', 'utf8')
    const journeyDiscovery = readFileSync('src/modules/customer-request/hosted-agent-journey/discovery.ts', 'utf8')
    for (const schema of [
      'customerRequestSubmitInputSchema', 'customerRequestMessageInputSchema',
      'customerRequestFactInputSchema', 'customerRequestOptionsInputSchema',
      'customerRequestAuthorizationInputSchema',
      'customerRequestViewSchema',
    ]) expect(contract).toContain(`export const ${schema}`)

    const handlerContracts = [
      ['submitHttp', 'customerRequestSubmitInputSchema'],
      ['factsHttp', 'customerRequestFactInputSchema'],
      ['optionsHttp', 'customerRequestOptionsInputSchema'],
    ] as const
    for (const [handler, schema] of handlerContracts) expect(source(handler)).toContain(schema)
    expect(journey).toContain("from './hosted-agent-journey/index'")
    expect(journeyRun).toMatch(/customerRequestSubmitInputSchema\.parse/)
    expect(journeyRuntime).toMatch(/customerRequestAgentResultSchema\.parse/)
    expect(journeyRuntime).toMatch(/customerRequestJsonValueSchema\.parse/)
    expect(journeyDiscovery).toMatch(/customerRequestAgentResultSchema\.safeParse/)
    const hostedSource = `${journey}\n${journeyRun}\n${journeyRuntime}\n${journeyDiscovery}`
    expect(hostedSource).toContain("'route_confirmation'")
    expect(hostedSource).not.toMatch(/prepared_action_approval|\/approval/)
    expect(hostedSource).not.toMatch(/providerId|bindingId|offeringId|Convex|customerRequestApplication:/)

    const smoke = readFileSync('tools/release/customer-request-production-smoke.ts', 'utf8')
    expect(smoke).toContain('runHostedCustomerRequestJourney')
    expect(smoke).not.toMatch(/switch\s*\([^)]*state|while\s*\(|requestViewSchema\s*=|z\.object/)
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
