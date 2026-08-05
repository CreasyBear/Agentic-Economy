import type { PublicBusinessCatalogApiV2Dto } from '@/modules/registry/public'
import type {
  PublicAccessPath,
  PublicBusinessPageRouteReadbackResult,
  PublicOfferingSupplyProjection,
} from '@/modules/catalog/public'
import { projectBusinessSupplyToPublicApi } from '@/modules/registry/public'
import type { BusinessId, OperationKey, CorrelationId, OfferingRef } from '@/modules/common/ids'
import { brandNonEmpty } from '@/modules/common/ids'
import {
  PUBLIC_INQUIRY_UNAVAILABLE_REASON,
  PUBLIC_PHONE_CHANNEL_DISCLOSURE,
  PUBLIC_WEBSITE_CHANNEL_DISCLOSURE,
} from '@/modules/inquiries/public-copy'
import { normalizeInquiryWhitespace } from './internal/normalize-text'
import {
  createEmptyInquirySourceState,
  evaluateR1TargetAdmission,
  submitInquiry,
  type AdmissionBlocker,
  type InquiryNotificationStatus,
  type InquiryCustomerAccessKeyring,
  type GovernedSendIntegrityKeyring,
  type InquiryOriginRef,
  type InquirySourceState,
  type InquiryTargetRef,
  type PublicInquiryContactInput,
  type SubmitInquiryErrorCode,
  type R1TargetAdmission,
} from '@/modules/inquiries/public'

export type PublicInquiryFormInput = {
  body: string
  contact: PublicInquiryContactInput
}

export type PublicInquiryFormField = 'body' | 'email' | 'phone'

export type PublicInquiryValidationError = {
  field: PublicInquiryFormField
  message: string
}

export type PublicInquiryValidationResult =
  | { kind: 'valid'; input: PublicInquiryFormInput }
  | { kind: 'invalid'; errors: readonly PublicInquiryValidationError[] }

export type PublicInquiryTarget = InquiryTargetRef

export type PublicInquiryAffordance =
  | {
      kind: 'available'
      label: 'Send inquiry'
      href: string
      businessName: string
      offeringName: string
      disclosure: string
      target: PublicInquiryTarget
    }
  | {
      kind: 'unavailable'
      label: 'Inquiry unavailable'
      reason: string
      blockers?: readonly AdmissionBlocker[]
      businessName: string
      offeringName?: string
    }

export type PublicInquiryRouteReadback =
  | {
      kind: 'available'
      slug: string
      businessName: string
      offeringName: string
      disclosure: string
      target: PublicInquiryTarget
      maxBodyLength: number
      submitted?: PublicInquirySubmittedReceipt
    }
  | {
      kind: 'unavailable'
      slug: string
      reason: string
      blockers?: readonly AdmissionBlocker[]
      businessName?: string
      offeringName?: string
    }

export type PublicInquirySubmittedReceipt = {
  threadId: string
  businessName: string
  offeringName: string
  status: 'unread' | 'read' | 'replied' | 'closed'
  notificationStatus: InquiryNotificationStatus
  deliveryLabel: string
  accessKey: string
}

export type PublicInquiryRouteInput = {
  slug: string
  page?: PublicBusinessPageRouteReadbackResult
  state?: InquirySourceState
  admission?: R1TargetAdmission
  preferredOfferingRef?: OfferingRef
}

export type PublicInquiryRouteSubmitInput = PublicInquiryFormInput & {
  slug: string
  state: InquirySourceState
  operationKey: OperationKey
  correlationId: CorrelationId
  pseudonymousSessionId: string
  abuseBucketKey?: string
  now: number
  expectedDigest: string
  inquiryOrigin?: InquiryOriginRef
  notificationStatus?: InquiryNotificationStatus
  notificationFailureCode?: string
  customerAccessKeyring: InquiryCustomerAccessKeyring
  governedSendIntegrityKeyring: GovernedSendIntegrityKeyring
}

export type PublicInquiryRouteSubmitResult =
  | {
      kind: 'submitted'
      code: 'inquiry_submitted' | 'inquiry_replayed'
      state: InquirySourceState
      receipt: PublicInquirySubmittedReceipt
      readback: PublicInquiryRouteReadback
    }
  | {
      kind: 'error'
      code: SubmitInquiryErrorCode
      reason: string
      retryable: boolean
      blockers?: readonly AdmissionBlocker[]
      field?: string
      retryAfter?: number
      state?: InquirySourceState
    }

const defaultBodyLength = createEmptyInquirySourceState().operatorControls.maxBodyLength

export function validatePublicInquiryFormInput(input: PublicInquiryFormInput): PublicInquiryValidationResult {
  const body = normalizeInquiryWhitespace(input.body)
  const contact = normalizeContact(input.contact)
  const errors: PublicInquiryValidationError[] = []

  if (body.length === 0) {
    errors.push({ field: 'body', message: 'Message is required.' })
  }

  if (contact.email.length === 0 && contact.phone.length === 0) {
    errors.push({ field: 'email', message: 'Email or phone is required.' })
  }

  if (contact.email.length > 0 && (!contact.email.includes('@') || contact.email.includes(' '))) {
    errors.push({ field: 'email', message: 'Email looks malformed.' })
  }

  if (contact.phone.length > 0 && contact.phone.replace(/\D/g, '').length < 6) {
    errors.push({ field: 'phone', message: 'Phone looks malformed.' })
  }

  if (errors.length > 0) {
    return { kind: 'invalid', errors }
  }

  return {
    kind: 'valid',
    input: {
      body,
      contact: {
        ...(contact.name.length === 0 ? {} : { name: contact.name }),
        ...(contact.email.length === 0 ? {} : { email: contact.email }),
        ...(contact.phone.length === 0 ? {} : { phone: contact.phone }),
      },
    },
  }
}

export function buildPublicInquiryAffordance(
  catalog: PublicBusinessCatalogApiV2Dto,
  preferredOfferingRef?: OfferingRef,
  admissionOrState?: R1TargetAdmission | InquirySourceState,
): PublicInquiryAffordance {
  const match = firstInquiryOffering(catalog, preferredOfferingRef)
  if (match === undefined) {
    return {
      kind: 'unavailable',
      label: 'Inquiry unavailable',
      reason: 'This business has not published a human inquiry path yet.',
      businessName: catalog.name,
    }
  }
  const target = {
    businessId: brandNonEmpty(catalog.businessId, 'BusinessId'),
    offeringRef: brandNonEmpty(match.offering.offeringRef, 'OfferingRef'),
  } satisfies InquiryTargetRef
  const admission = admissionOrState === undefined
    ? undefined
    : 'version' in admissionOrState
      ? admissionOrState
      : evaluateR1TargetAdmission(admissionOrState, target)
  if (admission?.admitted !== true) {
    return {
      kind: 'unavailable',
      label: 'Inquiry unavailable',
      reason: PUBLIC_INQUIRY_UNAVAILABLE_REASON,
      businessName: catalog.name,
      offeringName: match.offering.name,
      ...(admission === undefined ? {} : { blockers: admission.blockers }),
    }
  }

  return {
    kind: 'available',
    label: 'Send inquiry',
    href: `/${catalog.slug}/inquiry`,
    businessName: catalog.name,
    offeringName: match.offering.name,
    disclosure: match.path.disclosure,
    target,
  }
}

export function readPublicInquiryRouteReadback(input: PublicInquiryRouteInput): PublicInquiryRouteReadback {
  const page = input.page ?? publicPageFromInquirySourceState(input.state, input.slug)
  if (page.kind !== 'available') {
    return {
      kind: 'unavailable',
      slug: input.slug,
      reason: 'This business page is not public.',
    }
  }

  const affordance = buildPublicInquiryAffordance(
    page.catalog,
    input.preferredOfferingRef,
    input.admission ?? input.state,
  )
  if (affordance.kind === 'unavailable') {
    return {
      kind: 'unavailable',
      slug: input.slug,
      reason: affordance.reason,
      ...(affordance.blockers === undefined ? {} : { blockers: affordance.blockers }),
      businessName: affordance.businessName,
      ...(affordance.offeringName === undefined ? {} : { offeringName: affordance.offeringName }),
    }
  }

  return {
    kind: 'available',
    slug: input.slug,
    businessName: affordance.businessName,
    offeringName: affordance.offeringName,
    disclosure: affordance.disclosure,
    target: affordance.target,
    maxBodyLength: input.state?.operatorControls.maxBodyLength ?? defaultBodyLength,
  }
}

export function submitPublicInquiryRouteReadback(input: PublicInquiryRouteSubmitInput): PublicInquiryRouteSubmitResult {
  const validation = validatePublicInquiryFormInput(input)
  if (validation.kind === 'invalid') {
    const firstError = validation.errors[0]
    return {
      kind: 'error',
      code: 'inquiry_invalid_input',
      retryable: false,
      reason: firstError?.message ?? 'Inquiry input is invalid.',
      ...(firstError === undefined ? {} : { field: firstError.field }),
    }
  }

  const readback = readPublicInquiryRouteReadback({ slug: input.slug, state: input.state })
  if (readback.kind !== 'available') {
    return {
      kind: 'error',
      code: 'inquiry_target_not_admitted',
      retryable: false,
      reason: readback.reason,
      ...(readback.blockers === undefined ? {} : { blockers: readback.blockers }),
    }
  }

  const result = submitInquiry(input.state, {
    target: readback.target,
    body: validation.input.body,
    contact: validation.input.contact,
    customerAccessKeyring: input.customerAccessKeyring,
    governedSendIntegrityKeyring: input.governedSendIntegrityKeyring,
    operationKey: input.operationKey,
    correlationId: input.correlationId,
    ...(input.abuseBucketKey === undefined ? {} : { abuseBucketKey: input.abuseBucketKey }),
    pseudonymousSessionId: input.pseudonymousSessionId,
    now: input.now,
    expectedDigest: input.expectedDigest,
    ...(input.inquiryOrigin === undefined ? {} : { origin: input.inquiryOrigin }),
    ...(input.notificationStatus === undefined ? {} : { notificationStatus: input.notificationStatus }),
    ...(input.notificationFailureCode === undefined ? {} : { notificationFailureCode: input.notificationFailureCode }),
  })

  if (result.kind === 'error') {
    return {
      kind: 'error',
      code: result.code,
      retryable: result.retryable,
      reason: result.reason,
      ...(result.blockers === undefined ? {} : { blockers: result.blockers }),
      ...(result.field === undefined ? {} : { field: result.field }),
      ...(result.retryAfter === undefined ? {} : { retryAfter: result.retryAfter }),
      ...(result.state === undefined ? {} : { state: result.state }),
    }
  }

  const receipt = {
    threadId: result.thread.threadId,
    businessName: readback.businessName,
    offeringName: readback.offeringName,
    status: result.thread.status,
    notificationStatus: result.notification.status,
    deliveryLabel: deliveryLabel(result.notification.status),
    accessKey: result.customerAccessKey,
  } satisfies PublicInquirySubmittedReceipt

  return {
    kind: 'submitted',
    code: result.code,
    state: result.state,
    receipt,
    readback: {
      ...readback,
      submitted: receipt,
    },
  }
}

function publicPageFromInquirySourceState(
  state: InquirySourceState | undefined,
  slug: string
): PublicBusinessPageRouteReadbackResult {
  if (state === undefined) {
    return { kind: 'not_found', reason: 'not_public' }
  }

  const business = state.businesses.find((candidate) => candidate.slug === slug && candidate.publicStatus === 'published')
  if (business === undefined) {
    return { kind: 'not_found', reason: 'not_public' }
  }

  const offerings: PublicOfferingSupplyProjection[] = []
  for (const offering of state.businessOfferings) {
    if (offering.businessId !== business.businessId || offering.status !== 'published') continue
    const revision = state.businessOfferingRevisions.find((candidate) => (
      candidate.businessId === offering.businessId
      && candidate.offeringRef === offering.offeringRef
      && candidate.revision === offering.currentRevision
    ))
    if (revision === undefined) continue
    const accessPaths = state.offeringAccessPaths
      .reduce<{ accessPathRef: (typeof state.offeringAccessPaths)[number]['accessPathRef']; descriptor: (typeof state.offeringAccessPaths)[number]['descriptor'] }[]>((acc, path) => {
        if (path.businessId === offering.businessId && path.offeringRef === offering.offeringRef && path.offeringRevision === revision.revision && path.offeringSourceHash === revision.sourceHash && path.status === 'published') {
          acc.push({ accessPathRef: path.accessPathRef, descriptor: path.descriptor })
        }
        return acc
      }, [])
    offerings.push({
      offering: {
        offeringRef: revision.offeringRef,
        revision: revision.revision,
        name: revision.name,
        category: revision.category,
        summary: revision.summary,
        ...(revision.serviceAreaSummary === undefined ? {} : { serviceAreaSummary: revision.serviceAreaSummary }),
        ...(revision.availabilitySummary === undefined ? {} : { availabilitySummary: revision.availabilitySummary }),
        ...(revision.pricingSummary === undefined ? {} : { pricingSummary: revision.pricingSummary }),
        ...(revision.price === undefined ? {} : { price: revision.price }),
      },
      accessPaths,
      support: {
        integrated: false,
        routeable: false,
        reasons: [],
      },
    } satisfies PublicOfferingSupplyProjection)
  }

  if (offerings.length === 0) {
    return { kind: 'not_found', reason: 'not_public' }
  }

  const sourceProjection = {
    business: {
      businessId: business.businessId,
      slug: business.slug,
      name: business.name,
      category: business.category,
      suburb: business.suburb,
      stateTerritory: business.stateTerritory,
      ...(business.publishedPhone === undefined ? {} : { publishedPhone: business.publishedPhone }),
      publicUrl: `/${business.slug}`,
      trustTier: business.trustTier,
      photos: [],
    },
    offerings,
    sourceRevision: 0,
    sourceDigest: business.sourceHash,
    observedAt: business.updatedAt,
    disposition: 'current' as const,
  }
  return {
    kind: 'available',
    catalog: projectBusinessSupplyToPublicApi(sourceProjection),
  }
}

export function selectPublicInquiryTarget(
  catalog: PublicBusinessCatalogApiV2Dto,
  preferredOfferingRef?: OfferingRef,
): InquiryTargetRef | undefined {
  const match = firstInquiryOffering(catalog, preferredOfferingRef)
  return match === undefined
    ? undefined
    : {
        businessId: brandNonEmpty(catalog.businessId, 'BusinessId'),
        offeringRef: brandNonEmpty(match.offering.offeringRef, 'OfferingRef'),
      }
}

export function projectPublicInquiryAvailability(
  catalog: PublicBusinessCatalogApiV2Dto,
  admission: R1TargetAdmission | undefined,
): PublicBusinessCatalogApiV2Dto {
  if (admission?.admitted === true) return catalog
  return {
    ...catalog,
    offerings: catalog.offerings.map((offering) => ({
      ...offering,
      accessPaths: offering.accessPaths.filter((path) => {
        if (path.kind !== 'human_request') return true
        return path.channel !== 'ae_inquiry'
      }),
    })),
  }
}

/**
 * Offering supply as the business page should render it.
 *
 * `inquiryHref` is the reachable inquiry destination, or `undefined` when the
 * inquiry route would refuse. Refused means the AE path is withdrawn rather
 * than shown without a destination, and the human channels that remain are
 * described by their own channel instead of the stored first-contact copy.
 * Admitted means the AE path carries the destination, so the sentence the
 * reader is given and the link they can click are the same fact.
 */
export function projectPublicInquiryOfferingSupply(
  offerings: readonly PublicOfferingSupplyProjection[],
  inquiryHref: string | undefined,
): readonly PublicOfferingSupplyProjection[] {
  return offerings.map((offering) => ({
    ...offering,
    accessPaths: offering.accessPaths.flatMap((path): readonly PublicAccessPath[] => {
      const descriptor = path.descriptor
      if (descriptor.kind !== 'human_request') return [path]
      if (descriptor.channel === 'ae_inquiry') {
        return inquiryHref === undefined ? [] : [{ ...path, descriptor: { ...descriptor, url: inquiryHref } }]
      }
      if (inquiryHref !== undefined) return [path]
      return [{
        ...path,
        descriptor: {
          ...descriptor,
          disclosure: descriptor.channel === 'phone'
            ? PUBLIC_PHONE_CHANNEL_DISCLOSURE
            : PUBLIC_WEBSITE_CHANNEL_DISCLOSURE,
        },
      }]
    }),
  }))
}

export function selectOwnerAdmissionTarget(
  catalog: PublicBusinessCatalogApiV2Dto,
): InquiryTargetRef | undefined {
  return selectPublicInquiryTarget(catalog)
}

function firstInquiryOffering(
  catalog: PublicBusinessCatalogApiV2Dto,
  preferredOfferingRef?: OfferingRef,
) {
  const offerings = preferredOfferingRef === undefined
    ? catalog.offerings
    : [
        ...catalog.offerings.filter((offering) => offering.offeringRef === preferredOfferingRef),
        ...catalog.offerings.filter((offering) => offering.offeringRef !== preferredOfferingRef),
      ]

  for (const offering of offerings) {
    const path = offering.accessPaths.find(
      (candidate) => candidate.kind === 'human_request' && candidate.channel === 'ae_inquiry',
    )
    if (path === undefined) continue
    if (path.kind !== 'human_request') continue
    if (path.channel !== 'ae_inquiry') continue
    return { offering, path }
  }

  return undefined
}

function deliveryLabel(status: InquiryNotificationStatus): string {
  switch (status) {
    case 'queued':
      return 'Queued for owner delivery'
    case 'sent':
      return 'Delivery recorded'
    case 'failed':
      return 'Delivery needs review'
    case 'held':
      return 'Delivery held in source state'
  }
}

function normalizeContact(input: PublicInquiryContactInput): { name: string; email: string; phone: string } {
  return {
    name: normalizeInquiryWhitespace(input.name ?? ''),
    email: normalizeInquiryWhitespace(input.email ?? '').toLowerCase(),
    phone: normalizeInquiryWhitespace(input.phone ?? ''),
  }
}

