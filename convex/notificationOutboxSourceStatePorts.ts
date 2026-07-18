import type { NotificationOutboxSourceStatePorts } from '../src/modules/notification-outbox/public'
import type { RuntimeDb } from './source_state'
import {
  loadNotificationOutboxSourceState,
  persistNotificationOutboxSourceState,
} from './notificationOutboxSourceState'

export function notificationOutboxSourceStatePorts(db: RuntimeDb): NotificationOutboxSourceStatePorts {
  return {
    load: () => loadNotificationOutboxSourceState(db),
    persist: (state) => persistNotificationOutboxSourceState(db, state),
  }
}
