import type {
  AdminReadbackRepairAction,
  AdminReadbackRow,
  AdminReadbackSurface,
} from '@/modules/security/public'
import { getStatusPresentation } from '@/lib/ui/status-presentation'

export const adminReadbackSurfaceLabels = {
  audit_events: 'Activity log',
  index_health: 'Catalog health',
} satisfies Record<AdminReadbackSurface, string>

export const adminReadbackRowStateLabels = {
  no_source_rows: 'No source rows',
  guarded: 'Guarded',
  queued: 'Queued',
  indexed: 'Indexed',
  degraded: getStatusPresentation('degraded').label,
  stale: 'Stale',
  suppressed: 'Suppressed',
} satisfies Record<AdminReadbackRow['rowState'], string>

export const adminReadbackRepairNextSteps = {
  inspect_audit: 'Inspect the audit record',
  regenerate_projection: 'Regenerate the projection',
  source_auth_required: 'Restore source authorization',
  no_repair_available: 'No repair is available',
} satisfies Record<AdminReadbackRepairAction, string>
