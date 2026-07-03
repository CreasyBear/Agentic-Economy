import type { ComponentProps, ReactNode } from 'react'

import { Badge } from '@astryxdesign/core/Badge'
import { Button } from '@astryxdesign/core/Button'
import { Item } from '@astryxdesign/core/Item'
import { List } from '@astryxdesign/core/List'

import { AeEmptyState } from '@/components/ae/feedback/AeEmptyState'

export type AeOperatorQueueBadge = {
  label: string
  variant?: 'default' | 'secondary' | 'destructive' | 'outline'
}

export type AeOperatorQueueAction = {
  label: string
  href: string
  variant?: 'primary' | 'secondary' | 'ghost' | 'destructive' | 'link'
}

export type AeOperatorQueueRow = {
  id: string
  href?: string
  badges: readonly AeOperatorQueueBadge[]
  title: string
  description?: string
  body?: ReactNode
  facts?: readonly { label: string; value: string }[]
  actions?: readonly AeOperatorQueueAction[]
  footer?: ReactNode
}

export type AeOperatorQueueListProps = {
  rows: readonly AeOperatorQueueRow[]
  emptyTitle: string
  emptyDescription: string
  scroll?: boolean
  maxHeight?: string
  className?: string
  /** Caps the visible fact rows per item (rest stays available on the detail page). Used for compact/owner density. */
  maxFacts?: number
}

export function AeOperatorQueueList({
  rows,
  emptyTitle,
  emptyDescription,
  scroll = false,
  maxHeight = 'min(70vh, 48rem)',
  className,
  maxFacts,
}: AeOperatorQueueListProps) {
  if (rows.length === 0) {
    return <AeEmptyState title={emptyTitle} description={emptyDescription} />
  }

  const list = (
    <List density="spacious" className={`gap-3 ${className ?? ''}`}>
      {rows.map((row) => (
        <AeOperatorQueueItem key={row.id} row={row} maxFacts={maxFacts} />
      ))}
    </List>
  )

  if (!scroll) {
    return list
  }

  return (
    <div className="overflow-auto rounded-md border border-border" style={{ maxHeight }}>
      <div className="p-3">{list}</div>
    </div>
  )
}

function AeOperatorQueueItem({ row, maxFacts }: { row: AeOperatorQueueRow; maxFacts: number | undefined }) {
  const hasActions = row.href !== undefined || (row.actions !== undefined && row.actions.length > 0)
  const visibleFacts = maxFacts === undefined ? row.facts : row.facts?.slice(0, maxFacts)
  const endContent = (
    <div className="flex flex-wrap items-center gap-2">
      {row.badges.map((badge) => (
        <Badge
          key={`${row.id}:${badge.label}`}
          variant={toAstryxBadgeVariant(badge.variant)}
          label={badge.label}
        />
      ))}
    </div>
  )
  const description = (
    <div className="grid gap-2">
      {row.description === undefined ? null : <p className="text-sm leading-6 text-secondary">{row.description}</p>}
      {row.body}
      {visibleFacts === undefined || visibleFacts.length === 0 ? null : (
        <dl className="mt-2 grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-3">
          {visibleFacts.map((fact) => (
            <div key={`${row.id}:${fact.label}`}>
              <dt className="font-medium text-secondary">{fact.label}</dt>
              <dd className="break-words text-primary">{fact.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {hasActions ? (
        <div className="mt-2 flex flex-wrap justify-start gap-2">
          {row.href === undefined ? null : (
            <Button href={row.href} label="Open" variant="secondary" size="sm" />
          )}
          {row.actions?.map((action) => (
            <Button
              key={`${row.id}:${action.label}`}
              href={action.href}
              label={action.label}
              variant={toAstryxButtonVariant(action.variant)}
              size="sm"
            />
          ))}
        </div>
      ) : null}
      {row.footer}
    </div>
  )

  return (
    <Item
      as="li"
      density="compact"
      align="start"
      label={<span className="break-words font-mono text-sm">{row.title}</span>}
      description={description}
      endContent={endContent}
    />
  )
}

function toAstryxBadgeVariant(variant: AeOperatorQueueBadge['variant']): NonNullable<ComponentProps<typeof Badge>['variant']> {
  if (variant === 'destructive') return 'error'
  if (variant === 'secondary') return 'info'
  return 'neutral'
}

function toAstryxButtonVariant(variant: AeOperatorQueueAction['variant']): NonNullable<ComponentProps<typeof Button>['variant']> {
  if (variant === 'primary') return 'primary'
  if (variant === 'ghost' || variant === 'link') return 'ghost'
  if (variant === 'destructive') return 'destructive'
  return 'secondary'
}
