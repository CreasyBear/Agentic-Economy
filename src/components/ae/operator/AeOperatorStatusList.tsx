import type { ReactNode } from 'react'

import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemHeader,
  ItemTitle,
} from '@/components/ui/item'
import { ScrollArea } from '@/components/ui/scroll-area'

export type AeOperatorStatusRow = {
  id: string
  label: string
  state: string
  description?: ReactNode
  meta?: ReactNode
}

export type AeOperatorStatusListProps = {
  rows: readonly AeOperatorStatusRow[]
  scroll?: boolean
  maxHeight?: string
}

export function AeOperatorStatusList({
  rows,
  scroll = false,
  maxHeight = 'min(24rem, 50vh)',
}: AeOperatorStatusListProps) {
  const list = (
    <ItemGroup className="ae-operator-status-list gap-2">
      {rows.map((row) => (
        <Item key={row.id} variant="outline" size="sm" className="ae-operator-status-row">
          <ItemContent>
            <ItemHeader>
              <ItemTitle className="text-sm">{row.label}</ItemTitle>
              <span className="text-xs font-medium text-muted-foreground">{row.state}</span>
            </ItemHeader>
            {row.description === undefined ? null : (
              <ItemDescription className="text-xs">{row.description}</ItemDescription>
            )}
            {row.meta}
          </ItemContent>
        </Item>
      ))}
    </ItemGroup>
  )

  if (!scroll || rows.length <= 4) {
    return list
  }

  return (
    <ScrollArea className="ae-operator-status-scroll" style={{ maxHeight }}>
      <div className="pr-3">{list}</div>
    </ScrollArea>
  )
}
