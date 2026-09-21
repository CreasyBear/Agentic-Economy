import type {
  AdminReadbackRepairAction,
  AdminReadbackRow,
  AdminReadbackSurface,
} from '@/modules/security/public'

export const adminReadbackSurfaceLabels = {
  audit_events: 'Activity log',
  index_health: 'Catalog health',
} satisfies Record<AdminReadbackSurface, string>

export const adminReadbackRowStateLabels = {
  no_source_rows: 'No source rows',
  guarded: 'Guarded',
  queued: 'Queued',
  indexed: 'Indexed',
  degraded: 'Degraded',
  stale: 'Stale',
  suppressed: 'Suppressed',
} satisfies Record<AdminReadbackRow['rowState'], string>

export const adminReadbackRepairLabels = {
  inspect_audit: 'Inspect audit',
  regenerate_projection: 'Regenerate projection',
  source_auth_required: 'Source auth required',
  no_repair_available: 'No repair available',
} satisfies Record<AdminReadbackRepairAction, string>
