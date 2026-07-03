import { CheckCircle2Icon, CircleAlertIcon } from 'lucide-react'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { Text } from '@astryxdesign/core/Text'

import type { PublicInquirySubmitServerResult } from '@/modules/inquiries/inquiry.functions'
import type { InquiryNotificationStatus } from '@/modules/inquiries/public'

/**
 * Typed result card. Renders an action result by discriminator
 * instead of plain prose, the AE counterpart to the "render action
 * results as typed cards" pattern. Each supported result code gets its own renderer;
 * the error branch is always covered so new actions don't break the surface.
 *
 * Astryx-era result card: one plain next step, mono receipt ids, no
 * epistemic-state labels, no badge cemetery.
 */

type AeActionResultCardProps = {
  result: PublicInquirySubmitServerResult
  businessName?: string
  serviceName?: string
  answerHref?: string
}

export function AeActionResultCard({ result, businessName, serviceName, answerHref }: AeActionResultCardProps) {
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
      {...(answerHref === undefined ? {} : { answerHref })}
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
  answerHref,
  businessName,
  serviceName,
}: {
  code: InquirySubmittedCode
  threadId: string
  notificationId: string
  notificationStatus: InquiryNotificationStatus
  answerHref?: string
  businessName?: string
  serviceName?: string
}) {
  const title = code === 'inquiry_replayed' ? 'Inquiry already received' : 'Inquiry recorded'
  const subject = businessName ?? 'the business'

  return (
    <Card padding={5} role="status">
      <div className="grid gap-1.5 border-b pb-4">
        <Text as="div" type="large" weight="semibold" display="block" className="flex items-center gap-2">
          <CheckCircle2Icon aria-hidden="true" className="size-4" />
          {title}
        </Text>
        {serviceName === undefined ? null : (
          <Text as="p" type="supporting">
            {serviceName}
          </Text>
        )}
      </div>
      <div className="grid gap-4 pt-4">
        <Text as="p" type="body">
          Message saved for {subject}. Delivery state: {deliveryLabel(notificationStatus)}.
        </Text>
        <div className="grid gap-1 font-mono text-xs text-secondary" aria-label="Receipt details">
          <span>Receipt {threadId}</span>
          {notificationId ? <span>Notification {notificationId}</span> : null}
        </div>
        <Text as="p" type="supporting">
          The business reviews your message and replies through your chosen contact detail. They handle timing, price, and availability.
        </Text>
        {answerHref === undefined ? null : (
          <div className="grid gap-2 rounded-md border border-border bg-card p-3">
            <Text as="p" type="supporting">
              This receipt stays connected to the answer path you started from.
            </Text>
            <Button label="Back to answer" href={answerHref} variant="secondary" size="sm" className="justify-self-start" />
          </div>
        )}
      </div>
    </Card>
  )
}

function ErrorCard({ reason }: { reason: string }) {
  return (
    <Card variant="red" padding={5} role="alert">
      <div className="grid gap-1.5 border-b pb-4">
        <Text as="div" type="large" weight="semibold" display="block" className="flex items-center gap-2">
          <CircleAlertIcon aria-hidden="true" className="size-4" />
          Inquiry needs attention
        </Text>
      </div>
      <div className="pt-4">
        <Text as="p" type="body">
          {reason}
        </Text>
      </div>
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
