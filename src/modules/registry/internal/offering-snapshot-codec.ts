import { z } from 'zod'

import type { BusinessSupplyProjection } from '@/modules/catalog/public'
import {
  validateOfferingComparisonEnvelope,
} from '@/modules/catalog/public'
import { brandNonEmpty } from '@/modules/common/ids'

const boundedText = (maximum: number) => z.string().trim().min(1).max(maximum)
const observedAt = z.number().finite().nonnegative()
const factSourceSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('business_supplied') }),
  z.strictObject({
    kind: z.literal('publicly_observed'),
    referenceUrl: z.string().url().max(2_048).optional(),
  }),
  z.strictObject({
    kind: z.literal('ae_support'),
    actionId: boundedText(160),
    actionVersion: boundedText(80),
  }),
])

function comparisonFactSchema<T extends z.ZodType>(value: T) {
  return z.discriminatedUnion('kind', [
    z.strictObject({
      kind: z.literal('known'),
      value,
      source: factSourceSchema,
      observedAt,
      validUntil: observedAt.optional(),
    }),
    z.strictObject({
      kind: z.literal('unknown'),
      explanation: boundedText(500),
      source: factSourceSchema,
      observedAt,
    }),
    z.strictObject({
      kind: z.literal('not_supplied'),
      source: factSourceSchema,
      observedAt,
    }),
    z.strictObject({
      kind: z.literal('stale'),
      lastKnown: value.optional(),
      source: factSourceSchema,
      observedAt,
      validUntil: observedAt,
    }),
  ])
}

const priceBasisSchema = z.strictObject({
  description: boundedText(500),
  currency: z.string().regex(/^[A-Z]{3}$/u).optional(),
  amountMinor: z.number().int().nonnegative().safe().optional(),
  unit: z.enum(['total', 'hour', 'day', 'month', 'request', 'unit']),
})

export const offeringComparisonEnvelopeSchema = z.strictObject({
  schemaVersion: z.literal('offering-comparison:v1'),
  profile: z.discriminatedUnion('profileId', [
    z.strictObject({
      profileId: z.literal('professional_service:v1'),
      scopeBasis: comparisonFactSchema(boundedText(500)),
      priceBasis: comparisonFactSchema(priceBasisSchema),
      timingBasis: comparisonFactSchema(boundedText(500)),
      serviceArea: comparisonFactSchema(boundedText(500)),
    }),
    z.strictObject({
      profileId: z.literal('machine_data:v1'),
      interfaceFormat: comparisonFactSchema(z.enum(['graphql', 'rest_json', 'csv', 'other'])),
      requestMethod: comparisonFactSchema(z.enum(['GET', 'POST'])),
      authentication: comparisonFactSchema(z.enum(['none', 'api_key', 'oauth2', 'other'])),
      priceBasis: comparisonFactSchema(priceBasisSchema),
      freshnessOrUpdateCadence: comparisonFactSchema(boundedText(500)),
    }),
  ]),
}).superRefine((value, context) => {
  if (validateOfferingComparisonEnvelope(value).kind === 'invalid') {
    context.addIssue({
      code: 'custom',
      message: 'Comparison profile must satisfy the catalog-owned contract.',
    })
  }
})

const humanRequestAccessPathSchema = z.strictObject({
  accessPathRef: boundedText(300),
  kind: z.literal('human_request'),
  channel: z.enum(['phone', 'website', 'ae_inquiry']),
  disclosure: boundedText(2_000),
  url: z.string().url().max(2_048).optional(),
})

const externalOperationAccessPathSchema = z.strictObject({
  accessPathRef: boundedText(300),
  kind: z.literal('external_operation'),
  name: boundedText(300),
  summary: boundedText(2_000),
  url: z.string().url().max(2_048),
  method: boundedText(20).optional(),
  documentationUrl: z.string().url().max(2_048).optional(),
  interfaceDescription: z.strictObject({
    format: boundedText(100),
    url: z.string().url().max(2_048).optional(),
  }).optional(),
  authenticationSummary: boundedText(500).optional(),
  pricingSummary: boundedText(500).optional(),
  provenance: z.enum(['business_declared', 'publicly_observed']),
})

export const publicOfferingDtoSchema = z.strictObject({
  offeringRef: boundedText(300),
  revision: z.number().int().positive(),
  name: boundedText(300),
  category: boundedText(200),
  summary: boundedText(2_000),
  serviceAreaSummary: boundedText(500).optional(),
  availabilitySummary: boundedText(500).optional(),
  pricingSummary: boundedText(500).optional(),
  comparison: offeringComparisonEnvelopeSchema.optional(),
  accessPaths: z.array(z.discriminatedUnion('kind', [
    humanRequestAccessPathSchema,
    externalOperationAccessPathSchema,
  ])).max(50),
  support: z.strictObject({
    integrated: z.boolean(),
    aeSupportedAction: z.boolean(),
    observedAt: observedAt.optional(),
    validUntil: observedAt.optional(),
  }),
})

export const publicBusinessCatalogApiV2DtoSchema = z.strictObject({
  schemaVersion: z.literal('public-business-catalog-api:v2'),
  businessId: boundedText(300),
  slug: boundedText(200),
  name: boundedText(300),
  category: boundedText(200),
  suburb: boundedText(200),
  stateTerritory: boundedText(100),
  publishedPhone: boundedText(100).optional(),
  postcode: boundedText(20).optional(),
  publicUrl: boundedText(2_048),
  observedAt,
  disposition: z.enum(['current', 'partial', 'stale']),
  offerings: z.array(publicOfferingDtoSchema).max(50),
  accessSummary: z.strictObject({
    humanRequest: z.boolean(),
    externalOperation: z.boolean(),
    aeSupportedAction: z.boolean(),
  }),
})

// Convex pagination cursors are opaque platform values rather than business
// identifiers. Keep them bounded at the public boundary, but do not apply the
// much smaller human-text limit: production search cursors routinely exceed
// 200 characters.
export const opaquePaginationCursorSchema = z.string().min(1).max(8_192)

export const publicBusinessCatalogApiV2PageSchema = z.strictObject({
  kind: z.literal('ok'),
  schemaVersion: z.literal('public-business-catalog-api:v2'),
  query: z.string().max(200).optional(),
  items: z.array(publicBusinessCatalogApiV2DtoSchema).max(50),
  pagination: z.strictObject({
    cursor: opaquePaginationCursorSchema.optional(),
    nextCursor: opaquePaginationCursorSchema.optional(),
    limit: z.number().int().min(1).max(50),
    total: z.number().int().nonnegative(),
    hasMore: z.boolean(),
  }),
})

export const publicBusinessCatalogV2DetailResultSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('found'),
    schemaVersion: z.literal('public-business-catalog-api:v2'),
    business: publicBusinessCatalogApiV2DtoSchema,
  }),
  z.strictObject({
    kind: z.literal('not_found'),
    code: z.literal('business_not_found'),
    reason: boundedText(500),
  }),
])

const storedHumanRequestAccessPathSchema = z.strictObject({
  accessPathRef: boundedText(300),
  descriptor: z.strictObject({
    kind: z.literal('human_request'),
    channel: z.enum(['phone', 'website', 'ae_inquiry']),
    disclosure: boundedText(2_000),
    url: z.string().url().max(2_048).optional(),
  }),
})

const storedExternalOperationAccessPathSchema = z.strictObject({
  accessPathRef: boundedText(300),
  descriptor: z.strictObject({
    kind: z.literal('external_operation'),
    name: boundedText(300),
    summary: boundedText(2_000),
    url: z.string().url().max(2_048),
    method: boundedText(20).optional(),
    documentationUrl: z.string().url().max(2_048).optional(),
    interfaceDescription: z.strictObject({
      format: boundedText(100),
      url: z.string().url().max(2_048).optional(),
    }).optional(),
    authenticationSummary: boundedText(500).optional(),
    pricingSummary: boundedText(500).optional(),
    provenance: z.enum(['business_declared', 'publicly_observed']),
  }),
})

const storedProjectionSchema = z.strictObject({
  business: z.strictObject({
    businessId: boundedText(300),
    slug: boundedText(200),
    name: boundedText(300),
    category: boundedText(200),
    suburb: boundedText(200),
    stateTerritory: boundedText(100),
    publishedPhone: boundedText(100).optional(),
    postcode: boundedText(20).optional(),
    publicUrl: boundedText(2_048),
  }),
  offerings: z.array(z.strictObject({
    offering: z.strictObject({
      offeringRef: boundedText(300),
      revision: z.number().int().positive(),
      name: boundedText(300),
      category: boundedText(200),
      summary: boundedText(2_000),
      serviceAreaSummary: boundedText(500).optional(),
      availabilitySummary: boundedText(500).optional(),
      pricingSummary: boundedText(500).optional(),
      comparison: z.unknown().optional(),
    }),
    accessPaths: z.array(z.union([
      storedHumanRequestAccessPathSchema,
      storedExternalOperationAccessPathSchema,
    ])).max(50),
    support: z.strictObject({
      integrated: z.boolean(),
      routeable: z.boolean(),
      reasons: z.array(z.enum([
        'not_integrated',
        'publication_inactive',
        'readiness_unavailable',
        'readiness_stale',
      ])).max(20),
      observedAt: observedAt.optional(),
      validUntil: observedAt.optional(),
    }),
  })).max(50),
  sourceRevision: z.number().int().positive(),
  sourceDigest: boundedText(300),
  observedAt,
  disposition: z.enum(['current', 'partial', 'stale']),
})

export type StoredBusinessSupplyProjectionDecodeResult =
  | Readonly<{ kind: 'valid'; projection: BusinessSupplyProjection }>
  | Readonly<{ kind: 'invalid'; reason: 'invalid_offering_snapshot' }>

export function decodeStoredBusinessSupplyProjection(
  input: unknown,
): StoredBusinessSupplyProjectionDecodeResult {
  const parsed = storedProjectionSchema.safeParse(input)
  if (!parsed.success) return invalidSnapshot()

  const offerings: BusinessSupplyProjection['offerings'][number][] = []
  for (const item of parsed.data.offerings) {
    const comparison = item.offering.comparison === undefined
      ? undefined
      : validateOfferingComparisonEnvelope(item.offering.comparison)
    if (comparison !== undefined && comparison.kind === 'invalid') return invalidSnapshot()

    offerings.push({
      offering: {
        offeringRef: brandNonEmpty(item.offering.offeringRef, 'OfferingRef'),
        revision: item.offering.revision,
        name: item.offering.name,
        category: item.offering.category,
        summary: item.offering.summary,
        ...(item.offering.serviceAreaSummary === undefined ? {} : { serviceAreaSummary: item.offering.serviceAreaSummary }),
        ...(item.offering.availabilitySummary === undefined ? {} : { availabilitySummary: item.offering.availabilitySummary }),
        ...(item.offering.pricingSummary === undefined ? {} : { pricingSummary: item.offering.pricingSummary }),
        ...(comparison === undefined ? {} : { comparison: comparison.envelope }),
      },
      accessPaths: item.accessPaths.map(decodeAccessPath),
      support: {
        integrated: item.support.integrated,
        routeable: item.support.routeable,
        reasons: item.support.reasons,
        ...(item.support.observedAt === undefined ? {} : { observedAt: item.support.observedAt }),
        ...(item.support.validUntil === undefined ? {} : { validUntil: item.support.validUntil }),
      },
    })
  }

  return {
    kind: 'valid',
    projection: {
      business: {
        businessId: brandNonEmpty(parsed.data.business.businessId, 'BusinessId'),
        slug: parsed.data.business.slug,
        name: parsed.data.business.name,
        category: parsed.data.business.category,
        suburb: parsed.data.business.suburb,
        stateTerritory: parsed.data.business.stateTerritory,
        ...(parsed.data.business.publishedPhone === undefined ? {} : { publishedPhone: parsed.data.business.publishedPhone }),
        ...(parsed.data.business.postcode === undefined ? {} : { postcode: parsed.data.business.postcode }),
        publicUrl: parsed.data.business.publicUrl,
      },
      offerings,
      sourceRevision: parsed.data.sourceRevision,
      sourceDigest: brandNonEmpty(parsed.data.sourceDigest, 'SourceHash'),
      observedAt: parsed.data.observedAt,
      disposition: parsed.data.disposition,
    },
  }
}

function invalidSnapshot(): StoredBusinessSupplyProjectionDecodeResult {
  return { kind: 'invalid', reason: 'invalid_offering_snapshot' }
}

function decodeAccessPath(
  path: z.infer<typeof storedHumanRequestAccessPathSchema>
    | z.infer<typeof storedExternalOperationAccessPathSchema>,
): BusinessSupplyProjection['offerings'][number]['accessPaths'][number] {
  return path.descriptor.kind === 'human_request'
    ? {
        accessPathRef: brandNonEmpty(path.accessPathRef, 'AccessPathRef'),
        descriptor: {
          kind: 'human_request',
          channel: path.descriptor.channel,
          disclosure: path.descriptor.disclosure,
          ...(path.descriptor.url === undefined ? {} : { url: path.descriptor.url }),
        },
      }
    : {
        accessPathRef: brandNonEmpty(path.accessPathRef, 'AccessPathRef'),
        descriptor: {
          kind: 'external_operation',
          name: path.descriptor.name,
          summary: path.descriptor.summary,
          url: path.descriptor.url,
          ...(path.descriptor.method === undefined ? {} : { method: path.descriptor.method }),
          ...(path.descriptor.documentationUrl === undefined ? {} : { documentationUrl: path.descriptor.documentationUrl }),
          ...(path.descriptor.interfaceDescription === undefined
            ? {}
            : {
                interfaceDescription: {
                  format: path.descriptor.interfaceDescription.format,
                  ...(path.descriptor.interfaceDescription.url === undefined
                    ? {}
                    : { url: path.descriptor.interfaceDescription.url }),
                },
              }),
          ...(path.descriptor.authenticationSummary === undefined ? {} : { authenticationSummary: path.descriptor.authenticationSummary }),
          ...(path.descriptor.pricingSummary === undefined ? {} : { pricingSummary: path.descriptor.pricingSummary }),
          provenance: path.descriptor.provenance,
        },
      }
}
