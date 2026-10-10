import { useRef } from 'react'
import { AeNavigationSafetyBoundary } from '@/components/ae/layout/AeNavigationSafetyBoundary'
import { AeRenderErrorBoundary } from '@/components/ae/feedback/AeObservabilityErrorBoundary'
import { Button } from '@/components/arc/button/button'
import { WorkspaceClosePanel } from './components/WorkspaceClosePanel'
import { WorkspaceTransferPanel } from './components/WorkspaceTransferPanel'
import type { UseWorkspaceDangerZoneResult } from './workspace-danger-zone.contracts'
import { useWorkspaceDangerZone } from './useWorkspaceDangerZone'
import { WorkspaceDangerZoneSkeleton } from './WorkspaceDangerZoneSkeleton'
import './WorkspaceDangerComposition.css'

type WorkspaceDangerZoneProps = Readonly<{
  confirmedCompletion?: UseWorkspaceDangerZoneResult['completion']
  onCompletion?: (completion: NonNullable<UseWorkspaceDangerZoneResult['completion']>) => void
  onReadPausedChange?: (paused: boolean) => void
}>
export function WorkspaceDangerZone(props: WorkspaceDangerZoneProps = {}) {
  return <AeRenderErrorBoundary fallback={<section className="grid gap-3" role="alert"><h2>Workspace eligibility unavailable</h2><p>Close and transfer stay blocked until current ownership and obligations can be confirmed.</p><Button type="button" variant="secondary" onClick={() => window.location.reload()}>Check eligibility again</Button></section>}><WorkspaceDangerZoneContent {...props} /></AeRenderErrorBoundary>
}

function WorkspaceDangerZoneContent(props: WorkspaceDangerZoneProps) {
  const saveActionRef = useRef<HTMLElement | null>(null)
  const headingRef = useRef<HTMLDivElement | null>(null)
  const { loading, closePanel, transferPanel, completion, readUnavailable, onRetryRead } = useWorkspaceDangerZone(props)
  if (completion !== undefined) return <section className="grid gap-4" aria-label="Workspace change complete">
    <h2 className="text-lg font-medium">{completion.kind === 'closed' ? 'Workspace closed' : 'Ownership transferred'}</h2>
    <p role="status">{completion.kind === 'closed' ? `${completion.displayName} is closed. Its Tools, access keys and delegations stop. Retained records remain subject to their retention rules.`
      : `${completion.successorName ?? 'The selected member'} now owns ${completion.displayName}. You remain a member; balances and Calls stay with the workspace.`}</p>
    <p className="break-all text-sm">Workspace reference: {completion.accountRef}</p>
    {completion.kind === 'transferred' ? <a className="underline underline-offset-4" href="/owner/settings/team">Review current team and roles</a> : null}
    <a className="underline underline-offset-4" href="/market">Browse Tools in the public Market</a>
    <p className="text-sm text-muted-foreground">Select another workspace with the Account switcher when you need workspace access.</p>
    <a className="underline underline-offset-4" href="/support#private-support">Get help with this workspace</a>
  </section>
  if (readUnavailable) return <section className="grid gap-3" role="alert"><h2>Workspace eligibility unavailable</h2><p>Close and transfer stay blocked while current ownership and obligations cannot be confirmed.</p><Button type="button" variant="secondary" onClick={onRetryRead}>Check eligibility again</Button></section>
  if (loading || closePanel === null || transferPanel === null) return <WorkspaceDangerZoneSkeleton />
  const pending = closePanel.closePending || transferPanel.transferPending
  const unconfirmed = Boolean(closePanel.closeAttemptUnconfirmed || transferPanel.transferAttemptUnconfirmed)
  return <AeNavigationSafetyBoundary state={{ dirty: pending || unconfirmed, pending, saveOutcome: unconfirmed ? 'outcome_unknown' : 'idle' }}
    title="Leave an unconfirmed workspace change?" pendingTitle="Workspace change is still pending"
    description="The recorded outcome has not been confirmed. Leaving loses this attempt's recovery reference. Stay to check the same attempt before making another workspace change."
    pendingDescription="Wait for the recorded result. This page retains the exact attempt so an uncertain result can be checked safely."
    cancelLabel="Check this attempt" saveActionRef={saveActionRef} headingRef={headingRef}>
    <div ref={headingRef} tabIndex={-1} className="arc-market arc-workspace-danger-workspace"><WorkspaceClosePanel {...closePanel} /><WorkspaceTransferPanel {...transferPanel} /></div>
  </AeNavigationSafetyBoundary>
}
