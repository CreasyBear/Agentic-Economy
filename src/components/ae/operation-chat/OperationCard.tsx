import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import type { OperationCardProjection } from './presentation'

export function OperationCard({ projection }: { projection: OperationCardProjection }) {
  const status = {
    working: 'Working',
    complete: 'Complete',
    refused: 'Refused',
    error: 'Unavailable',
  }[projection.state]
  const variant = projection.state === 'complete'
    ? 'success'
    : projection.state === 'working'
      ? 'info'
      : projection.state === 'refused'
        ? 'warning'
        : 'destructive'

  return (
    <Card className="gap-2 rounded-lg py-3 shadow-xs" data-operation-tool={projection.toolId}>
      <CardContent className="flex flex-col gap-2 px-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm font-medium">{projection.title}</span>
          <Badge variant={variant}>{status}</Badge>
        </div>
        {projection.name === undefined ? null : <p className="text-sm text-muted-foreground">{projection.name}</p>}
        {projection.count === undefined ? null : <p className="text-xs tabular-nums text-muted-foreground">{projection.count} operations</p>}
        {projection.summary === undefined ? null : <p className="text-xs text-muted-foreground">{projection.summary}</p>}
        {projection.operationRefs.length === 0 ? null : (
          <ul className="flex list-none flex-wrap gap-1 p-0" aria-label="Operation references">
            {projection.operationRefs.map((operationRef) => (
              <li key={operationRef}><Badge variant="outline" className="font-mono font-normal">{operationRef}</Badge></li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
