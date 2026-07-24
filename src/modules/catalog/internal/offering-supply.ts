import type {
  AccessPathRef,
  BusinessId,
  OfferingRef,
  SourceHash,
} from '@/modules/common/ids'
import { stableHash } from '@/modules/common/stable-hash'

export const BusinessOfferingStatusValues = ['draft', 'published', 'paused', 'retired'] as const
export type BusinessOfferingStatus = (typeof BusinessOfferingStatusValues)[number]

export const OfferingAccessPathStatusValues = ['draft', 'published', 'withdrawn'] as const
export type OfferingAccessPathStatus = (typeof OfferingAccessPathStatusValues)[number]

export const HumanRequestChannelValues = ['phone', 'website', 'ae_inquiry'] as const
export type HumanRequestChannel = (typeof HumanRequestChannelValues)[number]

export const ExternalOperationProvenanceValues = ['business_declared', 'publicly_observed'] as const
export type ExternalOperationProvenance = (typeof ExternalOperationProvenanceValues)[number]

export const PublicSupportReasonValues = [
  'not_integrated',
  'publication_inactive',
  'readiness_unavailable',
  'readiness_stale',
] as const
export type PublicSupportReason = (typeof PublicSupportReasonValues)[number]

export type BusinessOfferingRecord = Readonly<{
  offeringRef: OfferingRef
  businessId: BusinessId
  currentRevision: number
  status: BusinessOfferingStatus
  createdAt: number
  updatedAt: number
}>

export type BusinessOfferingRevisionRecord = Readonly<{
  offeringRef: OfferingRef
  businessId: BusinessId
  revision: number
  name: string
  category: string
  summary: string
  serviceAreaSummary?: string
  availabilitySummary?: string
  pricingSummary?: string
  sourceHash: SourceHash
  createdAt: number
}>


export type HumanRequestAccessPathDescriptor = Readonly<{
  kind: 'human_request'
  channel: HumanRequestChannel
  disclosure: string
  /** Website is an explicit public target; phone and AE inquiry resolve source-owned business routes. */
  url?: string
}>

export type ExternalOperationAccessPathDescriptor = Readonly<{
  kind: 'external_operation'
  name: string
  summary: string
  url: string
  method?: string
  documentationUrl?: string
  interfaceDescription?: Readonly<{ format: string; url?: string }>
  authenticationSummary?: string
  pricingSummary?: string
  provenance: ExternalOperationProvenance
}>

export type OfferingAccessPathDescriptor =
  | HumanRequestAccessPathDescriptor
  | ExternalOperationAccessPathDescriptor

export type OfferingAccessPathRecord = Readonly<{
  accessPathRef: AccessPathRef
  businessId: BusinessId
  offeringRef: OfferingRef
  offeringRevision: number
  offeringSourceHash: SourceHash
  status: OfferingAccessPathStatus
  descriptor: OfferingAccessPathDescriptor
  sourceHash: SourceHash
  createdAt: number
  updatedAt: number
}>

export type OfferingSupportProjection = Readonly<{
  integrated: boolean
  routeable: boolean
  reasons: readonly PublicSupportReason[]
  observedAt?: number
  validUntil?: number
}>

export type PublicAccessPath = Readonly<{
  accessPathRef: AccessPathRef
  descriptor: OfferingAccessPathDescriptor
}>

export type BusinessOfferingProjection = Readonly<{
  offeringRef: OfferingRef
  revision: number
  name: string
  category: string
  summary: string
  serviceAreaSummary?: string
  availabilitySummary?: string
  pricingSummary?: string
}>

export type PublicOfferingSupplyProjection = Readonly<{
  offering: BusinessOfferingProjection
  accessPaths: readonly PublicAccessPath[]
  support: OfferingSupportProjection
}>

export type PublicBusinessProfile = Readonly<{
  businessId: BusinessId
  slug: string
  name: string
  category: string
  suburb: string
  stateTerritory: string
  publishedPhone?: string
  postcode?: string
  publicUrl: string
}>

export type BusinessSupplyProjection = Readonly<{
  business: PublicBusinessProfile
  offerings: readonly PublicOfferingSupplyProjection[]
  sourceRevision: number
  sourceDigest: SourceHash
  observedAt: number
  disposition: 'current' | 'partial' | 'stale'
}>

export type BuildBusinessSupplyProjectionResult =
  | Readonly<{ kind: 'available'; projection: BusinessSupplyProjection }>
  | Readonly<{ kind: 'unavailable'; reason: 'business_not_public' | 'offering_lineage_mismatch' | 'limit_exceeded' }>

export type BuildPublicOfferingSupplyProjectionResult =
  | Readonly<{ kind: 'available'; projection: PublicOfferingSupplyProjection }>
  | Readonly<{
      kind: 'unavailable'
      reason: 'offering_not_published' | 'offering_revision_missing' | 'offering_lineage_mismatch'
    }>

export type OfferingAccessPathValidation =
  | Readonly<{ kind: 'valid'; descriptor: OfferingAccessPathDescriptor }>
  | Readonly<{
      kind: 'invalid'
      reason:
        | 'human_request_invalid'
        | 'external_operation_invalid'
        | 'external_operation_url_invalid'
    }>

const HTTP_METHOD = /^(?:DELETE|GET|HEAD|OPTIONS|PATCH|POST|PUT)$/

export function buildPublicOfferingSupplyProjection(input: Readonly<{
  offering: BusinessOfferingRecord
  revision: BusinessOfferingRevisionRecord
  accessPaths: readonly OfferingAccessPathRecord[]
  support: OfferingSupportProjection
}>): BuildPublicOfferingSupplyProjectionResult {
  if (input.offering.status !== 'published') {
    return { kind: 'unavailable', reason: 'offering_not_published' }
  }
  if (
    input.revision.offeringRef !== input.offering.offeringRef
    || input.revision.businessId !== input.offering.businessId
    || input.revision.revision !== input.offering.currentRevision
  ) {
    return { kind: 'unavailable', reason: 'offering_revision_missing' }
  }
  if (input.support.routeable && !input.support.integrated) {
    return { kind: 'unavailable', reason: 'offering_lineage_mismatch' }
  }

  const publishedPaths = input.accessPaths.filter((path) => path.status === 'published')
  if (publishedPaths.some((path) => (
    path.businessId !== input.offering.businessId
    || path.offeringRef !== input.offering.offeringRef
    || path.offeringRevision !== input.revision.revision
    || path.offeringSourceHash !== input.revision.sourceHash
  ))) {
    return { kind: 'unavailable', reason: 'offering_lineage_mismatch' }
  }

  const offeringProjection: BusinessOfferingProjection = {
    offeringRef: input.offering.offeringRef,
    revision: input.revision.revision,
    name: input.revision.name,
    category: input.revision.category,
    summary: input.revision.summary,
    ...(input.revision.serviceAreaSummary === undefined ? {} : { serviceAreaSummary: input.revision.serviceAreaSummary }),
    ...(input.revision.availabilitySummary === undefined ? {} : { availabilitySummary: input.revision.availabilitySummary }),
    ...(input.revision.pricingSummary === undefined ? {} : { pricingSummary: input.revision.pricingSummary }),
  }

  return {
    kind: 'available',
    projection: {
      offering: offeringProjection,
      accessPaths: publishedPaths.map((path) => ({
        accessPathRef: path.accessPathRef,
        descriptor: path.descriptor,
      })),
      support: input.support,
    },
  }
}

export function buildBusinessSupplyProjection(input: Readonly<{
  business: PublicBusinessProfile
  businessIsPublic: boolean
  offerings: readonly Readonly<{
    offering: BusinessOfferingRecord
    revision: BusinessOfferingRevisionRecord
    accessPaths: readonly OfferingAccessPathRecord[]
    support: OfferingSupportProjection
  }>[]
  sourceRevision: number
  observedAt: number
  disposition?: 'current' | 'partial' | 'stale'
}>): BuildBusinessSupplyProjectionResult {
  if (!input.businessIsPublic) return { kind: 'unavailable', reason: 'business_not_public' }
  if (input.offerings.length > 100) return { kind: 'unavailable', reason: 'limit_exceeded' }

  const projections: PublicOfferingSupplyProjection[] = []
  for (const item of input.offerings) {
    if (item.accessPaths.length > 20) return { kind: 'unavailable', reason: 'limit_exceeded' }
    const result = buildPublicOfferingSupplyProjection(item)
    if (result.kind === 'available') projections.push(result.projection)
    else if (result.reason !== 'offering_not_published') {
      return { kind: 'unavailable', reason: 'offering_lineage_mismatch' }
    }
  }
  projections.sort((left, right) => left.offering.name.localeCompare(right.offering.name))
  const digestInput = {
    business: input.business,
    offerings: projections,
    sourceRevision: input.sourceRevision,
  }
  return {
    kind: 'available',
    projection: {
      business: input.business,
      offerings: projections,
      sourceRevision: input.sourceRevision,
      sourceDigest: stableHash(digestInput) as SourceHash,
      observedAt: input.observedAt,
      disposition: input.disposition ?? 'current',
    },
  }
}

export function validateOfferingAccessPath(input: OfferingAccessPathDescriptor): OfferingAccessPathValidation {
  if (input.kind === 'human_request') {
    const disclosure = cleanText(input.disclosure, 500)
    const url = input.url?.trim()
    if (
      !HumanRequestChannelValues.includes(input.channel)
      || disclosure.length === 0
      || (input.channel === 'website' && (url === undefined || !isPublicHttpsUrl(url)))
      || (input.channel !== 'website' && url !== undefined)
    ) {
      return { kind: 'invalid', reason: 'human_request_invalid' }
    }
    return { kind: 'valid', descriptor: { kind: 'human_request', channel: input.channel, disclosure, ...(url === undefined ? {} : { url }) } }
  }

  const name = cleanText(input.name, 160)
  const summary = cleanText(input.summary, 1_000)
  const method = input.method?.trim().toUpperCase()
  if (name.length === 0 || summary.length === 0 || (method !== undefined && !HTTP_METHOD.test(method))) {
    return { kind: 'invalid', reason: 'external_operation_invalid' }
  }
  if (!isPublicHttpsUrl(input.url) || (input.documentationUrl !== undefined && !isPublicHttpsUrl(input.documentationUrl))) {
    return { kind: 'invalid', reason: 'external_operation_url_invalid' }
  }
  if (input.interfaceDescription?.url !== undefined && !isPublicHttpsUrl(input.interfaceDescription.url)) {
    return { kind: 'invalid', reason: 'external_operation_url_invalid' }
  }

  return {
    kind: 'valid',
    descriptor: {
      kind: 'external_operation',
      name,
      summary,
      url: input.url.trim(),
      ...(method === undefined ? {} : { method }),
      ...(input.documentationUrl === undefined ? {} : { documentationUrl: input.documentationUrl.trim() }),
      ...(input.interfaceDescription === undefined ? {} : {
        interfaceDescription: {
          format: cleanText(input.interfaceDescription.format, 80),
          ...(input.interfaceDescription.url === undefined ? {} : { url: input.interfaceDescription.url.trim() }),
        },
      }),
      ...(input.authenticationSummary === undefined ? {} : { authenticationSummary: cleanText(input.authenticationSummary, 500) }),
      ...(input.pricingSummary === undefined ? {} : { pricingSummary: cleanText(input.pricingSummary, 500) }),
      provenance: input.provenance,
    },
  }
}

function isPublicHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.username.length > 0 || url.password.length > 0) return false
    const host = url.hostname.toLowerCase()
    const bareHost = host.replace(/^\[|\]$/g, '').replace(/\.+$/, '')
    const ipv4 = bareHost.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)?.slice(1).map(Number)
    const privateIpv4 = ipv4 !== undefined && (
      ipv4.some((part) => part > 255)
      || ipv4[0] === 10
      || ipv4[0] === 127
      || (ipv4[0] === 169 && ipv4[1] === 254)
      || (ipv4[0] === 172 && (ipv4[1] ?? 0) >= 16 && (ipv4[1] ?? 0) <= 31)
      || (ipv4[0] === 192 && ipv4[1] === 168)
      || ipv4.every((part) => part === 0)
    )
    return bareHost !== 'localhost'
      && bareHost !== '::1'
      && !bareHost.startsWith('fc')
      && !bareHost.startsWith('fd')
      && !bareHost.startsWith('fe80:')
      && !bareHost.startsWith('::ffff:')
      && !bareHost.endsWith('.localhost')
      && !privateIpv4
  } catch {
    return false
  }
}

function cleanText(value: string, maximum: number): string {
  return value.replaceAll(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, maximum)
}
