import type { InquiryNotificationStatus } from '@/modules/inquiries/public'

export type InquiryNotificationBadgeVariant = 'outline' | 'secondary' | 'destructive'
export type InquiryNotificationVariantOptions = Readonly<{
  held: 'secondary' | 'destructive'
}>

export function notificationVariant(
  status: InquiryNotificationStatus,
  options: InquiryNotificationVariantOptions,
): InquiryNotificationBadgeVariant {
  switch (status) {
    case 'queued':
      return 'outline'
    case 'sent':
      return 'secondary'
    case 'failed':
      return 'destructive'
    case 'held':
      return options.held
  }
}
