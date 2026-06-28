import { createFileRoute } from '@tanstack/react-router'

import { AeAdminShell } from '@/components/ae/layout/AeAdminShell'
import { AeAdminReadbackPanel } from '@/components/ae/readback/AeAdminReadbackPanel'
import {
  createDefaultRegistrySourceState,
  readCatalogHealth,
  syncCatalogProjection,
} from '@/modules/registry/public'
import type {
  CatalogHealthReadback,
  IndexStatus,
  RegistryProjectionAttemptContract,
} from '@/modules/registry/public'
import { readAdminRouteShell } from '@/modules/security/public'
import type {
  AdminReadbackRepairAction,
  AdminReadbackRow,
  AdminReadbackRowState,
} from '@/modules/security/public'

const defaultIndexHealthReadbackAt = 4_000

export function buildIndexHealthRows(now = defaultIndexHealthReadbackAt): readonly AdminReadbackRow[] {
  const state = createDefaultRegistrySourceState()
  const business = state.businesses.find((candidate) => candidate.publicStatus === 'published')

  if (business === undefined) {
    return [
      {
        rowId: 'row:index:source-catalog',
        rowType: 'index_surface',
        objectRef: 'source:catalog:none',
        rowState: 'no_source_rows',
        surface: 'index_health',
        readbackState: 'not_queued',
        repairAction: 'source_auth_required',
        repairResult: 'not_run',
        updatedAt: now,
      },
    ]
  }

  syncCatalogProjection(state, { businessId: business.businessId }, { now })
  const health = readCatalogHealth(state, business.businessId)
  const attempt = health.latestAttempt

  return [
    sourceCatalogRow(health, business.slug, now),
    projectionAttemptRow(health, attempt, now),
    publicSurfaceRow(health, attempt, now),
  ]
}

export const Route = createFileRoute('/admin/index-health')({
  loader: () =>
    readAdminRouteShell({
      membership: undefined,
      surface: 'index_health',
      rows: buildIndexHealthRows(),
      now: defaultIndexHealthReadbackAt,
    }),
  component: AdminIndexHealthRoute,
})

function AdminIndexHealthRoute() {
  const readback = Route.useLoaderData()

  return (
    <AeAdminShell
      title="Index health"
      description="Check catalog and projection readbacks before public discovery files are allowed to ship."
      currentPath="/admin/index-health"
    >
      <AeAdminReadbackPanel
        title="Index readback"
        description="Denied reads return no private rows; authorized reads show source, attempt, repair, and affected public surfaces."
        readback={readback}
      />
    </AeAdminShell>
  )
}

function sourceCatalogRow(health: CatalogHealthReadback, slug: string, now: number): AdminReadbackRow {
  return {
    rowId: 'row:index:source-catalog',
    rowType: 'index_surface',
    objectRef: `source:catalog:${slug}:${health.sourceState}`,
    rowState: rowStateForIndexStatus(health.indexStatus, health.sourceState),
    surface: 'index_health',
    readbackState: health.sourceState === 'published' ? 'available' : 'not_queued',
    repairAction: repairActionFor(health.repairAction),
    repairResult: health.repairResult,
    affectedPublicSurfaces: health.affectedPublicSurfaces,
    ...(health.latestAttempt === undefined ? {} : { attemptRef: health.latestAttempt.logicalKey }),
    updatedAt: now,
  }
}

function projectionAttemptRow(
  health: CatalogHealthReadback,
  attempt: RegistryProjectionAttemptContract | undefined,
  now: number
): AdminReadbackRow {
  return {
    rowId: 'row:index:latest-attempt',
    rowType: 'index_surface',
    objectRef: attempt === undefined ? 'registry:attempt:none' : `registry:attempt:${attempt.status}`,
    rowState: attempt === undefined ? 'no_source_rows' : rowStateForAttempt(attempt),
    surface: 'index_health',
    readbackState: attempt?.latestReadback === undefined ? 'unavailable' : 'available',
    repairAction: repairActionFor(health.repairAction),
    repairResult: health.repairResult,
    affectedPublicSurfaces: health.affectedPublicSurfaces,
    ...(attempt?.sourceHash === undefined ? {} : { correlationId: attempt.sourceHash }),
    ...(attempt?.logicalKey === undefined ? {} : { attemptRef: attempt.logicalKey }),
    updatedAt: attempt?.finishedAt ?? attempt?.startedAt ?? now,
  }
}

function publicSurfaceRow(
  health: CatalogHealthReadback,
  attempt: RegistryProjectionAttemptContract | undefined,
  now: number
): AdminReadbackRow {
  return {
    rowId: 'row:index:affected-surfaces',
    rowType: 'index_surface',
    objectRef: `public-surfaces:${health.affectedPublicSurfaces.join('|')}`,
    rowState: rowStateForIndexStatus(health.indexStatus, health.sourceState),
    surface: 'index_health',
    readbackState: health.projectionItems.length > 0 ? 'available' : 'unavailable',
    repairAction: repairActionFor(health.repairAction),
    repairResult: health.repairResult,
    affectedPublicSurfaces: health.affectedPublicSurfaces,
    ...(attempt?.latestReadback?.generatedHash === undefined
      ? {}
      : { correlationId: attempt.latestReadback.generatedHash }),
    ...(attempt?.logicalKey === undefined ? {} : { attemptRef: attempt.logicalKey }),
    updatedAt: attempt?.finishedAt ?? now,
  }
}

function rowStateForIndexStatus(
  indexStatus: IndexStatus,
  sourceState: CatalogHealthReadback['sourceState']
): AdminReadbackRowState {
  if (sourceState !== 'published') {
    return 'no_source_rows'
  }

  if (indexStatus === 'indexed') {
    return 'indexed'
  }

  if (indexStatus === 'failed') {
    return 'degraded'
  }

  if (indexStatus === 'not_queued') {
    return 'queued'
  }

  return indexStatus
}

function rowStateForAttempt(attempt: RegistryProjectionAttemptContract): AdminReadbackRowState {
  if (attempt.status === 'succeeded') {
    return 'indexed'
  }

  if (attempt.status === 'failed') {
    return 'degraded'
  }

  return attempt.status
}

function repairActionFor(action: CatalogHealthReadback['repairAction']): AdminReadbackRepairAction {
  if (action === 'no_repair') {
    return 'no_repair_available'
  }

  return 'regenerate_projection'
}
