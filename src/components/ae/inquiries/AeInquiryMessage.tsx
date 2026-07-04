import { useMemo } from 'react'
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
  const metadata = useMemo(
    () => (
      <time dateTime={timestampIso(message.createdAt)} data-numeric>
        {formatTimestamp(message.createdAt)}
      </time>
    ),
    [message.createdAt],
  )

  return (
    <ChatMessage
      sender={sender}
      avatar={<Avatar name={senderLabel} size="small" />}
      name={senderLabel}
      metadata={metadata}
    >
      <ChatMessageBubble>{message.body}</ChatMessageBubble>
    </ChatMessage>
  )
}
