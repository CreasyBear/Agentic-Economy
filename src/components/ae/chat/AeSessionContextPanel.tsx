import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'

import type { FollowUpIntent, PublicThreadProjection } from '@/modules/answer-thread/public'
import { buildSessionContext } from './session-context'

export type AeSessionContextPanelProps = {
  projection: PublicThreadProjection | null
  liveTurn?: {
    query: string
    intent: FollowUpIntent
  } | null
}

export function AeSessionContextPanel({ projection, liveTurn = null }: AeSessionContextPanelProps) {
  const context = buildSessionContext({ projection, liveTurn })

  if (context === null) {
    return null
  }

  return (
    <section className="w-full" aria-label="Session context">
      <Card className="grid gap-3 p-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="grid min-w-0 gap-1">
            <p className="block text-sm font-medium text-muted-foreground">
              Session context
            </p>
            <p className="block text-foreground">
              {context.summary}
            </p>
          </div>
          <Badge variant="secondary">{context.badgeLabel}</Badge>
        </div>
        <dl className="grid gap-2 sm:grid-cols-2">
          {context.facts.map((fact) => (
            <div key={fact.id} className="grid min-w-0 gap-0.5 rounded-md border border-border bg-card p-2">
              <dt className="text-xs font-medium leading-snug text-muted-foreground">{fact.label}</dt>
              <dd className="break-words text-sm leading-snug text-foreground">{fact.value}</dd>
            </div>
          ))}
        </dl>
      </Card>
    </section>
  )
}
