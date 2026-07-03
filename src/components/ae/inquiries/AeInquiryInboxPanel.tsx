import { useMemo, useState } from 'react'
import { Badge, type BadgeProps } from '@astryxdesign/core/Badge'
import { Item } from '@astryxdesign/core/Item'
import { Tab, TabList } from '@astryxdesign/core/TabList'

import { AeEmptyState } from '@/components/ae/feedback/AeEmptyState'
import { formatTimestamp, timestampIso } from '@/lib/ui/format-time'
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
    <div>
      <TabList value={filter} onChange={(value) => setFilter(value as InboxFilter)} aria-label="Filter messages by status">
        <Tab value="all" label={`All (${inbox.inquiries.length})`} />
        <Tab value="unread" label={`Unread (${inbox.buckets.unread})`} />
        <Tab value="needs_reply" label={`Needs reply (${inbox.buckets.needs_reply})`} />
        <Tab value="resolved" label={`Resolved (${inbox.buckets.resolved})`} />
      </TabList>
      <div className="mt-4">
        {filtered.length === 0 ? (
          <AeEmptyState
            title="Nothing in this bucket"
            description="Try another filter to see messages in a different state."
          />
        ) : (
          <div className="grid gap-3">
            {filtered.map((inquiry) => (
              <AeInquiryInboxRow key={inquiry.threadId} inquiry={inquiry} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function AeInquiryInboxRow({ inquiry }: { inquiry: OwnerInboxInquiryProjection }) {
  const href = `/owner/inquiries/${encodeURIComponent(inquiry.threadId)}`

  const labels = (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <span>{inquiry.serviceName}</span>
        <Badge
          variant={inquiry.bucket === 'resolved' ? 'info' : 'neutral'}
          label={inquiry.bucket.replace('_', ' ')}
        />
        <Badge variant={notificationVariant(inquiry.notificationStatus)} label={inquiry.notificationLabel} />
      </div>
      <p className="line-clamp-2 text-sm text-primary">{inquiry.preview}</p>
    </div>
  )

  const metadata = (
    <div className="flex flex-wrap gap-2 text-xs text-secondary">
      <span>{inquiry.messageCount} messages</span>
      <span>{inquiry.status}</span>
      <time dateTime={timestampIso(inquiry.updatedAt)} data-numeric>
        {formatTimestamp(inquiry.updatedAt)}
      </time>
    </div>
  )

  return (
    <Item
      href={href}
      density="spacious"
      align="start"
      label={labels}
      description={inquiry.businessName}
      endContent={metadata}
    />
  )
}

function notificationVariant(status: InquiryNotificationStatus): NonNullable<BadgeProps['variant']> {
  switch (status) {
    case 'queued':
      return 'neutral'
    case 'sent':
      return 'info'
    case 'failed':
      return 'error'
    case 'held':
      return 'warning'
  }
}
