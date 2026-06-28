import { brandNonEmpty } from '@/modules/common/ids'
import { stableHash } from '@/modules/common/stable-hash'
import {
  buildPublicCatalogDto,
  validateServiceCatalogInput,
} from '@/modules/catalog/public'
import type {
  BusinessServiceRecord,
  PublishBusinessCatalogCommand,
  PublishBusinessCatalogResult,
  PublishBusinessCatalogState,
  ServiceCapabilityRecord,
  ValidatedServiceCatalogInput,
} from '@/modules/catalog/public'
import type { AuditEventContract, OperationKeyInput, OperationKeyRecord, OperationKeyStore } from '@/modules/observability/public'
import {
  markOperationSucceeded,
  reserveOperationKey,
  validateAuditEvent,
} from '@/modules/observability/public'
import type { DiscoveryManifestAttemptContract } from '@/modules/discovery/public'
import type { RegistryProjectionAttemptContract } from '@/modules/registry/public'
import { assertCsrf } from '@/modules/security/public'

export function publishBusinessCatalog(
  state: PublishBusinessCatalogState,
  command: PublishBusinessCatalogCommand
): PublishBusinessCatalogResult {
  const csrfDecision = assertCsrf(command.security.csrf)
  if (csrfDecision.kind === 'rejected') {
    return {
      kind: 'error',
      code: 'catalog_publish_csrf_rejected',
      retryable: false,
      reason: csrfDecision.reason,
    }
  }

  if (command.actor.kind === 'anonymous') {
    return {
      kind: 'error',
      code: 'catalog_publish_unauthenticated',
      retryable: false,
      reason: 'Authentication is required to publish a business catalog.',
    }
  }

  const claim = state.claims.find((candidate) => candidate.claimId === command.claimId)
  if (claim === undefined) {
    return {
      kind: 'error',
      code: 'catalog_publish_claim_not_found',
      retryable: false,
      reason: 'Claim was not found.',
    }
  }

  if (claim.status === 'contested' || claim.status === 'disputed') {
    return {
      kind: 'error',
      code: 'catalog_publish_pending_review',
      retryable: false,
      reason: 'Claim must finish review before publishing.',
    }
  }

  const owner = state.owners.find((candidate) => candidate.ownerId === claim.ownerId)
  if (owner === undefined || owner.clerkUserId !== command.actor.clerkUserId) {
    return {
      kind: 'error',
      code: 'catalog_publish_wrong_owner',
      retryable: false,
      reason: 'Only the source-bound owner can publish this catalog.',
    }
  }

  const business = state.businesses.find((candidate) => candidate.businessId === claim.businessId)
  const context = state.businessContexts.find((candidate) => candidate.businessId === claim.businessId)
  if (business === undefined || context === undefined) {
    return {
      kind: 'error',
      code: 'catalog_publish_claim_not_found',
      retryable: false,
      reason: 'Claim source state is incomplete.',
    }
  }

  const serviceValidation = validateServiceCatalogInput(command.services)
  if (serviceValidation.kind === 'invalid') {
    return {
      kind: 'error',
      code: 'catalog_publish_invalid_services',
      retryable: false,
      reason: serviceValidation.reason,
    }
  }

  const requestHash = stableHash({
    claimId: command.claimId,
    services: serviceValidation.services.map((service) => ({
      category: service.category,
      firstRequest: {
        mode: service.firstRequest.mode,
        noContactReason: service.firstRequest.noContactReason ?? '',
        publicChannel: service.firstRequest.publicChannel,
        publicDisclosure: service.firstRequest.publicDisclosure,
      },
      name: service.name,
      serviceArea: service.serviceArea,
      summary: service.summary,
    })),
  })
  const operationStore = new ArrayOperationKeyStore(state.operationKeys)
  const operationInput: OperationKeyInput = {
    scope: 'catalog',
    actorKind: 'owner',
    actorRef: owner.ownerId,
    operationName: 'publishBusinessCatalog',
    key: command.operationKey,
    requestHash,
    sourceHash: business.sourceHash,
    now: command.now,
  }
  const operationDecision = reserveOperationKey(operationStore, operationInput, operationStore)
  if (operationDecision.kind === 'error') {
    return {
      kind: 'error',
      code: 'catalog_publish_operation_conflict',
      retryable: false,
      reason: operationDecision.reason,
    }
  }

  const replayed = operationDecision.code === 'operation_replayed'
  if (!replayed) {
    applyPublishState(state, business, claim, serviceValidation.services, command.now)
  }

  const services = state.businessServices.filter((service) => service.businessId === business.businessId)
  const capabilities = state.serviceCapabilities.filter((capability) => capability.businessId === business.businessId)
  const catalogResult = buildPublicCatalogDto({
    business,
    context,
    services,
    capabilities,
    indexStatus: 'queued',
    discoveryStatus: 'degraded',
  })
  if (catalogResult.kind === 'hidden') {
    return {
      kind: 'error',
      code: 'catalog_publish_invalid_services',
      retryable: false,
      reason: catalogResult.reason,
    }
  }

  const auditEvent = ensurePublishAuditEvent(state, business, command, replayed)
  const registryAttempts = ensureRegistryAttempts(state, business.businessId, business.sourceHash, services, command.now)
  const discoveryAttempts = ensureDiscoveryAttempts(state, business.businessId, business.sourceHash, command.now)

  if (!replayed) {
    const resultHash = stableHash({
      auditEventId: auditEvent.eventId,
      businessId: business.businessId,
      registryAttempts: registryAttempts.map((attempt) => attempt.logicalKey),
      slug: business.slug,
    })
    const succeeded = markOperationSucceeded(
      operationDecision.record,
      resultHash,
      [
        auditEvent.eventId,
        ...registryAttempts.map((attempt) => attempt.logicalKey),
        ...discoveryAttempts.map((attempt) => attempt.attemptId),
      ],
      command.now
    )
    operationStore.save(succeeded)
  }

  return {
    kind: 'ok',
    code: replayed ? 'catalog_publish_replayed' : 'catalog_published',
    business,
    claim,
    catalog: catalogResult.catalog,
    auditEvent,
    registryProjectionAttempts: registryAttempts,
    discoveryManifestAttempts: discoveryAttempts,
  }
}

function applyPublishState(
  state: PublishBusinessCatalogState,
  business: PublishBusinessCatalogState['businesses'][number],
  claim: PublishBusinessCatalogState['claims'][number],
  services: readonly ValidatedServiceCatalogInput[],
  now: number
): void {
  business.publicStatus = 'published'
  business.claimStatus = 'published'
  business.updatedAt = now
  claim.status = 'published'
  claim.updatedAt = now

  services.forEach((service, index) => {
    const serviceSlug = brandNonEmpty(slugify(service.name), 'Slug')
    const serviceId = brandNonEmpty(`service:${business.businessId}:${serviceSlug}`, 'ServiceId')
    const serviceHash = stableHash({
      businessId: business.businessId,
      category: service.category,
      name: service.name,
      serviceArea: service.serviceArea,
      summary: service.summary,
    })
    const serviceRecord: BusinessServiceRecord = {
      serviceId,
      serviceSlug,
      businessId: business.businessId,
      name: service.name,
      category: service.category,
      summary: service.summary,
      serviceArea: service.serviceArea,
      hoursOrUnknown: service.hoursOrUnknown,
      status: 'published',
      sortOrder: index,
      sourceHash: serviceHash,
      createdAt: now,
      updatedAt: now,
    }
    upsertService(state.businessServices, serviceRecord)

    const capabilityRecord: ServiceCapabilityRecord = {
      businessId: business.businessId,
      serviceId,
      kind: service.firstRequest.mode === 'quote_request_available' ? 'quote_request' : 'phone_inquiry',
      status: service.firstRequest.mode === 'not_available_yet' ? 'unavailable' : 'available',
      firstRequest: service.firstRequest,
      callable: false,
      paymentRequired: false,
      ...(service.firstRequest.noContactReason === undefined ? {} : { reason: service.firstRequest.noContactReason }),
      sourceHash: stableHash({
        firstRequestMode: service.firstRequest.mode,
        serviceId,
      }),
      createdAt: now,
      updatedAt: now,
    }
    upsertCapability(state.serviceCapabilities, capabilityRecord)
  })
}

function ensurePublishAuditEvent(
  state: PublishBusinessCatalogState,
  business: PublishBusinessCatalogState['businesses'][number],
  command: PublishBusinessCatalogCommand,
  replayed: boolean
): AuditEventContract {
  const eventId = brandNonEmpty(`audit:claim.published:${business.businessId}:${command.operationKey}`, 'AuditEventId')
  const existing = state.auditEvents.find((event) => event.eventId === eventId)
  if (existing !== undefined) {
    return existing
  }

  const redactedPayload = {
    replayed,
    slug: business.slug,
  }
  const validation = validateAuditEvent({
    eventId,
    eventType: 'claim.published',
    actorKind: 'owner',
    actorRef: business.ownerId,
    targetType: 'business',
    targetRef: business.businessId,
    businessId: business.businessId,
    idempotencyKey: command.operationKey,
    correlationId: command.correlationId,
    beforeState: 'authenticated',
    afterState: 'published',
    redactedPayload,
    payloadHash: stableHash(redactedPayload),
    createdAt: command.now,
  })

  if (!validation.valid) {
    throw new Error(`Invalid publish audit event: ${validation.reason}`)
  }

  state.auditEvents.push(validation.event)
  return validation.event
}

function ensureRegistryAttempts(
  state: PublishBusinessCatalogState,
  businessId: PublishBusinessCatalogState['businesses'][number]['businessId'],
  sourceHash: PublishBusinessCatalogState['businesses'][number]['sourceHash'],
  services: readonly BusinessServiceRecord[],
  now: number
): readonly RegistryProjectionAttemptContract[] {
  const businessAttempt = upsertRegistryAttempt(state.registryProjectionAttempts, {
    businessId,
    logicalKey: `registry:business:${businessId}:${sourceHash}`,
    sourceHash,
    sourceVersion: 'public-catalog:v1',
    projectionKind: 'business_catalog',
    status: 'queued',
    retryCount: 0,
    startedAt: now,
    repairAction: 'rebuild_projection',
    repairResult: 'not_run',
  })
  const serviceAttempts = services.map((service) =>
    upsertRegistryAttempt(state.registryProjectionAttempts, {
      businessId,
      serviceId: service.serviceId,
      logicalKey: `registry:service:${service.serviceId}:${service.sourceHash}`,
      sourceHash: service.sourceHash,
      sourceVersion: 'public-catalog:v1',
      projectionKind: 'service_catalog',
      status: 'queued',
      retryCount: 0,
      startedAt: now,
      repairAction: 'rebuild_projection',
      repairResult: 'not_run',
    })
  )
  return [businessAttempt, ...serviceAttempts]
}

function ensureDiscoveryAttempts(
  state: PublishBusinessCatalogState,
  businessId: PublishBusinessCatalogState['businesses'][number]['businessId'],
  sourceHash: PublishBusinessCatalogState['businesses'][number]['sourceHash'],
  now: number
): readonly DiscoveryManifestAttemptContract[] {
  const attempt = upsertDiscoveryAttempt(state.discoveryManifestAttempts, {
    attemptId: `discovery:manifest:${businessId}:${sourceHash}:v1`,
    businessId,
    ucpVersion: 'v1',
    pathKind: 'ae_hosted_fallback',
    status: 'queued',
    startedAt: now,
  })

  return [attempt]
}

function upsertService(records: BusinessServiceRecord[], next: BusinessServiceRecord): void {
  const existing = records.findIndex((record) => record.serviceId === next.serviceId)
  if (existing === -1) {
    records.push(next)
    return
  }

  records[existing] = next
}

function upsertCapability(records: ServiceCapabilityRecord[], next: ServiceCapabilityRecord): void {
  const existing = records.findIndex((record) => record.serviceId === next.serviceId && record.kind === next.kind)
  if (existing === -1) {
    records.push(next)
    return
  }

  records[existing] = next
}

function upsertRegistryAttempt(
  records: RegistryProjectionAttemptContract[],
  next: RegistryProjectionAttemptContract
): RegistryProjectionAttemptContract {
  const existing = records.find((record) => record.logicalKey === next.logicalKey)
  if (existing !== undefined) {
    return existing
  }

  records.push(next)
  return next
}

function upsertDiscoveryAttempt(
  records: DiscoveryManifestAttemptContract[],
  next: DiscoveryManifestAttemptContract
): DiscoveryManifestAttemptContract {
  const existing = records.find((record) => record.attemptId === next.attemptId)
  if (existing !== undefined) {
    return existing
  }

  records.push(next)
  return next
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72)
}

class ArrayOperationKeyStore implements OperationKeyStore {
  constructor(private readonly records: OperationKeyRecord[]) {}

  find(input: OperationKeyInput): OperationKeyRecord | undefined {
    return this.records.find(
      (record) => record.actorRef === input.actorRef && record.operationName === input.operationName && record.key === input.key
    )
  }

  save(record: OperationKeyRecord): OperationKeyRecord {
    const index = this.records.findIndex(
      (candidate) =>
        candidate.actorRef === record.actorRef &&
        candidate.operationName === record.operationName &&
        candidate.key === record.key
    )
    if (index === -1) {
      this.records.push(record)
      return record
    }

    this.records[index] = record
    return record
  }

  recordConflict(): void {
    return undefined
  }
}
