import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { Text } from '@astryxdesign/core/Text'

import type { OwnerInboxOriginProjection } from '@/modules/inquiries/public'

export type AeInquiryOriginCardProps = {
  origin: OwnerInboxOriginProjection
}

export function AeInquiryOriginCard({ origin }: AeInquiryOriginCardProps) {
  return (
    <Card padding={3} className="grid gap-3">
      <div className="grid gap-1">
        <Text as="h2" type="supporting" weight="semibold">
          Chat answer context
        </Text>
        <Text as="p" type="supporting">
          This inquiry started after the customer chose a listed business in chat. Open the answer to review the listed facts and limits before replying.
        </Text>
      </div>
      <Button label="Open answer" href={origin.href} variant="secondary" size="sm" className="justify-self-start" />
    </Card>
  )
}
