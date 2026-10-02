import { Badge } from '@/components/ui/badge'

import type { DecommissionFenceListProps } from '../workspace-danger-zone.contracts'
import '../WorkspaceDangerComposition.css'

export function DecommissionFenceList({ fenceMessages }: DecommissionFenceListProps) {
  return (
    <div className="arc-market arc-workspace-fences">
      <div className="arc-workspace-fences-heading">
        <Badge variant="destructive">Close blocked</Badge>
        <span>
          Close stays blocked until these are resolved.
        </span>
      </div>
      <ul className="arc-workspace-fences-list">
        {fenceMessages.map((message) => (
          <li key={message}>{message}</li>
        ))}
      </ul>
    </div>
  )
}
