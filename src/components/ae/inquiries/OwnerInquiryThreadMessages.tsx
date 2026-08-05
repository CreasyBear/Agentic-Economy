import { Link } from '@tanstack/react-router'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Conversation, ConversationContent } from '@/components/ai-elements/conversation'
import { Message, MessageContent } from '@/components/ai-elements/message'
import { AeOperatorFactGrid } from '@/components/ae/operator/AeOperatorFactGrid'
import { formatTimestamp, timestampIso } from '@/lib/ui/format-time'
import { notificationVariant } from '@/lib/ui/inquiry-notification'
import type { OwnerInquiryDetailReadback } from '@/modules/inquiries/public'

export function ThreadMessages({ detail }: { detail: OwnerInquiryDetailReadback }) {
  return (
    <Card className="p-3">
      <div className="grid gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={detail.inquiry.bucket === 'resolved' ? 'secondary' : 'outline'}>{detail.inquiry.bucket.replace('_', ' ')}</Badge>
          <Badge variant={notificationVariant(detail.inquiry.notificationStatus, { held: 'destructive' })}>{detail.inquiry.notificationLabel}</Badge>
        </div>
        <h2 className="text-lg font-semibold text-foreground">Thread messages</h2>
        <p className="text-sm text-muted-foreground">{detail.inquiry.preview}</p>
      </div>
      <div className="mt-4 grid gap-4">
        <Conversation className="max-h-[min(32rem,60vh)] overflow-auto pr-3">
          <ConversationContent className="grid gap-3 p-0 pb-1">
            {detail.messages.map((message) => {
              const isOwner = message.sender === 'owner'
              const senderLabel = isOwner ? 'Owner' : 'Customer'
              const sender = isOwner ? 'user' : 'assistant'
              return (
                <Message key={message.messageId} from={sender} className="grid max-w-full gap-2">
                  <div className="flex items-start gap-2">
                    <Avatar size="sm" aria-label={senderLabel}>
                      <AvatarFallback>{senderLabel.slice(0, 1)}</AvatarFallback>
                    </Avatar>
                    <div className="grid min-w-0 gap-1">
                      <div className="flex flex-wrap items-baseline gap-2">
                        <span className="text-sm font-medium text-foreground">{senderLabel}</span>
                        <span className="text-xs text-muted-foreground">
                          <time dateTime={timestampIso(message.createdAt)} data-numeric>
                            {formatTimestamp(message.createdAt)}
                          </time>
                        </span>
                      </div>
                      <MessageContent className="rounded-md border border-border bg-card px-3 py-2 text-foreground">
                        {message.body}
                      </MessageContent>
                    </div>
                  </div>
                </Message>
              )
            })}
          </ConversationContent>
        </Conversation>
        {detail.inquiry.status === 'closed' ? (
          <>
            <div className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
              <span className="h-px flex-1 bg-border" aria-hidden="true" />
              <span>Thread closed</span>
              <span className="h-px flex-1 bg-border" aria-hidden="true" />
            </div>
            <Button asChild variant="secondary" size="sm" className="justify-self-start"><Link to="/owner/inquiries">Back to inbox</Link></Button>
          </>
        ) : null}
        <AeOperatorFactGrid
          facts={[
            { label: 'Status', value: detail.inquiry.status },
            { label: 'Messages', value: String(detail.inquiry.messageCount) },
            { label: 'Updated', value: formatTimestamp(detail.inquiry.updatedAt) },
          ]}
        />
      </div>
    </Card>
  )
}
