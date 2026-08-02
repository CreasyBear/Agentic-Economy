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

export type BusinessSupplyProjectionSnapshotEnvelope = Readonly<{
  businessId?: string
  sourceRevision?: number
  sourceDigest?: string
  observedAt?: number
  disposition?: BusinessSupplyProjection['disposition']
}>

type ProjectionOffering = BusinessSupplyProjection['offerings'][number]
type ProjectionSupportReason = ProjectionOffering['support']['reasons'][number]

type DecoderContext = {
  errorPrefix: BusinessSupplyProjectionErrorPrefix
  expectedBusinessId?: string
  expectedSlug?: string
  envelope?: BusinessSupplyProjectionSnapshotEnvelope
}

/** Decode the persisted projection once at each public Convex boundary. */
export function readBusinessSupplyProjectionSnapshot(
  value: unknown,
  errorPrefix: BusinessSupplyProjectionErrorPrefix,
  expectedBusinessId?: string,
  expectedSlug?: string,
  envelope?: BusinessSupplyProjectionSnapshotEnvelope,
): BusinessSupplyProjection {
  const context: DecoderContext = {
    errorPrefix,
    ...(expectedBusinessId === undefined ? {} : { expectedBusinessId }),
    ...(expectedSlug === undefined ? {} : { expectedSlug }),
    ...(envelope === undefined ? {} : { envelope }),
  }
  const isLegacyProjectionJson = typeof value === 'string'
  const decoded = decodeProjectionValue(value, context)
  const projection = errorPrefix === 'discovery'
    ? readDiscoveryProjection(decoded, context)
    : (() => {
        const row = readRecord(decoded, `${errorPrefix}_projection_invalid`)
        return {
          business: readPersistedBusiness(row.business, context),
          offerings: readArray(row.offerings, `${errorPrefix}_projection_offerings_invalid`)
            .map((entry) => readPersistedOffering(entry, context)),
          sourceRevision: readNumber(row.sourceRevision, `${errorPrefix}_projection_source_revision_invalid`),
          sourceDigest: brandNonEmpty(
            readString(row.sourceDigest, `${errorPrefix}_projection_source_digest_invalid`),
            'SourceHash',
          ),
          observedAt: readNumber(row.observedAt, `${errorPrefix}_projection_observed_at_invalid`),
          disposition: readDisposition(row.disposition, context),
        }
      })()
  if (isLegacyProjectionJson) validateProjectionEnvelope(projection, context)
  return projection
}

function validateProjectionEnvelope(
  projection: BusinessSupplyProjection,
  context: DecoderContext,
): void {
  const envelope = context.envelope
  if (envelope === undefined) return
  if (envelope.businessId !== undefined && projection.business.businessId !== envelope.businessId) {
    throw new Error(`${context.errorPrefix}_projection_envelope_business_mismatch`)
  }
  if (envelope.sourceRevision !== undefined && projection.sourceRevision !== envelope.sourceRevision) {
    throw new Error(`${context.errorPrefix}_projection_envelope_revision_mismatch`)
  }
  if (envelope.sourceDigest !== undefined && projection.sourceDigest !== envelope.sourceDigest) {
    throw new Error(`${context.errorPrefix}_projection_envelope_digest_mismatch`)
  }
  if (envelope.observedAt !== undefined && projection.observedAt !== envelope.observedAt) {
    throw new Error(`${context.errorPrefix}_projection_envelope_observed_at_mismatch`)
  }
  if (envelope.disposition !== undefined && projection.disposition !== envelope.disposition) {
    throw new Error(`${context.errorPrefix}_projection_envelope_disposition_mismatch`)
  }
}

function decodeProjectionValue(value: unknown, context: DecoderContext): unknown {
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value) as unknown
  } catch {
    throw new Error(`${context.errorPrefix}_projection_json_invalid`)
  }
}

function readPersistedBusiness(
  value: unknown,
  context: DecoderContext,
): BusinessSupplyProjection['business'] {
  const row = readRecord(value, `${context.errorPrefix}_projection_business_invalid`)
  const businessId = readString(row.businessId, `${context.errorPrefix}_projection_business_id_invalid`)
  const slug = readString(row.slug, `${context.errorPrefix}_projection_business_slug_invalid`)
  const publishedPhone = readOptionalString(row.publishedPhone, `${context.errorPrefix}_projection_business_phone_invalid`)
  const postcode = readOptionalString(row.postcode, `${context.errorPrefix}_projection_business_postcode_invalid`)
  const responseTimeMinutes = readOptionalNumber(row.responseTimeMinutes, `${context.errorPrefix}_projection_business_response_time_invalid`)
  const photos = row.photos === undefined
    ? undefined
    : readArray(row.photos, `${context.errorPrefix}_projection_business_photos_invalid`).map((photo) => {
        const photoRecord = readRecord(photo, `${context.errorPrefix}_projection_business_photo_invalid`)
        return {
          url: readString(photoRecord.url, `${context.errorPrefix}_projection_business_photo_url_invalid`),
          alt: readString(photoRecord.alt, `${context.errorPrefix}_projection_business_photo_alt_invalid`),
        }
      })
  if (context.expectedBusinessId !== undefined && businessId !== context.expectedBusinessId) {
    throw new Error(`${context.errorPrefix}_projection_business_mismatch`)
  }
  if (context.expectedSlug !== undefined && slug !== context.expectedSlug) {
    throw new Error(`${context.errorPrefix}_projection_slug_mismatch`)
  }
  return {
    businessId: brandNonEmpty(businessId, 'BusinessId'),
    slug,
    name: readString(row.name, `${context.errorPrefix}_projection_business_name_invalid`),
    category: readString(row.category, `${context.errorPrefix}_projection_business_category_invalid`),
    suburb: readString(row.suburb, `${context.errorPrefix}_projection_business_suburb_invalid`),
    stateTerritory: readString(row.stateTerritory, `${context.errorPrefix}_projection_business_state_invalid`),
    ...(publishedPhone === undefined ? {} : { publishedPhone }),
    ...(postcode === undefined ? {} : { postcode }),
    publicUrl: readString(row.publicUrl, `${context.errorPrefix}_projection_business_url_invalid`),
    trustTier: readTrustTier(row.trustTier, context),
    ...(responseTimeMinutes === undefined ? {} : { responseTimeMinutes }),
    ...(photos === undefined ? {} : { photos }),
  }
}

function readPersistedOffering(
  value: unknown,
  context: DecoderContext,
): ProjectionOffering {
  const row = readRecord(value, `${context.errorPrefix}_projection_offering_invalid`)
  const offering = readRecord(row.offering, `${context.errorPrefix}_projection_offering_facts_invalid`)
  const serviceAreaSummary = readOptionalString(offering.serviceAreaSummary, `${context.errorPrefix}_projection_offering_area_invalid`)
  const availabilitySummary = readOptionalString(offering.availabilitySummary, `${context.errorPrefix}_projection_offering_availability_invalid`)
  const pricingSummary = readOptionalString(offering.pricingSummary, `${context.errorPrefix}_projection_offering_pricing_invalid`)
  const price = offering.price === undefined ? undefined : readPrice(offering.price, context)
  const support = readRecord(row.support, `${context.errorPrefix}_projection_offering_support_invalid`)
  const reasons = readArray(support.reasons, `${context.errorPrefix}_projection_offering_reasons_invalid`)
    .map((reason) => readSupportReason(reason, context))
  const observedAt = readOptionalNumber(support.observedAt, `${context.errorPrefix}_projection_offering_observed_at_invalid`)
  const validUntil = readOptionalNumber(support.validUntil, `${context.errorPrefix}_projection_offering_valid_until_invalid`)
  const accessPaths = readArray(row.accessPaths, `${context.errorPrefix}_projection_offering_access_paths_invalid`).map((path) => {
    const pathRecord = readRecord(path, `${context.errorPrefix}_projection_access_path_invalid`)
    return {
      accessPathRef: brandNonEmpty(
        readString(pathRecord.accessPathRef, `${context.errorPrefix}_projection_access_path_ref_invalid`),
        'AccessPathRef',
      ),
      descriptor: readDescriptor(pathRecord.descriptor, context),
    }
  })
  return {
    offering: {
      offeringRef: brandNonEmpty(
        readString(offering.offeringRef, `${context.errorPrefix}_projection_offering_ref_invalid`),
        'OfferingRef',
      ),
      revision: readNumber(offering.revision, `${context.errorPrefix}_projection_offering_revision_invalid`),
      name: readString(offering.name, `${context.errorPrefix}_projection_offering_name_invalid`),
      category: readString(offering.category, `${context.errorPrefix}_projection_offering_category_invalid`),
      summary: readString(offering.summary, `${context.errorPrefix}_projection_offering_summary_invalid`),
      ...(serviceAreaSummary === undefined ? {} : { serviceAreaSummary }),
      ...(availabilitySummary === undefined ? {} : { availabilitySummary }),
      ...(pricingSummary === undefined ? {} : { pricingSummary }),
      ...(price === undefined ? {} : { price }),
    },
    accessPaths,
    support: {
      integrated: readBoolean(support.integrated, `${context.errorPrefix}_projection_offering_integrated_invalid`),
      routeable: readBoolean(support.routeable, `${context.errorPrefix}_projection_offering_routeable_invalid`),
      reasons,
      ...(observedAt === undefined ? {} : { observedAt }),
      ...(validUntil === undefined ? {} : { validUntil }),
    },
  }
}

function readPrice(value: unknown, context: DecoderContext): OfferingPrice {
  const row = readRecord(value, context.errorPrefix === 'catalog' ? 'catalog_invalid_price' : `invalid_${context.errorPrefix}_price`)
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
  const row = readRecord(value, `${context.errorPrefix}_projection_invalid`)
  return {
    business: readPersistedBusiness(row.business, context),
    offerings: readArray(row.offerings, `${context.errorPrefix}_projection_offerings_invalid`)
      .map((entry) => readPersistedOffering(entry, context)),
    sourceRevision: readNumber(row.sourceRevision, `${context.errorPrefix}_projection_source_revision_invalid`),
    sourceDigest: brandNonEmpty(
      readString(row.sourceDigest, `${context.errorPrefix}_projection_source_digest_invalid`),
      'SourceHash',
    ),
    observedAt: readNumber(row.observedAt, `${context.errorPrefix}_projection_observed_at_invalid`),
    disposition: readDisposition(row.disposition, context),
  }
}

function readTrustTier(
  value: unknown,
  context: DecoderContext,
): BusinessSupplyProjection['business']['trustTier'] {
  if (value === 'claimed' || value === 'contact_confirmed' || value === 'listed' || value === 'registry_verified') return value
  throw new Error(`${context.errorPrefix}_projection_trust_tier_invalid`)
}

function readSupportReason(value: unknown, context: DecoderContext): ProjectionSupportReason {
  if (PublicSupportReasonValues.includes(value as ProjectionSupportReason)) return value as ProjectionSupportReason
  throw new Error(`${context.errorPrefix}_projection_support_reason_invalid`)
}

function readDisposition(value: unknown, context: DecoderContext): BusinessSupplyProjection['disposition'] {
  if (value === 'current' || value === 'partial' || value === 'stale') return value
  throw new Error(`${context.errorPrefix}_projection_disposition_invalid`)
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
  if (context.errorPrefix === 'registry') {
    const mapped = field === 'amountMinor' ? 'amount' : field === 'maximumAmountMinor' ? 'maximum' : field
    return `invalid_registry_${mapped}`
  }
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
