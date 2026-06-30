import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Bubble, BubbleContent } from '@/components/ui/bubble'
import { Message, MessageAvatar, MessageContent, MessageFooter, MessageHeader } from '@/components/ui/message'
import type { OwnerInboxMessageProjection } from '@/modules/inquiries/public'

export type AeInquiryMessageProps = {
  message: OwnerInboxMessageProjection
}

export function AeInquiryMessage({ message }: AeInquiryMessageProps) {
  const isOwner = message.sender === 'owner'
  const senderLabel = isOwner ? 'Owner' : 'Customer'
  const align = isOwner ? 'end' : 'start'
  const initials = isOwner ? 'OW' : 'CU'

  return (
    <Message align={align} className="ae-inquiry-message">
      <MessageAvatar>
        <Avatar size="sm" className="ae-inquiry-message__avatar">
          <AvatarFallback className="ae-inquiry-message__avatar-fallback">{initials}</AvatarFallback>
        </Avatar>
      </MessageAvatar>
      <MessageContent>
        <MessageHeader>{senderLabel}</MessageHeader>
        <Bubble variant="outline" align={align}>
          <BubbleContent className="ae-inquiry-message__body">{message.body}</BubbleContent>
        </Bubble>
        <MessageFooter>
          <time dateTime={new Date(message.createdAt).toISOString()}>
            {new Date(message.createdAt).toISOString()}
          </time>
        </MessageFooter>
      </MessageContent>
    </Message>
  )
}
