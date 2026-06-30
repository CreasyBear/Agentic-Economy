import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

type AdminAnalyticsPanelProps = {
  activationSummary: {
    byStage: readonly { stage: string; count: number }[]
    totalTracked: number
  }
  posthogAppUrl?: string
}

export function AdminAnalyticsPanel({ activationSummary, posthogAppUrl }: AdminAnalyticsPanelProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>GTM analytics</CardTitle>
        <CardDescription>
          Channel funnels and event breakdowns live in PostHog. Owner activation milestones stay in source-owned readback below.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {posthogAppUrl === undefined ? (
          <p className="text-sm text-muted-foreground">
            Set <code className="font-mono text-xs">VITE_POSTHOG_APP_URL</code> to link the PostHog project from this panel.
          </p>
        ) : (
          <p className="text-sm">
            <a href={posthogAppUrl} className="font-medium underline underline-offset-4" target="_blank" rel="noreferrer">
              Open PostHog funnels and channel dashboards
            </a>
          </p>
        )}
        {activationSummary.totalTracked === 0 ? (
          <p className="text-sm text-muted-foreground">No owner activation milestones recorded yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Activation stage</TableHead>
                <TableHead className="text-right">Businesses</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {activationSummary.byStage.map((row) => (
                <TableRow key={row.stage}>
                  <TableCell>{row.stage.replaceAll('_', ' ')}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.count}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}
