import type { BusinessRecord } from '@/modules/business/public'
import type {
  PublicBusinessPageRouteReadbackResult,
  PublicRouteCapabilityContract,
  PublicRouteCatalogContract,
  PublicRouteServiceContract,
} from '@/modules/catalog/public'
import type { OperationKey, CorrelationId } from '@/modules/common/ids'
import {
  createEmptyInquirySourceState,
  evaluateInquiryLaunchSupportReadiness,
  submitInquiry,
  type InquiryNotificationStatus,
  type InquirySourceState,
  type InquiryTargetRef,
  type PublicInquiryContactInput,
  type SubmitInquiryErrorCode,
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
}

export type PublicInquiryRouteInput = {
  slug: string
  page?: PublicBusinessPageRouteReadbackResult
  state?: InquirySourceState
}

export type PublicInquiryRouteSubmitInput = PublicInquiryFormInput & {
  slug: string
  state: InquirySourceState
  operationKey: OperationKey
  correlationId: CorrelationId
  pseudonymousSessionId: string
  abuseBucketKey: string
  now: number
  notificationStatus?: InquiryNotificationStatus
  notificationFailureCode?: string
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

export function buildPublicInquiryAffordance(catalog: PublicRouteCatalogContract): PublicInquiryAffordance {
  const match = firstInquiryCapability(catalog)
  if (match === undefined) {
    const serviceName = catalog.services[0]?.name
    return {
      kind: 'unavailable',
      label: 'Inquiry unavailable',
      reason: 'This service has not published a source-owned human inquiry path yet.',
      businessName: catalog.name,
      ...(serviceName === undefined ? {} : { serviceName }),
    }
  }

  return {
    kind: 'available',
    label: 'Send inquiry',
    href: `/${catalog.slug}/inquiry`,
    businessName: catalog.name,
    serviceName: match.service.name,
    disclosure: match.capability.firstRequest.publicDisclosure,
    target: {
      businessId: catalog.businessId,
      serviceId: match.service.serviceId,
      capabilityKind: match.capability.kind,
    },
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

  if (input.state !== undefined) {
    const supportReadiness = evaluateInquiryLaunchSupportReadiness(input.state)
    if (supportReadiness.kind !== 'ready') {
      const serviceName = page.catalog.services[0]?.name
      return {
        kind: 'unavailable',
        slug: input.slug,
        reason: supportReadiness.reason,
        businessName: page.catalog.name,
        ...(serviceName === undefined ? {} : { serviceName }),
      }
    }
  }

  const affordance = buildPublicInquiryAffordance(page.catalog)
  if (affordance.kind === 'unavailable') {
    return {
      kind: 'unavailable',
      slug: input.slug,
      reason: affordance.reason,
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
      code: 'inquiry_target_unavailable',
      retryable: false,
      reason: readback.reason,
    }
  }

  const result = submitInquiry(input.state, {
    target: readback.target,
    body: validation.input.body,
    contact: validation.input.contact,
    operationKey: input.operationKey,
    correlationId: input.correlationId,
    pseudonymousSessionId: input.pseudonymousSessionId,
    abuseBucketKey: input.abuseBucketKey,
    now: input.now,
    ...(input.notificationStatus === undefined ? {} : { notificationStatus: input.notificationStatus }),
    ...(input.notificationFailureCode === undefined ? {} : { notificationFailureCode: input.notificationFailureCode }),
  })

  if (result.kind === 'error') {
    return {
      kind: 'error',
      code: result.code,
      retryable: result.retryable,
      reason: result.reason,
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
    services,
    schemaVersion: 'public-catalog:v1',
    updatedAt: business.updatedAt,
  }
}

function routeServiceFromState(
  state: InquirySourceState,
  service: InquirySourceState['businessServices'][number]
): PublicRouteServiceContract {
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
    capabilities: state.serviceCapabilities
      .filter((capability) => capability.businessId === service.businessId && capability.serviceId === service.serviceId)
      .map((capability) => ({
        serviceId: capability.serviceId,
        kind: capability.kind,
        status: capability.status,
        firstRequest: capability.firstRequest,
        callable: capability.callable,
        paymentRequired: capability.paymentRequired,
        ...(capability.reason === undefined ? {} : { reason: capability.reason }),
      })),
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
      noContactReason: 'No source-owned first request path has been published.',
      rawContactExcluded: true,
    }
  )
}

function firstInquiryCapability(
  catalog: PublicRouteCatalogContract
):
  | {
      service: PublicRouteServiceContract
      capability: PublicRouteCapabilityContract
    }
  | undefined {
  for (const service of catalog.services) {
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
