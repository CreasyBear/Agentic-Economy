import type { InquiryNotificationStatus, InquiryThreadStatus } from './schema'

export type SubmittedInquiryReceipt = Readonly<{
  threadId: string
  businessId: string
  offeringRef: string
  status: InquiryThreadStatus
  version: number
  notificationId: string
  notificationStatus: InquiryNotificationStatus
  accessKey: string
}>

export function buildSubmittedInquiryReceipt(input: Readonly<{
  thread: Readonly<{
    threadId: string
    businessId: string
    offeringRef: string
    status: InquiryThreadStatus
    version: number
  }>
  notification: Readonly<{
    notificationId: string
    status: InquiryNotificationStatus
  }>
  accessKey: string
}>): SubmittedInquiryReceipt {
  return {
    threadId: input.thread.threadId,
    businessId: input.thread.businessId,
    offeringRef: input.thread.offeringRef,
    status: input.thread.status,
    version: input.thread.version,
    notificationId: input.notification.notificationId,
    notificationStatus: input.notification.status,
    accessKey: input.accessKey,
  }
}
