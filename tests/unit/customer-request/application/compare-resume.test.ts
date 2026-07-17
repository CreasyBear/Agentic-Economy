import { describe, expect, it, vi } from 'vitest'

import {
  hasTransientBindingUnavailable,
  prepareCompare,
  projectGenerationRefreshResult,
  resumeCustomerRequest,
  routeRefreshCommand,
  routesAreCurrent,
  type CompareResumePorts,
  type CompareResumeRouteGeneration,
  type CompareResumeAggregate,
} from '@/modules/customer-request/application/public'
import type { RequestGraph } from '@/modules/customer-request/application/interpret-compile/types'

const NOW = Date.now()
const FUTURE = NOW + 60_000

const aggregate = {
  snapshot: {
    requestId: 'req:1',
    revision: 3,
    intent: 'Find a wheelchair-accessible ride',
    principalId: 'principal:1',
    networkId: 'net:1',
    delegatedAgentId: 'agent:1',
    facts: [],
    snapshotDigest: 'snap:1',
  },
  evaluation: {
    criteria: [{
      label: 'Destination',
      value: 'Perth',
      basis: 'customer_provided' as const,
      inputKey: 'destination',
    }],
    posture: 'progress_available' as const,
    factsDigest: 'facts:1',
    evaluationDigest: 'eval:1',
  },
  outcome: 'plan_ready' as const,
  plan: {
    actions: [{ actionId: 'action:1' }],
    planRevisionId: 'plan:1',
    planDigest: 'digest:plan:1',
    createdAt: NOW,
    registrySnapshotDigest: 'registry:1',
    compilerVersion: 'v1',
    interpreterId: 'interp:1',
    proposalDigest: 'prop:1',
  },
} satisfies CompareResumeAggregate

const generation = {
  generationRef: 'gen:1',
  generation: 2,
  createdAt: NOW,
  registrySnapshotDigest: 'registry:1',
  compiler: {
    compilerVersion: 'v1',
    interpreterId: 'interp:1',
    proposalDigest: 'prop:1',
  },
  routes: [{
    expiresAt: FUTURE,
    steps: [{
      businessId: 'biz:1',
      offeringId: 'off:1',
      bindingId: 'bind:1',
      contractRef: { capabilityId: 'cap.ride', version: 1, contractDigest: 'cd:1' },
      offeringRegistrationHash: 'hash:off',
      bindingRegistrationHash: 'hash:bind',
      publicationRef: 'pub:1',
      publicationRevision: 1,
      price: { kind: 'fixed', currency: 'AUD', amountMinor: 2500 },
    }],
  }],
} satisfies CompareResumeRouteGeneration

const availableGraph = {
  kind: 'available' as const,
  models: [],
  descriptors: [],
  registrySnapshotDigest: 'registry:1',
  bindings: [{
    businessId: 'biz:1',
    offeringId: 'off:1',
    bindingId: 'bind:1',
    contractRef: { capabilityId: 'cap.ride', version: 1, contractDigest: 'cd:1' },
    offeringRegistrationHash: 'hash:off',
    bindingRegistrationHash: 'hash:bind',
    publicationRef: 'pub:1',
    publicationRevision: 1,
    readinessValidUntil: FUTURE,
    price: { kind: 'fixed', currency: 'AUD', amountMinor: 2500 },
    cancellation: { kind: 'unsupported' as const, evidenceRefs: [] },
  }],
} as unknown as RequestGraph

function basePorts(overrides: Partial<CompareResumePorts> = {}): CompareResumePorts {
  return {
    runEgress: vi.fn(),
    resumeEgress: vi.fn(),
    resumeRequestEgress: vi.fn(async () => ({ kind: 'completed', states: [] })),
    preparationMaterialDigest: vi.fn(),
    preparePreparedAction: vi.fn(),
    loadCurrent: vi.fn(async () => ({
      kind: 'current' as const,
      aggregate,
      routeGenerationNumber: 2,
      routeGenerationRef: 'gen:1',
    })),
    getSubmissionShell: vi.fn(async () => ({ kind: 'not_found' as const })),
    getCurrentRouteRun: vi.fn(async () => ({ kind: 'not_found' as const })),
    getCurrentMandate: vi.fn(async () => ({ kind: 'not_found' as const })),
    getCurrentRoutePlanGeneration: vi.fn(async () => ({
      kind: 'found' as const,
      routeGeneration: generation,
    })),
    projectCurrentRoutePlans: vi.fn(async () => ({
      kind: 'request' as const,
      requestRef: 'req:1',
      revision: 3,
      state: 'options_ready' as const,
      summary: 'Options ready',
      nextAction: 'choose_option' as const,
      missingFields: [],
      criteria: [],
      options: [],
      decision: {
        generationRef: 'gen:1',
        outcome: { kind: 'routes_available' as const },
        routes: [],
      },
    })),
    resumePreparation: vi.fn(async () => ({ kind: 'not_found' as const })),
    egressStatus: vi.fn(async () => ({ operationCount: 0, states: [] })),
    prepareAction: vi.fn(),
    loadRequestGraph: vi.fn(async () => availableGraph),
    getRoutePlanGenerationRefreshReplay: vi.fn(async () => ({ kind: 'not_found' as const })),
    refreshRoutePlanGeneration: vi.fn(),
    recordRoutePlanGenerationRetry: vi.fn(async () => ({
      kind: 'retryable' as const,
      reason: 'current_supply_unavailable' as const,
    })),
    createInterpreter: vi.fn(() => undefined),
    ...overrides,
  }
}

describe('compare-resume currency', () => {
  it('treats matching registry, expiry, and bindings as current', () => {
    expect(routesAreCurrent(generation, availableGraph, NOW)).toBe(true)
  })

  it('treats digest mismatch as stale', () => {
    expect(routesAreCurrent(generation, {
      ...availableGraph,
      registrySnapshotDigest: 'registry:other',
    }, NOW)).toBe(false)
  })

  it('detects transient binding unavailability', () => {
    const graph = {
      ...availableGraph,
      bindings: [{
        ...availableGraph.bindings[0]!,
        readinessValidUntil: NOW - 1,
      }],
    } as RequestGraph
    expect(hasTransientBindingUnavailable(generation, graph, NOW)).toBe(true)
  })

  it('builds stable route-refresh command keys', () => {
    const command = routeRefreshCommand({
      requestRef: 'req:1', revision: 3, idempotencyKey: 'idem:1',
    }, 'principal:1')
    expect(command.commandKey.startsWith('route-refresh:')).toBe(true)
    expect(command.commandDigest.length).toBeGreaterThan(8)
  })
})

describe('compare-resume resumeCustomerRequest', () => {
  it('returns durable shell when aggregate is not current', async () => {
    const ports = basePorts({
      loadCurrent: vi.fn(async () => ({ kind: 'not_found' as const })),
      getSubmissionShell: vi.fn(async () => ({
        kind: 'found' as const,
        shell: { requestId: 'req:shell' },
      })),
    })
    const result = await resumeCustomerRequest(
      { requestRef: 'req:shell', principalId: 'principal:1' },
      ports,
    )
    expect(result).toMatchObject({
      kind: 'request',
      requestRef: 'req:shell',
      state: 'needs_attention',
      nextAction: 'retry',
    })
  })

  it('short-circuits on active route run', async () => {
    const ports = basePorts({
      getCurrentRouteRun: vi.fn(async () => ({
        kind: 'found' as const,
        run: {
          requestId: 'req:1',
          requestRevision: 3,
          generationRef: 'gen:1',
          state: 'running' as const,
          totalSteps: 1,
          completedSteps: 0,
          currentPosition: 0,
          currentState: 'dispatched' as const,
          updatedAt: 1_000,
        },
      })),
    })
    const result = await resumeCustomerRequest(
      { requestRef: 'req:1', principalId: 'principal:1' },
      ports,
    )
    expect(result.kind).toBe('request')
    expect(ports.projectCurrentRoutePlans).not.toHaveBeenCalled()
  })

  it('refuses principal mismatch', async () => {
    const result = await resumeCustomerRequest(
      { requestRef: 'req:1', principalId: 'principal:other' },
      basePorts(),
    )
    expect(result).toEqual({ kind: 'refused', reason: 'request_not_found' })
  })
})

describe('compare-resume prepareCompare', () => {
  it('projects current plans when routes are current', async () => {
    const ports = basePorts()
    const result = await prepareCompare({
      requestRef: 'req:1',
      revision: 3,
      idempotencyKey: 'idem:1',
      principalId: 'principal:1',
      compareCommandKey: 'compare:1',
      egressCommandKey: 'egress:1',
      commandDigest: 'digest:1',
    }, ports)
    expect(result).toMatchObject({ kind: 'request', state: 'options_ready' })
    expect(ports.recordRoutePlanGenerationRetry).not.toHaveBeenCalled()
    expect(ports.prepareAction).not.toHaveBeenCalled()
  })

  it('records retryable refresh when supply is unavailable', async () => {
    const ports = basePorts({
      loadRequestGraph: vi.fn(async () => ({ kind: 'unavailable' as const })),
    })
    const result = await prepareCompare({
      requestRef: 'req:1',
      revision: 3,
      idempotencyKey: 'idem:1',
      principalId: 'principal:1',
      compareCommandKey: 'compare:1',
      egressCommandKey: 'egress:1',
      commandDigest: 'digest:1',
    }, ports)
    expect(ports.recordRoutePlanGenerationRetry).toHaveBeenCalled()
    expect(result).toMatchObject({
      kind: 'request',
      state: 'needs_attention',
    })
  })

  it('prepares single action when no route generation is present', async () => {
    const ports = basePorts({
      loadCurrent: vi.fn(async () => ({
        kind: 'current' as const,
        aggregate,
        routeGenerationNumber: 0,
      })),
      prepareAction: vi.fn(async () => ({
        kind: 'conflict' as const,
        reason: 'revision_changed' as const,
      })),
    })
    const result = await prepareCompare({
      requestRef: 'req:1',
      revision: 3,
      idempotencyKey: 'idem:1',
      principalId: 'principal:1',
      compareCommandKey: 'compare:1',
      egressCommandKey: 'egress:1',
      commandDigest: 'digest:1',
    }, ports)
    expect(ports.prepareAction).toHaveBeenCalled()
    expect(result).toEqual({
      kind: 'conflict',
      requestRef: 'req:1',
      reason: 'revision_changed',
    })
  })
})

describe('compare-resume projectGenerationRefreshResult', () => {
  it('maps command conflict to idempotency reuse', async () => {
    const result = await projectGenerationRefreshResult(
      aggregate,
      { kind: 'command_conflict' },
      basePorts(),
    )
    expect(result).toEqual({
      kind: 'conflict',
      requestRef: 'req:1',
      reason: 'idempotency_key_reused',
    })
  })

  it('projects unchanged refresh through current route plans', async () => {
    const ports = basePorts()
    const result = await projectGenerationRefreshResult(
      aggregate,
      { kind: 'unchanged', routeGeneration: generation },
      ports,
    )
    expect(ports.projectCurrentRoutePlans).toHaveBeenCalledWith(aggregate)
    expect(result).toMatchObject({ kind: 'request', state: 'options_ready' })
  })
})
