import { Badge } from '@/components/ui/badge'

import type { DecommissionFenceListProps } from '../workspace-danger-zone.contracts'

export function DecommissionFenceList({ fenceMessages }: DecommissionFenceListProps) {
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="destructive">Close blocked</Badge>
        <span className="text-sm text-muted-foreground">
          Close stays blocked until these are resolved.
        </span>
      </div>
      <ul className="list-disc pl-5 text-sm text-muted-foreground">
        {fenceMessages.map((message) => (
          <li key={message}>{message}</li>
        ))}
      </ul>
    </div>
  )
}
