import { describe, expect, it, vi } from 'vitest'

import {
  customerPurposeLabel,
  preparationResultView,
  preparedActionFailureSummary,
  projectEgressCustomerState,
  projectPreparedAction,
  projectStoredPreparation,
  recoverUnresolvedEgress,
  resolvePreparedAction,
  resumePreparationEgress,
  runPreparationEgress,
  type PreparationEgressAggregate,
  type PreparationEgressPorts,
  type ReadyForRoutingPreparation,
} from '@/modules/customer-request/application/public'
import type { PreparedActionV2 } from '@/modules/customer-request/prepared-action-v2'
import { canonicalDigest } from '@/modules/common/canonical-digest'

const aggregate: PreparationEgressAggregate = {
  snapshot: {
    requestId: 'req:1',
    revision: 3,
    intent: 'Find a wheelchair-accessible ride',
    principalId: 'principal:1',
  },
  evaluation: {
    criteria: [{
      label: 'Destination',
      value: 'Perth',
      basis: 'customer_provided',
      inputKey: 'destination',
    }],
  },
}

const readyPreparation = {
  kind: 'ready_for_routing',
  preparationRef: 'prep:1',
  preparationDigest: 'digest:prep:1',
  preparedAt: 1_000,
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

function preparedActionFixture(): PreparedActionV2 {
  return {
    format: 'ae.prepared-action:v2',
    preparedActionRef: 'action:prepared:1',
    preparedActionDigest: 'digest:prepared:1',
    lineage: readyPreparation.lineage,
    business: { businessId: 'biz:1', name: 'AccessRide' },
    offering: {
      offeringId: 'off:1',
      registrationHash: canonicalDigest('offering'),
      registrationEvidenceRefs: [],
      label: 'Accessible transfer',
      summary: 'Door-to-door accessible transfer',
    },
    binding: {
      bindingId: 'bind:1',
      registrationHash: canonicalDigest('binding'),
      registrationEvidenceRefs: [],
    },
    providerAssertion: {
      assertionRef: 'assert:1',
      operationRef: 'op:1',
      assertedAt: 1_000,
      validUntil: 2_000,
      responseDigest: 'resp:1',
      outputDigest: 'out:1',
      output: { ok: true },
      evidence: [],
    },
    price: { kind: 'range', minimum: { currency: 'AUD', units: '25', exponent: 2 }, maximum: { currency: 'AUD', units: '40', exponent: 2 } },
    materialTerms: [{ label: 'Wait time', value: '15 minutes' }],
    commercialRelationship: { kind: 'none' },
    cancellation: { kind: 'unsupported', evidenceRefs: [] },
    disclosure: {
      authorityReference: 'auth-ref:1',
      authorityScopeDigest: 'auth:1',
      operationRef: 'op:1',
      releaseEvidenceRef: 'release:1',
      allocationRefs: [],
    },
    comparison: {
      kind: 'single_option',
      candidateCount: 1,
      selectedAssertionRef: 'assert:1',
    },
    alternatives: [],
    fallbacks: [],
    preparedAt: 1_000,
    expiresAt: 2_000,
  } as unknown as PreparedActionV2
}

describe('preparation-egress projections', () => {
  it('labels customer purposes and prepared-action failure summaries', () => {
    expect(customerPurposeLabel('prepare_options')).toBe('Prepare options')
    expect(preparedActionFailureSummary('disclosure_not_released')).toContain('did not send')
    expect(preparedActionFailureSummary('prepared_action_too_large')).toContain('too large')
  })

  it('projects stored preparation disclosure and ready states', () => {
    const needsAuthority = projectStoredPreparation(aggregate, {
      ...readyPreparation,
      kind: 'needs_authority',
    })
    expect(needsAuthority).toMatchObject({
      kind: 'request',
      state: 'needs_authorization',
      nextAction: 'review_disclosure',
      disclosureReview: { purpose: 'Prepare options', maximumRecipients: 2 },
    })

    const ready = projectStoredPreparation(aggregate, readyPreparation)
    expect(ready).toMatchObject({
      kind: 'request',
      state: 'ready_to_compare',
      nextAction: 'prepare_options',
    })
  })

  it('maps preparation mutation results without inventing route authority', () => {
    expect(preparationResultView(aggregate, {
      kind: 'conflict', reason: 'revision_changed',
    }, 'req:1', 3)).toEqual({
      kind: 'conflict', requestRef: 'req:1', reason: 'revision_changed',
    })
    expect(preparationResultView(aggregate, {
      kind: 'refused', reason: 'request_not_found',
    }, 'req:1', 3)).toEqual({ kind: 'refused', reason: 'request_not_found' })
    expect(preparationResultView(aggregate, {
      kind: 'stored', preparation: readyPreparation,
    }, 'req:1', 3)).toMatchObject({ state: 'ready_to_compare' })
  })

  it('projects egress customer states and prepared actions', () => {
    expect(projectEgressCustomerState(aggregate, readyPreparation, [
      { state: 'uncertain' },
    ])).toMatchObject({ state: 'needs_attention', nextAction: 'wait' })
    expect(projectEgressCustomerState(aggregate, readyPreparation, [
      { state: 'in_flight' },
    ])).toMatchObject({ state: 'preparing_options', nextAction: 'wait' })
    expect(projectEgressCustomerState(aggregate, readyPreparation, [
      { state: 'not_released' },
    ])).toMatchObject({ state: 'needs_attention', nextAction: 'revise_request' })

    const projected = projectPreparedAction(aggregate, readyPreparation, preparedActionFixture())
    expect(projected).toMatchObject({
      kind: 'request',
      state: 'options_ready',
      nextAction: 'inspect_options',
      preparedAction: {
        businessName: 'AccessRide',
        offeringLabel: 'Accessible transfer',
        cancellation: { kind: 'unsupported' },
      },
    })
  })
})

describe('preparation-egress resolve ports', () => {
  it('runs egress then resolves a prepared action through ports only', async () => {
    const prepared = preparedActionFixture()
    const ports: Pick<PreparationEgressPorts, 'runEgress' | 'preparationMaterialDigest' | 'preparePreparedAction'> = {
      runEgress: vi.fn(async () => ({
        kind: 'completed' as const,
        states: [{ operationRef: 'op:1', state: 'released' as const }],
      })),
      preparationMaterialDigest: vi.fn(async () => 'material:1'),
      preparePreparedAction: vi.fn(async () => ({
        kind: 'prepared' as const,
        preparedAction: prepared,
      })),
    }

    const result = await runPreparationEgress(aggregate, readyPreparation, {
      principalId: 'principal:1',
      commandKey: 'egress:1',
      commandDigest: 'digest:egress:1',
    }, ports)

    expect(ports.runEgress).toHaveBeenCalledOnce()
    expect(ports.preparePreparedAction).toHaveBeenCalledOnce()
    expect(result).toMatchObject({
      kind: 'request',
      state: 'options_ready',
      preparedAction: { businessName: 'AccessRide' },
    })
  })

  it('resumes egress and projects in-flight states without preparing', async () => {
    const ports: Pick<PreparationEgressPorts, 'resumeEgress' | 'preparationMaterialDigest' | 'preparePreparedAction'> = {
      resumeEgress: vi.fn(async () => ({
        kind: 'completed' as const,
        states: [{ operationRef: 'op:1', state: 'in_flight' as const }],
      })),
      preparationMaterialDigest: vi.fn(),
      preparePreparedAction: vi.fn(),
    }

    const result = await resumePreparationEgress(aggregate, readyPreparation, ports)
    expect(result).toMatchObject({ state: 'preparing_options', nextAction: 'wait' })
    expect(ports.preparationMaterialDigest).not.toHaveBeenCalled()
    expect(ports.preparePreparedAction).not.toHaveBeenCalled()
  })

  it('maps not_prepared recovery reasons through resolvePreparedAction', async () => {
    const ports: Pick<PreparationEgressPorts, 'preparationMaterialDigest' | 'preparePreparedAction'> = {
      preparationMaterialDigest: vi.fn(async () => 'material:1'),
      preparePreparedAction: vi.fn(async () => ({
        kind: 'not_prepared' as const,
        reason: 'provider_assertion_expired' as const,
        recoveryRef: 'recovery:1',
      })),
    }
    const result = await resolvePreparedAction(aggregate, readyPreparation, ports)
    expect(result).toMatchObject({
      kind: 'request',
      state: 'needs_attention',
      nextAction: 'revise_request',
      summary: expect.stringContaining('expired'),
    })
  })

  it('blocks on unresolved request egress recovery', async () => {
    const ports: Pick<PreparationEgressPorts, 'resumeRequestEgress'> = {
      resumeRequestEgress: vi.fn(async () => ({
        kind: 'completed' as const,
        states: [{
          operationRef: 'op:1',
          requestRevision: 2,
          state: 'released' as const,
        }],
      })),
    }
    const result = await recoverUnresolvedEgress(aggregate, ports)
    expect(result).toMatchObject({
      state: 'needs_attention',
      nextAction: 'revise_request',
      summary: expect.stringContaining('earlier business contact'),
    })
  })

  it('returns undefined when request egress recovery is clear', async () => {
    const ports: Pick<PreparationEgressPorts, 'resumeRequestEgress'> = {
      resumeRequestEgress: vi.fn(async () => ({
        kind: 'completed' as const,
        states: [{
          operationRef: 'op:1',
          requestRevision: 3,
          state: 'released' as const,
        }],
      })),
    }
    await expect(recoverUnresolvedEgress(aggregate, ports)).resolves.toBeUndefined()
  })
})
