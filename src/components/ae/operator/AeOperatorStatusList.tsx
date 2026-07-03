import type { ReactNode } from 'react'

import { Item } from '@astryxdesign/core/Item'
import { List } from '@astryxdesign/core/List'

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
    <List density="compact" className="gap-2">
      {rows.map((row) => (
        <Item
          key={row.id}
          as="li"
          density="compact"
          label={<span className="text-sm">{row.label}</span>}
          description={
            row.description === undefined && row.meta === undefined ? undefined : (
              <div className="grid gap-1 text-xs">
                {row.description === undefined ? null : row.description}
                {row.meta}
              </div>
            )
          }
          endContent={<span className="text-xs font-medium text-secondary">{row.state}</span>}
        />
      ))}
    </List>
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
