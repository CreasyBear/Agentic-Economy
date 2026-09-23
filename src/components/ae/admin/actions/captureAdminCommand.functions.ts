import { captureAdminEvent, buildAdminEventProperties } from '@/lib/observability/admin-event-props'
import { ADMIN_ACTION_PERMISSION } from '@/lib/operator/admin-console/contracts'
import type { AdminActionSheetReceipt } from '@/components/ae/admin/actions/actions.contracts'

export function captureAdminCommand(actorRef: string, receipt: AdminActionSheetReceipt): void {
  captureAdminEvent(actorRef, 'admin_command', buildAdminEventProperties('admin_command', {
    action: receipt.action,
    permission: ADMIN_ACTION_PERMISSION[receipt.action],
    outcome: receipt.kind,
  }))
}
