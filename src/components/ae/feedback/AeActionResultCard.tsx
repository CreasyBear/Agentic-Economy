import { CheckCircle2Icon, CircleAlertIcon } from 'lucide-react'

import type { PublicInquirySubmitServerResult } from '@/modules/inquiries/inquiry.functions'
import type { InquiryNotificationStatus } from '@/modules/inquiries/public'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

/**
 * Typed result card. Renders an action result by discriminator
 * instead of plain prose, the AE counterpart to the "render action
 * results as typed cards" pattern. Each supported result code gets its own renderer;
 * the error branch is always covered so new actions don't break the surface.
 *
 * Daylight Register: hairline Card, one plain next-step, mono for receipt ids,
 * no epistemic-state labels, no badge cemetery (DESIGN.md §9.4, §12, §13).
 */

type AeActionResultCardProps = {
  result: PublicInquirySubmitServerResult
  businessName?: string
  serviceName?: string
}

export function AeActionResultCard({ result, businessName, serviceName }: AeActionResultCardProps) {
  if (result.kind === 'error') {
    return <ErrorCard reason={result.reason} />
  }

  const optionalLabels = {
    ...(businessName === undefined ? {} : { businessName }),
    ...(serviceName === undefined ? {} : { serviceName }),
  }

  return (
    <InquirySubmittedCard
      code={result.code}
      threadId={result.receipt.threadId}
      notificationId={result.receipt.notificationId}
      notificationStatus={result.receipt.notificationStatus}
      {...optionalLabels}
    />
  )
}

type InquirySubmittedCode = 'inquiry_submitted' | 'inquiry_replayed'

function InquirySubmittedCard({
  code,
  threadId,
  notificationId,
  notificationStatus,
  businessName,
  serviceName,
}: {
  code: InquirySubmittedCode
  threadId: string
  notificationId: string
  notificationStatus: InquiryNotificationStatus
  businessName?: string
  serviceName?: string
}) {
  const title = code === 'inquiry_replayed' ? 'Inquiry already received' : 'Inquiry recorded'
  const subject = businessName ?? 'the business'
  const serviceLine = serviceName === undefined ? null : <CardDescription>{serviceName}</CardDescription>

  return (
    <Card className="ae-action-result-card ae-action-result-card--inquiry-submitted" role="status">
      <CardHeader className="border-b">
        <CardTitle className="flex items-center gap-2">
          <CheckCircle2Icon aria-hidden="true" className="size-4" />
          {title}
        </CardTitle>
        {serviceLine}
      </CardHeader>
      <CardContent className="grid gap-4 pt-2">
        <p className="text-sm leading-6">
          Message saved for {subject}. Delivery state: {deliveryLabel(notificationStatus)}.
        </p>
        <div className="grid gap-1 font-mono text-xs text-muted-foreground" aria-label="Receipt details">
          <span>Receipt {threadId}</span>
          {notificationId ? <span>Notification {notificationId}</span> : null}
        </div>
        <p className="text-sm leading-6 text-muted-foreground">
          The owner reviews your message and replies through your chosen contact detail. This does not book, charge, or dispatch work.
        </p>
      </CardContent>
    </Card>
  )
}

function ErrorCard({ reason }: { reason: string }) {
  return (
    <Card className="ae-action-result-card ae-action-result-card--error" role="alert">
      <CardHeader className="border-b">
        <CardTitle className="flex items-center gap-2">
          <CircleAlertIcon aria-hidden="true" className="size-4" />
          Inquiry needs attention
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-2">
        <p className="text-sm leading-6">{reason}</p>
      </CardContent>
    </Card>
  )
}

function deliveryLabel(status: InquiryNotificationStatus): string {
  switch (status) {
    case 'queued':
      return 'queued for owner delivery'
    case 'sent':
      return 'delivery recorded'
    case 'failed':
      return 'delivery needs review'
    case 'held':
      return 'delivery awaiting review'
    default:
      return 'awaiting owner review'
  }
}
