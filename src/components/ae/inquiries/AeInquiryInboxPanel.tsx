import { useMemo, useState } from 'react'

import { AeEmptyState } from '@/components/ae/feedback/AeEmptyState'
import { Badge } from '@/components/ui/badge'
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemFooter,
  ItemGroup,
  ItemHeader,
  ItemTitle,
} from '@/components/ui/item'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { InquiryNotificationStatus, OwnerInboxBucket, OwnerInboxInquiryProjection, OwnerInboxReadback } from '@/modules/inquiries/public'

type InboxFilter = 'all' | OwnerInboxBucket

export type AeInquiryInboxPanelProps = {
  inbox: OwnerInboxReadback
}

export function AeInquiryInboxPanel({ inbox }: AeInquiryInboxPanelProps) {
  const [filter, setFilter] = useState<InboxFilter>('all')

  const filtered = useMemo(() => {
    if (filter === 'all') {
      return inbox.inquiries
    }
    return inbox.inquiries.filter((inquiry) => inquiry.bucket === filter)
  }, [filter, inbox.inquiries])

  if (inbox.empty) {
    return (
      <AeEmptyState
        title="No messages yet"
        description="Published services with contact handling will appear here after a customer submits a message."
      />
    )
  }

  return (
    <Tabs value={filter} onValueChange={(value) => setFilter(value as InboxFilter)} className="ae-inquiry-inbox">
      <TabsList variant="line" aria-label="Filter messages by status">
        <TabsTrigger value="all">All ({inbox.inquiries.length})</TabsTrigger>
        <TabsTrigger value="unread">Unread ({inbox.buckets.unread})</TabsTrigger>
        <TabsTrigger value="needs_reply">Needs reply ({inbox.buckets.needs_reply})</TabsTrigger>
        <TabsTrigger value="resolved">Resolved ({inbox.buckets.resolved})</TabsTrigger>
      </TabsList>
      <div className="mt-4">
        {filtered.length === 0 ? (
          <AeEmptyState
            title="Nothing in this bucket"
            description="Try another filter to see messages in a different state."
          />
        ) : (
          <ItemGroup className="ae-inquiry-inbox__list gap-3">
            {filtered.map((inquiry) => (
              <AeInquiryInboxRow key={inquiry.threadId} inquiry={inquiry} />
            ))}
          </ItemGroup>
        )}
      </div>
    </Tabs>
  )
}

function AeInquiryInboxRow({ inquiry }: { inquiry: OwnerInboxInquiryProjection }) {
  const href = `/owner/inquiries/${encodeURIComponent(inquiry.threadId)}`

  return (
    <Item variant="outline" size="sm" className="ae-inquiry-inbox-row" asChild>
      <a href={href}>
        <ItemContent>
          <ItemHeader>
            <ItemTitle>{inquiry.serviceName}</ItemTitle>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={inquiry.bucket === 'resolved' ? 'secondary' : 'default'}>
                {inquiry.bucket.replace('_', ' ')}
              </Badge>
              <Badge variant={notificationVariant(inquiry.notificationStatus)}>{inquiry.notificationLabel}</Badge>
            </div>
          </ItemHeader>
          <ItemDescription>{inquiry.businessName}</ItemDescription>
          <p className="line-clamp-2 text-sm text-foreground">{inquiry.preview}</p>
          <ItemFooter className="text-xs text-muted-foreground">
            <span>{inquiry.messageCount} messages</span>
            <span>{inquiry.status}</span>
            <time dateTime={new Date(inquiry.updatedAt).toISOString()}>
              {new Date(inquiry.updatedAt).toISOString()}
            </time>
          </ItemFooter>
        </ItemContent>
      </a>
    </Item>
  )
}

function notificationVariant(status: InquiryNotificationStatus): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'queued':
      return 'outline'
    case 'sent':
      return 'secondary'
    case 'failed':
      return 'destructive'
    case 'held':
      return 'outline'
  }
}
