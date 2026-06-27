import { ShieldAlert, ShieldCheck } from 'lucide-react'

import { AeStatusBadge } from '@/components/ae/status/AeStatusBadge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { AdminReadbackRow, AdminReadbackSurface, AdminShellReadback } from '@/modules/security/public'

const surfaceLabels = {
  claims_queue: 'Claims queue',
  audit_events: 'Audit events',
  index_health: 'Index health',
} satisfies Record<AdminReadbackSurface, string>

const rowStateLabels = {
  pending_review: 'Pending review',
  no_source_rows: 'No source rows',
  guarded: 'Guarded',
  queued: 'Queued',
  degraded: 'Degraded',
  stale: 'Stale',
  suppressed: 'Suppressed',
} satisfies Record<AdminReadbackRow['rowState'], string>

const repairLabels = {
  review_claim: 'Review claim',
  inspect_audit: 'Inspect audit',
  regenerate_projection: 'Regenerate projection',
  source_auth_required: 'Source auth required',
  no_repair_available: 'No repair available',
} satisfies Record<AdminReadbackRow['repairAction'], string>

type AeAdminReadbackPanelProps = {
  title: string
  description: string
  readback: AdminShellReadback
}

export function AeAdminReadbackPanel({ title, description, readback }: AeAdminReadbackPanelProps) {
  const accessLabel = readback.kind === 'denied' ? `HTTP ${readback.httpStatus}` : `HTTP ${readback.httpStatus}`

  return (
    <>
      <Alert variant={readback.kind === 'denied' ? 'destructive' : 'default'}>
        {readback.kind === 'denied' ? (
          <ShieldAlert aria-hidden="true" className="size-4" />
        ) : (
          <ShieldCheck aria-hidden="true" className="size-4" />
        )}
        <AlertTitle>{readback.kind === 'denied' ? 'Access denied' : 'Readback available'}</AlertTitle>
        <AlertDescription>
          {readback.kind === 'denied'
            ? `${readback.publicMessage} ${accessLabel}.`
            : `${surfaceLabels[readback.surface]} is available to ${readback.actorRef}. ${accessLabel}.`}
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>
          {readback.kind === 'denied' ? <DeniedReadback readback={readback} /> : <AllowedReadback readback={readback} />}
        </CardContent>
      </Card>
    </>
  )
}

function DeniedReadback({ readback }: { readback: Extract<AdminShellReadback, { kind: 'denied' }> }) {
  return (
    <div className="grid gap-3 md:grid-cols-3">
      <ReadbackStat label="Surface" value={surfaceLabels[readback.surface]} />
      <ReadbackStat label="Decision" value={readback.reason.replaceAll('_', ' ')} />
      <ReadbackStat label="Private rows returned" value={String(readback.rows.length)} />
    </div>
  )
}

function AllowedReadback({ readback }: { readback: Extract<AdminShellReadback, { kind: 'allowed' }> }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 md:grid-cols-4">
        <ReadbackStat label="Queued" value={String(readback.summary.queued)} />
        <ReadbackStat label="Needs attention" value={String(readback.summary.attention)} />
        <ReadbackStat label="Stale" value={String(readback.summary.stale)} />
        <ReadbackStat label="Suppressed" value={String(readback.summary.suppressed)} />
      </div>
      {readback.rows.length === 0 ? (
        <div className="rounded-md border bg-muted/30 p-4">
          <AeStatusBadge status="not_queued" />
          <p className="mt-3 text-sm text-muted-foreground">No source-owned operational rows exist for this surface yet.</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3" aria-label={`${surfaceLabels[readback.surface]} readback rows`}>
          {readback.rows.map((row) => (
            <li key={row.rowId} className="rounded-md border p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="flex min-w-0 flex-col gap-2">
                  <span className="text-sm font-medium text-foreground">{row.objectRef}</span>
                  <span className="text-sm text-muted-foreground">
                    {row.rowType.replaceAll('_', ' ')} - {rowStateLabels[row.rowState]}
                  </span>
                </div>
                <Badge variant="outline">{repairLabels[row.repairAction]}</Badge>
              </div>
              <dl className="mt-3 grid gap-2 text-sm md:grid-cols-3">
                <ReadbackTerm label="Surface" value={surfaceLabels[row.surface]} />
                <ReadbackTerm label="Source state" value={rowStateLabels[row.rowState]} />
                <ReadbackTerm label="Readback" value={row.readbackState.replaceAll('_', ' ')} />
                <ReadbackTerm label="Attempt" value={row.attemptRef ?? 'Unavailable'} />
                <ReadbackTerm label="Correlation" value={row.correlationId ?? 'Unavailable'} />
              </dl>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function ReadbackStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-muted/30 p-3">
      <span className="block text-xs font-medium uppercase tracking-normal text-muted-foreground">{label}</span>
      <span className="mt-1 block text-sm font-medium text-foreground">{value}</span>
    </div>
  )
}

function ReadbackTerm({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-normal text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-foreground">{value}</dd>
    </div>
  )
}
