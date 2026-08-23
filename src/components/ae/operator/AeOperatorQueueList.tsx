import type { ReactNode } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Item,
  ItemActions,
  ItemContent,
  ItemHeader,
  ItemTitle,
} from '@/components/ui/item'

import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { cn } from '@/lib/utils'

export type AeOperatorQueueBadge = {
  label: string
  variant?: 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning' | 'info'
}

export type AeOperatorQueueAction = {
  label: string
  href: string
  variant?: 'default' | 'secondary' | 'ghost' | 'destructive' | 'link'
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
    return (
      <Empty className="border border-border bg-card p-5">
        <EmptyHeader>
          <EmptyTitle>{emptyTitle}</EmptyTitle>
          <EmptyDescription>{emptyDescription}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  const list = (
    <ul className={cn('m-0 flex list-none flex-col gap-3 p-0', className)}>
      {rows.map((row) => (
        <AeOperatorQueueItem key={row.id} row={row} maxFacts={maxFacts} />
      ))}
    </ul>
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

  return (
    <Item asChild variant="outline" className="grid gap-3 bg-card">
      <li>
        <ItemHeader className="min-w-0 flex-col items-start sm:flex-row">
          <ItemTitle className="min-w-0 max-w-full">
            <span className="max-w-full [overflow-wrap:anywhere] font-mono">{row.title}</span>
          </ItemTitle>
          <div className="flex flex-wrap items-center gap-2">
            {row.badges.map((badge) => (
              <Badge key={`${row.id}:${badge.label}`} variant={badge.variant ?? 'outline'}>
                {badge.label}
              </Badge>
            ))}
          </div>
        </ItemHeader>
        <ItemContent className="min-w-0 gap-2">
          {row.description === undefined ? null : <p className="text-sm leading-6 text-muted-foreground">{row.description}</p>}
          {row.body}
          {visibleFacts === undefined || visibleFacts.length === 0 ? null : (
            <dl className="mt-2 grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-3">
              {visibleFacts.map((fact) => (
                <div key={`${row.id}:${fact.label}`}>
                  <dt className="font-medium text-muted-foreground">{fact.label}</dt>
                  <dd className="break-words text-foreground">{fact.value}</dd>
                </div>
              ))}
            </dl>
          )}
          {hasActions ? (
            <ItemActions className="mt-2 flex-wrap justify-start">
              {row.href === undefined ? null : (
                <Button asChild variant="secondary" size="sm">
                  <a href={row.href}>Open</a>
                </Button>
              )}
              {row.actions?.map((action) => (
                <Button key={`${row.id}:${action.label}`} asChild variant={action.variant ?? 'secondary'} size="sm">
                  <a href={action.href}>{action.label}</a>
                </Button>
              ))}
            </ItemActions>
          ) : null}
          {row.footer}
        </ItemContent>
      </li>
    </Item>
  )
}
