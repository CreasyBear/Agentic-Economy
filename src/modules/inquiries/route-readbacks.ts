import type { BusinessRecord } from '@/modules/business/public'
import type {
  PublicBusinessPageRouteReadbackResult,
  PublicRouteCapabilityContract,
  PublicRouteCatalogContract,
  PublicRouteServiceContract,
} from '@/modules/catalog/public'
import type { OperationKey, CorrelationId } from '@/modules/common/ids'
import { PUBLIC_INQUIRY_UNAVAILABLE_REASON } from '@/modules/inquiries/public-copy'
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
      serviceName: string
      disclosure: string
      target: PublicInquiryTarget
    }
  | {
      kind: 'unavailable'
      label: 'Inquiry unavailable'
      reason: string
      blockers?: readonly AdmissionBlocker[]
      businessName: string
      serviceName?: string
    }

export type PublicInquiryRouteReadback =
  | {
      kind: 'available'
      slug: string
      businessName: string
      serviceName: string
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
      serviceName?: string
    }

export type PublicInquirySubmittedReceipt = {
  threadId: string
  businessName: string
  serviceName: string
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
  preferredServiceSlug?: string
}

export type PublicInquiryRouteSubmitInput = PublicInquiryFormInput & {
  slug: string
  state: InquirySourceState
  operationKey: OperationKey
  correlationId: CorrelationId
  pseudonymousSessionId: string
  abuseBucketKey: string
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
  const body = normalizeText(input.body)
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
  catalog: PublicRouteCatalogContract,
  preferredServiceSlug?: string,
  admissionOrState?: R1TargetAdmission | InquirySourceState,
): PublicInquiryAffordance {
  const match = firstInquiryCapability(catalog, preferredServiceSlug)
  if (match === undefined) {
    const serviceName = catalog.services[0]?.name
    return {
      kind: 'unavailable',
      label: 'Inquiry unavailable',
      reason: 'This service has not published a human inquiry path yet.',
      businessName: catalog.name,
      ...(serviceName === undefined ? {} : { serviceName }),
    }
  }

  const target = {
    businessId: catalog.businessId,
    serviceId: match.service.serviceId,
    capabilityKind: match.capability.kind,
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
      serviceName: match.service.name,
      ...(admission === undefined ? {} : { blockers: admission.blockers }),
    }
  }

  return {
    kind: 'available',
    label: 'Send inquiry',
    href: `/${catalog.slug}/inquiry`,
    businessName: catalog.name,
    serviceName: match.service.name,
    disclosure: match.capability.firstRequest.publicDisclosure,
    target,
  }
}

export function readPublicInquiryRouteReadback(input: PublicInquiryRouteInput): PublicInquiryRouteReadback {
  const page = input.page ?? publicPageFromInquirySourceState(input.state, input.slug)
  if (page.kind !== 'available') {
    return {
      kind: 'unavailable',
      slug: input.slug,
      reason: 'This service page is not public.',
    }
  }


  const affordance = buildPublicInquiryAffordance(
    page.catalog,
    input.preferredServiceSlug,
    input.admission ?? input.state,
  )
  if (affordance.kind === 'unavailable') {
    return {
      kind: 'unavailable',
      slug: input.slug,
      reason: affordance.reason,
      ...(affordance.blockers === undefined ? {} : { blockers: affordance.blockers }),
      businessName: affordance.businessName,
      ...(affordance.serviceName === undefined ? {} : { serviceName: affordance.serviceName }),
    }
  }

  return {
    kind: 'available',
    slug: input.slug,
    businessName: affordance.businessName,
    serviceName: affordance.serviceName,
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
    pseudonymousSessionId: input.pseudonymousSessionId,
    abuseBucketKey: input.abuseBucketKey,
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
    serviceName: readback.serviceName,
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

  const services = state.businessServices
    .filter((service) => service.businessId === business.businessId && service.status === 'published')
    .sort((left, right) => left.sortOrder - right.sortOrder || String(left.serviceId).localeCompare(String(right.serviceId)))
    .map((service) => routeServiceFromState(state, service))

  if (services.length === 0) {
    return { kind: 'not_found', reason: 'not_public' }
  }

  return {
    kind: 'available',
    catalog: routeCatalogFromBusiness(business, services),
  }
}

function routeCatalogFromBusiness(
  business: BusinessRecord,
  services: readonly PublicRouteServiceContract[]
): PublicRouteCatalogContract {
  return {
    businessId: business.businessId,
    slug: business.slug,
    name: business.name,
    category: business.category,
    suburb: business.suburb,
    stateTerritory: business.stateTerritory,
    publicUrl: `/${business.slug}`,
    publicStatus: 'published',
    trustTier: business.trustTier,
    indexStatus: 'queued',
    discoveryStatus: 'degraded',
    photos: [],
    services,
    schemaVersion: 'public-catalog:v1',
    updatedAt: business.updatedAt,
  }
}

function routeServiceFromState(
  state: InquirySourceState,
  service: InquirySourceState['businessServices'][number]
): PublicRouteServiceContract {
  const capabilities: PublicRouteCapabilityContract[] = []
  for (const capability of state.serviceCapabilities) {
    if (capability.businessId !== service.businessId || capability.serviceId !== service.serviceId) {
      continue
    }
    capabilities.push({
      serviceId: capability.serviceId,
      kind: capability.kind,
      status: capability.status,
      firstRequest: capability.firstRequest,
      callable: capability.callable,
      paymentRequired: capability.paymentRequired,
      ...(capability.reason === undefined ? {} : { reason: capability.reason }),
    })
  }

  return {
    serviceId: service.serviceId,
    serviceSlug: service.serviceSlug,
    businessId: service.businessId,
    name: service.name,
    category: service.category,
    summary: service.summary,
    serviceArea: service.serviceArea,
    hoursOrUnknown: service.hoursOrUnknown,
    firstRequest: firstRequestForService(state, service),
    status: 'published',
    capabilities,
  }
}

function firstRequestForService(
  state: InquirySourceState,
  service: InquirySourceState['businessServices'][number]
): PublicRouteServiceContract['firstRequest'] {
  return (
    state.serviceCapabilities.find((capability) => capability.businessId === service.businessId && capability.serviceId === service.serviceId)
      ?.firstRequest ?? {
      mode: 'not_available_yet',
      publicDisclosure: 'First request instructions are not available yet.',
      publicChannel: 'not_available',
      noContactReason: 'No first request path has been published.',
      rawContactExcluded: true,
    }
  )
}

export function selectPublicInquiryTarget(
  catalog: PublicRouteCatalogContract,
  preferredServiceSlug?: string,
): InquiryTargetRef | undefined {
  const match = firstInquiryCapability(catalog, preferredServiceSlug)
  return match === undefined
    ? undefined
    : {
        businessId: catalog.businessId,
        serviceId: match.service.serviceId,
        capabilityKind: match.capability.kind,
      }
}

export function projectPublicInquiryAvailability(
  catalog: PublicRouteCatalogContract,
  admission: R1TargetAdmission | undefined,
): PublicRouteCatalogContract {
  if (admission?.admitted === true) return catalog

  const target = selectPublicInquiryTarget(catalog)
  if (target === undefined) return catalog

  return {
    ...catalog,
    services: catalog.services.map((service) => {
      if (service.serviceId !== target.serviceId) return service
      return {
        ...service,
        firstRequest: {
          mode: 'not_available_yet',
          publicDisclosure: PUBLIC_INQUIRY_UNAVAILABLE_REASON,
          publicChannel: 'not_available',
          noContactReason: PUBLIC_INQUIRY_UNAVAILABLE_REASON,
          rawContactExcluded: true,
        },
        capabilities: service.capabilities.map((capability) =>
          capability.kind === target.capabilityKind
            ? {
                ...capability,
                status: 'unavailable' as const,
                firstRequest: {
                  mode: 'not_available_yet' as const,
                  publicDisclosure: PUBLIC_INQUIRY_UNAVAILABLE_REASON,
                  publicChannel: 'not_available' as const,
                  noContactReason: PUBLIC_INQUIRY_UNAVAILABLE_REASON,
                  rawContactExcluded: true as const,
                },
              }
            : capability),
      }
    }),
  }
}

export function selectOwnerAdmissionTarget(
  catalog: PublicRouteCatalogContract,
): InquiryTargetRef | undefined {
  for (const service of catalog.services) {
    const capability = service.capabilities[0]
    if (capability !== undefined) {
      return {
        businessId: catalog.businessId,
        serviceId: service.serviceId,
        capabilityKind: capability.kind,
      }
    }
  }

  return undefined
}

function firstInquiryCapability(
  catalog: PublicRouteCatalogContract,
  preferredServiceSlug?: string,
):
  | {
      service: PublicRouteServiceContract
      capability: PublicRouteCapabilityContract
    }
  | undefined {
  const services =
    preferredServiceSlug === undefined
      ? catalog.services
      : [
          ...catalog.services.filter((service) => String(service.serviceSlug) === preferredServiceSlug),
          ...catalog.services.filter((service) => String(service.serviceSlug) !== preferredServiceSlug),
        ]

  for (const service of services) {
    const capability = service.capabilities.find(
      (candidate) =>
        candidate.kind === 'phone_inquiry' &&
        candidate.status === 'available' &&
        candidate.firstRequest.mode === 'inquiry_available' &&
        candidate.firstRequest.publicChannel === 'public_business_contact' &&
        !candidate.callable &&
        !candidate.paymentRequired
    )

    if (capability !== undefined) {
      return { service, capability }
    }
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
    name: normalizeText(input.name ?? ''),
    email: normalizeText(input.email ?? '').toLowerCase(),
    phone: normalizeText(input.phone ?? ''),
  }
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}
