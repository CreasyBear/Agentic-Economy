import type { Doc } from './_generated/dataModel'
import type { QueryCtx } from './_generated/server'
import { readCurrentActiveAdminMembership as readCurrentActiveMembership } from './authz'
import { readAdminRouteShell } from '../src/modules/security/public'
import type {
  AdminReadbackRow,
  AdminShellReadback,
  AdminMembership,
} from '../src/modules/security/public'

type AdminReadbackSource = { businesses: Doc<'businesses'>[] }
type AdminReadbackRowResult = Omit<AdminReadbackRow, 'affectedPublicSurfaces'> & {
  affectedPublicSurfaces?: string[]
}
type AdminReadbackResult =
  | (Omit<Extract<AdminShellReadback, { kind: 'allowed' }>, 'rows'> & {
      rows: AdminReadbackRowResult[]
    })
  | (Omit<Extract<AdminShellReadback, { kind: 'denied' }>, 'rows'> & {
      rows: AdminReadbackRowResult[]
    })


export async function readAdminIndexHealthHandler(ctx: QueryCtx) {
  const membership = await readCurrentActiveMembership(ctx)
  const deniedNow = latestStoredAdminTimestamp(membership)
  const denied = readAdminRouteShell({ membership, surface: 'index_health', rows: [], now: deniedNow })
  if (denied.kind === 'denied') {
    return summarizeAdminReadback(denied)
  }

  const business = await ctx.db.query('businesses').first()
  const source: AdminReadbackSource = {
    businesses: business === null ? [] : [business],
  }
  const now = latestStoredAdminTimestamp(membership, source)
  return summarizeAdminReadback(readAdminRouteShell({
    membership,
    surface: 'index_health',
    rows: buildIndexRows(source, now),
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
    ...(source?.businesses.flatMap((business) => [business.createdAt, business.updatedAt]) ?? []),
  ]
  return timestamps.reduce<number>((latest, timestamp) => (
    typeof timestamp === 'number' && Number.isFinite(timestamp) && timestamp > latest
      ? timestamp
      : latest
  ), 0)
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

function summarizeAdminReadback(readback: AdminShellReadback): AdminReadbackResult {
  if (readback.kind === 'allowed') {
    return {
      kind: 'allowed',
      httpStatus: readback.httpStatus,
      surface: readback.surface,
      generatedAt: readback.generatedAt,
      actorRef: readback.actorRef,
      summary: readback.summary,
      rows: readback.rows.map(summarizeAdminReadbackRow),
    }
  }

  return {
    kind: 'denied',
    httpStatus: readback.httpStatus,
    reason: readback.reason,
    surface: readback.surface,
    generatedAt: readback.generatedAt,
    publicMessage: readback.publicMessage,
    rows: [],
  }
}

function summarizeAdminReadbackRow(row: AdminReadbackRow): AdminReadbackRowResult {
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
