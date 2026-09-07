import { describe, expect, it } from 'vitest'

import { findAction } from '@/modules/actions'
import { CURRENT_TOOL_PROJECTION_NAVIGATION } from '@/modules/actions/contract'

import {
  compareCapabilityTools,
  deserializeToolCompareResult,
  deserializeToolDescriptor,
  isAnonymousKeylessToolEligible,
  projectCapabilityTool as projectCapabilityToolWithNavigation,
  serializeToolCompareResult,
  serializeToolDescriptor,
  toolDetailOutputSchema,
  type CapabilityToolSourceRecord,
  type ToolProjectionNavigationContract,
  type ToolCompareResult,
} from '@/modules/capability-supply/public'
import { CALL_ROUTE_CONTRACT } from '@/modules/capability-execution/call-entry'
import { normalizePricingConfig, pricingConfigDigest } from '@/modules/money/public'
import { registryToolsDescribeAction, registryToolsSearchAction } from '@/modules/registry/tools.actions'
import { toolCatalogSearchInputSchema, toolChoiceDescribeOutputSchema, toolDescribeInputSchema } from '@/modules/registry/tool-choice-contracts'
import {
  projectToolHealth,
  projectProviderManagementStatus,
} from '@/modules/capability-supply/tool-health'

const operationRecord: CapabilityToolSourceRecord = {
  operationId: 'capability:reference.lookup',
  publicationRef: 'publication:reference.lookup',
  publicationRevision: 3,
  networkId: 'ae:public',
  contract: {
    contractFormat: 'ae.capability-contract:v2',
    capabilityId: 'reference.lookup',
    version: 1,
    name: 'Reference lookup',
    ref: { capabilityId: 'reference.lookup', version: 1, contractDigest: 'digest:contract' },
    description: 'Look up one reference value.',
    inputSchema: { type: 'object', properties: {} },
    outputSchema: { type: 'object', properties: {} },
    customerAnnotations: [],
    dataUse: [],
    effects: [],
    evidence: [],
    lifecycle: { idempotency: 'required', recovery: 'retry_safe' },
  },
  business: { businessId: 'business:reference', slug: 'reference', name: 'Reference' },
  offering: { offeringRef: 'offering:reference', revision: 1, label: 'Reference lookup', summary: 'One reference lookup.' },
  price: { kind: 'fixed', amount: { currency: 'USD', units: '125', exponent: 2 } },
  priceEvidence: { priceDigest: 'digest:publication-price', evidenceRefs: [] },
  materialTerms: [],
  commercialRelationship: { kind: 'none', summary: 'No commercial relationship.' },
  cancellation: { kind: 'unsupported' },
  transport: {
    method: 'POST',
    pathTemplate: '/lookup',
    responseStatus: 201,
    responseContentType: 'application/json',
    requestTimeoutMs: 5_000,
  },
  provenance: { publisher: 'provider_owned', sourceKind: 'openapi_http' },
  authentication: { kind: 'ae_api_key' },
  integrated: true,
  routeable: true,
  readiness: { observedAt: 1_000, validUntil: 10_000 },
  searchTerms: ['reference', 'lookup'],
  snapshotKey: 'publication:reference.lookup:3',
}
const populatedDataUseRecord: CapabilityToolSourceRecord = {
  ...operationRecord,
  operationId: 'capability:reference.lookup.data-use',
  publicationRef: 'publication:reference.lookup.data-use',
  contract: {
    ...operationRecord.contract,
    capabilityId: 'reference.lookup.data-use',
    ref: { capabilityId: 'reference.lookup.data-use', version: 1, contractDigest: 'digest:data-use' },
    dataUse: [{
      effectId: 'query_release',
      inputPointer: '/query',
      classification: 'public',
      phase: 'execution',
      recipient: { kind: 'selected_binding' },
      purposes: ['lookup_reference'],
    }],
  },
}
const freeKeylessRecord: CapabilityToolSourceRecord = {
  ...operationRecord,
  price: { kind: 'fixed', amount: { currency: 'USD', units: '0', exponent: 2 } },
  authentication: { kind: 'ae_api_key' },
}
const projectCapabilityTool = (
  record: CapabilityToolSourceRecord,
  now: number,
) => projectCapabilityToolWithNavigation(
  record,
  now,
  CURRENT_TOOL_PROJECTION_NAVIGATION,
)

describe('public Tool read contract', () => {
  it('projects reference-matched catalog and Provider health from the same facts', () => {
    const now = 2_000
    expect(projectToolHealth({
      posture: 'routeable', observedAt: 1_900, validUntil: 2_100,
    }, now)).toEqual({
      healthStatus: 'operational', lastCheckedAt: 1_900, lastHealthyAt: 1_900,
    })
    expect(projectToolHealth({
      posture: 'unavailable', observedAt: 1_950, validUntil: 2_050, lastHealthyAt: 1_800,
    }, now)).toEqual({
      healthStatus: 'degraded', lastCheckedAt: 1_950, lastHealthyAt: 1_800,
    })
    expect(projectToolHealth({
      posture: 'setup_required', observedAt: 1_950, validUntil: 2_050,
    }, now)).toEqual({ healthStatus: 'unverified', lastCheckedAt: 1_950 })

    expect(projectProviderManagementStatus({ disposition: 'current' }, now)).toBe('Validating')
    expect(projectProviderManagementStatus({
      disposition: 'current', credentialState: 'ready', healthState: 'healthy',
      readinessObservedAt: 1_900, readinessValidUntil: 2_100,
      authorityReviewRequired: true,
    }, now)).toBe('Validating')
    expect(projectProviderManagementStatus({
      disposition: 'current', credentialState: 'ready', healthState: 'healthy',
      readinessObservedAt: 1_900, readinessValidUntil: 2_100,
    }, now)).toBe('Live')
    expect(projectProviderManagementStatus({
      disposition: 'current', credentialState: 'unavailable', healthState: 'unhealthy',
      readinessObservedAt: 1_950, readinessLastHealthyAt: 1_800,
    }, now)).toBe('Action needed')
    expect(projectProviderManagementStatus({
      disposition: 'current', credentialState: 'ready', healthState: 'unhealthy',
      readinessObservedAt: 1_950, readinessLastHealthyAt: 1_800,
    }, now)).toBe('Degraded')
    expect(projectProviderManagementStatus({ disposition: 'withdrawn' }, now)).toBe('Removed')
  })
  it('shares canonical input schemas with registry actions', () => {
    expect(registryToolsSearchAction.schema).toBe(toolCatalogSearchInputSchema)
    expect(registryToolsDescribeAction.schema).toBe(toolDescribeInputSchema)
    expect(registryToolsDescribeAction.outputSchema).toBe(toolChoiceDescribeOutputSchema)
    expect(registryToolsDescribeAction.surfaces).toEqual(expect.arrayContaining(['chat', 'mcp']))
  })
  it('emits only navigation entries backed by registered actions', async () => {
    const projected = [
      projectCapabilityTool(operationRecord, 2_000),
      projectCapabilityTool(freeKeylessRecord, 2_000),
      projectCapabilityTool({ ...operationRecord, routeable: false, integrated: false }, 2_000),
    ]
    const navigation = projected.flatMap(({ navigation: entries }) => entries)

    for (const entry of navigation) {
      if (entry.actionId === undefined) continue
      expect(findAction(entry.actionId), `${entry.relation} navigation action`).toBeDefined()
    }
  })


  it('projects the current publication price digest without source material', () => {
    const tool = projectCapabilityTool(operationRecord, 2_000)
    expect(tool.callVia).toBe(CALL_ROUTE_CONTRACT.call.path)
    expect(tool.paymentLane).toBe('brokered')
    expect(tool.commercial.priceEvidence).toEqual({ priceDigest: 'digest:publication-price', evidenceRefs: [] })
    expect(tool.transport).toMatchObject({
      responseStatus: 201,
      responseContentType: 'application/json',
    })
    expect(tool).not.toHaveProperty('source')
    expect(tool).not.toHaveProperty('credential')
    expect(tool.navigation.find(({ relation }) => relation === 'describe')).toMatchObject({
      pathTemplate: '/api/v1/market-tools/describe',
      method: 'POST',
      actionId: 'registry.tools.describe',
    })
  })
  it('refuses an injected call path that drifts from the descriptor callVia contract', () => {
    const drifted = {
      ...CURRENT_TOOL_PROJECTION_NAVIGATION,
      call: {
        ...CURRENT_TOOL_PROJECTION_NAVIGATION.call,
        pathTemplate: '/api/v1/tools/other',
      },
    } as unknown as ToolProjectionNavigationContract
    expect(() => projectCapabilityToolWithNavigation(operationRecord, 2_000, drifted))
      .toThrowError('tool_projection_call_via_mismatch')
  })
  it('carries an additive Base USDC price breakdown through projection and wire roundtrip', () => {
    const tool = projectCapabilityTool({
      ...operationRecord,
      price: { kind: 'fixed', amount: { currency: 'USD', units: '1100', exponent: 2 } },
      priceBreakdown: {
        providerQuotedAmount: { currency: 'USD', units: '1000', exponent: 2 },
        agenticEconomyFee: { currency: 'USD', units: '100', exponent: 2 },
        totalBuyerAuthorization: { currency: 'USD', units: '1100', exponent: 2 },
        network: 'eip155:8453',
        asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      },
    }, 2_000)
    const wire = serializeToolDescriptor(tool)
    expect(wire.commercial.priceBreakdown).toEqual(tool.commercial.priceBreakdown)
    expect(deserializeToolDescriptor(wire).commercial.priceBreakdown).toEqual(tool.commercial.priceBreakdown)
    expect(toolDetailOutputSchema.safeParse({
      kind: 'found', schemaVersion: 'registry-tools:v1', tool,
    }).success).toBe(true)
  })
  it('preserves last healthy evidence through availability and comparison wire roundtrips', async () => {
    const now = 2_000
    const record: CapabilityToolSourceRecord = {
      ...operationRecord,
      routeable: false,
      readiness: { observedAt: 1_950, validUntil: 2_050, lastHealthyAt: 1_800 },
    }
    const tool = projectCapabilityTool(record, now)
    expect(tool.availability).toEqual({
      posture: 'setup_required', observedAt: 1_950, validUntil: 2_050,
      lastHealthyAt: 1_800, reason: 'setup_required',
    })

    const descriptorWire = serializeToolDescriptor(tool)
    expect(descriptorWire.availability.lastHealthyAt).toBe(1_800)
    const descriptor = deserializeToolDescriptor(descriptorWire)
    expect(projectToolHealth(descriptor.availability, now)).toEqual({
      healthStatus: 'degraded', lastCheckedAt: 1_950, lastHealthyAt: 1_800,
    })

    const result = await compareCapabilityTools({
      navigation: CURRENT_TOOL_PROJECTION_NAVIGATION,
      listCurrent: async () => ({ tools: [record], sourceCount: 1, snapshotKey: 'snapshot:health' }),
      loadCurrent: async (toolRef) => toolRef === tool.toolRef ? record : null,
    }, { toolRefs: [tool.toolRef] }, now)
    expect(result.kind).toBe('ok')
    if (result.kind !== 'ok') return
    const availabilityFact = result.facts.find(({ field }) => field === 'availability')
    expect(availabilityFact?.values[0]).toMatchObject({
      value: tool.availability, observedAt: 1_950, validUntil: 2_050, lastHealthyAt: 1_800,
    })

    const comparisonWire = serializeToolCompareResult(result)
    if (comparisonWire.kind !== 'ok') return
    const wireAvailabilityFact = comparisonWire.facts.find(({ field }) => field === 'availability')
    expect(wireAvailabilityFact?.values[0]).toMatchObject({
      value: tool.availability, observedAt: 1_950, validUntil: 2_050, lastHealthyAt: 1_800,
    })
    expect(deserializeToolCompareResult(comparisonWire)).toEqual(result)
  })
  it('preserves backward absence and canonical AUD unit boundaries', () => {
    expect(serializeToolDescriptor(projectCapabilityTool(operationRecord, 2_000)).commercial).not.toHaveProperty('priceBreakdown')
    const cases = [
      { total: '1100' },
      { total: '2' },
      { total: '0' },
      { total: '10145709240540253388' },
    ] as const
    for (const value of cases) {
      const config = {
        version: 'pricing:v3' as const,
        kind: 'fixed_aud' as const,
        currency: 'AUD' as const,
        exponent: 6 as const,
        amountUnits: value.total,
      }
      expect(normalizePricingConfig(config).kind).toBe('valid')
      expect(pricingConfigDigest(config)).not.toBe('invalid')
    }
    const corrupted = {
      version: 'pricing:v3' as const,
      kind: 'fixed_aud' as const,
      currency: 'AUD' as const,
      exponent: 6 as const,
      amountUnits: '01099',
    }
    expect(normalizePricingConfig(corrupted)).toEqual({ kind: 'invalid', code: 'pricing_config_invalid' })
  })
  it('requires a fixed exact zero price for anonymous keyless eligibility', () => {
    const base = {
      authority: { kind: 'public_upstream' },
      adapterId: 'http-json:v1',
      method: 'GET',
      sourceKind: 'openapi_http',
      price: { kind: 'fixed', amount: { currency: 'JPY', units: '0', exponent: 0 } },
      effects: [],
    } as const
    expect(isAnonymousKeylessToolEligible(base)).toBe(true)
    expect(isAnonymousKeylessToolEligible({
      ...base,
      price: { kind: 'fixed', amount: { currency: 'USD', units: '1', exponent: 2 } },
    })).toBe(false)
    expect(isAnonymousKeylessToolEligible({
      ...base,
      price: {
        kind: 'range',
        minimum: { currency: 'USD', units: '0', exponent: 2 },
        maximum: { currency: 'USD', units: '1', exponent: 2 },
      },
    })).toBe(false)
    expect(isAnonymousKeylessToolEligible({ ...base, price: { kind: 'on_request' } })).toBe(false)
  })

  it('projects keyed access as authenticated call only', () => {
    const tool = projectCapabilityTool({
      ...operationRecord,
      authentication: {
        kind: 'platform_credential',
        scheme: 'api_key',
        in: 'header',
        name: 'X-Provider-Key',
      },
    }, 2_000)
    expect(tool.navigation).toContainEqual({
      relation: 'call',
      pathTemplate: CALL_ROUTE_CONTRACT.call.path,
      method: CALL_ROUTE_CONTRACT.call.method,
      actionId: CALL_ROUTE_CONTRACT.call.actionId,
      authentication: 'required',
      surfaces: ['http', 'cli', 'mcp', 'chat'],
    })

    for (const record of [
      { ...operationRecord, routeable: false, integrated: true },
      { ...operationRecord, routeable: true, readiness: { observedAt: 1_000, validUntil: 2_000 } },
      { ...operationRecord, routeable: false, integrated: false },
    ]) {
      const projected = projectCapabilityTool(record, 2_000)
      expect(projected.navigation.some(({ relation }) => relation === 'call')).toBe(false)
    }
  })
  it('projects free public-upstream read-only Tools through authenticated call on the brokered rail', () => {
    const free = projectCapabilityTool(freeKeylessRecord, 2_000)
    const call = free.navigation.find(({ relation }) => relation === 'call')
    expect(call).toEqual({
      relation: 'call',
      pathTemplate: CALL_ROUTE_CONTRACT.call.path,
      method: CALL_ROUTE_CONTRACT.call.method,
      actionId: CALL_ROUTE_CONTRACT.call.actionId,
      authentication: 'required',
      surfaces: ['http', 'cli', 'mcp', 'chat'],
    })
    const roundTripped = deserializeToolDescriptor(serializeToolDescriptor(free))
    expect(roundTripped.navigation).toEqual(free.navigation)
    expect(roundTripped.callVia).toBe(free.callVia)
    expect(roundTripped.paymentLane).toBe(free.paymentLane)

    const paid = projectCapabilityTool(operationRecord, 2_000)
    expect(paid.navigation.some(({ relation }) => relation === 'call')).toBe(true)
    const ineligibleRecords: readonly CapabilityToolSourceRecord[] = [
      { ...freeKeylessRecord, authentication: { kind: 'platform_credential' as const, scheme: 'bearer' as const } },
      { ...freeKeylessRecord, provenance: { ...freeKeylessRecord.provenance, sourceKind: 'x402' } },
      {
        ...freeKeylessRecord,
        contract: {
          ...freeKeylessRecord.contract,
          effects: [{ effectId: 'write', class: 'external_state_change', authority: 'explicit', reversibility: 'reversible' }],
        },
      },
      { ...freeKeylessRecord, routeable: false },
    ]
    for (const record of ineligibleRecords) {
      const navigation = projectCapabilityTool(record, 2_000).navigation
      expect(navigation.some(({ relation }) => relation === 'call')).toBe(
        record.routeable && record.authentication.kind !== 'unknown',
      )
    }
  })
  it('never projects anonymous execute for x402 and keeps unavailable descriptors non-executable', () => {
    const x402 = projectCapabilityTool({
      ...freeKeylessRecord,
      authentication: { kind: 'x402' },
      provenance: { ...freeKeylessRecord.provenance, sourceKind: 'x402' },
    }, 2_000)
    expect(x402.provenance.sourceKind).toBe('x402')
    expect(x402.paymentLane).toBe('brokered')
    expect(x402.navigation.some(({ relation }) => relation === 'call')).toBe(true)

    const unavailable = projectCapabilityTool({
      ...operationRecord,
      integrated: false,
      routeable: false,
    }, 2_000)
    expect(unavailable.navigation.some(({ relation }) => (
      relation === 'call' || relation === 'reconcile'
    ))).toBe(false)
  })

  it('does not advertise routine recovery from descriptor lifecycle policy', () => {
    const tool = projectCapabilityTool({
      ...operationRecord,
      contract: {
        ...operationRecord.contract,
        lifecycle: { idempotency: 'required', recovery: 'reconcile_required' },
      },
    }, 2_000)
    expect(tool.recovery.recovery).toBe('reconcile_required')
    expect(tool.navigation.some(({ relation }) => relation === 'reconcile')).toBe(false)
  })
  it('compares populated data-use through the canonical wire schema and rejects object recipients', async () => {
    const tool = projectCapabilityTool(populatedDataUseRecord, 2_000)
    const result = await compareCapabilityTools({
      navigation: CURRENT_TOOL_PROJECTION_NAVIGATION,
      listCurrent: async () => ({ tools: [populatedDataUseRecord], sourceCount: 1, snapshotKey: 'snapshot:compare' }),
      loadCurrent: async (toolRef) => toolRef === tool.toolRef ? populatedDataUseRecord : null,
    }, { toolRefs: [tool.toolRef] }, 2_000)

    expect(result.kind).toBe('ok')
    if (result.kind !== 'ok') return
    const dataUseFact = result.facts.find(({ field }) => field === 'dataUse')
    expect(dataUseFact?.values[0]?.value).toEqual([{
      effectId: 'query_release',
      inputPointer: '/query',
      classification: 'public',
      phase: 'execution',
      recipient: 'selected_binding',
      purposes: ['lookup_reference'],
    }])

    const wire = serializeToolCompareResult(result)
    if (wire.kind !== 'ok') return
    const wireDataUseFact = wire.facts.find(({ field }) => field === 'dataUse')
    expect(wireDataUseFact?.values[0]?.value).toEqual([{
      effectId: 'query_release',
      inputPointer: '/query',
      classification: 'public',
      phase: 'execution',
      recipient: 'selected_binding',
      purposes: ['lookup_reference'],
    }])
    expect(deserializeToolCompareResult(wire)).toEqual(result)

    const invalid = {
      ...result,
      facts: result.facts.map((fact) => fact.field !== 'dataUse'
        ? fact
        : {
            ...fact,
            values: fact.values.map((value) => ({
              ...value,
              value: [{
                effectId: 'query_release',
                inputPointer: '/query',
                classification: 'public',
                phase: 'execution',
                recipient: { kind: 'selected_binding' },
                purposes: ['lookup_reference'],
              }],
            })),
          }),
    } as unknown as ToolCompareResult
    expect(() => serializeToolCompareResult(invalid)).toThrow('tool_comparison_value_invalid')
  })
})
