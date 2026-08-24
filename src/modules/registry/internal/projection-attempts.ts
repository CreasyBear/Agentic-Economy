import { isPubliclyDiscoverable } from '@/modules/business/public'
import type { PublicCatalogReadState } from '@/modules/catalog/public'
import { brandNonEmpty } from '@/modules/common/ids'
import type { BusinessId, CorrelationId, OfferingRef, OperationKey, SourceHash } from '@/modules/common/ids'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { validateAuditEvent } from '@/modules/observability/public'
import type { AuditEventContract, AuditEventType, RedactedPayload } from '@/modules/observability/public'
import type { IndexStatus } from './schema-values'
import type {
  CatalogHealthReadback,
  IndexStatusContract,
  RegistryProjectionAdapter,
  RegistryProjectionAttemptContract,
  RegistryProjectionItemContract,
  RegistryProjectionReadback,
  RegistrySourceState,
  RetryRegistryProjectionInput,
  SyncCatalogProjectionInput,
  SyncCatalogProjectionOptions,
  SyncCatalogProjectionResult,
} from './projection-contracts'
import { getPublicBusinessCatalog, type PublicBusinessCatalogApiV2Dto } from './offering-api-projection'

const sourceVersion = 'public-catalog:v1' as const
const publicSurfaces = [
  '/api/businesses',
  '/api/businesses/search',
  '/api/businesses/{slug}',
] as const

const defaultRetryAfterMs = 60_000
const defaultStaleAfterMs = 86_400_000

const defaultAdapter: RegistryProjectionAdapter = {
  writeProjection: (catalog) => ({
    kind: 'ok',
    generatedHash: canonicalDigest(toProjectionPayload(catalog)),
  }),
}

export function syncCatalogProjection(
  state: RegistrySourceState,
  input: SyncCatalogProjectionInput,
  options: SyncCatalogProjectionOptions
): SyncCatalogProjectionResult {
  const catalogResult = readSourceCatalog(state, input.businessId)
  const currentSourceHash =
    catalogResult.kind === 'available'
      ? catalogSourceHash(catalogResult.catalog)
      : canonicalDigest({ businessId: input.businessId, sourceState: 'not_public' })
  const logicalKey = `registry:business:${input.businessId}:${currentSourceHash}`
  const existingAttempt = state.registryProjectionAttempts.find((attempt) => attempt.logicalKey === logicalKey)

  if (catalogResult.kind === 'hidden') {
    const failedAttempt = upsertAttempt(state.registryProjectionAttempts, {
      businessId: input.businessId,
      logicalKey,
      projectionKind: 'business_catalog',
      sourceHash: currentSourceHash,
      sourceVersion,
      status: 'failed',
      retryCount: existingAttempt?.retryCount ?? 0,
      retryAfter: options.now + (options.retryAfterMs ?? defaultRetryAfterMs),
      lastErrorCode: 'registry_projection_not_public',
      lastErrorRedacted: 'Catalog is not public or has no published Offerings.',
      startedAt: existingAttempt?.startedAt ?? options.now,
      finishedAt: options.now,
      staleThresholdAt: options.now + (options.staleAfterMs ?? defaultStaleAfterMs),
      repairAction: 'no_repair',
      repairResult: 'failed',
    })
    const auditEvent = ensureRegistryAuditEvent(state, {
      businessId: input.businessId,
      eventType: 'registry.sync_failed',
      logicalKey,
      ...(input.operationKey === undefined ? {} : { operationKey: input.operationKey }),
      ...(input.correlationId === undefined ? {} : { correlationId: input.correlationId }),
      payload: {
        reason: catalogResult.reason,
        sourceState: 'not_public',
      },
      failureCode: 'registry_projection_not_public',
      now: options.now,
    })
    upsertIndexStatus(state.indexStatus, {
      targetType: 'business',
      targetRef: input.businessId,
      businessId: input.businessId,
      status: 'failed',
      lastAttemptAt: options.now,
      sourceHash: currentSourceHash,
      sourceVersion,
      staleReason: catalogResult.reason,
    })

    return {
      kind: 'error',
      code: 'registry_projection_not_public',
      retryable: false,
      reason: 'Catalog is not eligible for public registry projection.',
      attempt: failedAttempt,
      auditEvent,
    }
  }

  if (existingAttempt?.status === 'succeeded' && options.retry !== true) {
    const indexedStatuses = readIndexedStatuses(state.indexStatus, catalogResult.catalog)
    const auditEvent = ensureRegistryAuditEvent(state, {
      businessId: input.businessId,
      eventType: 'registry.sync_succeeded',
      logicalKey,
      ...(input.operationKey === undefined ? {} : { operationKey: input.operationKey }),
      ...(input.correlationId === undefined ? {} : { correlationId: input.correlationId }),
      payload: {
        replayed: true,
        publicUrl: catalogResult.catalog.publicUrl,
        offeringCount: catalogResult.catalog.offerings.length,
      },
      now: options.now,
    })

    return {
      kind: 'ok',
      code: 'registry_projection_replayed',
      catalog: catalogResult.catalog,
      projectionItems: state.registryProjectionItems.filter((item) => item.businessId === input.businessId),
      attempt: existingAttempt,
      indexStatuses: indexedStatuses,
      auditEvent,
    }
  }

  const adapter = options.adapter ?? defaultAdapter
  const adapterResult = safeWriteProjection(adapter, catalogResult.catalog)
  if (adapterResult.kind === 'error') {
    const failedAttempt = upsertAttempt(state.registryProjectionAttempts, {
      businessId: input.businessId,
      logicalKey,
      projectionKind: 'business_catalog',
      sourceHash: currentSourceHash,
      sourceVersion,
      status: 'failed',
      retryCount: nextRetryCount(existingAttempt, options.retry === true),
      retryAfter: options.now + (options.retryAfterMs ?? defaultRetryAfterMs),
      lastErrorCode: adapterResult.code,
      lastErrorRedacted: adapterResult.redactedMessage,
      startedAt: existingAttempt?.startedAt ?? options.now,
      finishedAt: options.now,
      latestReadback: buildProjectionReadback(catalogResult.catalog, currentSourceHash, options.now),
      staleThresholdAt: options.now + (options.staleAfterMs ?? defaultStaleAfterMs),
      repairAction: 'retry_projection',
      repairResult: 'failed',
    })
    const auditEvent = ensureRegistryAuditEvent(state, {
      businessId: input.businessId,
      eventType: 'registry.sync_failed',
      logicalKey,
      ...(input.operationKey === undefined ? {} : { operationKey: input.operationKey }),
      ...(input.correlationId === undefined ? {} : { correlationId: input.correlationId }),
      payload: {
        failureCode: adapterResult.code,
        publicUrl: catalogResult.catalog.publicUrl,
        offeringCount: catalogResult.catalog.offerings.length,
      },
      failureCode: adapterResult.code,
      now: options.now,
    })
    upsertIndexStatus(state.indexStatus, {
      targetType: 'business',
      targetRef: input.businessId,
      businessId: input.businessId,
      status: 'failed',
      lastAttemptAt: options.now,
      sourceHash: currentSourceHash,
      sourceVersion,
      staleReason: adapterResult.code,
    })

    return {
      kind: 'error',
      code: 'registry_projection_failed',
      retryable: true,
      reason: 'Registry projection write failed and is repairable.',
      attempt: failedAttempt,
      auditEvent,
    }
  }

  const catalog = catalogResult.catalog
  const readback = buildProjectionReadback(catalog, currentSourceHash, options.now, adapterResult.generatedHash)
  const attempt = upsertAttempt(state.registryProjectionAttempts, {
    businessId: input.businessId,
    logicalKey,
    projectionKind: 'business_catalog',
    sourceHash: currentSourceHash,
    sourceVersion,
    status: 'succeeded',
    retryCount: nextRetryCount(existingAttempt, options.retry === true),
    startedAt: existingAttempt?.startedAt ?? options.now,
    finishedAt: options.now,
    latestReadback: readback,
    staleThresholdAt: options.now + (options.staleAfterMs ?? defaultStaleAfterMs),
    repairAction: 'no_repair',
    repairResult: 'succeeded',
  })
  const projectionItems = upsertProjectionItems(state.registryProjectionItems, catalog, currentSourceHash, adapterResult.generatedHash, options.now)
  const indexStatuses = upsertIndexedStatuses(state.indexStatus, catalog, currentSourceHash, options.now)
  const auditEvent = ensureRegistryAuditEvent(state, {
    businessId: input.businessId,
    eventType: 'registry.sync_succeeded',
    logicalKey,
    ...(input.operationKey === undefined ? {} : { operationKey: input.operationKey }),
    ...(input.correlationId === undefined ? {} : { correlationId: input.correlationId }),
    payload: {
      generatedHash: adapterResult.generatedHash,
      publicUrl: catalog.publicUrl,
      offeringCount: catalog.offerings.length,
    },
    now: options.now,
  })

  return {
    kind: 'ok',
    code: 'registry_projection_indexed',
    catalog,
    projectionItems,
    attempt,
    indexStatuses,
    auditEvent,
  }
}

export function retryRegistryProjection(
  state: RegistrySourceState,
  input: RetryRegistryProjectionInput,
  options: SyncCatalogProjectionOptions
): SyncCatalogProjectionResult {
  const attempt =
    'logicalKey' in input
      ? state.registryProjectionAttempts.find((candidate) => candidate.logicalKey === input.logicalKey)
      : latestAttemptForBusiness(state.registryProjectionAttempts, input.businessId)

  if (attempt === undefined) {
    return {
      kind: 'error',
      code: 'registry_projection_missing_attempt',
      retryable: false,
      reason: 'No registry projection attempt exists for this repair request.',
    }
  }

  return syncCatalogProjection(
    state,
    {
      businessId: attempt.businessId,
      ...(input.operationKey === undefined ? {} : { operationKey: input.operationKey }),
      ...(input.correlationId === undefined ? {} : { correlationId: input.correlationId }),
    },
    { ...options, retry: true }
  )
}

export function getIndexStatus(
  state: Pick<RegistrySourceState, 'indexStatus'>,
  input: { targetType: IndexStatusContract['targetType']; targetRef: string }
): IndexStatusContract | undefined {
  return state.indexStatus.find(
    (candidate) => candidate.targetType === input.targetType && candidate.targetRef === input.targetRef
  )
}

export function readCatalogHealth(state: RegistrySourceState, businessId: BusinessId): CatalogHealthReadback {
  const catalogResult = readSourceCatalog(state, businessId)
  const latestAttempt = latestAttemptForBusiness(state.registryProjectionAttempts, businessId)
  const status = statusForHealth(state, latestAttempt, businessId)

  return {
    businessId,
    sourceState: catalogResult.kind === 'available' ? 'published' : 'not_public',
    ...(latestAttempt === undefined ? {} : { latestAttempt }),
    indexStatus: status,
    projectionItems: state.registryProjectionItems.filter((item) => item.businessId === businessId),
    affectedPublicSurfaces: publicSurfaces,
    repairAction: latestAttempt?.repairAction ?? (catalogResult.kind === 'available' ? 'rebuild_projection' : 'no_repair'),
    repairResult: latestAttempt?.repairResult ?? 'not_run',
  }
}

function readSourceCatalog(
  state: PublicCatalogReadState,
  businessId: BusinessId
):
  | { kind: 'available'; catalog: PublicBusinessCatalogApiV2Dto }
  | { kind: 'hidden'; reason: 'not_public' | 'missing_context' | 'not_published' | 'no_published_offerings' } {
  const business = state.businesses.find((candidate) => candidate.businessId === businessId)
  if (business === undefined || !isPubliclyDiscoverable(business)) {
    return { kind: 'hidden', reason: 'not_public' }
  }

  const context = state.businessContexts.find((candidate) => candidate.businessId === businessId)
  if (context === undefined) {
    return { kind: 'hidden', reason: 'missing_context' }
  }

  const result = getPublicBusinessCatalog(state, {
    slug: business.slug,
    indexStatus: 'queued',
    discoveryStatus: 'degraded',
  })
  if (result.kind === 'hidden') {
    return {
      kind: 'hidden',
      reason: state.offerings.some((offering) => offering.businessId === businessId && offering.status === 'published')
        ? 'not_published'
        : 'no_published_offerings',
    }
  }

  return result
}

function safeWriteProjection(adapter: RegistryProjectionAdapter, catalog: PublicBusinessCatalogApiV2Dto) {
  try {
    return adapter.writeProjection(catalog)
  } catch {
    return {
      kind: 'error' as const,
      code: 'registry_projection_adapter_exception',
      redactedMessage: 'Projection adapter failed before write.',
    }
  }
}

function upsertProjectionItems(
  items: RegistryProjectionItemContract[],
  catalog: PublicBusinessCatalogApiV2Dto,
  sourceHash: SourceHash,
  generatedHash: SourceHash,
  now: number
): readonly RegistryProjectionItemContract[] {
  const businessItem = upsertProjectionItem(items, {
    businessId: brandNonEmpty(catalog.businessId, 'BusinessId'),
    logicalKey: `registry:item:business:${catalog.businessId}`,
    projectionKind: 'business_catalog',
    publicStatus: 'published',
    sourceHash,
    sourceVersion,
    generatedHash,
    publicUrl: catalog.publicUrl,
    offeringCount: catalog.offerings.length,
    updatedAt: now,
  })
  const offeringItems = catalog.offerings.map((offering) => {
    const offeringRef = brandNonEmpty(offering.offeringRef, 'OfferingRef')
    const offeringSourceHash = canonicalDigest({
      offeringRef,
      revision: offering.revision,
      offering,
    })
    return upsertProjectionItem(items, {
      businessId: brandNonEmpty(catalog.businessId, 'BusinessId'),
      offeringRef,
      logicalKey: `registry:item:offering:${offeringRef}`,
      projectionKind: 'offering_catalog',
      publicStatus: 'published',
      sourceHash: offeringSourceHash,
      sourceVersion,
      generatedHash: canonicalDigest(toOfferingProjectionPayload(catalog, offeringRef)),
      publicUrl: `${catalog.publicUrl}#${offeringRef.split(':').at(-1) ?? offeringRef}`,
      offeringCount: 1,
      updatedAt: now,
    })
  })

  return [businessItem, ...offeringItems]
}

function upsertProjectionItem(
  items: RegistryProjectionItemContract[],
  next: RegistryProjectionItemContract
): RegistryProjectionItemContract {
  const index = items.findIndex(
    (item) =>
      item.businessId === next.businessId &&
      item.projectionKind === next.projectionKind &&
      item.offeringRef === next.offeringRef
  )

  if (index === -1) {
    items.push(next)
    return next
  }

  items[index] = next
  return next
}

function upsertIndexedStatuses(
  statuses: IndexStatusContract[],
  catalog: PublicBusinessCatalogApiV2Dto,
  sourceHash: SourceHash,
  now: number
): readonly IndexStatusContract[] {
  const businessStatus = upsertIndexStatus(statuses, {
    targetType: 'business',
    targetRef: catalog.businessId,
    businessId: brandNonEmpty(catalog.businessId, 'BusinessId'),
    status: 'indexed',
    lastAttemptAt: now,
    sourceHash,
    sourceVersion,
  })
  const offeringStatuses = catalog.offerings.map((offering) => {
    const offeringRef = brandNonEmpty(offering.offeringRef, 'OfferingRef')
    return upsertIndexStatus(statuses, {
      targetType: 'offering',
      targetRef: offeringRef,
      businessId: brandNonEmpty(catalog.businessId, 'BusinessId'),
      offeringRef,
      status: 'indexed',
      lastAttemptAt: now,
      sourceHash: canonicalDigest(offering),
      sourceVersion,
    })
  })

  return [businessStatus, ...offeringStatuses]
}

function readIndexedStatuses(
  statuses: readonly IndexStatusContract[],
  catalog: PublicBusinessCatalogApiV2Dto
): readonly IndexStatusContract[] {
  return statuses.filter(
    (status) =>
      (status.targetType === 'business' && status.targetRef === catalog.businessId) ||
      catalog.offerings.some((offering) =>
        status.targetType === 'offering' && status.targetRef === offering.offeringRef
      )
  )
}

function upsertIndexStatus(statuses: IndexStatusContract[], next: IndexStatusContract): IndexStatusContract {
  const index = statuses.findIndex(
    (status) => status.targetType === next.targetType && status.targetRef === next.targetRef
  )

  if (index === -1) {
    statuses.push(next)
    return next
  }

  statuses[index] = next
  return next
}

function upsertAttempt(
  attempts: RegistryProjectionAttemptContract[],
  next: RegistryProjectionAttemptContract
): RegistryProjectionAttemptContract {
  const index = attempts.findIndex((attempt) => attempt.logicalKey === next.logicalKey)

  if (index === -1) {
    attempts.push(next)
    return next
  }

  attempts[index] = {
    ...attempts[index],
    ...next,
  }
  return attempts[index]
}

function latestAttemptForBusiness(
  attempts: readonly RegistryProjectionAttemptContract[],
  businessId: BusinessId
): RegistryProjectionAttemptContract | undefined {
  return attempts
    .filter((attempt) => attempt.businessId === businessId)
    .sort((left, right) => (right.finishedAt ?? right.startedAt) - (left.finishedAt ?? left.startedAt))
    .at(0)
}

function nextRetryCount(attempt: RegistryProjectionAttemptContract | undefined, retry: boolean): number {
  if (attempt === undefined) {
    return 0
  }

  return retry ? attempt.retryCount + 1 : attempt.retryCount
}

function statusForHealth(
  state: Pick<RegistrySourceState, 'indexStatus'>,
  attempt: RegistryProjectionAttemptContract | undefined,
  businessId: BusinessId
): IndexStatus {
  if (attempt?.status === 'failed') {
    return 'failed'
  }

  if (attempt?.status === 'stale') {
    return 'stale'
  }

  const indexed = getIndexStatus(state, { targetType: 'business', targetRef: businessId })
  return indexed?.status ?? 'not_queued'
}

function buildProjectionReadback(
  catalog: PublicBusinessCatalogApiV2Dto,
  sourceHash: SourceHash,
  now: number,
  generatedHash?: SourceHash
): RegistryProjectionReadback {
  return {
    businessId: brandNonEmpty(catalog.businessId, 'BusinessId'),
    slug: brandNonEmpty(catalog.slug, 'Slug'),
    publicUrl: catalog.publicUrl,
    sourceVersion,
    sourceHash,
    ...(generatedHash === undefined ? {} : { generatedHash }),
    offeringCount: catalog.offerings.length,
    publicSurfaces,
    readAt: now,
  }
}

function ensureRegistryAuditEvent(
  state: Pick<RegistrySourceState, 'auditEvents'>,
  input: {
    businessId: BusinessId
    eventType: Extract<AuditEventType, 'registry.sync_failed' | 'registry.sync_succeeded'>
    logicalKey: string
    operationKey?: OperationKey
    correlationId?: CorrelationId
    payload: RedactedPayload
    failureCode?: string
    now: number
  }
): AuditEventContract {
  const eventId = brandNonEmpty(`audit:${input.eventType}:${input.logicalKey}`, 'AuditEventId')
  const existing = state.auditEvents.find((event) => event.eventId === eventId)
  if (existing !== undefined) {
    return existing
  }

  const validation = validateAuditEvent({
    eventId,
    eventType: input.eventType,
    actorKind: 'system',
    actorRef: 'registry-projection',
    targetType: 'registry_projection',
    targetRef: input.logicalKey,
    businessId: input.businessId,
    idempotencyKey: input.operationKey ?? brandNonEmpty(`op:${input.logicalKey}`, 'OperationKey'),
    correlationId: input.correlationId ?? brandNonEmpty(`corr:${input.logicalKey}`, 'CorrelationId'),
    redactedPayload: input.payload,
    payloadHash: canonicalDigest(input.payload),
    ...(input.failureCode === undefined ? {} : { failureCode: input.failureCode }),
    createdAt: input.now,
  })

  if (!validation.valid) {
    throw new Error(`Invalid registry audit event: ${validation.reason}`)
  }

  state.auditEvents.push(validation.event)
  return validation.event
}

function catalogSourceHash(catalog: PublicBusinessCatalogApiV2Dto): SourceHash {
  return canonicalDigest(catalog)
}

function toProjectionPayload(catalog: PublicBusinessCatalogApiV2Dto) {
  return catalog
}

function toOfferingProjectionPayload(catalog: PublicBusinessCatalogApiV2Dto, offeringRef: OfferingRef) {
  return {
    businessSlug: catalog.slug,
    offering: catalog.offerings.find((offering) => offering.offeringRef === offeringRef) ?? null,
  }
}
