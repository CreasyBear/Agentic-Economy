import { AeObservabilityErrorBoundary } from '@/components/ae/feedback/AeObservabilityErrorBoundary'
import { useState } from 'react'
import { AeCopyReference } from '@/components/ae/data/AeCopyReference'
import { AeRecordSheet } from '@/components/ae/layout/AeRecordSheet'
import { AeAlert } from '@/components/ae/shared/alert/AeAlert'
import { Badge } from '@/components/arc/badge/badge'
import { Button } from '@/components/arc/button/button'
import { ADMIN_REFUSAL_PRESENTATION } from '@/lib/operator/admin-console/refusal-presentation'
import { formatTimestamp } from '@/lib/ui/format-time'
import { ADMIN_ACTION_COPY, ADMIN_SUCCESS_COPY } from './actions.contracts'
import type { AdminCommandRecoveryIdentity } from './admin-command-recovery'
import { useAdminCommandObservation, useAdminCommandRecovery } from './useAdminCommandRecovery'

/** Adapted from official ReUI solution-agents-7 FailedRunTriage/Header/Sheet and
 * sheet-14 EventView/FactGroup. Existing AE drawer keeps focus, dismissal and portals.
 * All records come from scoped recovery identities and current receipt reads. */
export function AdminCommandRecoveryPanel() {
  return <AeObservabilityErrorBoundary fallback={({ resetError }) => <section className="arc-market grid gap-3 rounded-lg border border-border p-4" aria-label="Command recovery unavailable">
    <p role="status" className="text-sm text-muted-foreground">Command recovery could not be read. Saved recovery identities are retained.</p>
    <Button type="button" variant="secondary" onClick={resetError}>Check command recovery</Button>
  </section>}>
    <AdminCommandRecoveryContent />
  </AeObservabilityErrorBoundary>
}

function AdminCommandRecoveryContent() {
  const recovery = useAdminCommandRecovery()
  if (recovery.scope === null || recovery.entries.length === 0) return null
  const scope = recovery.scope
  return <section className="arc-market flex w-full min-w-0 flex-col gap-4" aria-label="Command recovery">
    <div className="flex w-full flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-center gap-2.5">
          <h2 className="text-foreground text-lg leading-tight font-medium tracking-tight">Command recovery</h2>
          <Badge tone="neutral">{recovery.entries.length} tracked</Badge>
        </div>
        <p className="mt-0.5 text-sm text-muted-foreground">Check commands whose outcomes need confirmation.</p>
      </div>
    </div>
    <ul className="min-w-0 divide-y divide-border rounded-lg border border-border">
      {recovery.entries.map(identity => <li key={`${scope}:${identity.action}:${identity.operationKey}`} className="min-w-0 px-4 py-3">
        <AeObservabilityErrorBoundary fallback={({ resetError }) => <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0"><p className="text-sm font-medium">{ADMIN_ACTION_COPY[identity.action]}</p><p role="status" className="text-sm text-muted-foreground">The receipt is unavailable. The recovery identity is retained.</p></div>
          <Button type="button" variant="secondary" onClick={resetError}>Check receipt</Button>
        </div>}>
          <RecoveryRecord scope={scope} identity={identity} />
        </AeObservabilityErrorBoundary>
      </li>)}
    </ul>
  </section>
}

function RecoveryRecord({ scope, identity }: Readonly<{ scope: string; identity: AdminCommandRecoveryIdentity }>) {
  const command = useAdminCommandObservation(scope, identity)
  const [open, setOpen] = useState(false)
  const observation = command.observation
  const receipt = observation?.kind === 'recorded' ? observation.receipt : null
  const label = observation === undefined ? 'Checking outcome'
    : observation.kind === 'refused' ? 'Access unavailable'
      : observation.kind !== 'recorded' ? 'Outcome unconfirmed'
        : receipt?.kind === 'pending' ? 'Pending'
          : receipt?.kind === 'completed' ? 'Completed'
            : receipt?.kind === 'proposed' ? 'Awaiting approval' : 'Refused'
  const detail = observation === undefined ? 'Reading the recorded command outcome.'
    : observation.kind === 'refused' ? 'Current access does not permit this receipt read. Its recovery identity remains saved.'
      : observation.kind !== 'recorded' ? 'No outcome has been confirmed. Keep this command identity and inspect Audit before starting another command of this type.'
        : receipt?.kind === 'pending' ? 'The command is recorded and still pending. Its receipt updates when the source confirms completion.'
          : receipt?.kind === 'completed' ? Object.entries(ADMIN_SUCCESS_COPY).find(([code]) => code === receipt.code)?.[1] ?? 'The command is completed.'
            : receipt?.kind === 'proposed' ? `A second approval is required before ${formatTimestamp(receipt.expiresAt, 'Australia/Perth')}.`
              : Object.entries(ADMIN_REFUSAL_PRESENTATION).find(([code]) => receipt?.kind === 'refused' && code === receipt.code)?.[1].copy ?? 'The command was refused.'
  const refs = receipt?.kind === 'completed' || receipt?.kind === 'pending' ? receipt.effectRefs : []
  return <>
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
      <div className="min-w-0"><p className="text-sm font-medium">{ADMIN_ACTION_COPY[identity.action]}</p><p role="status" className="text-sm text-muted-foreground">{label}</p></div>
      <Button type="button" variant="secondary" size="md" onClick={() => setOpen(true)}>Inspect command</Button>
    </div>
    <AeRecordSheet open={open} onOpenChange={setOpen} title={ADMIN_ACTION_COPY[identity.action]} description="Recorded command outcome and recovery references."
      action={command.canAcknowledge ? <Button type="button" size="md" onClick={() => { if (command.acknowledge()) setOpen(false) }}>Acknowledge receipt</Button> : undefined}>
      <div className="flex min-w-0 flex-col gap-4 py-4">
        <AeAlert tone={receipt?.kind === 'refused' ? 'danger' : 'info'} title={label} role="status">{detail}</AeAlert>
        <section className="flex min-w-0 flex-col gap-3">
          <h3 className="text-muted-foreground text-xs font-medium">Recovery identity</h3>
          <dl className="grid grid-cols-[7rem_minmax(0,1fr)] gap-x-3 gap-y-2.5 text-sm">
            <div className="contents"><dt className="text-muted-foreground">Operation</dt><dd className="min-w-0"><AeCopyReference label="Operation" value={identity.operationKey} /></dd></div>
            <div className="contents"><dt className="text-muted-foreground">Correlation</dt><dd className="min-w-0"><AeCopyReference label="Correlation" value={identity.correlationId} /></dd></div>
            {receipt?.kind === 'completed' || receipt?.kind === 'pending' ? <div className="contents"><dt className="text-muted-foreground">Audit event</dt><dd className="min-w-0"><AeCopyReference label="Audit event" value={receipt.auditEventRef} /></dd></div> : null}
            {receipt?.kind === 'proposed' ? <div className="contents"><dt className="text-muted-foreground">Proposal</dt><dd className="min-w-0"><AeCopyReference label="Proposal" value={receipt.proposalRef} /></dd></div> : null}
          </dl>
        </section>
        {refs.length === 0 ? null : <section className="flex min-w-0 flex-col gap-3"><h3 className="text-muted-foreground text-xs font-medium">Recorded effects</h3>{refs.map(ref => <AeCopyReference key={ref} label="Effect reference" value={ref} />)}</section>}
        <a className="text-sm underline underline-offset-4" href="/admin/audit-events">Inspect Audit</a>
      </div>
    </AeRecordSheet>
  </>
}
