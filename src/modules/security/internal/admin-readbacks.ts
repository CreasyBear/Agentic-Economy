import type { AdminMembership } from '@/modules/security/public'
import { requireAdminAuthority } from './admin-authority'

export const AdminReadbackSurfaceValues = ['claims_queue', 'audit_events', 'index_health'] as const
export type AdminReadbackSurface = (typeof AdminReadbackSurfaceValues)[number]

export const AdminReadbackRowTypeValues = ['claim', 'audit_event', 'index_surface'] as const
export type AdminReadbackRowType = (typeof AdminReadbackRowTypeValues)[number]

export const AdminReadbackRowStateValues = [
  'pending_review',
  'no_source_rows',
  'guarded',
  'queued',
  'indexed',
  'degraded',
  'stale',
  'suppressed',
] as const
export type AdminReadbackRowState = (typeof AdminReadbackRowStateValues)[number]

export const AdminReadbackRepairActionValues = [
  'review_claim',
  'inspect_audit',
  'regenerate_projection',
  'source_auth_required',
  'no_repair_available',
] as const
export type AdminReadbackRepairAction = (typeof AdminReadbackRepairActionValues)[number]

export const AdminReadbackRepairResultValues = ['not_run', 'succeeded', 'failed'] as const
export type AdminReadbackRepairResult = (typeof AdminReadbackRepairResultValues)[number]

export type AdminReadbackRow = {
  rowId: string
  rowType: AdminReadbackRowType
  objectRef: string
  rowState: AdminReadbackRowState
  surface: AdminReadbackSurface
  readbackState: 'not_queued' | 'available' | 'guarded' | 'unavailable'
  repairAction: AdminReadbackRepairAction
  repairResult?: AdminReadbackRepairResult
  affectedPublicSurfaces?: readonly string[]
  correlationId?: string
  attemptRef?: string
  updatedAt: number
}

export type AdminReadbackSummary = {
  queued: number
  attention: number
  stale: number
  suppressed: number
}

export type AdminReadbackDeniedReason = 'missing_membership' | 'inactive_membership' | 'action_not_allowed'

export type AdminDeniedReadback = {
  kind: 'denied'
  httpStatus: 401 | 403
  reason: AdminReadbackDeniedReason
  surface: AdminReadbackSurface
  generatedAt: number
  publicMessage: string
  rows: readonly []
}

export type AdminAllowedReadback = {
  kind: 'allowed'
  httpStatus: 200
  surface: AdminReadbackSurface
  generatedAt: number
  actorRef: string
  summary: AdminReadbackSummary
  rows: readonly AdminReadbackRow[]
}

export type AdminShellReadback = AdminDeniedReadback | AdminAllowedReadback

export type AdminReadbackRequest = {
  membership: AdminMembership | undefined
  surface: AdminReadbackSurface
  rows?: readonly AdminReadbackRow[]
  now: number
}

export function readAdminRouteShell(request: AdminReadbackRequest): AdminShellReadback {
  const authority = requireAdminAuthority(request.membership, 'read_admin_readbacks')
  if (authority.kind === 'denied') {
    return {
      kind: 'denied',
      httpStatus: authority.reason === 'missing_membership' ? 401 : 403,
      reason: authority.reason,
      surface: request.surface,
      generatedAt: request.now,
      publicMessage: 'Admin readback requires active source-owned membership.',
      rows: [],
    }
  }

  const rows = request.rows ?? []
  return {
    kind: 'allowed',
    httpStatus: 200,
    surface: request.surface,
    generatedAt: request.now,
    actorRef: authority.membership.clerkUserId,
    summary: summarizeAdminRows(rows),
    rows,
  }
}

function summarizeAdminRows(rows: readonly AdminReadbackRow[]): AdminReadbackSummary {
  return {
    queued: rows.filter((row) => row.rowState === 'queued' || row.rowState === 'pending_review').length,
    attention: rows.filter((row) => row.rowState === 'degraded' || row.rowState === 'guarded').length,
    stale: rows.filter((row) => row.rowState === 'stale').length,
    suppressed: rows.filter((row) => row.rowState === 'suppressed').length,
  }
}
