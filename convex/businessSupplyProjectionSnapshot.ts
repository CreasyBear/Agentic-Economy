import type { Doc } from './_generated/dataModel'
import { brandNonEmpty } from '../src/modules/common/ids'
import { isRecord } from '../src/modules/common/is-record'
import {
  ExternalOperationProvenanceValues,
  HumanRequestChannelValues,
  OfferingPriceKindValues,
  OfferingPriceTaxTreatmentValues,
  OfferingPriceUnitValues,
  PublicSupportReasonValues,
  type BusinessSupplyProjection,
  type OfferingAccessPathDescriptor,
  type OfferingPrice,
} from '../src/modules/catalog/public'

export type BusinessSupplyProjectionErrorPrefix = 'catalog' | 'registry' | 'discovery'

type PersistedBusinessSupplyProjection = NonNullable<Doc<'businessSupplyProjectionSnapshots'>['projection']>
type PersistedOfferingPrice = NonNullable<PersistedBusinessSupplyProjection['offerings'][number]['offering']['price']>
type ProjectionOffering = BusinessSupplyProjection['offerings'][number]
type ProjectionSupportReason = ProjectionOffering['support']['reasons'][number]

type DecoderContext = {
  errorPrefix: BusinessSupplyProjectionErrorPrefix
  expectedBusinessId?: string
}

/** Decode the persisted projection once at each public Convex boundary. */
export function readBusinessSupplyProjectionSnapshot(
  value: unknown,
  errorPrefix: BusinessSupplyProjectionErrorPrefix,
  expectedBusinessId?: string,
): BusinessSupplyProjection {
  const context: DecoderContext = expectedBusinessId === undefined
    ? { errorPrefix }
    : { errorPrefix, expectedBusinessId }
  if (errorPrefix === 'discovery') return readDiscoveryProjection(value, context)

  const projection = value as PersistedBusinessSupplyProjection
  return {
    business: readPersistedBusiness(projection.business),
    offerings: projection.offerings.map((entry) => readPersistedOffering(entry, context)),
    sourceRevision: projection.sourceRevision,
    sourceDigest: brandNonEmpty(projection.sourceDigest, 'SourceHash'),
    observedAt: projection.observedAt,
    disposition: projection.disposition,
  }
}

function readPersistedBusiness(
  value: PersistedBusinessSupplyProjection['business'],
): BusinessSupplyProjection['business'] {
  return {
    businessId: brandNonEmpty(String(value.businessId), 'BusinessId'),
    slug: value.slug,
    name: value.name,
    category: value.category,
    suburb: value.suburb,
    stateTerritory: value.stateTerritory,
    ...(value.publishedPhone === undefined ? {} : { publishedPhone: value.publishedPhone }),
    ...(value.postcode === undefined ? {} : { postcode: value.postcode }),
    publicUrl: value.publicUrl,
    trustTier: value.trustTier,
    ...(value.responseTimeMinutes === undefined ? {} : { responseTimeMinutes: value.responseTimeMinutes }),
    ...(value.photos === undefined ? {} : { photos: value.photos.map((photo: { url: string; alt: string }) => ({ url: photo.url, alt: photo.alt })) }),
  }
}

function readPersistedOffering(
  value: PersistedBusinessSupplyProjection['offerings'][number],
  context: DecoderContext,
): ProjectionOffering {
  return {
    offering: {
      offeringRef: brandNonEmpty(value.offering.offeringRef, 'OfferingRef'),
      revision: value.offering.revision,
      name: value.offering.name,
      category: value.offering.category,
      summary: value.offering.summary,
      ...(value.offering.serviceAreaSummary === undefined ? {} : { serviceAreaSummary: value.offering.serviceAreaSummary }),
      ...(value.offering.availabilitySummary === undefined ? {} : { availabilitySummary: value.offering.availabilitySummary }),
      ...(value.offering.pricingSummary === undefined ? {} : { pricingSummary: value.offering.pricingSummary }),
      ...(value.offering.price === undefined ? {} : { price: readPrice(value.offering.price, context) }),
    },
    accessPaths: value.accessPaths.map((path) => ({
      accessPathRef: brandNonEmpty(path.accessPathRef, 'AccessPathRef'),
      descriptor: readDescriptor(path.descriptor, context),
    })),
    support: {
      integrated: value.support.integrated,
      routeable: value.support.routeable,
      reasons: [...value.support.reasons],
      ...(value.support.observedAt === undefined ? {} : { observedAt: value.support.observedAt }),
      ...(value.support.validUntil === undefined ? {} : { validUntil: value.support.validUntil }),
    },
  }
}

function readPrice(value: unknown, context: DecoderContext): OfferingPrice {
  if (context.errorPrefix === 'registry') {
    const persisted = value as PersistedOfferingPrice
    return {
      kind: persisted.kind,
      currency: persisted.currency,
      ...(persisted.amountMinor === undefined ? {} : { amountMinor: persisted.amountMinor }),
      ...(persisted.maximumAmountMinor === undefined ? {} : { maximumAmountMinor: persisted.maximumAmountMinor }),
      ...(persisted.unit === undefined ? {} : { unit: persisted.unit }),
      taxTreatment: persisted.taxTreatment,
    }
  }
  const row = readRecord(value, context.errorPrefix === 'catalog' ? 'catalog_invalid_price' : 'discovery_manifest_price_invalid')
  const amountMinor = readOptionalNumber(row.amountMinor, priceFieldError(context, 'amountMinor'))
  const maximumAmountMinor = readOptionalNumber(row.maximumAmountMinor, priceFieldError(context, 'maximumAmountMinor'))
  const unit = row.unit === undefined
    ? undefined
    : readLiteral(row.unit, OfferingPriceUnitValues, priceFieldError(context, 'unit'))
  return {
    kind: readLiteral(row.kind, OfferingPriceKindValues, priceFieldError(context, 'kind')),
    currency: readString(row.currency, priceFieldError(context, 'currency'), context.errorPrefix === 'catalog'),
    ...(amountMinor === undefined ? {} : { amountMinor }),
    ...(maximumAmountMinor === undefined ? {} : { maximumAmountMinor }),
    ...(unit === undefined ? {} : { unit }),
    taxTreatment: readLiteral(row.taxTreatment, OfferingPriceTaxTreatmentValues, priceFieldError(context, 'taxTreatment')),
  }
}

function readDescriptor(value: unknown, context: DecoderContext): OfferingAccessPathDescriptor {
  const row = readRecord(value, descriptorError(context, 'record'))
  const kind = row.kind
  if (kind === 'human_request') {
    const url = readOptionalString(row.url, descriptorFieldError(context, 'url'))
    return {
      kind,
      channel: readLiteral(row.channel, HumanRequestChannelValues, descriptorLiteralError(context, 'channel')),
      disclosure: readString(row.disclosure, descriptorFieldError(context, 'disclosure'), context.errorPrefix === 'catalog'),
      ...(url === undefined ? {} : { url }),
    }
  }
  if (kind === 'external_operation') {
    const method = readOptionalString(row.method, descriptorFieldError(context, 'method'))
    const documentationUrl = readOptionalString(row.documentationUrl, descriptorFieldError(context, 'documentationUrl'))
    const authenticationSummary = readOptionalString(row.authenticationSummary, descriptorFieldError(context, 'authenticationSummary'))
    const pricingSummary = readOptionalString(row.pricingSummary, descriptorFieldError(context, 'pricingSummary'))
    const interfaceValue = row.interfaceDescription === undefined
      ? undefined
      : readRecord(row.interfaceDescription, descriptorError(context, 'interface'))
    const interfaceUrl = interfaceValue === undefined
      ? undefined
      : readOptionalString(interfaceValue.url, descriptorFieldError(context, 'interfaceUrl'))
    return {
      kind,
      name: readString(row.name, descriptorFieldError(context, 'name'), context.errorPrefix === 'catalog'),
      summary: readString(row.summary, descriptorFieldError(context, 'summary'), context.errorPrefix === 'catalog'),
      url: readString(row.url, descriptorFieldError(context, 'url'), context.errorPrefix === 'catalog'),
      ...(method === undefined ? {} : { method }),
      ...(documentationUrl === undefined ? {} : { documentationUrl }),
      ...(interfaceValue === undefined
        ? {}
        : {
            interfaceDescription: {
              format: readString(interfaceValue.format, descriptorFieldError(context, 'interfaceFormat'), context.errorPrefix === 'catalog'),
              ...(interfaceUrl === undefined ? {} : { url: interfaceUrl }),
            },
          }),
      ...(authenticationSummary === undefined ? {} : { authenticationSummary }),
      ...(pricingSummary === undefined ? {} : { pricingSummary }),
      provenance: readLiteral(row.provenance, ExternalOperationProvenanceValues, descriptorLiteralError(context, 'provenance')),
    }
  }
  throw new Error(descriptorError(context, 'kind'))
}

function readDiscoveryProjection(value: unknown, context: DecoderContext): BusinessSupplyProjection {
  const row = readRecord(value, 'discovery_projection_invalid')
  const business = readRecord(row.business, 'discovery_projection_business_invalid')
  const businessIdValue = readString(business.businessId, 'discovery_projection_business_id_invalid')
  if (context.expectedBusinessId !== undefined && businessIdValue !== context.expectedBusinessId) {
    throw new Error('discovery_projection_business_mismatch')
  }
  const publishedPhone = readOptionalString(business.publishedPhone, 'discovery_projection_business_phone_invalid')
  const postcode = readOptionalString(business.postcode, 'discovery_projection_business_postcode_invalid')
  const responseTimeMinutes = readOptionalNumber(business.responseTimeMinutes, 'discovery_projection_business_response_time_invalid')
  const photos = business.photos === undefined
    ? undefined
    : readArray(business.photos, 'discovery_projection_business_photos_invalid').map((photo) => {
        const photoRecord = readRecord(photo, 'discovery_projection_business_photo_invalid')
        return {
          url: readString(photoRecord.url, 'discovery_projection_business_photo_url_invalid'),
          alt: readString(photoRecord.alt, 'discovery_projection_business_photo_alt_invalid'),
        }
      })
  return {
    business: {
      businessId: brandNonEmpty(businessIdValue, 'BusinessId'),
      slug: readString(business.slug, 'discovery_projection_business_slug_invalid'),
      name: readString(business.name, 'discovery_projection_business_name_invalid'),
      category: readString(business.category, 'discovery_projection_business_category_invalid'),
      suburb: readString(business.suburb, 'discovery_projection_business_suburb_invalid'),
      stateTerritory: readString(business.stateTerritory, 'discovery_projection_business_state_invalid'),
      ...(publishedPhone === undefined ? {} : { publishedPhone }),
      ...(postcode === undefined ? {} : { postcode }),
      publicUrl: readString(business.publicUrl, 'discovery_projection_business_url_invalid'),
      trustTier: readTrustTier(business.trustTier),
      ...(responseTimeMinutes === undefined ? {} : { responseTimeMinutes }),
      ...(photos === undefined ? {} : { photos }),
    },
    offerings: readArray(row.offerings, 'discovery_projection_offerings_invalid').map((entry) => readDiscoveryOffering(entry, context)),
    sourceRevision: readNumber(row.sourceRevision, 'discovery_projection_source_revision_invalid'),
    sourceDigest: brandNonEmpty(readString(row.sourceDigest, 'discovery_projection_source_digest_invalid'), 'SourceHash'),
    observedAt: readNumber(row.observedAt, 'discovery_projection_observed_at_invalid'),
    disposition: readDisposition(row.disposition),
  }
}

function readDiscoveryOffering(value: unknown, context: DecoderContext): ProjectionOffering {
  const row = readRecord(value, 'discovery_projection_offering_invalid')
  const offering = readRecord(row.offering, 'discovery_projection_offering_facts_invalid')
  const serviceAreaSummary = readOptionalString(offering.serviceAreaSummary, 'discovery_projection_offering_area_invalid')
  const availabilitySummary = readOptionalString(offering.availabilitySummary, 'discovery_projection_offering_availability_invalid')
  const pricingSummary = readOptionalString(offering.pricingSummary, 'discovery_projection_offering_pricing_invalid')
  const price = offering.price === undefined ? undefined : readPrice(offering.price, context)
  const support = readRecord(row.support, 'discovery_projection_offering_support_invalid')
  const reasons = readArray(support.reasons, 'discovery_projection_offering_reasons_invalid').map(readSupportReason)
  const observedAt = readOptionalNumber(support.observedAt, 'discovery_projection_offering_observed_at_invalid')
  const validUntil = readOptionalNumber(support.validUntil, 'discovery_projection_offering_valid_until_invalid')
  return {
    offering: {
      offeringRef: brandNonEmpty(readString(offering.offeringRef, 'discovery_projection_offering_ref_invalid'), 'OfferingRef'),
      revision: readNumber(offering.revision, 'discovery_projection_offering_revision_invalid'),
      name: readString(offering.name, 'discovery_projection_offering_name_invalid'),
      category: readString(offering.category, 'discovery_projection_offering_category_invalid'),
      summary: readString(offering.summary, 'discovery_projection_offering_summary_invalid'),
      ...(serviceAreaSummary === undefined ? {} : { serviceAreaSummary }),
      ...(availabilitySummary === undefined ? {} : { availabilitySummary }),
      ...(pricingSummary === undefined ? {} : { pricingSummary }),
      ...(price === undefined ? {} : { price }),
    },
    accessPaths: readArray(row.accessPaths, 'discovery_projection_offering_access_paths_invalid').map((path) => {
      const pathRecord = readRecord(path, 'discovery_projection_access_path_invalid')
      return {
        accessPathRef: brandNonEmpty(readString(pathRecord.accessPathRef, 'discovery_projection_access_path_ref_invalid'), 'AccessPathRef'),
        descriptor: readDescriptor(pathRecord.descriptor, context),
      }
    }),
    support: {
      integrated: readBoolean(support.integrated, 'discovery_projection_offering_integrated_invalid'),
      routeable: readBoolean(support.routeable, 'discovery_projection_offering_routeable_invalid'),
      reasons,
      ...(observedAt === undefined ? {} : { observedAt }),
      ...(validUntil === undefined ? {} : { validUntil }),
    },
  }
}

function readTrustTier(value: unknown): BusinessSupplyProjection['business']['trustTier'] {
  if (value === 'claimed' || value === 'contact_confirmed' || value === 'listed' || value === 'registry_verified') return value
  throw new Error('discovery_projection_trust_tier_invalid')
}

function readSupportReason(value: unknown): ProjectionSupportReason {
  if (PublicSupportReasonValues.includes(value as ProjectionSupportReason)) return value as ProjectionSupportReason
  throw new Error('discovery_projection_support_reason_invalid')
}

function readDisposition(value: unknown): BusinessSupplyProjection['disposition'] {
  if (value === 'current' || value === 'partial' || value === 'stale') return value
  throw new Error('discovery_manifest_disposition_invalid')
}

function descriptorError(context: DecoderContext, kind: 'record' | 'interface' | 'kind'): string {
  if (context.errorPrefix === 'catalog') {
    return kind === 'record'
      ? 'catalog_invalid_descriptor'
      : kind === 'interface'
        ? 'catalog_invalid_interface_description'
        : 'catalog_invalid_descriptor_kind'
  }
  if (context.errorPrefix === 'registry') {
    return kind === 'interface'
      ? 'invalid_registry_interface_description'
      : 'invalid_registry_access_path_descriptor'
  }
  return kind === 'record'
    ? 'discovery_projection_descriptor_invalid'
    : kind === 'interface'
      ? 'discovery_projection_descriptor_interface_invalid'
      : 'discovery_manifest_access_path_kind_invalid'
}

function descriptorFieldError(context: DecoderContext, field: string): string {
  if (context.errorPrefix === 'catalog') {
    const mapped = field === 'channel' ? 'access_path_channel' : field === 'provenance' ? 'access_path_provenance' : field === 'interfaceUrl' || field === 'interfaceFormat' ? field === 'interfaceUrl' ? 'url' : 'format' : field
    return `catalog_invalid_${mapped}`
  }
  if (context.errorPrefix === 'registry') {
    const mapped = field === 'interfaceUrl' || field === 'interfaceFormat' ? field === 'interfaceUrl' ? 'url' : 'format' : field
    return `invalid_registry_${mapped}`
  }
  const mapped = field === 'interfaceUrl'
    ? 'interface_url'
    : field === 'interfaceFormat'
      ? 'interface_format'
      : field
  return `discovery_projection_descriptor_${mapped}_invalid`
}

function descriptorLiteralError(context: DecoderContext, field: string): string {
  if (context.errorPrefix === 'discovery') {
    return field === 'channel'
      ? 'discovery_manifest_human_channel_invalid'
      : field === 'provenance'
        ? 'discovery_manifest_provenance_invalid'
        : descriptorFieldError(context, field)
  }
  return descriptorFieldError(context, field)
}

function priceFieldError(context: DecoderContext, field: string): string {
  if (context.errorPrefix === 'catalog') return `catalog_invalid_${field}`
  if (field === 'amountMinor') return 'discovery_manifest_price_amount_invalid'
  if (field === 'maximumAmountMinor') return 'discovery_manifest_price_maximum_invalid'
  if (field === 'taxTreatment') return 'discovery_manifest_tax_treatment_invalid'
  return `discovery_manifest_price_${field}_invalid`
}

function readRecord(value: unknown, error: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(error)
  return value
}

function readString(value: unknown, error: string, nonEmpty = false): string {
  if (typeof value !== 'string' || (nonEmpty && value.trim().length === 0)) throw new Error(error)
  return value
}

function readOptionalString(value: unknown, error: string): string | undefined {
  return value === undefined ? undefined : readString(value, error)
}

function readNumber(value: unknown, error: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(error)
  return value
}

function readOptionalNumber(value: unknown, error: string): number | undefined {
  return value === undefined ? undefined : readNumber(value, error)
}

function readBoolean(value: unknown, error: string): boolean {
  if (typeof value !== 'boolean') throw new Error(error)
  return value
}

function readArray(value: unknown, error: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(error)
  return value
}

function readLiteral<Value extends string>(value: unknown, values: readonly Value[], error: string): Value {
  if (!values.includes(value as Value)) throw new Error(error)
  return value as Value
}
