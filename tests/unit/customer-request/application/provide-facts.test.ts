import { describe, expect, it, vi } from 'vitest'

import {
  provideCustomerRequestFacts,
  type ProvideFactsPorts,
} from '@/modules/customer-request/application/public'
import type {
  CapabilityDecisionModel,
  CapabilityInputKey,
  CapabilitySelectionKey,
  PointedSchemaIdentity,
} from '@/modules/capability-contract/public'

const NOW = Date.now()
const contractRef = { capabilityId: 'cap:ride', version: 1, contractDigest: 'digest:1' }

const requirement = {
  kind: 'contract_fact' as const,
  requirementKey: 'req:destination',
  customerLabel: 'Destination',
  targets: [{
    contractRef,
    selectionKey: 'sel:1',
    inputKey: 'destination',
    inputPointer: '/destination',
    schemaIdentity: 'schema:destination',
  }],
}

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
    criteria: [],
    posture: 'needs_information' as const,
    factsDigest: 'facts:1',
    evaluationDigest: 'eval:1',
    registrySnapshotDigest: 'registry:1',
    nextRequirement: requirement,
  },
  outcome: 'needs_information' as const,
  plan: {
    actions: [{
      actionId: 'action:1',
      selectionKey: 'sel:1',
      semanticDigest: 'sem:1',
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

const model = {
  selectionKey: 'sel:1' as CapabilitySelectionKey,
  semanticDigest: 'sem:1',
  contractRef,
  inputs: [{
    key: 'destination' as CapabilityInputKey,
    annotationId: 'destination',
    inputPointer: '/destination',
    label: 'Destination',
    role: 'constraint' as const,
    inference: 'allowed' as const,
    stage: 'option_selection' as const,
    required: true,
    schemaIdentity: 'schema:destination' as PointedSchemaIdentity,
    dataUse: [],
  }],
  evidence: [],
  dataUse: [],
  effects: [],
  lifecycle: { idempotency: 'not_applicable' as const, recovery: 'retry_safe' as const },
  assessInput: vi.fn(() => ({ kind: 'viable' as const, stage: 'option_selection' as const })),
  projectPreparation: vi.fn(() => ({
    kind: 'ready' as const,
    contractRef,
    selectionKey: 'sel:1' as CapabilitySelectionKey,
    semanticDigest: 'sem:1',
    input: null,
    dataUse: [],
  })),
  validateInput: vi.fn(() => ({ kind: 'valid' as const, value: null })),
  validateOutput: vi.fn(() => ({ kind: 'valid' as const, value: null })),
} satisfies CapabilityDecisionModel

const graph = {
  kind: 'available' as const,
  models: [model],
  descriptors: [],
  bindings: [],
  registrySnapshotDigest: 'registry:1',
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

function basePorts(overrides: Partial<ProvideFactsPorts> = {}): ProvideFactsPorts {
  return {
    loadCurrent: vi.fn(async () => ({
      kind: 'current' as const,
      aggregate,
      routeGenerationNumber: 2,
      routeGenerationRef: 'gen:1',
    })),
    recoverUnresolvedEgress: vi.fn(async () => undefined),
    replayCommittedCommand: vi.fn(async () => undefined),
    loadRequestGraph: vi.fn(async () => graph),
    loadCurrentRouteGenerationNumber: vi.fn(async () => 2),
    compileCommit: vi.fn(async () => successView),
    ...overrides,
  }
}

const baseInput = {
  requestRef: 'req:1',
  expectedRevision: 3,
  idempotencyKey: 'facts:1',
  requirementKey: 'req:destination',
  value: 'Perth',
  commandKey: 'cmd:facts:1',
  commandDigest: 'digest:cmd:1',
  principalId: 'principal:1',
}

describe('customer-request provide-facts', () => {
  it('short-circuits on committed-command replay', async () => {
    const ports = basePorts({
      replayCommittedCommand: vi.fn(async () => successView),
    })
    const result = await provideCustomerRequestFacts(baseInput, ports)
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
      })),
    })
    const result = await provideCustomerRequestFacts(baseInput, ports)
    expect(result).toEqual({ kind: 'refused', reason: 'request_not_found' })
  })

  it('blocks provide-facts while unresolved egress recovery is in progress', async () => {
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
    const result = await provideCustomerRequestFacts(baseInput, ports)
    expect(result).toEqual(blocked)
    expect(ports.compileCommit).not.toHaveBeenCalled()
  })

  it('returns revision_changed when expectedRevision mismatches', async () => {
    const ports = basePorts()
    const result = await provideCustomerRequestFacts({
      ...baseInput,
      expectedRevision: 2,
    }, ports)
    expect(result).toEqual({
      kind: 'conflict', requestRef: 'req:1', reason: 'revision_changed',
    })
  })

  it('returns needs_attention when the requirement key is wrong', async () => {
    const ports = basePorts()
    const result = await provideCustomerRequestFacts({
      ...baseInput,
      requirementKey: 'req:other',
    }, ports)
    expect(result).toMatchObject({
      kind: 'request',
      state: 'needs_attention',
      summary: 'Answer the current question before continuing.',
    })
    expect(ports.compileCommit).not.toHaveBeenCalled()
  })

  it('refuses when the request graph is unavailable', async () => {
    const ports = basePorts({
      loadRequestGraph: vi.fn(async () => ({ kind: 'unavailable' as const })),
    })
    const result = await provideCustomerRequestFacts(baseInput, ports)
    expect(result).toEqual({ kind: 'refused', reason: 'capabilities_unavailable' })
  })

  it('returns needs_attention when the registry digest changed', async () => {
    const ports = basePorts({
      loadRequestGraph: vi.fn(async () => ({
        ...graph,
        registrySnapshotDigest: 'registry:stale',
      })),
    })
    const result = await provideCustomerRequestFacts(baseInput, ports)
    expect(result).toMatchObject({
      kind: 'request',
      state: 'needs_attention',
      summary: 'The available options changed. Review the request again before answering.',
    })
    expect(ports.compileCommit).not.toHaveBeenCalled()
  })

  it('returns needs_attention when the answer cannot be bound', async () => {
    const ports = basePorts({
      loadRequestGraph: vi.fn(async () => ({
        ...graph,
        models: [{
          ...model,
          inputs: [{
            key: 'other' as CapabilityInputKey,
            annotationId: 'other',
            inputPointer: '/other',
            label: 'Other',
            role: 'constraint' as const,
            inference: 'allowed' as const,
            stage: 'option_selection' as const,
            required: true,
            schemaIdentity: 'schema:other' as PointedSchemaIdentity,
            dataUse: [],
          }],
        }],
      })),
    })
    const result = await provideCustomerRequestFacts(baseInput, ports)
    expect(result).toMatchObject({
      kind: 'request',
      state: 'needs_attention',
      summary: 'That answer does not match the requested information.',
    })
    expect(ports.compileCommit).not.toHaveBeenCalled()
  })

  it('returns needs_attention when route generation cannot be verified', async () => {
    const ports = basePorts({
      loadCurrentRouteGenerationNumber: vi.fn(async () => undefined),
    })
    const result = await provideCustomerRequestFacts(baseInput, ports)
    expect(result).toMatchObject({
      kind: 'request',
      state: 'needs_attention',
      summary: 'AE could not verify the current options. Try this request again.',
    })
    expect(ports.compileCommit).not.toHaveBeenCalled()
  })

  it('compiles through compileCommit with requirement-answer interpreter', async () => {
    const ports = basePorts()
    const result = await provideCustomerRequestFacts(baseInput, ports)
    expect(result).toEqual(successView)
    expect(ports.compileCommit).toHaveBeenCalledOnce()
    expect(ports.compileCommit).toHaveBeenCalledWith(expect.objectContaining({
      interpreterId: 'customer:requirement-answer',
      expectedRevision: 3,
      expectedRouteGeneration: 2,
      proposal: expect.objectContaining({ kind: 'capability_candidates' }),
    }))
    expect(ports).not.toHaveProperty('interpretCompileCommit')
  })
})
