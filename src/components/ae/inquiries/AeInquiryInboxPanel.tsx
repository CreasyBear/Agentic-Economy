import { useId, useMemo, useState, type ReactNode } from 'react'
import { AlertTriangleIcon, CheckCircle2Icon, InboxIcon, MailOpenIcon, ReplyIcon, SearchIcon, XIcon } from 'lucide-react'
import { Badge, type BadgeProps } from '@astryxdesign/core/Badge'
import { Button } from '@astryxdesign/core/Button'
import { Item } from '@astryxdesign/core/Item'
import { Tab, TabList } from '@astryxdesign/core/TabList'

import { AeEmptyState } from '@/components/ae/feedback/AeEmptyState'
import { formatTimestamp, timestampIso } from '@/lib/ui/format-time'
import type { InquiryNotificationStatus, OwnerInboxBucket, OwnerInboxInquiryProjection, OwnerInboxReadback } from '@/modules/inquiries/public'

type InboxFilter = 'all' | OwnerInboxBucket | 'delivery_attention'

export type AeInquiryInboxPanelProps = {
  inbox: OwnerInboxReadback
}

export function AeInquiryInboxPanel({ inbox }: AeInquiryInboxPanelProps) {
  const searchId = useId()
  const [filter, setFilter] = useState<InboxFilter>('all')
  const [query, setQuery] = useState('')
  const deliveryAttentionCount = inbox.delivery.failed + inbox.delivery.held
  const openCount = inbox.buckets.unread + inbox.buckets.needs_reply

  const filtered = useMemo(() => {
    const normalizedQuery = normalizeQuery(query)
    return inbox.inquiries
      .filter((inquiry) => inquiryMatchesFilter(inquiry, filter))
      .filter((inquiry) => inquiryMatchesQuery(inquiry, normalizedQuery))
      .sort(compareInboxPriority)
  }, [filter, inbox.inquiries, query])

  if (inbox.empty) {
    return (
      <AeEmptyState
        title="No messages yet"
        description="Published services with contact handling will appear here after a customer submits a message."
      />
    )
  }

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 md:grid-cols-4">
        <InboxStat
          icon={<InboxIcon aria-hidden="true" className="size-4" />}
          label="Open"
          value={openCount}
          tone={openCount > 0 ? 'active' : 'quiet'}
        />
        <InboxStat
          icon={<MailOpenIcon aria-hidden="true" className="size-4" />}
          label="Unread"
          value={inbox.buckets.unread}
          tone={inbox.buckets.unread > 0 ? 'active' : 'quiet'}
        />
        <InboxStat
          icon={<ReplyIcon aria-hidden="true" className="size-4" />}
          label="Needs reply"
          value={inbox.buckets.needs_reply}
          tone={inbox.buckets.needs_reply > 0 ? 'active' : 'quiet'}
        />
        <InboxStat
          icon={
            deliveryAttentionCount > 0
              ? <AlertTriangleIcon aria-hidden="true" className="size-4" />
              : <CheckCircle2Icon aria-hidden="true" className="size-4" />
          }
          label="Delivery attention"
          value={deliveryAttentionCount}
          tone={deliveryAttentionCount > 0 ? 'warning' : 'quiet'}
        />
      </div>
      <div className="flex min-h-11 items-center gap-2 rounded-md border border-border bg-card px-3">
        <SearchIcon aria-hidden="true" className="size-4 text-secondary" />
        <label htmlFor={searchId} className="sr-only">
          Search inquiries
        </label>
        <input
          id={searchId}
          name="inquirySearch"
          type="search"
          value={query}
          placeholder="Search inquiries"
          className="min-w-0 flex-1 bg-transparent text-sm text-primary outline-none placeholder:text-secondary"
          onChange={(event) => setQuery(event.currentTarget.value)}
        />
        {query.trim().length === 0 ? null : (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            isIconOnly
            label="Clear search"
            icon={<XIcon aria-hidden="true" />}
            onClick={() => setQuery('')}
          />
        )}
      </div>
      <TabList value={filter} onChange={(value) => setFilter(value as InboxFilter)} aria-label="Filter messages by status">
        <Tab value="all" label={`All (${inbox.inquiries.length})`} />
        <Tab value="unread" label={`Unread (${inbox.buckets.unread})`} />
        <Tab value="needs_reply" label={`Needs reply (${inbox.buckets.needs_reply})`} />
        <Tab value="delivery_attention" label={`Delivery (${deliveryAttentionCount})`} />
        <Tab value="resolved" label={`Resolved (${inbox.buckets.resolved})`} />
      </TabList>
      <div>
        {filtered.length === 0 ? (
          <AeEmptyState
            title="No matching inquiries"
            description="Try another filter or search term to see a different part of the queue."
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

function InboxStat({
  icon,
  label,
  value,
  tone,
}: {
  icon: ReactNode
  label: string
  value: number
  tone: 'active' | 'warning' | 'quiet'
}) {
  const toneClass =
    tone === 'warning'
      ? 'border-border bg-muted/50 text-primary'
      : tone === 'active'
        ? 'border-primary/20 bg-muted/50 text-primary'
        : 'border-border bg-card text-secondary'

  return (
    <div className={`grid min-h-24 content-between rounded-md border p-3 ${toneClass}`}>
      <div className="flex items-center justify-between gap-2 text-xs">
        <span>{label}</span>
        <span className="text-secondary">{icon}</span>
      </div>
      <span className="text-2xl font-semibold tabular-nums text-primary">{value}</span>
    </div>
  )
}

function AeInquiryInboxRow({ inquiry }: { inquiry: OwnerInboxInquiryProjection }) {
  const href = `/owner/inquiries/${encodeURIComponent(inquiry.threadId)}`
  const needsDeliveryAttention = deliveryNeedsAttention(inquiry.notificationStatus)

  const labels = (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <span>{inquiry.serviceName}</span>
        <Badge
          variant={bucketVariant(inquiry.bucket)}
          label={bucketLabel(inquiry.bucket)}
        />
        <Badge variant={notificationVariant(inquiry.notificationStatus)} label={inquiry.notificationLabel} />
        {inquiry.origin === undefined ? null : <Badge variant="info" label={inquiry.origin.label} />}
        {needsDeliveryAttention ? <Badge variant="warning" label="Delivery attention" /> : null}
      </div>
      <p className="line-clamp-2 text-sm text-primary">{inquiry.preview}</p>
    </div>
  )

  const metadata = (
    <div className="flex flex-wrap gap-2 text-xs text-secondary">
      <span>{nextActionLabel(inquiry)}</span>
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

function inquiryMatchesFilter(inquiry: OwnerInboxInquiryProjection, filter: InboxFilter): boolean {
  if (filter === 'all') {
    return true
  }
  if (filter === 'delivery_attention') {
    return deliveryNeedsAttention(inquiry.notificationStatus)
  }
  return inquiry.bucket === filter
}

function inquiryMatchesQuery(inquiry: OwnerInboxInquiryProjection, query: string): boolean {
  if (query.length === 0) {
    return true
  }

  return [
    inquiry.businessName,
    inquiry.serviceName,
    inquiry.preview,
    inquiry.origin?.label ?? '',
    inquiry.status,
    inquiry.notificationLabel,
    bucketLabel(inquiry.bucket),
  ].some((value) => normalizeQuery(value).includes(query))
}

function normalizeQuery(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

function compareInboxPriority(left: OwnerInboxInquiryProjection, right: OwnerInboxInquiryProjection): number {
  const priority = inquiryPriority(left) - inquiryPriority(right)
  if (priority !== 0) {
    return priority
  }

  return right.updatedAt - left.updatedAt || String(left.threadId).localeCompare(String(right.threadId))
}

function inquiryPriority(inquiry: OwnerInboxInquiryProjection): number {
  if (deliveryNeedsAttention(inquiry.notificationStatus) && inquiry.bucket !== 'resolved') {
    return 0
  }
  if (inquiry.bucket === 'unread') {
    return 1
  }
  if (inquiry.bucket === 'needs_reply') {
    return 2
  }
  if (deliveryNeedsAttention(inquiry.notificationStatus)) {
    return 3
  }
  return 4
}

function deliveryNeedsAttention(status: InquiryNotificationStatus): boolean {
  return status === 'failed' || status === 'held'
}

function bucketLabel(bucket: OwnerInboxBucket): string {
  switch (bucket) {
    case 'unread':
      return 'Unread'
    case 'needs_reply':
      return 'Needs reply'
    case 'resolved':
      return 'Resolved'
  }
}

function bucketVariant(bucket: OwnerInboxBucket): NonNullable<BadgeProps['variant']> {
  switch (bucket) {
    case 'unread':
      return 'neutral'
    case 'needs_reply':
      return 'warning'
    case 'resolved':
      return 'info'
  }
}

function nextActionLabel(inquiry: OwnerInboxInquiryProjection): string {
  if (deliveryNeedsAttention(inquiry.notificationStatus)) {
    return 'Review delivery'
  }
  switch (inquiry.bucket) {
    case 'unread':
      return 'Read message'
    case 'needs_reply':
      return 'Reply needed'
    case 'resolved':
      return 'Resolved'
  }
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
