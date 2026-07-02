import type { ReactNode } from 'react'

import { AeEmptyState } from '@/components/ae/feedback/AeEmptyState'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemFooter,
  ItemGroup,
  ItemHeader,
  ItemTitle,
} from '@/components/ui/item'
import { ScrollArea } from '@/components/ui/scroll-area'

export type AeOperatorQueueBadge = {
  label: string
  variant?: 'default' | 'secondary' | 'destructive' | 'outline'
}

export type AeOperatorQueueAction = {
  label: string
  href: string
  variant?: 'default' | 'outline' | 'secondary' | 'ghost' | 'destructive' | 'link'
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
}

export function AeOperatorQueueList({
  rows,
  emptyTitle,
  emptyDescription,
  scroll = false,
  maxHeight = 'min(70vh, 48rem)',
  className,
}: AeOperatorQueueListProps) {
  if (rows.length === 0) {
    return <AeEmptyState title={emptyTitle} description={emptyDescription} />
  }

  const list = (
    <ItemGroup className={`ae-operator-queue gap-3 ${className ?? ''}`}>
      {rows.map((row) => (
        <AeOperatorQueueItem key={row.id} row={row} />
      ))}
    </ItemGroup>
  )

  if (!scroll) {
    return list
  }

  return (
    <ScrollArea className="ae-operator-queue-scroll ae-operator-scroll-panel border" style={{ maxHeight }}>
      <div className="p-3">{list}</div>
    </ScrollArea>
  )
}

function AeOperatorQueueItem({ row }: { row: AeOperatorQueueRow }) {
  const hasActions = row.href !== undefined || (row.actions !== undefined && row.actions.length > 0)
  const content = (
    <ItemContent>
      <ItemHeader>
        <ItemTitle className="break-words font-mono text-sm">{row.title}</ItemTitle>
        <div className="flex flex-wrap items-center gap-2">
          {row.badges.map((badge) => (
            <Badge key={`${row.id}:${badge.label}`} variant={badge.variant ?? 'default'}>
              {badge.label}
            </Badge>
          ))}
        </div>
      </ItemHeader>
      {row.description === undefined ? null : <ItemDescription>{row.description}</ItemDescription>}
      {row.body}
      {row.facts === undefined || row.facts.length === 0 ? null : (
        <dl className="mt-2 grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-3">
          {row.facts.map((fact) => (
            <div key={`${row.id}:${fact.label}`}>
              <dt className="font-medium text-muted-foreground">{fact.label}</dt>
              <dd className="break-words text-foreground">{fact.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {hasActions ? (
        <ItemFooter className="mt-2 flex flex-wrap justify-start gap-2">
          {row.href === undefined ? null : (
            <Button asChild variant="outline" size="sm">
              <a href={row.href} aria-label={`Open ${row.title}`}>Open</a>
            </Button>
          )}
          {row.actions?.map((action) => (
            <Button key={`${row.id}:${action.label}`} asChild variant={action.variant ?? 'outline'} size="sm">
              <a href={action.href}>{action.label}</a>
            </Button>
          ))}
        </ItemFooter>
      ) : null}
      {row.footer}
    </ItemContent>
  )

  return (
    <Item variant="outline" size="sm" className="ae-operator-queue-row" role="listitem">
      {content}
    </Item>
  )
}
