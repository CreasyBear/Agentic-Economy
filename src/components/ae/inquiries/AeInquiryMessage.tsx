import { Avatar } from '@astryxdesign/core/Avatar'
import { ChatMessage, ChatMessageBubble } from '@astryxdesign/core/Chat'
import { formatTimestamp, timestampIso } from '@/lib/ui/format-time'
import type { OwnerInboxMessageProjection } from '@/modules/inquiries/public'

export type AeInquiryMessageProps = {
  message: OwnerInboxMessageProjection
}

export function AeInquiryMessage({ message }: AeInquiryMessageProps) {
  const isOwner = message.sender === 'owner'
  const senderLabel = isOwner ? 'Owner' : 'Customer'
  const sender = isOwner ? 'user' : 'assistant'

  return (
    <ChatMessage
      sender={sender}
      avatar={<Avatar name={senderLabel} size="small" />}
      name={senderLabel}
      metadata={
        <time dateTime={timestampIso(message.createdAt)} data-numeric>
          {formatTimestamp(message.createdAt)}
        </time>
      }
    >
      <ChatMessageBubble>{message.body}</ChatMessageBubble>
    </ChatMessage>
  )
}
