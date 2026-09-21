import { AeEmptyState } from '@/components/ae/feedback/AeEmptyState'
import { DEVELOPER_DISCOVERY_UI_COPY } from '../discovery.contracts'
import type { DeveloperDiscoveryRow } from '../discovery.contracts'

export type DiscoveryRowsProps = Readonly<{
  rows: readonly DeveloperDiscoveryRow[]
}>

export function DiscoveryRows({ rows }: DiscoveryRowsProps) {
  if (rows.length === 0) {
    return (
      <AeEmptyState
        title={DEVELOPER_DISCOVERY_UI_COPY.emptyRowsHeading}
        description={DEVELOPER_DISCOVERY_UI_COPY.emptyRowsDescription}
      />
    )
  }

  return (
    <ul className="m-0 grid list-none divide-y divide-border p-0">
      {rows.map((row) => (
        <li key={row.id} className="grid gap-1 py-3 first:pt-0 last:pb-0">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <span className="font-medium text-foreground">{row.label}</span>
            <span className="text-sm text-muted-foreground">{row.state}</span>
          </div>
          {row.description === undefined ? null : (
            <p className="text-sm text-muted-foreground">{row.description}</p>
          )}
        </li>
      ))}
    </ul>
  )
}
