import type { ReactNode } from 'react'

import { Badge } from '@/components/ui/badge'
import { Item, ItemActions, ItemContent, ItemGroup, ItemTitle } from '@/components/ui/item'

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
    <ItemGroup className="gap-2">
      {rows.map((row) => (
        <Item asChild key={row.id} variant="outline" className="grid gap-2 bg-card">
          <div role="listitem">
            <ItemContent className="gap-1">
              <ItemTitle>{row.label}</ItemTitle>
              {row.description === undefined && row.meta === undefined ? null : (
                <div className="grid gap-1 text-xs text-muted-foreground">
                  {row.description}
                  {row.meta}
                </div>
              )}
            </ItemContent>
            <ItemActions>
              <Badge variant="secondary">{row.state}</Badge>
            </ItemActions>
          </div>
        </Item>
      ))}
    </ItemGroup>
  )
  if (!scroll || rows.length <= 4) {
    return list
  }

  return (
    <div className="overflow-auto" style={{ maxHeight }}>
      <div className="pr-3">{list}</div>
    </div>
  )
}
