import { Badge } from '@/components/arc/badge/badge'

import type { DecommissionFenceListProps } from '../workspace-danger-zone.contracts'
import '../WorkspaceDangerComposition.css'

export function DecommissionFenceList({ fenceMessages, fenceDestinations }: DecommissionFenceListProps) {
  return (
    <div className="arc-market arc-workspace-fences">
      <div className="arc-workspace-fences-heading">
        <Badge tone="danger">Close blocked</Badge>
        <span>
          Close stays blocked until these are resolved.
        </span>
      </div>
      <ul className="arc-workspace-fences-list">
        {fenceDestinations === undefined ? fenceMessages.map(message => <li key={message}>{message}</li>)
          : fenceDestinations.map(item => <li key={item.fence}><p>{item.label}</p><a className="underline underline-offset-4" href={item.href}>{item.actionLabel}</a></li>)}
      </ul>
    </div>
  )
}
