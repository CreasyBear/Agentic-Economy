import { describe, expect, it, vi } from 'vitest'

import {
  refineCustomerRequest,
  type RefineCustomerRequestPorts,
} from '@/modules/customer-request/application/public'
import {
  defineCapabilityContract,
  openCapabilityDecisionModel,
} from '@/modules/capability-contract/public'
import { customerRouteRef } from '@/modules/customer-request/route-plan-customer-projection'
import { SANDBOX_V2_CAPABILITY_CONTRACT_DOCUMENT } from '@/modules/sandbox-supply/public'

const NOW = Date.now()
const model = openCapabilityDecisionModel(
  defineCapabilityContract(SANDBOX_V2_CAPABILITY_CONTRACT_DOCUMENT),
)
const contractRef = model.contractRef
const routePlanId = 'route:1'
const generationRef = 'gen:1'
const routeRef = customerRouteRef(generationRef, routePlanId)

const aggregate = {
  snapshot: {
    requestId: 'req:1',
    revision: 3,
    intent: 'Find a wheelchair-accessible ride',
    principalId: 'principal:1',
    networkId: 'net:1',
    delegatedAgentId: 'agent:1',
    facts: [],
    routeExclusions: [],
    snapshotDigest: 'snap:1',
  },
  evaluation: {
    criteria: [],
    posture: 'progress_available' as const,
    factsDigest: 'facts:1',
    evaluationDigest: 'eval:1',
  },
  outcome: 'plan_ready' as const,
  plan: {
    actions: [{
      actionId: 'action:1',
      selectionKey: model.selectionKey,
      semanticDigest: model.semanticDigest,
      contractRef,
    }],
    planRevisionId: 'plan:1',
    planDigest: 'digest:plan:1',
    createdAt: NOW,
    registrySnapshotDigest: 'registry:1',
    compilerVersion: 'v1',
    interpreterId: 'interp:1',
    proposalDigest: 'prop:1',
  },
  aggregateDigest: 'agg:1',
}

const graph = {
  kind: 'available' as const,
  models: [model],
  descriptors: [],
  bindings: [],
  registrySnapshotDigest: 'registry:1',
}

const routeGeneration = {
  generationRef,
  generation: 2,
  routes: [{
    routePlanId,
    steps: [{
      businessId: 'biz:1',
      offeringId: 'off:1',
      bindingId: 'bind:1',
      contractRef,
      offeringRegistrationHash: 'off-hash',
      bindingRegistrationHash: 'bind-hash',
    }],
  }],
}

const successView = {
  kind: 'request' as const,
  requestRef: 'req:1',
  revision: 4,
  state: 'routes_ready' as const,
  summary: 'Options ready',
  nextAction: 'inspect_routes' as const,
  missingFields: [],
  criteria: [],
  options: [],
}

function basePorts(overrides: Partial<RefineCustomerRequestPorts> = {}): RefineCustomerRequestPorts {
  return {
    loadCurrent: vi.fn(async () => ({
      kind: 'current' as const,
      aggregate,
      routeGenerationNumber: 2,
      routeGenerationRef: generationRef,
    })),
    recoverUnresolvedEgress: vi.fn(async () => undefined),
    resumeRequest: vi.fn(async () => successView),
    replayCommittedCommand: vi.fn(async () => undefined),
    recordNoopCommand: vi.fn(async () => ({ kind: 'stored' as const })),
    loadCurrentRouteGenerationNumber: vi.fn(async () => 2),
    loadCurrentRouteGeneration: vi.fn(async () => routeGeneration),
    loadRequestGraph: vi.fn(async () => graph),
    compileCommit: vi.fn(async () => successView),
    interpretCompileCommit: vi.fn(async () => successView),
    ...overrides,
  }
}

const baseInput = {
  requestRef: 'req:1',
  expectedRevision: 3,
  idempotencyKey: 'refine:1',
  message: 'Prefer evening pickup',
  commandKey: 'cmd:refine:1',
  commandDigest: 'digest:cmd:1',
  principalId: 'principal:1',
}

describe('customer-request refine', () => {
  it('refuses replace combined with replacesPriorStatement', async () => {
    const ports = basePorts()
    const result = await refineCustomerRequest({
      ...baseInput,
      mode: 'replace',
      replacesPriorStatement: 'old statement',
    }, ports)
    expect(result).toEqual({ kind: 'refused', reason: 'invalid_amendment' })
    expect(ports.replayCommittedCommand).not.toHaveBeenCalled()
  })

  it('refuses replace combined with reportedRouteRef', async () => {
    const ports = basePorts()
    const result = await refineCustomerRequest({
      ...baseInput,
      mode: 'replace',
      reportedRouteRef: routeRef,
    }, ports)
    expect(result).toEqual({ kind: 'refused', reason: 'invalid_amendment' })
  })

  it('short-circuits on committed-command replay', async () => {
    const ports = basePorts({
      replayCommittedCommand: vi.fn(async () => successView),
    })
    const result = await refineCustomerRequest(baseInput, ports)
    expect(result).toEqual(successView)
    expect(ports.loadCurrent).not.toHaveBeenCalled()
  })

  it('refuses when the request is not owned by the caller', async () => {
    const ports = basePorts({
      loadCurrent: vi.fn(async () => ({
        kind: 'current' as const,
        aggregate: {
          ...aggregate,
          snapshot: { ...aggregate.snapshot, principalId: 'principal:other' },
        },
        routeGenerationNumber: 2,
        routeGenerationRef: generationRef,
      })),
    })
    const result = await refineCustomerRequest(baseInput, ports)
    expect(result).toEqual({ kind: 'refused', reason: 'request_not_found' })
  })

  it('returns revision_changed when expectedRevision mismatches', async () => {
    const ports = basePorts()
    const result = await refineCustomerRequest({
      ...baseInput,
      expectedRevision: 2,
    }, ports)
    expect(result).toEqual({
      kind: 'conflict', requestRef: 'req:1', reason: 'revision_changed',
    })
  })

  it('blocks refine while unresolved egress recovery is in progress', async () => {
    const blocked = {
      kind: 'request' as const,
      requestRef: 'req:1',
      revision: 3,
      state: 'needs_attention' as const,
      summary: 'AE is still checking whether a business received this request.',
      nextAction: 'wait' as const,
      missingFields: [],
      criteria: [],
      options: [],
    }
    const ports = basePorts({
      recoverUnresolvedEgress: vi.fn(async () => blocked),
    })
    const result = await refineCustomerRequest(baseInput, ports)
    expect(result).toEqual(blocked)
    expect(ports.interpretCompileCommit).not.toHaveBeenCalled()
  })

  it('records a noop and resumes when replace message matches current intent', async () => {
    const ports = basePorts()
    const result = await refineCustomerRequest({
      ...baseInput,
      mode: 'replace',
      message: 'Find a wheelchair-accessible ride',
    }, ports)
    expect(result).toEqual(successView)
    expect(ports.recordNoopCommand).toHaveBeenCalledOnce()
    expect(ports.resumeRequest).toHaveBeenCalledWith({
      requestRef: 'req:1',
      principalId: 'principal:1',
    })
    expect(ports.interpretCompileCommit).not.toHaveBeenCalled()
  })

  it('maps noop command_conflict to idempotency_key_reused', async () => {
    const ports = basePorts({
      recordNoopCommand: vi.fn(async () => ({ kind: 'command_conflict' as const })),
    })
    const result = await refineCustomerRequest({
      ...baseInput,
      mode: 'replace',
      message: 'Find a wheelchair-accessible ride',
    }, ports)
    expect(result).toEqual({
      kind: 'conflict', requestRef: 'req:1', reason: 'idempotency_key_reused',
    })
  })

  it('appends via interpretCompileCommit with an amendment', async () => {
    const ports = basePorts()
    const result = await refineCustomerRequest(baseInput, ports)
    expect(result).toEqual(successView)
    expect(ports.interpretCompileCommit).toHaveBeenCalledOnce()
    expect(ports.interpretCompileCommit).toHaveBeenCalledWith(expect.objectContaining({
      intent: 'Find a wheelchair-accessible ride\nPrefer evening pickup',
      replaceCustomerRequestLiteral: true,
      amendment: {
        priorCustomerJob: 'Find a wheelchair-accessible ride',
        message: 'Prefer evening pickup',
      },
    }))
    expect(ports.compileCommit).not.toHaveBeenCalled()
  })

  it('replaces intent without an amendment object', async () => {
    const ports = basePorts()
    await refineCustomerRequest({
      ...baseInput,
      mode: 'replace',
      message: 'Need an accessible taxi instead',
    }, ports)
    expect(ports.interpretCompileCommit).toHaveBeenCalledWith(expect.objectContaining({
      intent: 'Need an accessible taxi instead',
    }))
    const call = vi.mocked(ports.interpretCompileCommit).mock.calls[0]?.[0]
    expect(call).toBeDefined()
    expect(call).not.toHaveProperty('amendment')
  })

  it('compiles a reported-route exclusion through compileCommit', async () => {
    const ports = basePorts()
    const result = await refineCustomerRequest({
      ...baseInput,
      reportedRouteRef: routeRef,
      message: 'That option does not work',
    }, ports)
    expect(result).toEqual(successView)
    expect(ports.compileCommit).toHaveBeenCalledOnce()
    expect(ports.compileCommit).toHaveBeenCalledWith(expect.objectContaining({
      interpreterId: 'customer:reported-option-unavailable',
      intent: 'Find a wheelchair-accessible ride',
      proposal: expect.objectContaining({ kind: 'capability_candidates' }),
      routeExclusions: expect.arrayContaining([
        expect.objectContaining({
          reportedRouteRef: routeRef,
          reportedGenerationRef: generationRef,
          reason: 'That option does not work',
          recordedAtRevision: 4,
        }),
      ]),
    }))
    expect(ports.interpretCompileCommit).not.toHaveBeenCalled()
  })

  it('refuses a foreign reportedRouteRef', async () => {
    const ports = basePorts()
    const result = await refineCustomerRequest({
      ...baseInput,
      reportedRouteRef: customerRouteRef(generationRef, 'route:missing'),
    }, ports)
    expect(result).toEqual({ kind: 'refused', reason: 'invalid_amendment' })
    expect(ports.compileCommit).not.toHaveBeenCalled()
  })

  it('returns needs_attention when selection rebind fails', async () => {
    const ports = basePorts({
      loadRequestGraph: vi.fn(async () => ({
        ...graph,
        models: [],
      })),
    })
    const result = await refineCustomerRequest({
      ...baseInput,
      reportedRouteRef: routeRef,
    }, ports)
    expect(result).toMatchObject({
      kind: 'request',
      state: 'needs_attention',
      summary: 'The registered options changed. Review the Request before continuing.',
    })
    expect(ports.compileCommit).not.toHaveBeenCalled()
  })
})
