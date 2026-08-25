import type { Doc } from './_generated/dataModel'
import type { QueryCtx } from './_generated/server'
import { readCurrentActiveAdminMembership as readCurrentActiveMembership } from './authz'
import { readAdminRouteShell } from '../src/modules/security/public'
import type {
  AdminReadbackRow,
  AdminShellReadback,
  AdminMembership,
} from '../src/modules/security/public'

type AdminReadbackSource = {
  auditEvents: Doc<'auditEvents'>[]
  businesses: Doc<'businesses'>[]
}

const ADMIN_READBACK_ROW_CAP = 100

export async function readAdminAuditEventsHandler(ctx: QueryCtx) {
  return readAdminRows(ctx, 'audit_events', (source, now) => buildAuditRows(source, now))
}

export async function readAdminIndexHealthHandler(ctx: QueryCtx) {
  return readAdminRows(ctx, 'index_health', (source, now) => buildIndexRows(source, now))
}

async function readAdminRows(
  ctx: QueryCtx,
  surface: 'audit_events' | 'index_health',
  buildRows: (source: AdminReadbackSource, now: number) => readonly AdminReadbackRow[],
) {
  const membership = await readCurrentActiveMembership(ctx)
  const deniedNow = latestStoredAdminTimestamp(membership)
  const denied = readAdminRouteShell({ membership, surface, rows: [], now: deniedNow })
  if (denied.kind === 'denied') {
    return summarizeAdminReadback(denied)
  }

  const source = await readAdminReadbackSource(ctx.db, surface)
  const now = latestStoredAdminTimestamp(membership, source)
  return summarizeAdminReadback(readAdminRouteShell({
    membership,
    surface,
    rows: buildRows(source, now),
    now,
  }))
}

function latestStoredAdminTimestamp(
  membership: AdminMembership | undefined,
  source?: AdminReadbackSource,
): number {
  const timestamps = [
    membership?.grantedAt,
    membership?.revokedAt,
    ...(source?.auditEvents.map((event) => event.createdAt) ?? []),
    ...(source?.businesses.flatMap((business) => [business.createdAt, business.updatedAt]) ?? []),
  ]
  return timestamps.reduce<number>((latest, timestamp) => (
    typeof timestamp === 'number' && Number.isFinite(timestamp) && timestamp > latest
      ? timestamp
      : latest
  ), 0)
}

async function readAdminReadbackSource(
  db: QueryCtx['db'],
  surface: 'audit_events' | 'index_health',
): Promise<AdminReadbackSource> {
  if (surface === 'audit_events') {
    return {
      auditEvents: await db.query('auditEvents').order('desc').take(ADMIN_READBACK_ROW_CAP),
      businesses: [],
    }
  }

  const business = await db.query('businesses').first()
  const businesses = business === null ? [] : [business]
  return { auditEvents: [], businesses }
}

function buildAuditRows(
  source: AdminReadbackSource,
  _now: number,
): readonly AdminReadbackRow[] {
  return source.auditEvents.map((event) => ({
    rowId: `row:audit:${String(event.eventId)}`,
    rowType: 'audit_event' as const,
    objectRef: `audit:${String(event.eventType)}:${String(event.targetType)}`,
    rowState: 'guarded' as const,
    surface: 'audit_events' as const,
    readbackState: 'available' as const,
    repairAction: 'inspect_audit' as const,
    correlationId: String(event.correlationId),
    updatedAt: event.createdAt,
  }))
}

function buildIndexRows(
  source: AdminReadbackSource,
  now: number,
): readonly AdminReadbackRow[] {
  return [
    {
      rowId: 'row:index:source-catalog',
      rowType: 'index_surface',
      objectRef: source.businesses.length === 0 ? 'source:catalog:none' : 'source:catalog:available',
      rowState: source.businesses.length === 0 ? 'no_source_rows' : 'queued',
      surface: 'index_health',
      readbackState: source.businesses.length === 0 ? 'not_queued' : 'guarded',
      repairAction: source.businesses.length === 0 ? 'source_auth_required' : 'regenerate_projection',
      repairResult: 'not_run',
      updatedAt: now,
    },
  ]
}

function summarizeAdminReadback(readback: AdminShellReadback) {
  const rows = readback.rows.map(summarizeAdminReadbackRow)
  if (readback.kind === 'allowed') {
    return {
      kind: 'allowed' as const,
      httpStatus: readback.httpStatus,
      surface: readback.surface,
      generatedAt: readback.generatedAt,
      actorRef: readback.actorRef,
      summary: readback.summary,
      rows,
    }
  }

  return {
    kind: 'denied' as const,
    httpStatus: readback.httpStatus,
    reason: readback.reason,
    surface: readback.surface,
    generatedAt: readback.generatedAt,
    publicMessage: readback.publicMessage,
    rows,
  }
}

function summarizeAdminReadbackRow(row: AdminReadbackRow) {
  return {
    rowId: row.rowId,
    rowType: row.rowType,
    objectRef: row.objectRef,
    rowState: row.rowState,
    surface: row.surface,
    readbackState: row.readbackState,
    repairAction: row.repairAction,
    ...(row.repairResult === undefined ? {} : { repairResult: row.repairResult }),
    ...(row.affectedPublicSurfaces === undefined ? {} : { affectedPublicSurfaces: [...row.affectedPublicSurfaces] }),
    ...(row.correlationId === undefined ? {} : { correlationId: row.correlationId }),
    ...(row.attemptRef === undefined ? {} : { attemptRef: row.attemptRef }),
    updatedAt: row.updatedAt,
  }
}
