import { describe, expect, it } from 'vitest'

import {
  defineCapabilityContract,
  openCapabilityDecisionModel,
  type CapabilityContract,
} from '@/modules/capability-contract/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  issueApprovalGrantV2,
  preparedActionV2Digest,
  type ActionPreparationLineage,
  type PreparedActionV2,
} from '@/modules/customer-request/public'
import { SANDBOX_V2_CAPABILITY_CONTRACT_DOCUMENT } from '@/modules/sandbox-supply/public'

describe('V2 Approval Grant issuance', () => {
  it('derives exact immutable authority from one Prepared Action and registered contract', () => {
    const contract = defineCapabilityContract(SANDBOX_V2_CAPABILITY_CONTRACT_DOCUMENT)
    const preparedAction = exactPreparedAction(contract)

    const result = issueApprovalGrantV2({
      preparedAction,
      contract,
      preparation: {
        reviewRef: `action-preparation-review:${digest('review')}`,
        reviewDigest: digest('review'),
        authorityScopeDigest: preparedAction.disclosure.authorityScopeDigest,
      },
      actor: {
        kind: 'clerk_owner',
        requestPrincipalId: preparedAction.lineage.principalId,
        ownerId: 'user_owner',
        credentialId: 'clerk:credential:one',
        authenticationEvidenceRef: 'clerk-identity:evidence:one',
      },
      maximumSpendMinor: 1_100,
      expiresAt: 50_000,
      now: 2_000,
    })

    expect(result).toMatchObject({
      kind: 'issued',
      approvalGrant: {
        format: 'ae.approval-grant:v2',
        preparedAction: {
          preparedActionRef: preparedAction.preparedActionRef,
          preparedActionDigest: preparedAction.preparedActionDigest,
        },
        lineage: preparedAction.lineage,
        capability: {
          contractRef: contract.ref,
          selectionKey: preparedAction.lineage.selectionKey,
          semanticDigest: preparedAction.lineage.semanticDigest,
        },
        supply: {
          businessId: 'business:one',
          offering: {
            offeringId: 'offering:one', registrationHash: digest('offering'),
            registrationEvidenceRefs: ['registration:offering:one'],
          },
          binding: {
            bindingId: 'binding:one', registrationHash: digest('binding'),
            registrationEvidenceRefs: ['registration:binding:one'],
          },
        },
        providerAssertion: {
          assertionRef: 'provider-assertion:one', operationRef: 'preparation-egress:one',
          responseDigest: digest('response'),
          outputDigest: canonicalDigest({ optionSummary: 'Provider-confirmed sandbox option' }),
        },
        spend: { currency: 'AUD', maximumAmountMinor: 1_100 },
        disclosure: {
          reviewRef: `action-preparation-review:${digest('review')}`, reviewDigest: digest('review'),
          authorityScopeDigest: preparedAction.disclosure.authorityScopeDigest,
        },
        recovery: {
          unknownOutcome: 'reconcile_only', automaticRetry: false,
          registeredLifecycle: contract.lifecycle,
        },
        actor: {
          kind: 'clerk_owner', principalId: preparedAction.lineage.principalId,
          ownerId: 'user_owner', credentialId: 'clerk:credential:one',
          authenticationEvidenceRef: 'clerk-identity:evidence:one',
        },
        issuedAt: 2_000,
        expiresAt: 50_000,
      },
    })
    if (result.kind !== 'issued') throw new Error('expected issued Approval Grant')
    expect(result.approvalGrant.approvalGrantRef).toMatch(/^approval-grant:v2:/)
    expect(result.approvalGrant.approvalGrantDigest).toMatch(/^sha256:[0-9a-f]{64}$/)
    expect(result.approvalGrant.dataScope).toEqual(contract.dataUse)
    expect(result.approvalGrant.effectScope).toEqual(contract.effects)
    expect(result.approvalGrant.evidenceScope.map(({ evidenceId, valueDigest }) => ({ evidenceId, valueDigest })))
      .toEqual([{
        evidenceId: 'option_summary', valueDigest: canonicalDigest('Provider-confirmed sandbox option'),
      }])
    expect(Object.isFrozen(result.approvalGrant)).toBe(true)
  })

  it('refuses a disclosure review reference that is not bound to its exact digest', () => {
    const contract = defineCapabilityContract(SANDBOX_V2_CAPABILITY_CONTRACT_DOCUMENT)
    const preparedAction = exactPreparedAction(contract)

    expect(issueApprovalGrantV2({
      preparedAction,
      contract,
      preparation: {
        reviewRef: 'action-preparation-review:forged',
        reviewDigest: digest('forged-review'),
        authorityScopeDigest: preparedAction.disclosure.authorityScopeDigest,
      },
      actor: {
        kind: 'clerk_owner', requestPrincipalId: preparedAction.lineage.principalId,
        ownerId: 'user_owner', credentialId: 'clerk:credential:one',
        authenticationEvidenceRef: 'clerk-identity:evidence:one',
      },
      maximumSpendMinor: 1_100, expiresAt: 50_000, now: 2_000,
    })).toEqual({ kind: 'refused', reason: 'capability_authority_changed' })
  })

  it('refuses recomputed Prepared Action material whose provider output digest is false', () => {
    const contract = defineCapabilityContract(SANDBOX_V2_CAPABILITY_CONTRACT_DOCUMENT)
    const original = exactPreparedAction(contract)
    const changedMaterial = {
      ...original,
      providerAssertion: {
        ...original.providerAssertion,
        output: { optionSummary: 'Material changed after preparation' },
      },
    }
    const changed = {
      ...changedMaterial,
      preparedActionDigest: preparedActionV2Digest(changedMaterial),
    }

    expect(issueApprovalGrantV2({
      preparedAction: changed,
      contract,
      preparation: {
        reviewRef: `action-preparation-review:${digest('review')}`,
        reviewDigest: digest('review'),
        authorityScopeDigest: changed.disclosure.authorityScopeDigest,
      },
      actor: {
        kind: 'clerk_owner', requestPrincipalId: changed.lineage.principalId,
        ownerId: 'user_owner', credentialId: 'clerk:credential:one',
        authenticationEvidenceRef: 'clerk-identity:evidence:one',
      },
      maximumSpendMinor: 1_100, expiresAt: 50_000, now: 2_000,
    })).toEqual({ kind: 'refused', reason: 'approval_material_invalid' })
  })

  it('issues from exact present evidence when optional recovery evidence is absent', () => {
    const contract = defineCapabilityContract({
      ...SANDBOX_V2_CAPABILITY_CONTRACT_DOCUMENT,
      outputSchema: {
        ...SANDBOX_V2_CAPABILITY_CONTRACT_DOCUMENT.outputSchema,
        properties: {
          ...SANDBOX_V2_CAPABILITY_CONTRACT_DOCUMENT.outputSchema.properties,
          recoveryNote: { type: 'string' },
        },
      },
      customerAnnotations: [
        ...SANDBOX_V2_CAPABILITY_CONTRACT_DOCUMENT.customerAnnotations,
        {
          annotationId: 'recovery_note', document: 'output', pointer: '/recoveryNote',
          label: 'Recovery note', role: 'recovery',
        },
      ],
      evidence: [
        ...SANDBOX_V2_CAPABILITY_CONTRACT_DOCUMENT.evidence,
        { evidenceId: 'recovery_note', outputPointer: '/recoveryNote', purpose: 'recovery' },
      ],
    })
    const preparedAction = exactPreparedAction(contract)

    const result = issueApprovalGrantV2(approvalInput(contract, preparedAction))

    expect(result).toMatchObject({ kind: 'issued' })
    if (result.kind !== 'issued') throw new Error('expected issued Approval Grant')
    expect(result.approvalGrant.evidenceScope.map(({ evidenceId }) => evidenceId)).toEqual(['option_summary'])
  })

  it('cannot widen spend or expiry, approve expired material, or change the owner principal', () => {
    const contract = defineCapabilityContract(SANDBOX_V2_CAPABILITY_CONTRACT_DOCUMENT)
    const preparedAction = exactPreparedAction(contract)
    const base = approvalInput(contract, preparedAction)

    expect(issueApprovalGrantV2({ ...base, maximumSpendMinor: 1_201 }))
      .toEqual({ kind: 'refused', reason: 'spend_scope_invalid' })
    expect(issueApprovalGrantV2({ ...base, maximumSpendMinor: 899 }))
      .toEqual({ kind: 'refused', reason: 'spend_scope_invalid' })
    expect(issueApprovalGrantV2({ ...base, expiresAt: 60_001 }))
      .toEqual({ kind: 'refused', reason: 'expiry_scope_invalid' })
    expect(issueApprovalGrantV2({ ...base, now: 60_000, expiresAt: 60_001 }))
      .toEqual({ kind: 'refused', reason: 'prepared_action_expired' })
    expect(issueApprovalGrantV2({
      ...base,
      actor: { ...base.actor, requestPrincipalId: 'principal:someone-else' },
    })).toEqual({ kind: 'refused', reason: 'capability_authority_changed' })
    expect(issueApprovalGrantV2({
      ...base,
      preparedAction: { ...preparedAction, preparedActionDigest: digest('false-action-digest') },
    })).toEqual({ kind: 'refused', reason: 'approval_material_invalid' })
  })
})

function exactPreparedAction(contract: CapabilityContract): PreparedActionV2 {
  const model = openCapabilityDecisionModel(contract)
  const lineage: ActionPreparationLineage = {
    requestId: 'request:one', requestRevision: 1, principalId: 'principal:one', delegatedAgentId: 'agent:one',
    planRevisionId: 'plan:one', planDigest: digest('plan'), actionId: 'action:one',
    contractRef: contract.ref, selectionKey: model.selectionKey, semanticDigest: model.semanticDigest,
  }
  const material: Omit<PreparedActionV2, 'preparedActionDigest'> = {
    format: 'ae.prepared-action:v2', preparedActionRef: 'prepared-action:v2:one', lineage,
    business: { businessId: 'business:one', name: 'Business One' },
    offering: {
      offeringId: 'offering:one', registrationHash: digest('offering'),
      registrationEvidenceRefs: ['registration:offering:one'], label: 'Registered option', summary: 'One option.',
    },
    binding: {
      bindingId: 'binding:one', registrationHash: digest('binding'),
      registrationEvidenceRefs: ['registration:binding:one'],
    },
    providerAssertion: {
      assertionRef: 'provider-assertion:one', operationRef: 'preparation-egress:one',
      assertedAt: 1_000, validUntil: 60_000, responseDigest: digest('response'),
      outputDigest: canonicalDigest({ optionSummary: 'Provider-confirmed sandbox option' }),
      output: { optionSummary: 'Provider-confirmed sandbox option' },
      evidence: [{
        evidenceId: 'option_summary', outputPointer: '/optionSummary', purpose: 'completion',
        schemaIdentity: model.evidence[0]?.schemaIdentity ?? '',
        valueDigest: canonicalDigest('Provider-confirmed sandbox option'),
      }],
    },
    price: {
      currency: 'AUD', minimumAmountMinor: 900, maximumAmountMinor: 1_200,
      components: [{
        kind: 'registered_offering', label: 'Registered option',
        minimumAmountMinor: 900, maximumAmountMinor: 1_200, evidenceRefs: ['registration:offering:one'],
      }],
    },
    materialTerms: [{ termId: 'term:one', label: 'Scope', value: 'One operation' }],
    commercialRelationship: {
      kind: 'none', summary: 'No commercial influence.', influencesEligibility: false,
      influencesInclusion: false, influencesOrder: false, evidenceRefs: ['relationship:none:one'],
    },
    cancellation: { kind: 'unsupported', evidenceRefs: ['cancellation:unsupported:one'] },
    disclosure: {
      authorityReference: 'preparation-authority:one', authorityScopeDigest: digest('authority-scope'),
      operationRef: 'preparation-egress:one', releaseEvidenceRef: 'provider-response:one',
      allocationRefs: ['allocation:one'],
    },
    comparison: { kind: 'single_option', candidateCount: 1, selectedAssertionRef: 'provider-assertion:one' },
    alternatives: [], fallbacks: [], preparedAt: 1_500, expiresAt: 60_000,
  }
  const preparedAction = { ...material, preparedActionDigest: '' } as PreparedActionV2
  return { ...material, preparedActionDigest: preparedActionV2Digest(preparedAction) }
}

function digest(value: string): string {
  return canonicalDigest(value)
}

function approvalInput(contract: CapabilityContract, preparedAction: PreparedActionV2) {
  return {
    preparedAction,
    contract,
    preparation: {
      reviewRef: `action-preparation-review:${digest('review')}`,
      reviewDigest: digest('review'),
      authorityScopeDigest: preparedAction.disclosure.authorityScopeDigest,
    },
    actor: {
      kind: 'clerk_owner' as const,
      requestPrincipalId: preparedAction.lineage.principalId,
      ownerId: 'user_owner',
      credentialId: 'clerk:credential:one',
      authenticationEvidenceRef: 'clerk-identity:evidence:one',
    },
    maximumSpendMinor: 1_100,
    expiresAt: 50_000,
    now: 2_000,
  }
}
