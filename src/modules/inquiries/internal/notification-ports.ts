import type {
  InquiryNotificationRecord,
  InquirySourceState,
} from './schema'

export type InquiryNotificationPorts = Readonly<{
  enqueueDispatches: (
    state: InquirySourceState,
    notification: InquiryNotificationRecord,
    businessId: string,
    correlationId: string,
  ) => Promise<{ state: InquirySourceState; notification: InquiryNotificationRecord }>
}>
