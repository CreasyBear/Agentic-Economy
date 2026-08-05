import { Card } from '@/components/ui/card'
import type { OwnerInquiryDetailReadback } from '@/modules/inquiries/public'

export function InquiryNextStep({ detail }: { detail: OwnerInquiryDetailReadback }) {
  return (
    <Card className="p-3">
      <div className="grid gap-1.5">
        <h2 className="text-lg font-semibold text-foreground">Next step</h2>
        <p className="text-sm text-muted-foreground">{nextStepCopy(detail)}</p>
      </div>
    </Card>
  )
}

function nextStepCopy(detail: OwnerInquiryDetailReadback): string {
  if (detail.inquiry.notificationStatus === 'failed' || detail.inquiry.notificationStatus === 'held') {
    return 'Review delivery status before relying on customer notification, while keeping the saved message visible here.'
  }

  switch (detail.inquiry.status) {
    case 'unread':
      return 'Read the customer message, then reply or mark it read for owner follow-up.'
    case 'read':
      return 'Reply when the owner has enough detail, or close if no further follow-up is needed.'
    case 'replied':
      return 'Close the thread when the customer follow-up is complete.'
    case 'closed':
      return 'This thread is closed and remains available for reference.'
  }
}
