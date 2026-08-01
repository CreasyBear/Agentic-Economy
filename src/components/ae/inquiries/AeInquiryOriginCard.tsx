import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'

import type { OwnerInboxOriginProjection } from '@/modules/inquiries/public'

export type AeInquiryOriginCardProps = {
  origin: OwnerInboxOriginProjection
}

export function AeInquiryOriginCard({ origin }: AeInquiryOriginCardProps) {
  return (
    <Card className="border-border bg-card">
      <CardHeader>
        <CardTitle className="text-sm">Chat answer context</CardTitle>
        <CardDescription>
          This inquiry started after the customer chose a listed business in chat. Open the answer to review the listed facts and limits before replying.
        </CardDescription>
      </CardHeader>
      <CardFooter>
        <Button asChild variant="secondary" size="sm">
          <a href={origin.href}>Open answer</a>
        </Button>
      </CardFooter>
    </Card>
  )
}
