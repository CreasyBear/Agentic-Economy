import { claimBusiness, createEmptyBusinessSourceState, validateOwnerPublishedPhone } from '@/modules/business/public'
import type { BusinessMutationActor } from '@/modules/business/public'
import { brandNonEmpty } from '@/modules/common/ids'
import type { CorrelationId, OperationKey, Slug, SourceHash } from '@/modules/common/ids'
import { normalizeSlug } from '@/modules/common/normalize-slug'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { matchingCsrf } from '@/modules/common/matching-csrf'
import { sanitizeText } from '@/modules/common/sanitize-text'
import { buildOfferingSupplyProjection, createEmptyCatalogSourceState } from './catalog-model'
import { publishBusinessCatalog } from './publish'
import type {
  FirstRequestMode,
  PublicFirstRequestChannel,
  PublishBusinessCatalogState,
  ServiceCatalogInput,
} from './catalog-model'
import { projectBusinessSupplyToPublicApi } from '@/modules/registry/public'
import type { PublicBusinessCatalogApiV2Dto } from '@/modules/registry/public'

const PublicOwnerClaimFieldValues = [
  'businessName',
  'category',
  'suburb',
  'stateTerritory',
  'requestedSlug',
  'publishedPhone',
  'ownerMessage',
  'sourceLabel',
  'serviceName',
  'serviceCategory',
  'serviceSummary',
  'serviceArea',
  'hoursOrUnknown',
  'photoUrl',
  'responseTimeMinutes',
  'firstRequestMode',
  'publicDisclosure',
  'noContactReason',
] as const

export type PublicOwnerClaimField = (typeof PublicOwnerClaimFieldValues)[number]

export type PublicOwnerClaimFlowInput = {
  businessName: string
  category: string
  suburb: string
  stateTerritory: string
  requestedSlug: string
  publishedPhone: string
  ownerMessage: string
  sourceLabel: string
  serviceName: string
  serviceCategory: string
  serviceSummary: string
  serviceArea: string
  hoursOrUnknown: string
  photoUrl: string
  responseTimeMinutes: string
  firstRequestMode: FirstRequestMode
  publicDisclosure: string
  noContactReason: string
}

export type PublicOwnerClaimValidationError = {
  field: PublicOwnerClaimField
  message: string
}

export type PublicOwnerClaimValidationResult =
  | { kind: 'valid'; input: PublicOwnerClaimFlowInput }
  | { kind: 'invalid'; errors: readonly PublicOwnerClaimValidationError[] }

export type PublicOwnerUnavailableCapability = {
  label: 'Bookings not live' | 'Payments not live' | 'Automated actions not live'
  explanation: string
}

export type PublicOwnerStatusReadback = {
  publicUrl: string
  noindex: true
  catalog: PublicBusinessCatalogApiV2Dto
  projectionMode: 'public_source' | 'local_preview'
  unavailableCapabilities: readonly PublicOwnerUnavailableCapability[]
  nextAction: string
}

export type PublicOwnerClaimFlowResult =
  | {
      kind: 'ok'
      code: 'claim_flow_published'
      catalog: PublicBusinessCatalogApiV2Dto
      readback: PublicOwnerStatusReadback
    }
  | {
      kind: 'error'
      code: 'claim_flow_invalid' | 'claim_flow_claim_rejected' | 'claim_flow_publish_rejected'
      retryable: boolean
      reason: string
      errors?: readonly PublicOwnerClaimValidationError[]
    }
export type PublicBusinessPageNotFoundReason = 'no_such_business' | 'not_public'


export type PublicBusinessPageReadbackResult =
  | { kind: 'available'; catalog: PublicBusinessCatalogApiV2Dto }
  | { kind: 'not_found'; reason: PublicBusinessPageNotFoundReason }
  | { kind: 'unavailable'; reason: 'source_unavailable'; retryable: true }

export const publicOwnerDefaultClaimInput = {
  businessName: 'Parramatta Emergency Plumbing',
  category: 'Emergency plumbing',
  suburb: 'Parramatta',
  stateTerritory: 'NSW',
  requestedSlug: 'parramatta-emergency-plumbing',
  publishedPhone: '',
  ownerMessage: 'Owner supplied emergency plumbing facts for the public service page.',
  sourceLabel: 'Owner supplied service facts',
  serviceName: 'Emergency pipe repair',
  serviceCategory: 'Emergency plumbing',
  serviceSummary: 'Burst pipe triage and repair for urgent local plumbing jobs.',
  serviceArea: 'Parramatta and nearby suburbs',
  hoursOrUnknown: 'Hours supplied by owner',
  photoUrl: '',
  responseTimeMinutes: '',
  firstRequestMode: 'not_available_yet',
  publicDisclosure: 'This business has not published a request path.',
  noContactReason: 'Owner has not supplied public contact instructions.',
} satisfies PublicOwnerClaimFlowInput

const firstRequestModes = new Set<FirstRequestMode>([
  'inquiry_available',
  'quote_request_available',
  'not_available_yet',
])

const requiredFieldLabels = {
  businessName: 'Business name',
  category: 'Business category',
  suburb: 'Suburb',
  stateTerritory: 'State or territory',
  requestedSlug: 'Public page slug',
  sourceLabel: 'Fact note',
  serviceName: 'Service name',
  serviceCategory: 'Service category',
  serviceSummary: 'Service summary',
  serviceArea: 'Service area',
  hoursOrUnknown: 'Hours or unknown',
} satisfies Record<
  Exclude<
    PublicOwnerClaimField,
    'ownerMessage' | 'publishedPhone' | 'firstRequestMode' | 'publicDisclosure' | 'noContactReason' | 'photoUrl' | 'responseTimeMinutes'
  >,
  string
>

const sourceOwnedActor: BusinessMutationActor = {
  kind: 'authenticated_owner',
  clerkUserId: 'source-owned-owner-session',
  displayName: 'Sam',
}

type PublicOwnerRouteState = PublishBusinessCatalogState

let publicOwnerRouteState = createPublicOwnerFlowState()

export function validatePublicOwnerClaimFlowInput(
  input: PublicOwnerClaimFlowInput
): PublicOwnerClaimValidationResult {
  const normalized = normalizeInput(input)
  const errors: PublicOwnerClaimValidationError[] = []

  for (const [field, label] of Object.entries(requiredFieldLabels) as readonly [
    keyof typeof requiredFieldLabels,
    string,
  ][]) {
    if (normalized[field].length === 0) {
      errors.push({ field, message: `${label} is required.` })
    }
  }

  if (!firstRequestModes.has(input.firstRequestMode)) {
    errors.push({ field: 'firstRequestMode', message: 'Choose what the first safe request can show.' })
  }

  if (normalized.firstRequestMode === 'not_available_yet') {
    if (normalized.noContactReason.length === 0) {
      errors.push({ field: 'noContactReason', message: 'Explain why no request path is published.' })
    }
  } else if (normalized.publicDisclosure.length === 0) {
    errors.push({ field: 'publicDisclosure', message: 'Describe the public first-request instruction.' })
  }

  if (validateOwnerPublishedPhone(normalized.publishedPhone).kind === 'invalid') {
    errors.push({ field: 'publishedPhone', message: 'Enter a valid Australian phone number.' })
  }

  if (errors.length > 0) {
    return { kind: 'invalid', errors }
  }

  return { kind: 'valid', input: normalized }
}

export function submitPublicOwnerClaimFlow(input: PublicOwnerClaimFlowInput): PublicOwnerClaimFlowResult {
  return submitPublicOwnerClaimFlowWithState(createPublicOwnerFlowState(), input)
}

export function submitDurablePublicOwnerClaimFlow(input: PublicOwnerClaimFlowInput): PublicOwnerClaimFlowResult {
  return submitPublicOwnerClaimFlowWithState(publicOwnerRouteState, input)
}

export function resetPublicOwnerRouteReadbacksForTest(): void {
  publicOwnerRouteState = createPublicOwnerFlowState()
}

export function getPublicOwnerStatusReadbackBySlug(slug: string): PublicOwnerStatusReadback | undefined {
  const catalog = readPublicOwnerRouteCatalogBySlug(slug)
  return catalog === undefined ? undefined : buildPublicOwnerStatusReadback(catalog)
}

function submitPublicOwnerClaimFlowWithState(
  state: PublicOwnerRouteState,
  input: PublicOwnerClaimFlowInput
): PublicOwnerClaimFlowResult {
  const validation = validatePublicOwnerClaimFlowInput(input)
  if (validation.kind === 'invalid') {
    return {
      kind: 'error',
      code: 'claim_flow_invalid',
      retryable: false,
      reason: 'Some service page facts need attention.',
      errors: validation.errors,
    }
  }

  const slug = brandNonEmpty(validation.input.requestedSlug, 'Slug')
  const photos = parseClaimPhotos(validation.input.photoUrl, validation.input.businessName)
  const responseTimeMinutes = parseResponseTimeMinutes(validation.input.responseTimeMinutes)
  const claim = claimBusiness(state, {
    actor: sourceOwnedActor,
    facts: {
      name: validation.input.businessName,
      category: validation.input.category,
      suburb: validation.input.suburb,
      stateTerritory: validation.input.stateTerritory,
      requestedSlug: validation.input.requestedSlug,
      ...(validation.input.publishedPhone.length === 0 ? {} : { publishedPhone: validation.input.publishedPhone }),
      ...(validation.input.ownerMessage.length === 0 ? {} : { ownerMessage: validation.input.ownerMessage }),
      ...(photos.length === 0 ? {} : { photos }),
      ...(responseTimeMinutes === undefined ? {} : { responseTimeMinutes }),
      sourceRefs: [
        {
          label: validation.input.sourceLabel,
          evidenceRef: `private:evidence:${validation.input.requestedSlug}`,
          sourceHash: sourceHash(`source:${validation.input.requestedSlug}`),
        },
      ],
    },
    security: {
      csrf: matchingCsrf('claim'),
    },
    operationKey: operationKey(`claim:${slug}`),
    correlationId: correlationId(`claim:${slug}`),
    now: 1_000,
  })

  if (claim.kind === 'error') {
    return {
      kind: 'error',
      code: 'claim_flow_claim_rejected',
      retryable: claim.retryable,
      reason: claim.reason,
    }
  }

  const published = publishBusinessCatalog(state, {
    actor: sourceOwnedActor,
    claimId: claim.claim.claimId,
    services: [toServiceCatalogInput(validation.input)],
    security: { csrf: matchingCsrf('publish') },
    operationKey: operationKey(`publish:${slug}`),
    correlationId: correlationId(`publish:${slug}`),
    now: 2_000,
  })

  if (published.kind === 'error') {
    return {
      kind: 'error',
      code: 'claim_flow_publish_rejected',
      retryable: published.retryable,
      reason: published.reason,
    }
  }

  return {
    kind: 'ok',
    code: 'claim_flow_published',
    catalog: published.catalog,
    readback: buildPublicOwnerStatusReadback(published.catalog),
  }
}

export function getDefaultPublicOwnerStatusReadback(): PublicOwnerStatusReadback {
  const result = submitPublicOwnerClaimFlow(publicOwnerDefaultClaimInput)
  if (result.kind === 'error') {
    throw new Error(`Default public owner readback failed: ${result.reason}`)
  }

  return result.readback
}

export function getPublicBusinessPageReadback(slug: string): PublicBusinessPageReadbackResult {
  const readback = getDefaultPublicOwnerStatusReadback()
  if (readback.catalog.slug !== slug) {
    const routeCatalog = readPublicOwnerRouteCatalogBySlug(slug)
    if (routeCatalog !== undefined) {
      return { kind: 'available', catalog: routeCatalog }
    }

    return { kind: 'not_found', reason: 'no_such_business' }
  }

  return { kind: 'available', catalog: readback.catalog }
}

export function buildPublicOwnerStatusReadback(catalog: PublicBusinessCatalogApiV2Dto): PublicOwnerStatusReadback {
  return {
    publicUrl: `/${catalog.slug}`,
    noindex: true,
    catalog,
    projectionMode: 'public_source',
    unavailableCapabilities: [
      {
        label: 'Bookings not live',
        explanation: 'Customers can read service facts, but booking is not enabled in this phase.',
      },
      {
        label: 'Payments not live',
        explanation: 'Payment remains between the customer and the business.',
      },
      {
        label: 'Automated actions not live',
        explanation: 'The business reviews each request before acting.',
      },
    ],
    nextAction: ownerNextAction(catalog),
  }
}

function createPublicOwnerFlowState(): PublishBusinessCatalogState {
  return {
    ...createEmptyBusinessSourceState(),
    ...createEmptyCatalogSourceState(),
    operationKeys: [],
    auditEvents: [],
    registryProjectionAttempts: [],
    discoveryManifestAttempts: [],
  }
}

function readPublicOwnerRouteCatalogBySlug(slug: string): PublicBusinessCatalogApiV2Dto | undefined {
  const normalizedSlug = normalizeSlug(slug)
  const business = publicOwnerRouteState.businesses.find(
    (candidate) => candidate.slug === normalizedSlug && candidate.publicStatus === 'published'
  )
  if (business === undefined) {
    return undefined
  }

  const context = publicOwnerRouteState.businessContexts.find((candidate) => candidate.businessId === business.businessId)
  if (context === undefined) {
    return undefined
  }

  const projection = buildOfferingSupplyProjection({
    business,
    context,
    offerings: publicOwnerRouteState.offerings.filter((offering) => offering.businessId === business.businessId),
    revisions: publicOwnerRouteState.revisions.filter((revision) => revision.businessId === business.businessId),
    accessPaths: publicOwnerRouteState.accessPaths.filter((path) => path.businessId === business.businessId),
    indexStatus: 'queued',
    discoveryStatus: 'degraded',
  })
  return projection === undefined ? undefined : projectBusinessSupplyToPublicApi(projection)
}

export function toServiceCatalogInput(
  input: PublicOwnerClaimFlowInput,
  options: Readonly<{ omitBlankDisclosure?: boolean }> = {},
): ServiceCatalogInput {
  return {
    name: input.serviceName,
    category: input.serviceCategory,
    summary: input.serviceSummary,
    serviceArea: input.serviceArea,
    hoursOrUnknown: input.hoursOrUnknown,
    firstRequest:
      input.firstRequestMode === 'not_available_yet'
        ? {
            mode: input.firstRequestMode,
            publicChannel: 'not_available',
            ...(options.omitBlankDisclosure === true && input.publicDisclosure.trim().length === 0
              ? {}
              : { publicDisclosure: input.publicDisclosure }),
            noContactReason: input.noContactReason,
          }
        : {
            mode: input.firstRequestMode,
            publicChannel: publicChannelFor(input.firstRequestMode),
            publicDisclosure: input.publicDisclosure,
          },
  }
}

function publicChannelFor(mode: Exclude<FirstRequestMode, 'not_available_yet'>): Extract<
  PublicFirstRequestChannel,
  'public_business_contact' | 'ae_status_only'
> {
  return mode === 'quote_request_available' ? 'ae_status_only' : 'public_business_contact'
}

function ownerNextAction(catalog: PublicBusinessCatalogApiV2Dto): string {
  if (catalog.disposition === 'stale') {
    return 'Review search status before sharing widely.'
  }

  if (catalog.disposition === 'partial') {
    return 'Share the public page while assistant-ready data catches up.'
  }

  return 'Share the public page and keep service facts current.'
}

function normalizeInput(input: PublicOwnerClaimFlowInput): PublicOwnerClaimFlowInput {
  return {
    businessName: cleanText(input.businessName),
    category: cleanText(input.category),
    suburb: cleanText(input.suburb),
    stateTerritory: cleanText(input.stateTerritory),
    requestedSlug: normalizeSlug(input.requestedSlug),
    publishedPhone: cleanText(input.publishedPhone),
    ownerMessage: cleanText(input.ownerMessage),
    sourceLabel: cleanText(input.sourceLabel),
    serviceName: cleanText(input.serviceName),
    serviceCategory: cleanText(input.serviceCategory),
    serviceSummary: cleanText(input.serviceSummary),
    serviceArea: cleanText(input.serviceArea),
    hoursOrUnknown: cleanText(input.hoursOrUnknown),
    photoUrl: cleanText(input.photoUrl),
    responseTimeMinutes: cleanText(input.responseTimeMinutes),
    firstRequestMode: input.firstRequestMode,
    publicDisclosure: cleanText(input.publicDisclosure),
    noContactReason: cleanText(input.noContactReason),
  }
}

function cleanText(value: string): string {
  return sanitizeText(value, 280)
}



function sourceHash(value: string): SourceHash {
  return canonicalDigest(value)
}

function operationKey(value: string): OperationKey {
  return brandNonEmpty(`op:owner-ui:${value}`, 'OperationKey')
}

function correlationId(value: string): CorrelationId {
  return brandNonEmpty(`corr:owner-ui:${value}`, 'CorrelationId')
}


function parseClaimPhotos(photoUrl: string, businessName: string) {
  const url = photoUrl.trim()
  if (url.length === 0 || (!/^https?:\/\//i.test(url) && !url.startsWith('/'))) {
    return [] as const
  }

  return [{ url, alt: `${businessName} photo` }] as const
}

function parseResponseTimeMinutes(value: string): number | undefined {
  const trimmed = value.trim()
  if (trimmed.length === 0) {
    return undefined
  }

  const minutes = Number.parseInt(trimmed, 10)
  if (!Number.isFinite(minutes) || minutes <= 0 || minutes > 24 * 60) {
    return undefined
  }

  return minutes
}
