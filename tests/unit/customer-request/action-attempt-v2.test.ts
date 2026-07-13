import { describe, expect, it } from 'vitest'

import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  actionAttemptV2Digest,
  admitActionAttemptV2,
  approvalGrantV2Digest,
  type ApprovalGrantV2,
} from '@/modules/customer-request/public'

describe('V2 Action Attempt admission', () => {
  it('derives one exact immutable admission bundle from the Approval Grant', () => {
    const approvalGrant = exactApprovalGrant()

    const result = admitActionAttemptV2({
      approvalGrant,
      admissionKey: 'request:one:admit:one',
      admittedAt: 2_000,
      currentAuthorityBudget: null,
    })

    expect(result).toMatchObject({
      kind: 'admitted',
      bundle: {
        consumption: {
          approvalGrantRef: approvalGrant.approvalGrantRef,
          approvalGrantDigest: approvalGrant.approvalGrantDigest,
        },
        attempt: {
          format: 'ae.action-attempt:v2', state: 'admitted',
          approvalGrantRef: approvalGrant.approvalGrantRef,
          lineage: approvalGrant.lineage,
          authorityLineageDigest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
          maximumSpend: { currency: 'AUD', amountMinor: 1_100 },
          recovery: { unknownOutcome: 'reconcile_only', automaticRetry: false },
        },
        spendReservation: { currency: 'AUD', amountMinor: 1_100, state: 'reserved' },
        authorityBudget: {
          format: 'ae.action-authority-budget:v2', state: 'exhausted',
          maximumSpendMinor: 1_100, reservedSpendMinor: 1_100,
          maximumExposureCount: 2, reservedExposureCount: 2,
        },
        dataReservation: {
          state: 'reserved', declarationCount: 1, exposureCount: 2,
          reservedExposureBefore: 0, reservedExposureAfter: 2,
        },
        providerReleaseGrant: {
          format: 'ae.provider-release-grant:v2', state: 'unreleased',
          businessId: 'business:one', offeringId: 'offering:one', bindingId: 'binding:one',
        },
        disclosureGrant: {
          format: 'ae.disclosure-grant:v2', state: 'unreleased',
          bindingId: 'binding:one', scope: approvalGrant.dataScope.filter(({ phase }) => phase === 'execution'),
        },
      },
    })
    if (result.kind !== 'admitted') throw new Error('expected admitted bundle')
    expect(actionAttemptV2Digest(result.bundle.attempt)).toBe(result.bundle.attempt.actionAttemptDigest)
    expect(new Set([
      result.bundle.consumption.authorityLineageDigest,
      result.bundle.attempt.authorityLineageDigest,
      result.bundle.spendReservation.authorityLineageDigest,
      result.bundle.dataReservation.authorityLineageDigest,
      result.bundle.providerReleaseGrant.authorityLineageDigest,
      result.bundle.disclosureGrant.authorityLineageDigest,
    ]).size).toBe(1)
    for (const record of [
      result.bundle.consumption,
      result.bundle.idempotencyClaim,
      result.bundle.spendReservation,
      result.bundle.dataReservation,
      result.bundle.providerReleaseGrant,
      result.bundle.disclosureGrant,
    ]) {
      expect(record).not.toHaveProperty('authority')
      expect(record).toMatchObject({
        approvalGrantRef: approvalGrant.approvalGrantRef,
        approvalGrantDigest: approvalGrant.approvalGrantDigest,
      })
    }
    expect(result.bundle.attempt.authority).toEqual(approvalGrant)
    expect(result.bundle.spendReservation).toMatchObject({
      reservedBeforeMinor: 0, reservedAfterMinor: 1_100,
      authorityBudgetRef: result.bundle.authorityBudget.authorityBudgetRef,
    })
    expect(digestWithout(result.bundle.consumption, 'consumptionDigest'))
      .toBe(result.bundle.consumption.consumptionDigest)
    expect(digestWithout(result.bundle.idempotencyClaim, 'idempotencyClaimDigest'))
      .toBe(result.bundle.idempotencyClaim.idempotencyClaimDigest)
    expect(digestWithout(result.bundle.spendReservation, 'spendReservationDigest'))
      .toBe(result.bundle.spendReservation.spendReservationDigest)
    expect(digestWithout(result.bundle.dataReservation, 'dataReservationDigest'))
      .toBe(result.bundle.dataReservation.dataReservationDigest)
    expect(digestWithout(result.bundle.providerReleaseGrant, 'providerReleaseGrantDigest'))
      .toBe(result.bundle.providerReleaseGrant.providerReleaseGrantDigest)
    expect(digestWithout(result.bundle.disclosureGrant, 'disclosureGrantDigest'))
      .toBe(result.bundle.disclosureGrant.disclosureGrantDigest)
    expect(digestWithout(result.bundle.authorityBudget, 'authorityBudgetDigest'))
      .toBe(result.bundle.authorityBudget.authorityBudgetDigest)
    expect(Object.isFrozen(result.bundle)).toBe(true)
  })

  it('refuses cumulative spend or disclosure exposure oversubscription', () => {
    const approvalGrant = exactApprovalGrant()
    const first = admitActionAttemptV2({
      approvalGrant, admissionKey: 'request:one:admit:first', admittedAt: 2_000,
      currentAuthorityBudget: null,
    })
    if (first.kind !== 'admitted') throw new Error('expected first admission')
    expect(admitActionAttemptV2({
      approvalGrant, admissionKey: 'request:one:admit:second', admittedAt: 2_001,
      currentAuthorityBudget: first.bundle.authorityBudget,
    })).toEqual({ kind: 'refused', reason: 'cumulative_authority_exhausted' })
    expect(admitActionAttemptV2({
      approvalGrant, admissionKey: 'request:one:admit:changed', admittedAt: 2_001,
      currentAuthorityBudget: {
        ...first.bundle.authorityBudget,
        currency: 'USD',
      },
    })).toEqual({ kind: 'refused', reason: 'cumulative_authority_changed' })
  })

  it('refuses expired or structurally invalid Approval Grants', () => {
    const approvalGrant = exactApprovalGrant()
    expect(admitActionAttemptV2({
      approvalGrant, admissionKey: 'request:one:admit:expired', admittedAt: approvalGrant.expiresAt,
      currentAuthorityBudget: null,
    })).toEqual({ kind: 'refused', reason: 'approval_grant_expired' })
    expect(admitActionAttemptV2({
      approvalGrant: { ...approvalGrant, approvalGrantDigest: digest('forged') },
      admissionKey: 'request:one:admit:forged', admittedAt: 2_000, currentAuthorityBudget: null,
    })).toEqual({ kind: 'refused', reason: 'approval_grant_invalid' })
  })
})

function exactApprovalGrant(): ApprovalGrantV2 {
  const dataScope: ApprovalGrantV2['dataScope'] = [{
    effectId: 'release:one', inputPointer: '/customerReference', classification: 'personal',
    phase: 'execution', recipient: { kind: 'selected_binding' },
    purposes: ['complete_request', 'provide_evidence'],
  }, {
    effectId: 'prepare:one', inputPointer: '/searchArea', classification: 'public',
    phase: 'preparation', recipient: { kind: 'candidate_binding' }, purposes: ['compare_options'],
  }]
  const effectScope: ApprovalGrantV2['effectScope'] = [{
    effectId: 'release:one', class: 'data_release', authority: 'mandate_or_explicit', reversibility: 'irreversible',
  }, {
    effectId: 'prepare:one', class: 'data_release', authority: 'mandate_or_explicit', reversibility: 'irreversible',
  }]
  const evidenceScope: ApprovalGrantV2['evidenceScope'] = [{
    evidenceId: 'completion:one', outputPointer: '/result', purpose: 'completion',
    schemaIdentity: digest('schema'), valueDigest: digest('value'),
  }]
  const registeredLifecycle = { idempotency: 'required' as const, recovery: 'reconcile_required' as const }
  const material: Omit<ApprovalGrantV2, 'approvalGrantDigest'> = {
    format: 'ae.approval-grant:v2', approvalGrantRef: 'approval-grant:v2:one',
    preparedAction: { preparedActionRef: 'prepared-action:v2:one', preparedActionDigest: digest('prepared') },
    lineage: {
      requestId: 'request:one', requestRevision: 1, principalId: 'principal:one', delegatedAgentId: 'agent:one',
      planRevisionId: 'plan:one', planDigest: digest('plan'), actionId: 'action:one',
      contractRef: { capabilityId: 'capability.one', version: 1, contractDigest: digest('contract') },
      selectionKey: 'selection:one', semanticDigest: digest('semantic'),
    },
    capability: {
      contractRef: { capabilityId: 'capability.one', version: 1, contractDigest: digest('contract') },
      selectionKey: 'selection:one', semanticDigest: digest('semantic'),
    },
    supply: {
      businessId: 'business:one',
      offering: {
        offeringId: 'offering:one', registrationHash: digest('offering'),
        registrationEvidenceRefs: ['offering:evidence'], evidenceDigest: canonicalDigest(['offering:evidence']),
      },
      binding: {
        bindingId: 'binding:one', registrationHash: digest('binding'),
        registrationEvidenceRefs: ['binding:evidence'], evidenceDigest: canonicalDigest(['binding:evidence']),
      },
    },
    providerAssertion: {
      assertionRef: 'assertion:one', operationRef: 'operation:one', assertedAt: 1_000, validUntil: 9_000,
      responseDigest: digest('response'), outputDigest: digest('output'), evidenceDigest: digest('evidence'),
    },
    spend: { currency: 'AUD', maximumAmountMinor: 1_100 },
    disclosure: {
      reviewRef: `action-preparation-review:${digest('review')}`,
      reviewDigest: digest('review'), authorityScopeDigest: digest('authority'),
    },
    dataScope, effectScope, evidenceScope,
    scopeDigest: canonicalDigest({ dataScope, effectScope, evidenceScope, registeredLifecycle }),
    recovery: {
      unknownOutcome: 'reconcile_only', automaticRetry: false,
      registeredLifecycle,
    },
    actor: {
      kind: 'clerk_owner', principalId: 'principal:one', ownerId: 'owner:one',
      credentialId: 'credential:one', authenticationEvidenceRef: 'identity:evidence:one',
    },
    issuedAt: 1_500, expiresAt: 8_000,
  }
  const grant = { ...material, approvalGrantDigest: '' } as ApprovalGrantV2
  return { ...material, approvalGrantDigest: approvalGrantV2Digest(grant) }
}

function digest(value: string): string {
  return canonicalDigest(value)
}

function digestWithout<T extends object, K extends keyof T>(value: T, key: K): string {
  const material = Object.fromEntries(Object.entries(value).filter(([candidate]) => candidate !== key))
  return canonicalDigest(material)
}
