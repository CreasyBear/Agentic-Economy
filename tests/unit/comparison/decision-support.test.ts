import { describe, expect, it } from 'vitest'

import { validateOfferingComparisonEnvelope } from '@/modules/catalog/public'
import {
  buildComparisonBrief,
  compareOfferings,
  comparisonFactId,
  deriveRegisteredConstraintEligibility,
  projectPublicDecisionSourceResult,
  type OfferingComparisonEnvelope,
  type RegisteredConstraintEligibilityEvidence,
  type ResolvedComparisonSelection,
  type WebsiteDecisionConstraintId,
} from '@/modules/comparison/public'

const source = { kind: 'business_supplied' as const }
const pricePriority = ['professional_service:v1:lowest_total_price'] as const

describe('public decision support from exact comparison evidence', () => {
  it('changes posture for identical exact supply only when a confirmed constraint lacks material evidence', () => {
    const selections = [
      professional('one', knownPrice(100_000)),
      professional('two', knownPrice(200_000)),
    ]

    expect(evaluate({
      selections,
      constraints: [],
      proveChoice: true,
    }).outcome).toBe(
      'usable_comparison',
    )
    expect(evaluate({
      selections,
      constraints: ['website:v1:perth_local_preference'],
      proveChoice: true,
    }).outcome).toBe('insufficient_evidence')
  })

  it('keeps zero registered supply distinct from registered supply with no current exact resolution', () => {
    expect(evaluate({ selections: [], registeredSupplyCount: 0 }).outcome).toBe(
      'no_registered_supply',
    )
    expect(evaluate({ selections: [], registeredSupplyCount: 2 }).outcome).toBe(
      'no_current_match',
    )
  })

  it('reports one exact eligible option without promoting it to a comparison or best choice', () => {
    expect(evaluate({
      selections: [professional('one', knownPrice(100_000))],
      constraints: [],
      proveChoice: true,
    }).outcome).toBe('one_plausible_option')
  })

  it('uses typed registered eligibility to name a provably narrow preference', () => {
    const selections = [
      professional('one', knownPrice(100_000)),
      professional('two', knownPrice(200_000)),
    ]
    const comparison = compareOfferings({ selections, priorities: pricePriority })
    const constraintId = 'website:v1:perth_local_preference' as const
    const eligibility: RegisteredConstraintEligibilityEvidence = {
      schemaVersion: 'registered-constraint-eligibility:v1',
      categoryId: 'website:v1',
      registeredSupplyCount: 2,
      selections: selections.map((selection) => ({
        selection: selection.selection,
        websiteFunction: {
          choiceId: 'brochure_enquiries',
          disposition: {
            kind: 'satisfied',
            factId: comparisonFactId(
              selection.selection,
              'professional_service:v1:scope_basis',
            ),
          },
        },
        constraints: [{
          constraintId,
          disposition: {
            kind: 'excluded',
            factId: comparisonFactId(
              selection.selection,
              'professional_service:v1:service_area',
            ),
          },
        }],
      })),
    }

    expect(projectPublicDecisionSourceResult({
      requestedCategoryId: 'website:v1',
      confirmedChoiceId: 'brochure_enquiries',
      confirmedConstraintIds: [constraintId],
      resolution: resolved(selections),
      comparison,
      brief: buildComparisonBrief(comparison),
      eligibility,
    })).toMatchObject({
      outcome: 'constraints_too_narrow',
      relaxableConstraintId: constraintId,
    })
  })

  it('does not call exclusions narrow without a proven named relaxable preference', () => {
    const selections = [professional('one', knownPrice(100_000))]
    const comparison = compareOfferings({ selections, priorities: pricePriority })
    const constraintId = 'website:v1:simple' as const
    const eligibility: RegisteredConstraintEligibilityEvidence = {
      schemaVersion: 'registered-constraint-eligibility:v1',
      categoryId: 'website:v1',
      registeredSupplyCount: 1,
      selections: [{
        selection: selections[0]!.selection,
        websiteFunction: {
          choiceId: 'brochure_enquiries',
          disposition: {
            kind: 'satisfied',
            factId: comparisonFactId(
              selections[0]!.selection,
              'professional_service:v1:scope_basis',
            ),
          },
        },
        constraints: [{
          constraintId,
          disposition: {
            kind: 'excluded',
            factId: comparisonFactId(
              selections[0]!.selection,
              'professional_service:v1:scope_basis',
            ),
          },
        }],
      }],
    }

    expect(projectPublicDecisionSourceResult({
      requestedCategoryId: 'website:v1',
      confirmedChoiceId: 'brochure_enquiries',
      confirmedConstraintIds: [constraintId],
      resolution: resolved(selections),
      comparison,
      brief: buildComparisonBrief(comparison),
      eligibility,
    }).outcome).toBe('no_current_match')
  })

  it('does not treat incomplete constraint evidence as an exclusion', () => {
    const selections = [professional('one', knownPrice(100_000))]
    expect(evaluate({
      selections,
      constraints: ['website:v1:perth_local_preference'],
      proveChoice: true,
    }).outcome).toBe('insufficient_evidence')
  })

  it('fails closed for unknown, stale, or not-supplied confirmed material facts', () => {
    for (const price of [unknownPrice(), stalePrice(), notSuppliedPrice()]) {
      const result = evaluate({
        selections: [
          professional('one', price),
          professional('two', knownPrice(200_000)),
        ],
        constraints: ['website:v1:indicative_price_requested'],
        proveChoice: true,
      })
      expect(result.outcome).toBe('insufficient_evidence')
    }
  })

  it('returns unsupported_category for a closed category outside this website decision flow', () => {
    const selections = [professional('one', knownPrice(100_000))]
    const comparison = compareOfferings({ selections, priorities: pricePriority })
    const resolution = resolved(selections)
    const eligibility = deriveRegisteredConstraintEligibility({
      categoryId: 'machine_data:v1',
      registeredSupplyCount: 1,
      resolution,
      comparison,
      confirmedChoiceId: 'brochure_enquiries',
      confirmedConstraintIds: [],
    })

    expect(projectPublicDecisionSourceResult({
      requestedCategoryId: 'machine_data:v1',
      confirmedChoiceId: 'brochure_enquiries',
      confirmedConstraintIds: [],
      resolution,
      comparison,
      brief: buildComparisonBrief(comparison),
      eligibility,
    }).outcome).toBe('unsupported_category')
  })

  it('does not reuse website-function eligibility for a different closed choice', () => {
    const selections = [
      professional('one', knownPrice(100_000)),
      professional('two', knownPrice(200_000)),
    ]
    const comparison = compareOfferings({ selections, priorities: pricePriority })
    const resolution = resolved(selections)
    const eligibility = proveWebsiteFunction(
      deriveRegisteredConstraintEligibility({
        categoryId: 'website:v1',
        registeredSupplyCount: 2,
        resolution,
        comparison,
        confirmedChoiceId: 'brochure_enquiries',
        confirmedConstraintIds: [],
      }),
    )

    expect(projectPublicDecisionSourceResult({
      requestedCategoryId: 'website:v1',
      confirmedChoiceId: 'brochure_enquiries',
      confirmedConstraintIds: [],
      resolution,
      comparison,
      brief: buildComparisonBrief(comparison),
      eligibility,
    }).outcome).toBe('usable_comparison')
    expect(projectPublicDecisionSourceResult({
      requestedCategoryId: 'website:v1',
      confirmedChoiceId: 'transactional',
      confirmedConstraintIds: [],
      resolution,
      comparison,
      brief: buildComparisonBrief(comparison),
      eligibility,
    }).outcome).toBe('insufficient_evidence')
  })
})

function evaluate(input: {
  selections: readonly ResolvedComparisonSelection[]
  constraints?: readonly WebsiteDecisionConstraintId[]
  registeredSupplyCount?: number
  proveChoice?: boolean
}) {
  const constraints = input.constraints ?? []
  const resolution = resolved(input.selections)
  const comparison = compareOfferings({
    selections: input.selections,
    priorities: pricePriority,
  })
  const eligibility = deriveRegisteredConstraintEligibility({
    categoryId: 'website:v1',
    registeredSupplyCount:
      input.registeredSupplyCount ?? input.selections.length,
    resolution,
    comparison,
    confirmedChoiceId: 'brochure_enquiries',
    confirmedConstraintIds: constraints,
  })
  return projectPublicDecisionSourceResult({
    requestedCategoryId: 'website:v1',
    confirmedChoiceId: 'brochure_enquiries',
    confirmedConstraintIds: constraints,
    resolution,
    comparison,
    brief: buildComparisonBrief(comparison),
    eligibility: input.proveChoice === true
      ? proveWebsiteFunction(eligibility)
      : eligibility,
  })
}

function proveWebsiteFunction(
  evidence: RegisteredConstraintEligibilityEvidence,
): RegisteredConstraintEligibilityEvidence {
  return {
    ...evidence,
    selections: evidence.selections.map((candidate) => ({
      ...candidate,
      websiteFunction: {
        choiceId: 'brochure_enquiries',
        disposition: {
          kind: 'satisfied',
          factId: comparisonFactId(
            candidate.selection,
            'professional_service:v1:scope_basis',
          ),
        },
      },
    })),
  }
}

function resolved(
  selections: readonly ResolvedComparisonSelection[],
) {
  return {
    kind: 'resolved' as const,
    disposition: 'current' as const,
    selections,
    refusals: [],
  }
}

function professional(
  suffix: string,
  priceBasis: Extract<
    OfferingComparisonEnvelope['profile'],
    { profileId: 'professional_service:v1' }
  >['priceBasis'],
): ResolvedComparisonSelection {
  const known = <T>(value: T) => ({
    kind: 'known' as const,
    value,
    source,
    observedAt: 100,
  })
  return {
    selection: {
      businessId: `business:${suffix}`,
      offeringRef: `offering:${suffix}`,
      offeringRevision: 1,
      projectionObservedAt: 100,
    },
    business: {
      businessId: `business:${suffix}`,
      slug: suffix,
      name: `Business ${suffix}`,
    },
    offering: {
      offeringRef: `offering:${suffix}`,
      revision: 1,
      name: `Website ${suffix}`,
      category: 'Website',
      summary: 'Published website service.',
      comparison: validatedProfessionalEnvelope({
        scopeBasis: known('Published scope'),
        priceBasis,
        timingBasis: known('Published timing'),
        serviceArea: known('Published service area'),
      }),
    },
    publication: {
      publishedAt: 90,
      safeDisplayDisposition: 'retain_safe_history',
    },
    projectionDisposition: 'current',
    resolvedAt: 150,
  }
}

function validatedProfessionalEnvelope(
  profile: Omit<
    Extract<
      OfferingComparisonEnvelope['profile'],
      { profileId: 'professional_service:v1' }
    >,
    'profileId'
  >,
): OfferingComparisonEnvelope {
  const result = validateOfferingComparisonEnvelope({
    schemaVersion: 'offering-comparison:v1',
    profile: {
      profileId: 'professional_service:v1',
      ...profile,
    },
  })
  if (result.kind === 'invalid') {
    throw new Error('invalid professional comparison fixture')
  }
  return result.envelope
}

function knownPrice(amountMinor: number) {
  return {
    kind: 'known' as const,
    value: {
      description: `AUD ${amountMinor / 100} total`,
      currency: 'AUD',
      amountMinor,
      unit: 'total' as const,
    },
    source,
    observedAt: 100,
  }
}

function unknownPrice() {
  return {
    kind: 'unknown' as const,
    explanation: 'The business did not publish a comparable price.',
    source,
    observedAt: 100,
  }
}

function stalePrice() {
  return {
    kind: 'stale' as const,
    lastKnown: {
      description: 'AUD 1000 total',
      currency: 'AUD',
      amountMinor: 100_000,
      unit: 'total' as const,
    },
    source,
    observedAt: 100,
    validUntil: 120,
  }
}

function notSuppliedPrice() {
  return {
    kind: 'not_supplied' as const,
    source,
    observedAt: 100,
  }
}
