import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { AeOperatorFactGrid } from '@/components/ae/operator/AeOperatorFactGrid'
import { formatTimestamp } from '@/lib/ui/format-time'
import { notificationVariant } from '@/lib/ui/inquiry-notification'
import type { OwnerInboxNotificationProjection } from '@/modules/inquiries/public'

export function DeliveryReadback({ notifications }: { notifications: readonly OwnerInboxNotificationProjection[] }) {
  return (
    <Card className="p-3">
      <div className="grid gap-1.5">
        <h2 className="text-lg font-semibold text-foreground">Delivery status</h2>
        <p className="text-sm text-muted-foreground">
          Notification state never replaces the saved inquiry message.
        </p>
      </div>
      <div className="mt-4 grid gap-3">
        {notifications.length === 0 ? (
          <p className="text-sm text-muted-foreground">No delivery status recorded.</p>
        ) : (
          notifications.map((notification) => (
            <div key={notification.notificationId} className="grid gap-2 rounded-lg bg-muted/40 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={notificationVariant(notification.status, { held: 'destructive' })}>{notification.label}</Badge>
                <span className="text-xs text-muted-foreground">{notification.recipientRole}</span>
              </div>
              <AeOperatorFactGrid
                columns={2}
                facts={[
                  { label: 'Updated', value: formatTimestamp(notification.updatedAt) },
                  { label: 'Failure', value: notification.failureCode ?? 'none' },
                ]}
              />
            </div>
          ))
        )}
      </div>
    </Card>
  )
}
