import { describe, expect, it } from 'vitest'

import { findAction } from '@/modules/actions'

import {
  compareCapabilityOperations,
  deserializeOperationCompareResult,
  deserializeOperationDescriptor,
  inspectCapabilityOperationPlan,
  isAnonymousKeylessOperationEligible,
  operationDetailInputSchema,
  operationDetailOutputSchema,
  operationSearchInputSchema,
  projectCapabilityOperation,
  serializeOperationCompareResult,
  serializeOperationDescriptor,
  type CapabilityOperationSourceRecord,
  type OperationCompareResult,
} from '@/modules/capability-supply/public'
import { OPERATION_INVOKE_ROUTE_CONTRACT } from '@/modules/capability-execution/operation-invoke-entry'
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
  authentication: { kind: 'keyless' },
  integrated: true,
  routeable: true,
  answerExecutable: false,
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
  authentication: { kind: 'keyless' },
  answerExecutable: true,
}

describe('public operation read contract', () => {
  it('shares canonical input schemas with registry actions', () => {
    expect(registryOperationsSearchAction.schema).toBe(operationSearchInputSchema)
    expect(registryOperationsDetailAction.schema).toBe(operationDetailInputSchema)
    expect(registryOperationsDetailAction.outputSchema).toBe(operationDetailOutputSchema)
    expect(registryOperationsDetailAction.surfaces).toEqual(expect.arrayContaining(['answerThread', 'mcp']))
  })
  it('emits only navigation entries backed by registered actions', async () => {
    const projected = [
      projectCapabilityOperation(operationRecord, 2_000),
      projectCapabilityOperation(freeKeylessRecord, 2_000),
      projectCapabilityOperation({ ...operationRecord, routeable: false, integrated: false }, 2_000),
    ]
    const plan = await inspectCapabilityOperationPlan({
      listCurrent: async () => ({ operations: [operationRecord], snapshotKey: 'snapshot:projection' }),
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
  it('requires a fixed exact zero price for anonymous keyless eligibility', () => {
    const base = {
      authority: { kind: 'keyless' },
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
      surfaces: ['answerThread'],
    })
    expect(operation.navigation.some(({ relation }) => relation === 'execute')).toBe(false)

    for (const record of [
      { ...operationRecord, routeable: false, integrated: true },
      { ...operationRecord, routeable: true, readiness: { observedAt: 1_000, validUntil: 2_000 } },
      { ...operationRecord, routeable: false, integrated: false },
    ]) {
      const projected = projectCapabilityOperation(record, 2_000)
      expect(projected.navigation.some(({ relation }) => relation === 'invoke')).toBe(false)
    }
  })
  it('projects anonymous execute only for current free keyless read-only operations and preserves it on the wire', () => {
    const free = projectCapabilityOperation(freeKeylessRecord, 2_000)
    const execute = free.navigation.find(({ relation }) => relation === 'execute')
    expect(execute).toEqual({
      relation: 'execute',
      method: 'POST',
      actionId: 'operation.execute',
      authentication: 'none',
      surfaces: ['answerThread', 'mcp'],
      precondition: 'free_keyless_read_only',
    })
    const roundTripped = deserializeOperationDescriptor(serializeOperationDescriptor(free))
    expect(roundTripped.navigation).toEqual(free.navigation)
    expect(roundTripped.callVia).toBe(free.callVia)
    expect(roundTripped.paymentLane).toBe(free.paymentLane)
    expect(free.navigation.some(({ relation }) => relation === 'invoke')).toBe(false)

    const paid = projectCapabilityOperation(operationRecord, 2_000)
    expect(paid.navigation.some(({ relation }) => relation === 'execute')).toBe(false)
    const ineligibleRecords: readonly CapabilityOperationSourceRecord[] = [
      { ...freeKeylessRecord, authentication: { kind: 'platform_credential' as const, scheme: 'bearer' as const }, answerExecutable: false },
      { ...freeKeylessRecord, provenance: { ...freeKeylessRecord.provenance, sourceKind: 'x402' }, answerExecutable: false },
      {
        ...freeKeylessRecord,
        answerExecutable: false,
        contract: {
          ...freeKeylessRecord.contract,
          effects: [{ effectId: 'write', class: 'external_state_change', authority: 'explicit', reversibility: 'reversible' }],
        },
      },
      { ...freeKeylessRecord, routeable: false },
    ]
    for (const record of ineligibleRecords) {
      expect(projectCapabilityOperation(record, 2_000).navigation.some(({ relation }) => relation === 'execute')).toBe(false)
    }
  })
  it('never projects anonymous execute for x402 and keeps unavailable descriptors non-executable', () => {
    const x402 = projectCapabilityOperation({
      ...freeKeylessRecord,
      authentication: { kind: 'x402' },
      provenance: { ...freeKeylessRecord.provenance, sourceKind: 'x402' },
      answerExecutable: true,
    }, 2_000)
    expect(x402.authentication).toEqual({ kind: 'x402' })
    expect(x402.provenance.sourceKind).toBe('x402')
    expect(x402.paymentLane).toBe('brokered')
    expect(x402.navigation.some(({ relation }) => relation === 'execute')).toBe(false)
    expect(x402.navigation.some(({ relation }) => relation === 'invoke')).toBe(true)

    const unavailable = projectCapabilityOperation({
      ...operationRecord,
      integrated: false,
      routeable: false,
    }, 2_000)
    expect(unavailable.navigation.some(({ relation }) => (
      relation === 'execute' || relation === 'invoke' || relation === 'reconcile'
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
      listCurrent: async () => ({ operations: [populatedDataUseRecord], snapshotKey: 'snapshot:compare' }),
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
