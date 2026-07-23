import { z } from 'zod'

import { defineAction, type ActionParameter } from '@/modules/common/action'
import { comparePublicOfferingSelections } from './comparison.functions'
import {
  ComparisonPriorityIds,
  MAX_COMPARISON_PRIORITIES,
  MAX_COMPARISON_SELECTIONS,
  type OfferingComparisonResult,
} from './public'

const boundedIdentifier = z.string().trim().min(1).max(300)
const safePositiveInteger = z.number().int().positive().safe()
const safeTimestamp = z.number().int().nonnegative().safe()
const prioritySchema = z.enum(ComparisonPriorityIds)

export const comparisonSelectionInputSchema = z.strictObject({
  businessId: boundedIdentifier,
  offeringRef: boundedIdentifier,
  offeringRevision: safePositiveInteger,
  projectionObservedAt: safeTimestamp,
})

export const comparisonCompareInputSchema = z.strictObject({
  selections: z.array(comparisonSelectionInputSchema)
    .max(MAX_COMPARISON_SELECTIONS),
  priorities: z.array(prioritySchema)
    .max(MAX_COMPARISON_PRIORITIES),
}).superRefine((input, context) => {
  requireUnique(input.selections.map((selection) => exactKey(selection)), 'selections', context)
  requireUnique(input.priorities, 'priorities', context)
})

const factSourceSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('business_supplied') }),
  z.strictObject({
    kind: z.literal('publicly_observed'),
    referenceUrl: z.string().url().optional(),
  }),
  z.strictObject({
    kind: z.literal('ae_support'),
    actionId: boundedIdentifier,
    actionVersion: boundedIdentifier,
  }),
])

const priceSchema = z.strictObject({
  description: z.string().max(500),
  currency: z.string().regex(/^[A-Z]{3}$/).optional(),
  amountMinor: z.number().int().nonnegative().safe().optional(),
  unit: z.enum(['total', 'hour', 'day', 'month', 'request', 'unit']),
})

const comparisonValueSchema = z.union([
  z.string().max(500),
  z.number().safe(),
  priceSchema,
])

const comparisonCellSchema = z.union([
  z.strictObject({
    kind: z.literal('known'),
    value: comparisonValueSchema,
    source: factSourceSchema,
    observedAt: safeTimestamp,
    validUntil: safeTimestamp.optional(),
  }),
  z.strictObject({
    kind: z.literal('unknown'),
    explanation: z.string().max(500),
    source: factSourceSchema,
    observedAt: safeTimestamp,
  }),
  z.strictObject({
    kind: z.literal('not_supplied'),
    source: factSourceSchema,
    observedAt: safeTimestamp,
  }),
  z.strictObject({
    kind: z.literal('stale'),
    lastKnown: comparisonValueSchema.optional(),
    source: factSourceSchema,
    observedAt: safeTimestamp,
    validUntil: safeTimestamp,
  }),
  z.strictObject({
    kind: z.literal('not_comparable'),
    reason: z.enum(['profile_mismatch', 'unit_mismatch']),
  }),
])

function comparisonFact<Value extends z.ZodType>(value: Value) {
  return z.union([
    z.strictObject({
      kind: z.literal('known'),
      value,
      source: factSourceSchema,
      observedAt: safeTimestamp,
      validUntil: safeTimestamp.optional(),
    }),
    z.strictObject({
      kind: z.literal('unknown'),
      explanation: z.string().max(500),
      source: factSourceSchema,
      observedAt: safeTimestamp,
    }),
    z.strictObject({
      kind: z.literal('not_supplied'),
      source: factSourceSchema,
      observedAt: safeTimestamp,
    }),
    z.strictObject({
      kind: z.literal('stale'),
      lastKnown: value.optional(),
      source: factSourceSchema,
      observedAt: safeTimestamp,
      validUntil: safeTimestamp,
    }),
  ])
}

const professionalServiceProfileSchema = z.strictObject({
  profileId: z.literal('professional_service:v1'),
  scopeBasis: comparisonFact(z.string().max(500)),
  priceBasis: comparisonFact(priceSchema),
  timingBasis: comparisonFact(z.string().max(500)),
  serviceArea: comparisonFact(z.string().max(500)),
})

const machineDataProfileSchema = z.strictObject({
  profileId: z.literal('machine_data:v1'),
  interfaceFormat: comparisonFact(z.enum(['graphql', 'rest_json', 'csv', 'other'])),
  requestMethod: comparisonFact(z.enum(['GET', 'POST'])),
  authentication: comparisonFact(z.enum(['none', 'api_key', 'oauth2', 'other'])),
  priceBasis: comparisonFact(priceSchema),
  freshnessOrUpdateCadence: comparisonFact(z.string().max(500)),
})

const comparisonEnvelopeSchema = z.strictObject({
  schemaVersion: z.literal('offering-comparison:v1'),
  profile: z.discriminatedUnion('profileId', [
    professionalServiceProfileSchema,
    machineDataProfileSchema,
  ]),
})

const exactReferenceSchema = z.strictObject({
  businessId: boundedIdentifier,
  offeringRef: boundedIdentifier,
  offeringRevision: safePositiveInteger,
})

const resolvedSelectionSchema = z.strictObject({
  selection: comparisonSelectionInputSchema,
  business: z.strictObject({
    businessId: boundedIdentifier,
    slug: boundedIdentifier,
    name: z.string().trim().min(1).max(500),
  }),
  offering: z.strictObject({
    offeringRef: boundedIdentifier,
    revision: safePositiveInteger,
    name: z.string().trim().min(1).max(500),
    category: z.string().trim().min(1).max(500),
    summary: z.string().max(2_000),
    comparison: comparisonEnvelopeSchema.optional(),
  }),
  publication: z.strictObject({
    publishedAt: safeTimestamp,
    withdrawnAt: safeTimestamp.optional(),
    safeDisplayDisposition: z.literal('retain_safe_history'),
  }),
  projectionDisposition: z.enum(['current', 'partial', 'stale']),
  newerCurrentReference: exactReferenceSchema.optional(),
  resolvedAt: safeTimestamp,
})

const dimensionSchema = z.enum([
  'common:business_name',
  'common:offering_name',
  'common:offering_revision',
  'professional_service:v1:scope_basis',
  'professional_service:v1:price_basis',
  'professional_service:v1:timing_basis',
  'professional_service:v1:service_area',
  'machine_data:v1:interface_format',
  'machine_data:v1:request_method',
  'machine_data:v1:authentication',
  'machine_data:v1:price_basis',
  'machine_data:v1:freshness_or_update_cadence',
])

const orderingReasonSchema = z.enum([
  'insufficient_selections',
  'no_priority',
  'missing_material_fact',
  'stale_fact',
  'not_comparable',
  'partial_projection',
  'unavailable_selection',
  'tie',
])

const orderingSchema = z.union([
  z.strictObject({
    kind: z.literal('unranked'),
    reason: orderingReasonSchema,
    blockingFactIds: z.array(boundedIdentifier).optional(),
  }),
  z.strictObject({
    kind: z.literal('ordered'),
    rule: z.literal('lexicographic_stated_priorities:v1'),
    orderedSelectionIds: z.array(boundedIdentifier),
    decisivePriorityIds: z.array(prioritySchema).max(MAX_COMPARISON_PRIORITIES),
    decisiveFactIds: z.array(boundedIdentifier),
    reasonIds: z.array(z.string().startsWith('reason:')),
  }),
])

const offeringComparisonResultObjectSchema = z.strictObject({
    schemaVersion: z.literal('offering-comparison:v1'),
    priorities: z.array(prioritySchema).max(MAX_COMPARISON_PRIORITIES),
    selections: z.array(resolvedSelectionSchema).max(MAX_COMPARISON_SELECTIONS),
    rows: z.array(z.strictObject({
      dimensionId: dimensionSchema,
      cells: z.array(z.strictObject({
        selectionId: boundedIdentifier,
        factId: boundedIdentifier,
        cell: comparisonCellSchema,
      })).max(MAX_COMPARISON_SELECTIONS),
    })),
    refusedSelectionCount: z.number().int().nonnegative().max(MAX_COMPARISON_SELECTIONS),
    ordering: orderingSchema,
  })

export const offeringComparisonResultSchema =
  offeringComparisonResultObjectSchema as z.ZodType<OfferingComparisonResult>

const comparisonCompareActionResultSchema = offeringComparisonResultObjectSchema.extend({
  kind: z.literal('comparison'),
})

const parameters: readonly ActionParameter[] = [
  {
    name: 'selections',
    type: 'object',
    description: 'Up to four exact published Offering versions to compare.',
    required: true,
  },
  {
    name: 'priorities',
    type: 'enum',
    enum: ComparisonPriorityIds,
    description: 'Up to three supported priorities, in the order that matters.',
    required: true,
  },
]

export const comparisonCompareAction = defineAction({
  id: 'comparison.compare',
  name: 'Compare published Offerings',
  summary:
    'Compare up to four exact published Offering versions using only their public facts and stated supported priorities.',
  boundaries: [
    'Read-only. Does not contact a business, send an inquiry, book, charge, pay, dispatch, or run an endpoint.',
    'A priority orders options only when the exact public facts are current and comparable; otherwise the result stays unranked.',
    'Published information may change. A newer version is disclosed without replacing the exact version selected.',
  ],
  schema: comparisonCompareInputSchema,
  outputSchema: comparisonCompareActionResultSchema,
  parameters,
  readOnly: true,
  surfaces: ['http', 'agentJson'],
  invocationContract: {
    version: 'comparison.compare:v1',
    consequenceClass: 'read_only',
    materialInputPaths: ['selections', 'priorities'],
    authorityRequirement: 'none',
    retryClass: 'replayable',
    expectedEvidence: ['public_offering_comparison_result'],
    safeContinuations: [
      'view_offering',
      'remove_selection',
      'compare',
      'change_priorities',
    ],
    invalidationConditions: [
      'action_contract_version_changed',
      'selection_changed',
      'priority_changed',
      'public_eligibility_changed',
    ],
  },
  run: async ({ data }) => comparisonCompareActionResultSchema.parse({
    kind: 'comparison',
    ...await comparePublicOfferingSelections(data),
  }),
})

function exactKey(selection: z.infer<typeof comparisonSelectionInputSchema>): string {
  return `${selection.businessId}\u0000${selection.offeringRef}\u0000${selection.offeringRevision}`
}

function requireUnique(
  values: readonly string[],
  path: 'selections' | 'priorities',
  context: z.RefinementCtx,
): void {
  if (new Set(values).size !== values.length) {
    context.addIssue({
      code: 'custom',
      path: [path],
      message: `Duplicate ${path} are not allowed.`,
    })
  }
}
