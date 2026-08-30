import { describe, expect, it } from 'vitest'

import { findAction } from '@/modules/actions'
import { CURRENT_OPERATION_PROJECTION_NAVIGATION } from '@/modules/actions/contract'

import {
  compareCapabilityOperations,
  deserializeOperationCompareResult,
  deserializeOperationDescriptor,
  inspectCapabilityOperationPlan,
  isAnonymousKeylessOperationEligible,
  operationDetailInputSchema,
  operationDetailOutputSchema,
  operationSearchInputSchema,
  projectCapabilityOperation as projectCapabilityOperationWithNavigation,
  serializeOperationCompareResult,
  serializeOperationDescriptor,
  type CapabilityOperationSourceRecord,
  type OperationProjectionNavigationContract,
  type OperationCompareResult,
} from '@/modules/capability-supply/public'
import { OPERATION_INVOKE_ROUTE_CONTRACT } from '@/modules/capability-execution/operation-invoke-entry'
import { normalizePricingConfig, pricingConfigDigest } from '@/modules/money/public'
import { registryOperationsDetailAction, registryOperationsSearchAction } from '@/modules/registry/operations.actions'

const operationRecord: CapabilityOperationSourceRecord = {
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
const populatedDataUseRecord: CapabilityOperationSourceRecord = {
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
const freeKeylessRecord: CapabilityOperationSourceRecord = {
  ...operationRecord,
  price: { kind: 'fixed', amount: { currency: 'USD', units: '0', exponent: 2 } },
  authentication: { kind: 'ae_api_key' },
}
const projectCapabilityOperation = (
  record: CapabilityOperationSourceRecord,
  now: number,
) => projectCapabilityOperationWithNavigation(
  record,
  now,
  CURRENT_OPERATION_PROJECTION_NAVIGATION,
)

describe('public operation read contract', () => {
  it('shares canonical input schemas with registry actions', () => {
    expect(registryOperationsSearchAction.schema).toBe(operationSearchInputSchema)
    expect(registryOperationsDetailAction.schema).toBe(operationDetailInputSchema)
    expect(registryOperationsDetailAction.outputSchema).toBe(operationDetailOutputSchema)
    expect(registryOperationsDetailAction.surfaces).toEqual(expect.arrayContaining(['chat', 'mcp']))
  })
  it('emits only navigation entries backed by registered actions', async () => {
    const projected = [
      projectCapabilityOperation(operationRecord, 2_000),
      projectCapabilityOperation(freeKeylessRecord, 2_000),
      projectCapabilityOperation({ ...operationRecord, routeable: false, integrated: false }, 2_000),
    ]
    const plan = await inspectCapabilityOperationPlan({
      navigation: CURRENT_OPERATION_PROJECTION_NAVIGATION,
      listCurrent: async () => ({ operations: [operationRecord], sourceCount: 1, snapshotKey: 'snapshot:projection' }),
      loadCurrent: async () => operationRecord,
    }, { operationRefs: [projected[0]!.operationRef] }, 2_000)
    expect(plan.kind).toBe('ok')
    if (plan.kind !== 'ok') return

    const navigation = [
      ...projected.flatMap(({ navigation: entries }) => entries),
      ...plan.navigation,
    ]

    for (const entry of navigation) {
      if (entry.actionId === undefined) continue
      expect(findAction(entry.actionId), `${entry.relation} navigation action`).toBeDefined()
    }
  })


  it('projects the current publication price digest without source material', () => {
    const operation = projectCapabilityOperation(operationRecord, 2_000)
    expect(operation.callVia).toBe(OPERATION_INVOKE_ROUTE_CONTRACT.invoke.path)
    expect(operation.paymentLane).toBe('brokered')
    expect(operation.commercial.priceEvidence).toEqual({ priceDigest: 'digest:publication-price', evidenceRefs: [] })
    expect(operation.transport).toMatchObject({
      responseStatus: 201,
      responseContentType: 'application/json',
    })
    expect(operation).not.toHaveProperty('source')
    expect(operation).not.toHaveProperty('credential')
    expect(operation.navigation.find(({ relation }) => relation === 'detail')).toMatchObject({
      pathTemplate: '/api/v1/market-operations/detail',
      method: 'POST',
      actionId: 'registry.operations.detail',
    })
  })
  it('refuses an injected invoke path that drifts from the descriptor callVia contract', () => {
    const drifted = {
      ...CURRENT_OPERATION_PROJECTION_NAVIGATION,
      invoke: {
        ...CURRENT_OPERATION_PROJECTION_NAVIGATION.invoke,
        pathTemplate: '/api/v1/operations/other',
      },
    } as unknown as OperationProjectionNavigationContract
    expect(() => projectCapabilityOperationWithNavigation(operationRecord, 2_000, drifted))
      .toThrowError('operation_projection_call_via_mismatch')
  })
  it('carries an additive Base USDC price breakdown through projection and wire roundtrip', () => {
    const operation = projectCapabilityOperation({
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
    const wire = serializeOperationDescriptor(operation)
    expect(wire.commercial.priceBreakdown).toEqual(operation.commercial.priceBreakdown)
    expect(deserializeOperationDescriptor(wire).commercial.priceBreakdown).toEqual(operation.commercial.priceBreakdown)
  })
  it('preserves backward absence and pinned fee rounding cases', () => {
    expect(serializeOperationDescriptor(projectCapabilityOperation(operationRecord, 2_000)).commercial).not.toHaveProperty('priceBreakdown')
    const cases = [
      { provider: '1000', fee: '100', total: '1100' },
      { provider: '1', fee: '1', total: '2' },
      { provider: '0', fee: '0', total: '0' },
      { provider: '9223372036854775807', fee: '922337203685477581', total: '10145709240540253388' },
    ] as const
    for (const value of cases) {
      const config = {
        version: 'pricing:v2' as const,
        unit: 'call' as const,
        providerAmount: { currency: 'USD', units: value.provider, exponent: 2 },
        platformFee: { currency: 'USD', units: value.fee, exponent: 2 },
        paidAmount: { currency: 'USD', units: value.total, exponent: 2 },
      }
      expect(normalizePricingConfig(config).kind).toBe('valid')
      expect(pricingConfigDigest(config)).not.toBe('invalid')
    }
    const corrupted = {
      version: 'pricing:v2' as const,
      unit: 'call' as const,
      providerAmount: { currency: 'USD', units: '1000', exponent: 2 },
      platformFee: { currency: 'USD', units: '99', exponent: 2 },
      paidAmount: { currency: 'USD', units: '1099', exponent: 2 },
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
    expect(isAnonymousKeylessOperationEligible(base)).toBe(true)
    expect(isAnonymousKeylessOperationEligible({
      ...base,
      price: { kind: 'fixed', amount: { currency: 'USD', units: '1', exponent: 2 } },
    })).toBe(false)
    expect(isAnonymousKeylessOperationEligible({
      ...base,
      price: {
        kind: 'range',
        minimum: { currency: 'USD', units: '0', exponent: 2 },
        maximum: { currency: 'USD', units: '1', exponent: 2 },
      },
    })).toBe(false)
    expect(isAnonymousKeylessOperationEligible({ ...base, price: { kind: 'on_request' } })).toBe(false)
  })

  it('projects keyed access as authenticated invoke only', () => {
    const operation = projectCapabilityOperation({
      ...operationRecord,
      authentication: {
        kind: 'platform_credential',
        scheme: 'api_key',
        in: 'header',
        name: 'X-Provider-Key',
      },
    }, 2_000)
    expect(operation.navigation).toContainEqual({
      relation: 'invoke',
      pathTemplate: OPERATION_INVOKE_ROUTE_CONTRACT.invoke.path,
      method: OPERATION_INVOKE_ROUTE_CONTRACT.invoke.method,
      actionId: OPERATION_INVOKE_ROUTE_CONTRACT.invoke.actionId,
      authentication: 'required',
      surfaces: ['http', 'cli', 'mcp', 'chat'],
    })

    for (const record of [
      { ...operationRecord, routeable: false, integrated: true },
      { ...operationRecord, routeable: true, readiness: { observedAt: 1_000, validUntil: 2_000 } },
      { ...operationRecord, routeable: false, integrated: false },
    ]) {
      const projected = projectCapabilityOperation(record, 2_000)
      expect(projected.navigation.some(({ relation }) => relation === 'invoke')).toBe(false)
    }
  })
  it('projects free public-upstream read-only operations through authenticated invoke on the brokered rail', () => {
    const free = projectCapabilityOperation(freeKeylessRecord, 2_000)
    const invoke = free.navigation.find(({ relation }) => relation === 'invoke')
    expect(invoke).toEqual({
      relation: 'invoke',
      pathTemplate: OPERATION_INVOKE_ROUTE_CONTRACT.invoke.path,
      method: OPERATION_INVOKE_ROUTE_CONTRACT.invoke.method,
      actionId: OPERATION_INVOKE_ROUTE_CONTRACT.invoke.actionId,
      authentication: 'required',
      surfaces: ['http', 'cli', 'mcp', 'chat'],
    })
    const roundTripped = deserializeOperationDescriptor(serializeOperationDescriptor(free))
    expect(roundTripped.navigation).toEqual(free.navigation)
    expect(roundTripped.callVia).toBe(free.callVia)
    expect(roundTripped.paymentLane).toBe(free.paymentLane)

    const paid = projectCapabilityOperation(operationRecord, 2_000)
    expect(paid.navigation.some(({ relation }) => relation === 'invoke')).toBe(true)
    const ineligibleRecords: readonly CapabilityOperationSourceRecord[] = [
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
      const navigation = projectCapabilityOperation(record, 2_000).navigation
      expect(navigation.some(({ relation }) => relation === 'invoke')).toBe(
        record.routeable && record.authentication.kind !== 'unknown',
      )
    }
  })
  it('never projects anonymous execute for x402 and keeps unavailable descriptors non-executable', () => {
    const x402 = projectCapabilityOperation({
      ...freeKeylessRecord,
      authentication: { kind: 'x402' },
      provenance: { ...freeKeylessRecord.provenance, sourceKind: 'x402' },
    }, 2_000)
    expect(x402.provenance.sourceKind).toBe('x402')
    expect(x402.paymentLane).toBe('brokered')
    expect(x402.navigation.some(({ relation }) => relation === 'invoke')).toBe(true)

    const unavailable = projectCapabilityOperation({
      ...operationRecord,
      integrated: false,
      routeable: false,
    }, 2_000)
    expect(unavailable.navigation.some(({ relation }) => (
      relation === 'invoke' || relation === 'reconcile'
    ))).toBe(false)
  })

  it('does not advertise routine recovery from descriptor lifecycle policy', () => {
    const operation = projectCapabilityOperation({
      ...operationRecord,
      contract: {
        ...operationRecord.contract,
        lifecycle: { idempotency: 'required', recovery: 'reconcile_required' },
      },
    }, 2_000)
    expect(operation.recovery.recovery).toBe('reconcile_required')
    expect(operation.navigation.some(({ relation }) => relation === 'reconcile')).toBe(false)
  })
  it('compares populated data-use through the canonical wire schema and rejects object recipients', async () => {
    const operation = projectCapabilityOperation(populatedDataUseRecord, 2_000)
    const result = await compareCapabilityOperations({
      navigation: CURRENT_OPERATION_PROJECTION_NAVIGATION,
      listCurrent: async () => ({ operations: [populatedDataUseRecord], sourceCount: 1, snapshotKey: 'snapshot:compare' }),
      loadCurrent: async (operationRef) => operationRef === operation.operationRef ? populatedDataUseRecord : null,
    }, { operationRefs: [operation.operationRef] }, 2_000)

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

    const wire = serializeOperationCompareResult(result)
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
    expect(deserializeOperationCompareResult(wire)).toEqual(result)

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
    } as unknown as OperationCompareResult
    expect(() => serializeOperationCompareResult(invalid)).toThrow('operation_comparison_value_invalid')
  })
})
