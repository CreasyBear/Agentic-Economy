import { AeEmptyState } from '@/components/ae/shared/empty-state/AeEmptyState'
import { DEVELOPER_DISCOVERY_UI_COPY } from '../discovery.contracts'
import type { DeveloperDiscoveryRow } from '../discovery.contracts'
import '../../DeveloperReferenceComposition.css'

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
    <ul className="arc-market arc-reference-rows">
      {rows.map((row) => (
        <li key={row.id} className="arc-reference-row">
          <div className="arc-reference-row-main">
            <span className="arc-reference-row-label">{row.label}</span>
            <span className="arc-reference-row-state">{row.state}</span>
          </div>
          {row.description === undefined ? null : (
            <p className="arc-reference-row-state">{row.description}</p>
          )}
        </li>
      ))}
    </ul>
  )
}
