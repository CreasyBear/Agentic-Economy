import { brandNonEmpty } from '@/modules/common/ids'
import type { BusinessId, SourceHash } from '@/modules/common/ids'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { getPublicBusinessCatalog } from '@/modules/catalog/public'
import type { PublicBusinessCatalogApiV2Dto } from '@/modules/registry/public'
import type {
  DiscoveryHealthReadback,
  DiscoveryManifestAttemptContract,
  DiscoveryManifestContract,
  DiscoveryManifestReadback,
  DiscoverySourceState,
  InvalidateDiscoveryManifestInput,
  InvalidateDiscoveryManifestResult,
  RegenerateDiscoveryManifestInput,
  RegenerateDiscoveryManifestOptions,
  RegenerateDiscoveryManifestResult,
} from '@/modules/discovery/public'
import { readCatalogHealth } from '@/modules/registry/public'
import { validateAuditEvent } from '@/modules/observability/public'
import type { AuditEventContract } from '@/modules/observability/public'
import { buildCatalogDiscoveryManifest } from './ucp-manifest'

const defaultStaleAfterMs = 3_600_000

export function regenerateDiscoveryManifest(
  state: DiscoverySourceState,
  input: RegenerateDiscoveryManifestInput,
  options: RegenerateDiscoveryManifestOptions
): RegenerateDiscoveryManifestResult {
  const catalogResult = readSourceCatalog(state, input)
  if (catalogResult.kind === 'hidden') {
    return {
      kind: 'error',
      code: 'discovery_manifest_not_public',
      retryable: false,
      reason: catalogResult.reason,
    }
  }

  const existing = latestAttemptForBusiness(state.discoveryManifestAttempts, brandNonEmpty(catalogResult.catalog.businessId, 'BusinessId'))
  const retryCount = existing?.status === 'failed' ? existing.retryCount + 1 : existing?.retryCount ?? 0
  const manifestResult = buildCatalogDiscoveryManifest({
    catalog: catalogResult.catalog,
    canonicalBaseUrl: options.canonicalBaseUrl,
    now: options.now,
    sourceHash: catalogResult.sourceHash,
  })
  if (manifestResult.kind === 'hidden') {
    return {
      kind: 'error',
      code: 'discovery_manifest_not_public',
      retryable: false,
      reason: manifestResult.reason,
    }
  }

  const manifest = {
    ...manifestResult.manifest,
    sourceHash: catalogResult.sourceHash,
  }
  const baseAttempt = ensureDiscoveryAttempt(state.discoveryManifestAttempts, {
    attemptId: attemptId(manifest.businessId, manifest.sourceHash),
    businessId: manifest.businessId,
    ucpVersion: manifest.ucpVersion,
    pathKind: 'ae_hosted_fallback',
    sourceHash: manifest.sourceHash,
    sourceVersion: 'public-catalog:v1',
    status: 'queued',
    retryCount,
    startedAt: options.now,
    staleThresholdAt: options.now + (options.staleAfterMs ?? defaultStaleAfterMs),
    repairAction: 'regenerate_manifest',
    repairResult: 'not_run',
  })

  const readbackResult = safeReadManifest(options.adapter ?? defaultAdapter, manifest)
  if (readbackResult.kind === 'error') {
    const failedAttempt = updateAttempt(state.discoveryManifestAttempts, {
      ...baseAttempt,
      status: 'failed',
      retryCount,
      failureCode: readbackResult.code,
      failureMessageRedacted: readbackResult.redactedMessage,
      finishedAt: options.now,
      repairAction: 'regenerate_manifest',
      repairResult: 'failed',
    })
    const auditEvent = ensureDiscoveryAuditEvent(state, manifest, {
      eventType: 'discovery.degraded',
      failureCode: readbackResult.code,
      reason: readbackResult.redactedMessage,
      now: options.now,
    })

    return {
      kind: 'error',
      code: 'discovery_manifest_failed',
      retryable: true,
      reason: readbackResult.redactedMessage,
      attempt: failedAttempt,
      auditEvent,
    }
  }

  const replayed = baseAttempt.status === 'succeeded' && baseAttempt.generatedHash === manifest.generatedHash
  const readback = buildReadback(manifest, options.now, catalogResult.sourceHash)
  const {
    failureCode: _failureCode,
    failureMessageRedacted: _failureMessageRedacted,
    ...cleanBaseAttempt
  } = baseAttempt
  const succeededAttempt = updateAttempt(state.discoveryManifestAttempts, {
    ...cleanBaseAttempt,
    status: 'succeeded',
    retryCount,
    finishedAt: options.now,
    generatedHash: manifest.generatedHash,
    bodyHash: manifest.bodyHash,
    urlHash: manifest.urlHash,
    latestReadback: readback,
    staleThresholdAt: options.now + (options.staleAfterMs ?? defaultStaleAfterMs),
    repairAction: 'no_repair',
    repairResult: 'succeeded',
  })
  upsertManifest(state.discoveryManifests, manifest)
  const auditEvent = ensureDiscoveryAuditEvent(state, manifest, {
    eventType: 'discovery.generated',
    now: options.now,
  })

  return {
    kind: 'ok',
    code: replayed ? 'discovery_manifest_replayed' : 'discovery_manifest_generated',
    manifest,
    attempt: succeededAttempt,
    auditEvent,
  }
}

export function invalidateDiscoveryManifest(
  state: DiscoverySourceState,
  input: InvalidateDiscoveryManifestInput
): InvalidateDiscoveryManifestResult {
  const manifests: DiscoveryManifestContract[] = []
  for (const manifest of state.discoveryManifests) {
    if (manifest.businessId !== input.businessId) {
      continue
    }
    const next: DiscoveryManifestContract = {
      ...manifest,
      disposition: 'stale',
      degradedReason: input.reasonCode,
      suppressedAt: input.now,
    }
    upsertManifest(state.discoveryManifests, next)
    manifests.push(next)
  }

  const attempts: DiscoveryManifestAttemptContract[] = []
  for (const attempt of state.discoveryManifestAttempts) {
    if (attempt.businessId !== input.businessId) {
      continue
    }
    attempts.push(updateAttempt(state.discoveryManifestAttempts, {
      ...attempt,
      status: 'stale',
      finishedAt: input.now,
      staleThresholdAt: input.now,
      failureCode: input.reasonCode,
      repairAction: 'invalidate_manifest',
      repairResult: 'succeeded',
    }))
  }

  for (const intent of state.invalidationIntents) {
    let includesDiscoveryManifest = false
    for (const surface of intent.surfaces) {
      if (surface === 'discovery_manifest') {
        includesDiscoveryManifest = true
        break
      }
    }
    if (
      intent.businessId === input.businessId
      && intent.status === 'queued'
      && includesDiscoveryManifest
    ) {
      intent.status = 'applied'
    }
  }

  return {
    kind: 'ok',
    code: 'discovery_manifest_invalidated',
    attempts,
    manifests,
  }
}

export function readDiscoveryHealth(state: DiscoverySourceState, businessId: BusinessId): DiscoveryHealthReadback {
  const catalogResult = readSourceCatalog(state, { businessId })
  const latestAttempt = latestAttemptForBusiness(state.discoveryManifestAttempts, businessId)
  const latestManifest = latestManifestForBusiness(state.discoveryManifests, businessId)
  const sourceHash = catalogResult.kind === 'available' ? catalogResult.sourceHash : undefined
  const status = healthStatus(catalogResult.kind, latestAttempt, sourceHash)

  return {
    businessId,
    sourceState: catalogResult.kind === 'available' ? 'published' : 'not_public',
    discoveryStatus: status,
    ...(latestManifest === undefined ? {} : { latestManifest }),
    ...(latestAttempt === undefined ? {} : { latestAttempt }),
    affectedPublicSurfaces: latestManifest?.routes.map((route) => route.url) ?? [],
    repairAction: latestAttempt?.repairAction ?? (catalogResult.kind === 'available' ? 'regenerate_manifest' : 'no_repair'),
    repairResult: latestAttempt?.repairResult ?? 'not_run',
  }
}

function readSourceCatalog(
  state: DiscoverySourceState,
  input: RegenerateDiscoveryManifestInput
):
  | { kind: 'available'; catalog: PublicBusinessCatalogApiV2Dto; sourceHash: SourceHash }
  | { kind: 'hidden'; reason: 'not_public' | 'missing_business' | 'no_public_catalog' } {
  const business =
    'businessId' in input
      ? state.businesses.find((candidate) => candidate.businessId === input.businessId)
      : state.businesses.find((candidate) => candidate.slug === String(input.slug))

  if (business === undefined) {
    return { kind: 'hidden', reason: 'missing_business' }
  }

  const registryHealth = readCatalogHealth(state, business.businessId)
  const result = getPublicBusinessCatalog(state, {
    slug: business.slug,
    indexStatus: registryHealth.indexStatus,
    discoveryStatus: 'available',
  })

  if (result.kind === 'hidden') {
    return { kind: 'hidden', reason: 'no_public_catalog' }
  }

  return { kind: 'available', catalog: result.catalog, sourceHash: business.sourceHash }
}

function healthStatus(
  sourceState: 'available' | 'hidden',
  attempt: DiscoveryManifestAttemptContract | undefined,
  sourceHash: SourceHash | undefined
): DiscoveryHealthReadback['discoveryStatus'] {
  if (sourceState === 'hidden') {
    return 'unavailable'
  }

  if (attempt === undefined) {
    return 'degraded'
  }

  if (sourceHash !== undefined && attempt.sourceHash !== sourceHash) {
    return 'stale'
  }

  if (attempt.status === 'succeeded') {
    return 'available'
  }

  if (attempt.status === 'stale') {
    return 'stale'
  }

  return 'degraded'
}

function ensureDiscoveryAttempt(
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

function updateAttempt(
  records: DiscoveryManifestAttemptContract[],
  next: DiscoveryManifestAttemptContract
): DiscoveryManifestAttemptContract {
  const index = records.findIndex((record) => record.attemptId === next.attemptId)
  if (index === -1) {
    records.push(next)
    return next
  }

  records[index] = next
  return next
}

function upsertManifest(records: DiscoveryManifestContract[], next: DiscoveryManifestContract): void {
  const index = records.findIndex(
    (record) => record.businessId === next.businessId && record.ucpVersion === next.ucpVersion
  )
  if (index === -1) {
    records.push(next)
    return
  }

  records[index] = next
}

function latestAttemptForBusiness(
  records: readonly DiscoveryManifestAttemptContract[],
  businessId: BusinessId
): DiscoveryManifestAttemptContract | undefined {
  return records
    .filter((attempt) => attempt.businessId === businessId)
    .sort((left, right) => (right.finishedAt ?? right.startedAt) - (left.finishedAt ?? left.startedAt))
    .at(0)
}

function latestManifestForBusiness(
  records: readonly DiscoveryManifestContract[],
  businessId: BusinessId
): DiscoveryManifestContract | undefined {
  return records
    .filter((manifest) => manifest.businessId === businessId)
    .sort((left, right) => right.generatedAt - left.generatedAt)
    .at(0)
}

function safeReadManifest(
  adapter: NonNullable<RegenerateDiscoveryManifestOptions['adapter']>,
  manifest: DiscoveryManifestContract
) {
  try {
    return adapter.readManifest(manifest)
  } catch {
    return {
      kind: 'error' as const,
      code: 'discovery_readback_exception',
      redactedMessage: 'Discovery readback failed before completion.',
    }
  }
}

const defaultAdapter = {
  readManifest: () => ({ kind: 'ok' as const }),
}

function buildReadback(
  manifest: DiscoveryManifestContract,
  readAt: number,
  sourceHash: SourceHash,
): DiscoveryManifestReadback {
  return {
    businessId: manifest.businessId,
    slug: manifest.slug,
    manifestUrl: manifest.manifestUrl,
    sourceVersion: manifest.sourceVersion,
    sourceHash,
    generatedHash: manifest.generatedHash,
    bodyHash: manifest.bodyHash,
    urlHash: manifest.urlHash,
    routeUrls: manifest.routes.map((route) => route.url),
    readAt,
  }
}

function ensureDiscoveryAuditEvent(
  state: DiscoverySourceState,
  manifest: DiscoveryManifestContract & { sourceHash: SourceHash },
  input: {
    eventType: 'discovery.generated' | 'discovery.degraded'
    failureCode?: string
    reason?: string
    now: number
  }
): AuditEventContract {
  const eventId = brandNonEmpty(`audit:${input.eventType}:${manifest.businessId}:${manifest.sourceHash}`, 'AuditEventId')
  const existing = state.auditEvents.find((event) => event.eventId === eventId)
  if (existing !== undefined) {
    return existing
  }

  const redactedPayload = {
    bodyHash: manifest.bodyHash,
    routeCount: manifest.routes.length,
    schemaVersion: manifest.schemaVersion,
    slug: manifest.slug,
    urlHash: manifest.urlHash,
    ...(input.reason === undefined ? {} : { reason: input.reason }),
  }
  const validation = validateAuditEvent({
    eventId,
    eventType: input.eventType,
    actorKind: 'system',
    actorRef: 'discovery',
    targetType: 'discovery_manifest',
    targetRef: manifest.businessId,
    businessId: manifest.businessId,
    idempotencyKey: brandNonEmpty(`op:${input.eventType}:${manifest.businessId}:${manifest.sourceHash}`, 'OperationKey'),
    correlationId: brandNonEmpty(`corr:${input.eventType}:${manifest.businessId}:${manifest.sourceHash}`, 'CorrelationId'),
    beforeState: 'queued',
    afterState: input.eventType === 'discovery.generated' ? 'available' : 'degraded',
    evidenceRefs: [],
    redactedPayload,
    payloadHash: canonicalDigest(redactedPayload),
    ...(input.failureCode === undefined ? {} : { failureCode: input.failureCode }),
    createdAt: input.now,
  })

  if (!validation.valid) {
    throw new Error(`Invalid discovery audit event: ${validation.reason}`)
  }

  state.auditEvents.push(validation.event)
  return validation.event
}

function attemptId(businessId: BusinessId, sourceHash: SourceHash): string {
  return `discovery:manifest:${businessId}:${sourceHash}:v1`
}
