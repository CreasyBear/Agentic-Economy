import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

import type { ConsumerDecisionRecord } from '@/modules/customer-request/application/public'

export type AeDecisionTrailProps = Readonly<{
  decisions: readonly ConsumerDecisionRecord[]
}>

export function AeDecisionTrail({ decisions }: AeDecisionTrailProps) {
  if (decisions.length === 0) return null
  return (
    <section aria-labelledby="decision-trail-title" className="grid gap-3">
      <div className="grid gap-1">
        <h3 id="decision-trail-title" className="text-lg font-semibold text-foreground">Decisions so far</h3>
        <p className="text-muted-foreground">A readable trail of what was checked and what still needs a decision.</p>
      </div>
      <ol className="m-0 grid list-none gap-3 p-0">
        {decisions.map((record) => (
          <li key={`${record.step}-${record.optionRef ?? 'step'}`}>
            <Card className="border border-border bg-card p-0">
              <CardHeader className="p-4">
                <CardTitle className="text-base">Step {record.step}: {record.summary}</CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <p className="text-sm text-muted-foreground">
                  {record.authority === 'inspect_only' ? 'Read-only check' : 'Customer decision'} · {record.action}
                  {' · '}Next: {record.nextAction.label}
                </p>
              </CardContent>
            </Card>
          </li>
        ))}
      </ol>
    </section>
  )
}
