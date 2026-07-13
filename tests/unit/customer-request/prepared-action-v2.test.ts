import { describe, expect, it } from 'vitest'

import { defineCapabilityContract, openCapabilityDecisionModel } from '@/modules/capability-contract/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  compilePreparedActionOptions,
  type ActionPreparationLineage,
  type PreparedActionOptionCandidate,
} from '@/modules/customer-request/public'
import { SANDBOX_V2_CAPABILITY_CONTRACT_DOCUMENT } from '@/modules/sandbox-supply/public'

describe('V2 Prepared Action compilation', () => {
  it('compiles one exact validated provider option without inventing commercial material', () => {
    const model = openCapabilityDecisionModel(defineCapabilityContract(SANDBOX_V2_CAPABILITY_CONTRACT_DOCUMENT))
    const lineage = actionLineage(model)
    const response = {
      format: 'ae.provider-option:v1',
      operationRef: 'preparation-egress:one',
      contractRef: model.contractRef,
      offeringId: 'offering:one',
      bindingId: 'binding:one',
      assertionRef: 'provider-assertion:one',
      assertedAt: 1_000,
      validUntil: 61_000,
      output: { optionSummary: 'Provider-confirmed sandbox option' },
    } as const
    const responseBodyText = JSON.stringify(response)
    const candidate: PreparedActionOptionCandidate = {
      operation: {
        operationRef: response.operationRef,
        state: 'released',
        lineage,
        authorityReference: 'authority:one',
        authorityScopeDigest: 'sha256:' + 'a'.repeat(64),
        responseStatus: 200,
        responseContentType: 'application/json',
        responseBodyText,
        responseBodyDigest: canonicalDigest(responseBodyText),
        releaseEvidenceRef: 'provider-response:one',
      },
      model,
      business: { businessId: 'business:one', name: 'Business One' },
      offering: {
        offeringId: response.offeringId,
        registrationHash: 'sha256:' + 'b'.repeat(64),
        registrationEvidenceRefs: ['registration:offering:one'],
        presentation: {
          label: 'Reference lookup',
          summary: 'Returns one registered reference result.',
          price: { kind: 'fixed', currency: 'AUD', amountMinor: 125 },
          materialTerms: [{ termId: 'term:scope', label: 'Scope', value: 'One lookup' }],
          commercialRelationship: {
            kind: 'none', summary: 'No commercial relationship.',
            influencesEligibility: false, influencesInclusion: false, influencesOrder: false,
            evidenceRefs: ['relationship:none:one'],
          },
        },
      },
      binding: {
        bindingId: response.bindingId,
        registrationHash: 'sha256:' + 'c'.repeat(64),
        registrationEvidenceRefs: ['registration:binding:one'],
        cancellation: { kind: 'unsupported', evidenceRefs: ['cancellation:unsupported:one'] },
      },
      disclosure: {
        outcome: 'released',
        allocationRefs: ['preparation-disclosure:one'],
      },
    }

    const result = compilePreparedActionOptions({
      lineage,
      candidates: [candidate],
      selection: { kind: 'single_option' },
      now: 2_000,
    })

    expect(result).toMatchObject({
      kind: 'prepared',
      preparedAction: {
        format: 'ae.prepared-action:v2',
        lineage,
        business: { businessId: 'business:one', name: 'Business One' },
        offering: {
          offeringId: 'offering:one', registrationHash: candidate.offering.registrationHash,
          registrationEvidenceRefs: ['registration:offering:one'],
        },
        binding: {
          bindingId: 'binding:one', registrationHash: candidate.binding.registrationHash,
          registrationEvidenceRefs: ['registration:binding:one'],
        },
        providerAssertion: {
          assertionRef: 'provider-assertion:one', operationRef: 'preparation-egress:one',
          assertedAt: 1_000, validUntil: 61_000,
          responseDigest: candidate.operation.responseBodyDigest,
          outputDigest: canonicalDigest(response.output),
          evidence: [{
            evidenceId: 'option_summary', outputPointer: '/optionSummary', purpose: 'completion',
            valueDigest: canonicalDigest('Provider-confirmed sandbox option'),
          }],
        },
        price: {
          currency: 'AUD', minimumAmountMinor: 125, maximumAmountMinor: 125,
          components: [{
            kind: 'registered_offering', label: 'Reference lookup',
            minimumAmountMinor: 125, maximumAmountMinor: 125,
            evidenceRefs: ['registration:offering:one'],
          }],
        },
        materialTerms: [{ termId: 'term:scope', label: 'Scope', value: 'One lookup' }],
        cancellation: { kind: 'unsupported', evidenceRefs: ['cancellation:unsupported:one'] },
        disclosure: {
          authorityReference: 'authority:one', authorityScopeDigest: candidate.operation.authorityScopeDigest,
          operationRef: 'preparation-egress:one', releaseEvidenceRef: 'provider-response:one',
          allocationRefs: ['preparation-disclosure:one'],
        },
        comparison: { kind: 'single_option', candidateCount: 1, selectedAssertionRef: 'provider-assertion:one' },
        alternatives: [],
        fallbacks: [],
        expiresAt: 61_000,
      },
    })
    if (result.kind !== 'prepared') throw new Error('expected prepared action')
    expect(result.preparedAction.preparedActionRef).toMatch(/^prepared-action:v2:/)
    expect(result.preparedAction.preparedActionDigest).toMatch(/^sha256:[0-9a-f]{64}$/)
  })

  it('selects the lowest registered maximum only from comparable uninfluenced options', () => {
    const model = openCapabilityDecisionModel(defineCapabilityContract(SANDBOX_V2_CAPABILITY_CONTRACT_DOCUMENT))
    const lineage = actionLineage(model)
    const first = optionCandidate({ model, lineage, suffix: 'one', amountMinor: 1_200 })
    const second = optionCandidate({ model, lineage, suffix: 'two', amountMinor: 900 })

    const result = compilePreparedActionOptions({
      lineage,
      candidates: [first, second],
      selection: {
        kind: 'lowest_maximum_price',
        basis: 'customer_request',
        evidenceRef: 'request-preference:lowest-price',
      },
      now: 2_000,
    })

    expect(result).toMatchObject({
      kind: 'prepared',
      preparedAction: {
        business: { businessId: 'business:two', name: 'Business Two' },
        providerAssertion: { assertionRef: 'provider-assertion:two' },
        price: { currency: 'AUD', maximumAmountMinor: 900 },
        comparison: {
          kind: 'lowest_maximum_price',
          candidateCount: 2,
          selectedAssertionRef: 'provider-assertion:two',
          evidenceRef: 'request-preference:lowest-price',
          commercialInfluence: 'none',
          comparedAssertionRefs: ['provider-assertion:one', 'provider-assertion:two'],
        },
        alternatives: [{
          assertionRef: 'provider-assertion:one',
          business: { businessId: 'business:one', name: 'Business One' },
          offeringId: 'offering:one', bindingId: 'binding:one',
          price: { currency: 'AUD', maximumAmountMinor: 1_200 },
          expiresAt: 61_000,
        }],
        fallbacks: [],
      },
    })
  })

  it('refuses price selection when commercial influence affects ordering', () => {
    const model = openCapabilityDecisionModel(defineCapabilityContract(SANDBOX_V2_CAPABILITY_CONTRACT_DOCUMENT))
    const lineage = actionLineage(model)
    const first = optionCandidate({ model, lineage, suffix: 'one', amountMinor: 1_200 })
    const second = optionCandidate({ model, lineage, suffix: 'two', amountMinor: 900 })
    const influenced: PreparedActionOptionCandidate = {
      ...second,
      offering: {
        ...second.offering,
        presentation: {
          ...second.offering.presentation,
          commercialRelationship: {
            ...second.offering.presentation.commercialRelationship,
            kind: 'affiliate', summary: 'The relationship influences ordering.', influencesOrder: true,
          },
        },
      },
    }

    expect(compilePreparedActionOptions({
      lineage, candidates: [first, influenced],
      selection: {
        kind: 'lowest_maximum_price', basis: 'customer_request', evidenceRef: 'request:lowest-price',
      },
      now: 2_000,
    })).toEqual({ kind: 'not_prepared', reason: 'commercial_influence_blocks_selection' })
  })

  it('persists no recommendation when registered prices are not comparable', () => {
    const model = openCapabilityDecisionModel(defineCapabilityContract(SANDBOX_V2_CAPABILITY_CONTRACT_DOCUMENT))
    const lineage = actionLineage(model)
    const first = optionCandidate({ model, lineage, suffix: 'one', amountMinor: 1_200 })
    const second = optionCandidate({ model, lineage, suffix: 'two', amountMinor: 900 })
    const differentCurrency: PreparedActionOptionCandidate = {
      ...second,
      offering: {
        ...second.offering,
        presentation: {
          ...second.offering.presentation,
          price: { kind: 'fixed', currency: 'USD', amountMinor: 900 },
        },
      },
    }

    expect(compilePreparedActionOptions({
      lineage, candidates: [first, differentCurrency],
      selection: {
        kind: 'lowest_maximum_price', basis: 'customer_request', evidenceRef: 'request:lowest-price',
      },
      now: 2_000,
    })).toEqual({ kind: 'not_prepared', reason: 'comparison_unavailable' })
  })

  it('keeps an unavailable registered business as an evidenced fallback when one valid option remains', () => {
    const model = openCapabilityDecisionModel(defineCapabilityContract(SANDBOX_V2_CAPABILITY_CONTRACT_DOCUMENT))
    const lineage = actionLineage(model)
    const available = optionCandidate({ model, lineage, suffix: 'one', amountMinor: 900 })
    const unavailableBase = optionCandidate({ model, lineage, suffix: 'two', amountMinor: 800 })
    const unavailable: PreparedActionOptionCandidate = {
      ...unavailableBase,
      operation: { ...unavailableBase.operation, state: 'not_released' },
      disclosure: { ...unavailableBase.disclosure, outcome: 'not_released' },
    }

    expect(compilePreparedActionOptions({
      lineage, candidates: [available, unavailable],
      selection: {
        kind: 'lowest_maximum_price', basis: 'customer_request', evidenceRef: 'request-preference:lowest-price',
      },
      now: 2_000,
    })).toMatchObject({
      kind: 'prepared',
      preparedAction: {
        business: { businessId: 'business:one' },
        fallbacks: [{
          operationRef: 'preparation-egress:two', reason: 'disclosure_not_released',
          disclosureOutcome: 'not_released', offeringId: 'offering:two', bindingId: 'binding:two',
        }],
      },
    })
  })

  it('does not select around commercial influence hidden in an unavailable candidate', () => {
    const model = openCapabilityDecisionModel(defineCapabilityContract(SANDBOX_V2_CAPABILITY_CONTRACT_DOCUMENT))
    const lineage = actionLineage(model)
    const available = optionCandidate({ model, lineage, suffix: 'one', amountMinor: 900 })
    const influencedBase = optionCandidate({ model, lineage, suffix: 'two', amountMinor: 800 })
    const influenced: PreparedActionOptionCandidate = {
      ...influencedBase,
      operation: { ...influencedBase.operation, state: 'not_released' },
      disclosure: { ...influencedBase.disclosure, outcome: 'not_released' },
      offering: {
        ...influencedBase.offering,
        presentation: {
          ...influencedBase.offering.presentation,
          commercialRelationship: {
            ...influencedBase.offering.presentation.commercialRelationship,
            kind: 'affiliate', influencesInclusion: true,
          },
        },
      },
    }
    expect(compilePreparedActionOptions({
      lineage, candidates: [available, influenced],
      selection: {
        kind: 'lowest_maximum_price', basis: 'customer_request', evidenceRef: 'request-preference:lowest-price',
      },
      now: 2_000,
    })).toEqual({ kind: 'not_prepared', reason: 'commercial_influence_blocks_selection' })
  })

  it('blocks hidden commercial influence even when only one option is available', () => {
    const model = openCapabilityDecisionModel(defineCapabilityContract(SANDBOX_V2_CAPABILITY_CONTRACT_DOCUMENT))
    const lineage = actionLineage(model)
    const base = optionCandidate({ model, lineage, suffix: 'one', amountMinor: 900 })
    const influenced: PreparedActionOptionCandidate = {
      ...base,
      offering: {
        ...base.offering,
        presentation: {
          ...base.offering.presentation,
          commercialRelationship: {
            ...base.offering.presentation.commercialRelationship,
            kind: 'affiliate', influencesEligibility: true,
          },
        },
      },
    }
    expect(compilePreparedActionOptions({
      lineage, candidates: [influenced], selection: { kind: 'single_option' }, now: 2_000,
    })).toEqual({ kind: 'not_prepared', reason: 'commercial_influence_blocks_selection' })
  })

  it('returns typed recovery when the only provider option echoes a different binding', () => {
    const model = openCapabilityDecisionModel(defineCapabilityContract(SANDBOX_V2_CAPABILITY_CONTRACT_DOCUMENT))
    const lineage = actionLineage(model)
    const candidate = optionCandidate({ model, lineage, suffix: 'one', amountMinor: 900 })
    const envelope = JSON.parse(candidate.operation.responseBodyText ?? '{}') as Record<string, unknown>
    const responseBodyText = JSON.stringify({ ...envelope, bindingId: 'binding:different' })
    expect(compilePreparedActionOptions({
      lineage,
      candidates: [{
        ...candidate,
        operation: { ...candidate.operation, responseBodyText, responseBodyDigest: canonicalDigest(responseBodyText) },
      }],
      selection: { kind: 'single_option' },
      now: 2_000,
    })).toEqual({ kind: 'not_prepared', reason: 'provider_echo_mismatch' })
  })

  it('returns typed recovery before a valid prepared action can exceed the persistence byte budget', () => {
    const model = openCapabilityDecisionModel(defineCapabilityContract(SANDBOX_V2_CAPABILITY_CONTRACT_DOCUMENT))
    const lineage = actionLineage(model)
    const candidates = Array.from({ length: 64 }, (_, index) => {
      const candidate = optionCandidate({ model, lineage, suffix: `provider-${index}`, amountMinor: index + 1 })
      return { ...candidate, business: { ...candidate.business, name: 'x'.repeat(10_000) } }
    })
    expect(compilePreparedActionOptions({
      lineage, candidates,
      selection: {
        kind: 'lowest_maximum_price', basis: 'customer_request', evidenceRef: 'request-preference:lowest-price',
      },
      now: 2_000,
    })).toEqual({ kind: 'not_prepared', reason: 'prepared_action_too_large' })
  })
})

function actionLineage(model: ReturnType<typeof openCapabilityDecisionModel>): ActionPreparationLineage {
  return {
    requestId: 'request:one', requestRevision: 1, principalId: 'principal:one', delegatedAgentId: 'agent:one',
    planRevisionId: 'plan:one', planDigest: 'sha256:' + '1'.repeat(64), actionId: 'action:one',
    contractRef: model.contractRef, selectionKey: model.selectionKey, semanticDigest: model.semanticDigest,
  }
}

function optionCandidate(input: Readonly<{
  model: ReturnType<typeof openCapabilityDecisionModel>
  lineage: ActionPreparationLineage
  suffix: string
  amountMinor: number
}>): PreparedActionOptionCandidate {
  const response = {
    format: 'ae.provider-option:v1' as const,
    operationRef: `preparation-egress:${input.suffix}`,
    contractRef: input.model.contractRef,
    offeringId: `offering:${input.suffix}`,
    bindingId: `binding:${input.suffix}`,
    assertionRef: `provider-assertion:${input.suffix}`,
    assertedAt: 1_000,
    validUntil: 61_000,
    output: { optionSummary: `Provider-confirmed option ${input.suffix}` },
  }
  const responseBodyText = JSON.stringify(response)
  const title = input.suffix[0]?.toUpperCase() + input.suffix.slice(1)
  return {
    operation: {
      operationRef: response.operationRef, state: 'released', lineage: input.lineage,
      authorityReference: 'authority:comparison', authorityScopeDigest: 'sha256:' + 'd'.repeat(64),
      responseStatus: 200, responseContentType: 'application/json',
      responseBodyText, responseBodyDigest: canonicalDigest(responseBodyText),
      releaseEvidenceRef: `provider-response:${input.suffix}`,
    },
    model: input.model,
    business: { businessId: `business:${input.suffix}`, name: `Business ${title}` },
    offering: {
      offeringId: response.offeringId, registrationHash: 'sha256:' + (input.suffix === 'one' ? 'b' : 'e').repeat(64),
      registrationEvidenceRefs: [`registration:offering:${input.suffix}`],
      presentation: {
        label: `Reference lookup ${title}`, summary: `Returns option ${input.suffix}.`,
        price: { kind: 'fixed', currency: 'AUD', amountMinor: input.amountMinor },
        materialTerms: [{ termId: 'term:scope', label: 'Scope', value: 'One lookup' }],
        commercialRelationship: {
          kind: 'none', summary: 'No commercial relationship.', influencesEligibility: false,
          influencesInclusion: false, influencesOrder: false,
          evidenceRefs: [`relationship:none:${input.suffix}`],
        },
      },
    },
    binding: {
      bindingId: response.bindingId, registrationHash: 'sha256:' + (input.suffix === 'one' ? 'c' : 'f').repeat(64),
      registrationEvidenceRefs: [`registration:binding:${input.suffix}`],
      cancellation: { kind: 'unsupported', evidenceRefs: [`cancellation:unsupported:${input.suffix}`] },
    },
    disclosure: { outcome: 'released', allocationRefs: [`preparation-disclosure:${input.suffix}`] },
  }
}
