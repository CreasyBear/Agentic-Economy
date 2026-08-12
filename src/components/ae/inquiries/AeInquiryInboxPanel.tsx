import { useId, useMemo, useState, type ReactNode } from 'react'
import { AlertTriangleIcon, CheckCircle2Icon, InboxIcon, MailOpenIcon, ReplyIcon, SearchIcon, XIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle } from '@/components/ui/item'

import { formatTimestamp, timestampIso } from '@/lib/ui/format-time'
import { notificationVariant } from '@/lib/ui/inquiry-notification'
import { cn } from '@/lib/utils'
import type {
  InquiryNotificationStatus,
  OwnerInboxBucket,
  OwnerInboxInquiryProjection,
  OwnerInboxReadback,
} from '@/modules/inquiries/public'

type InboxFilter = 'all' | OwnerInboxBucket | 'delivery_attention'
type InboxBadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline'

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
      .filter((inquiry) => inquiryMatchesFilter(inquiry, filter) && inquiryMatchesQuery(inquiry, normalizedQuery))
      .sort(compareInboxPriority)
  }, [filter, inbox.inquiries, query])

  if (inbox.empty) {
    return (
      <Empty className="border border-border bg-card p-5">
        <EmptyHeader>
          <EmptyTitle>No messages yet</EmptyTitle>
          <EmptyDescription>Published services with contact handling will appear here after a customer submits a message.</EmptyDescription>
        </EmptyHeader>
      </Empty>
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
      <FieldGroup>
        <Field orientation="horizontal" className="min-h-11 items-center gap-2 rounded-md border border-border bg-card px-3">
          <SearchIcon aria-hidden="true" className="size-4 text-muted-foreground" />
          <FieldLabel htmlFor={searchId} className="sr-only">
            Search inquiries
          </FieldLabel>
          <Input
            id={searchId}
            name="inquirySearch"
            type="search"
            value={query}
            placeholder="Search inquiries"
            className="min-w-0 flex-1 border-0 bg-transparent px-0 text-sm shadow-none focus-visible:ring-0"
            onChange={(event) => setQuery(event.currentTarget.value)}
          />
          {query.trim().length === 0 ? null : (
            <Button
              type="button"
              size="icon"
              variant="secondary"
              aria-label="Clear search"
              onClick={() => setQuery('')}
            >
              <XIcon aria-hidden="true" />
            </Button>
          )}
        </Field>
      </FieldGroup>
      <ToggleGroup
        type="single"
        value={filter}
        variant="outline"
        aria-label="Filter messages by status"
        className="max-w-full flex-wrap justify-start"
        onValueChange={(value) => {
          if (value !== '' && isInboxFilter(value)) {
            setFilter(value)
          }
        }}
      >
        <ToggleGroupItem value="all">All ({inbox.inquiries.length})</ToggleGroupItem>
        <ToggleGroupItem value="unread">Unread ({inbox.buckets.unread})</ToggleGroupItem>
        <ToggleGroupItem value="needs_reply">Needs reply ({inbox.buckets.needs_reply})</ToggleGroupItem>
        <ToggleGroupItem value="delivery_attention">Delivery ({deliveryAttentionCount})</ToggleGroupItem>
        <ToggleGroupItem value="resolved">Resolved ({inbox.buckets.resolved})</ToggleGroupItem>
      </ToggleGroup>
      <div>
        {filtered.length === 0 ? (
          <Empty className="border border-border bg-card p-5">
            <EmptyHeader>
              <EmptyTitle>No matching inquiries</EmptyTitle>
              <EmptyDescription>Try another filter or search term to see a different part of the queue.</EmptyDescription>
            </EmptyHeader>
          </Empty>
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
    tone === 'active'
      ? 'border-brand bg-card text-foreground'
      : tone === 'warning'
        ? 'border-border bg-card text-foreground'
        : 'border-border bg-card text-muted-foreground'

  return (
    <div className={cn('grid min-h-24 content-between rounded-md border p-3', toneClass)}>
      <div className="flex items-center justify-between gap-2 text-xs">
        <span>{label}</span>
        <span className="text-muted-foreground">{icon}</span>
      </div>
      <span className="text-2xl font-semibold tabular-nums text-foreground">{value}</span>
    </div>
  )
}

function AeInquiryInboxRow({ inquiry }: { inquiry: OwnerInboxInquiryProjection }) {
  const href = `/owner/inquiries/${encodeURIComponent(inquiry.threadId)}`
  const needsDeliveryAttention = deliveryNeedsAttention(inquiry.notificationStatus)

  return (
    <Item asChild variant="outline" className="grid gap-3 bg-card text-foreground">
      <a href={href}>
        <ItemContent className="gap-2">
          <ItemTitle className="w-full flex-wrap">
            <span>{inquiry.offeringName}</span>
            <Badge variant={bucketVariant(inquiry.bucket)}>{bucketLabel(inquiry.bucket)}</Badge>
            <Badge variant={notificationVariant(inquiry.notificationStatus, { held: 'secondary' })}>{inquiry.notificationLabel}</Badge>
            {inquiry.origin === undefined ? null : <Badge variant="secondary">{inquiry.origin.label}</Badge>}
            {needsDeliveryAttention ? <Badge variant="secondary">Delivery attention</Badge> : null}
          </ItemTitle>
          <ItemDescription className="text-foreground">{inquiry.preview}</ItemDescription>
          {inquiry.origin === undefined ? null : (
            <ItemDescription className="text-xs leading-snug text-muted-foreground">
              Chat answer context: review the listed facts and limits before replying.
            </ItemDescription>
          )}
        </ItemContent>
        <ItemActions className="basis-full flex-wrap justify-start text-xs text-muted-foreground">
          <span>{nextActionLabel(inquiry)}</span>
          <span>{inquiry.messageCount} messages</span>
          <span>{inquiry.status}</span>
          <time dateTime={timestampIso(inquiry.updatedAt)} data-numeric>
            {formatTimestamp(inquiry.updatedAt)}
          </time>
        </ItemActions>
      </a>
    </Item>
  )
}

function isInboxFilter(value: string): value is InboxFilter {
  return value === 'all' || value === 'unread' || value === 'needs_reply' || value === 'delivery_attention' || value === 'resolved'
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
    inquiry.offeringName,
    inquiry.preview,
    inquiry.origin?.label ?? '',
    inquiry.status,
    inquiry.notificationLabel,
    bucketLabel(inquiry.bucket),
    inquiry.origin === undefined ? '' : 'chat answer context',
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

function bucketVariant(bucket: OwnerInboxBucket): InboxBadgeVariant {
  switch (bucket) {
    case 'unread':
      return 'outline'
    case 'needs_reply':
      return 'secondary'
    case 'resolved':
      return 'secondary'
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

