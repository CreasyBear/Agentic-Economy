import type { InquiryNotificationPorts } from '../src/modules/inquiries/public'
import type { RuntimeDb } from './source_state'
import { enqueueInquiryNotificationDispatches } from './inquiryNotificationBridge'

export function inquiryNotificationPorts(db: RuntimeDb): InquiryNotificationPorts {
  return {
    enqueueDispatches: (state, notification, businessId, correlationId) =>
      enqueueInquiryNotificationDispatches(db, state, notification, businessId, correlationId),
  }
}
