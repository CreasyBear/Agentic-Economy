import { Badge } from '@astryxdesign/core/Badge'
import { Card } from '@astryxdesign/core/Card'
import { Text } from '@astryxdesign/core/Text'

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
      <Card padding={3} className="grid gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="grid min-w-0 gap-1">
            <Text type="supporting" weight="medium" color="secondary" display="block">
              Session context
            </Text>
            <Text color="primary" display="block">
              {context.summary}
            </Text>
          </div>
          <Badge variant="info" label={context.badgeLabel} />
        </div>
        <dl className="grid gap-2 sm:grid-cols-2">
          {context.facts.map((fact) => (
            <div key={fact.id} className="grid min-w-0 gap-0.5 rounded-md border border-border bg-card p-2">
              <dt className="text-xs font-medium leading-snug text-secondary">{fact.label}</dt>
              <dd className="break-words text-sm leading-snug text-primary">{fact.value}</dd>
            </div>
          ))}
        </dl>
      </Card>
    </section>
  )
}
