import { describe, expect, it, vi } from 'vitest'

import {
  authorizePreparation,
  type AuthorizePreparationPorts,
} from '@/modules/customer-request/application/public'
import type { ReadyForRoutingPreparation } from '@/modules/customer-request/application/preparation-egress'

const NOW = 1_700_000_000_000

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
}

const readyPreparation = {
  kind: 'ready_for_routing',
  preparationRef: 'prep:1',
  preparationDigest: 'digest:prep:1',
  preparedAt: NOW,
  lineage: {
    requestId: 'req:1',
    requestRevision: 3,
    principalId: 'principal:1',
    delegatedAgentId: 'agent:1',
    planRevisionId: 'plan:1',
    planDigest: 'digest:plan:1',
    actionId: 'action:1',
    contractRef: { capabilityId: 'test.ride', version: 1 },
    selectionKey: 'sel:1',
    semanticDigest: 'sem:1',
  },
  authorityScope: {
    authorityScopeDigest: 'auth:1',
    maximumRecipients: 2,
    purposes: ['prepare_options'],
    categories: [],
    recipients: [],
    effectRequirements: [],
  },
  disclosureReview: {
    reviewRef: 'review:1',
    reviewDigest: 'digest:review:1',
    preparationRef: 'prep:1',
    purposes: ['prepare_options'],
    categories: [{
      inputKey: 'destination',
      label: 'Destination',
      classification: 'personal' as const,
    }],
    recipients: [{ kind: 'candidate_binding' as const }],
    effectRequirements: [{
      effectId: 'release',
      class: 'data_release' as const,
      authority: 'explicit' as const,
      reversibility: 'irreversible' as const,
    }],
    limits: { maximumRecipients: 2, maximumCandidateBindings: 2 },
  },
} as unknown as ReadyForRoutingPreparation

function baseInput(overrides: Record<string, unknown> = {}) {
  return {
    requestRef: 'req:1',
    revision: 3,
    preparationRef: 'prep:1',
    idempotencyKey: 'idem:1',
    commandDigest: 'digest:command:1',
    commandKey: (principalId: string) => `authorize:${principalId}`,
    egressCommandKey: (principalId: string) => `egress:${principalId}`,
    tokenIdentifier: 'principal:1',
    ownerId: 'owner:1',
    credentialId: 'principal:1',
    authenticationEvidenceRef: 'clerk-identity:evidence',
    now: NOW,
    ...overrides,
  }
}

function basePorts(overrides: Partial<AuthorizePreparationPorts> = {}): AuthorizePreparationPorts {
  return {
    loadCurrent: vi.fn(async () => ({
      kind: 'current' as const,
      aggregate,
      routeGenerationNumber: 1,
    })),
    getAgentPrincipal: vi.fn(async () => null),
    prepare: vi.fn(async () => ({
      kind: 'stored' as const,
      preparation: {
        kind: 'needs_authority' as const,
        preparationRef: 'prep:1',
        preparationDigest: 'digest:prep:1',
        preparedAt: NOW,
        lineage: readyPreparation.lineage,
        authorityScope: readyPreparation.authorityScope,
        disclosureReview: readyPreparation.disclosureReview,
      },
    })),
    runEgress: vi.fn(async () => ({ kind: 'completed' as const, states: [] })),
    preparationMaterialDigest: vi.fn(async () => 'digest:material:1'),
    preparePreparedAction: vi.fn(async () => ({
      kind: 'not_prepared' as const,
      reason: 'options_pending' as const,
      recoveryRef: 'recovery:1',
    })),
    ...overrides,
  }
}

describe('authorizePreparation', () => {
  it('returns needs_attention for historical requests', async () => {
    const ports = basePorts({
      loadCurrent: vi.fn(async () => ({
        kind: 'needs_attention' as const,
        requestId: 'req:1',
        reason: 'historical_request_resubmit_required' as const,
        resumable: false as const,
      })),
    })
    const result = await authorizePreparation(baseInput(), ports)
    expect(result).toMatchObject({
      kind: 'request',
      state: 'needs_attention',
      nextAction: 'retry',
    })
    expect(ports.prepare).not.toHaveBeenCalled()
  })

  it('refuses when the request is missing', async () => {
    const ports = basePorts({
      loadCurrent: vi.fn(async () => ({ kind: 'not_found' as const })),
    })
    await expect(authorizePreparation(baseInput(), ports)).resolves.toEqual({
      kind: 'refused', reason: 'request_not_found',
    })
  })

  it('refuses when the caller does not own the request', async () => {
    const ports = basePorts({
      getAgentPrincipal: vi.fn(async () => ({ ownerId: 'other-owner' })),
    })
    await expect(authorizePreparation(baseInput({
      tokenIdentifier: 'stranger',
      ownerId: 'stranger-owner',
    }), ports)).resolves.toEqual({
      kind: 'refused', reason: 'request_not_found',
    })
    expect(ports.prepare).not.toHaveBeenCalled()
  })

  it('allows the agent owner to authorize', async () => {
    const ports = basePorts({
      getAgentPrincipal: vi.fn(async () => ({ ownerId: 'owner:1' })),
      prepare: vi.fn(async () => ({
        kind: 'conflict' as const,
        reason: 'revision_changed' as const,
      })),
    })
    const result = await authorizePreparation(baseInput({
      tokenIdentifier: 'owner-token',
      ownerId: 'owner:1',
      credentialId: 'owner-token',
    }), ports)
    expect(result).toMatchObject({ kind: 'conflict', reason: 'revision_changed' })
    expect(ports.prepare).toHaveBeenCalled()
  })

  it('returns revision conflict before prepare', async () => {
    const ports = basePorts()
    await expect(authorizePreparation(baseInput({ revision: 2 }), ports)).resolves.toEqual({
      kind: 'conflict', requestRef: 'req:1', reason: 'revision_changed',
    })
    expect(ports.prepare).not.toHaveBeenCalled()
  })

  it('returns needs_attention when the plan is not a single action', async () => {
    const ports = basePorts({
      loadCurrent: vi.fn(async () => ({
        kind: 'current' as const,
        aggregate: {
          ...aggregate,
          plan: { ...aggregate.plan, actions: [{ actionId: 'a' }, { actionId: 'b' }] },
        },
        routeGenerationNumber: 1,
      })),
    })
    const result = await authorizePreparation(baseInput(), ports)
    expect(result).toMatchObject({
      kind: 'request',
      state: 'needs_attention',
      summary: 'This request needs an action choice before AE can prepare it.',
    })
    expect(ports.prepare).not.toHaveBeenCalled()
  })

  it('projects preparationResultView when prepare is not ready for routing', async () => {
    const ports = basePorts()
    const result = await authorizePreparation(baseInput(), ports)
    expect(result).toMatchObject({
      kind: 'request',
      requestRef: 'req:1',
      preparationRef: 'prep:1',
    })
    expect(ports.runEgress).not.toHaveBeenCalled()
  })

  it('composes runPreparationEgress when prepare is ready for routing', async () => {
    const ports = basePorts({
      prepare: vi.fn(async () => ({
        kind: 'stored' as const,
        preparation: readyPreparation,
      })),
      runEgress: vi.fn(async () => ({
        kind: 'completed' as const,
        states: [{ operationRef: 'op:1', state: 'released' as const }],
      })),
      preparePreparedAction: vi.fn(async () => ({
        kind: 'not_prepared' as const,
        reason: 'options_pending' as const,
        recoveryRef: 'recovery:1',
      })),
    })
    const result = await authorizePreparation(baseInput(), ports)
    expect(ports.runEgress).toHaveBeenCalled()
    expect(ports.preparePreparedAction).toHaveBeenCalled()
    expect(result).toMatchObject({ kind: 'request', requestRef: 'req:1' })
  })
})
