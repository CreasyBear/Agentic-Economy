import { Link } from '@tanstack/react-router'

import { AeFactList } from '@/components/ae/data/AeFactList'
import { AeSection } from '@/components/ae/layout/AeSection'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import type { PendingCallApproval } from '@/modules/capability-execution/call-approval.functions'
import { approvalCanApprove, approvalFacts, approvalToolDescription, approvalToolName } from './agent-operator-console-model'

export function AeAgentApprovalsSection({
  approvals,
  loading,
  error,
  decision,
  onRetry,
  onDecide,
}: Readonly<{
  approvals: readonly PendingCallApproval[]
  loading: boolean
  error?: string
  decision?: Readonly<{ callRef: string; decision: 'approve' | 'deny' }>
  onRetry: () => void
  onDecide: (callRef: string, toolRef: string, decision: 'approve' | 'deny') => void
}>) {
  if (!loading && error === undefined && approvals.length === 0) return null

  return (
    <AeSection title="Waiting for approval" description="Review the exact Tool before allowing it to run once.">
      {loading && approvals.length === 0 ? (
        <div className="grid gap-intra" aria-busy="true" aria-label="Loading waiting approvals">
          <Skeleton className="h-touch w-full" />
          <Skeleton className="h-touch w-full" />
        </div>
      ) : null}
      {error === undefined ? null : (
        <Alert>
          <AlertTitle>Waiting approvals unavailable</AlertTitle>
          <AlertDescription>
            <p>{error}</p>
            <Button type="button" variant="secondary" disabled={loading} onClick={onRetry}>
              {loading ? 'Refreshing approvals…' : 'Refresh approvals'}
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {approvals.length === 0 ? null : (
        <ol className="m-0 list-none divide-y divide-border border-y border-border p-0">
          {approvals.map((approval) => {
            const deciding = decision?.callRef === approval.callRef
            const controlsDisabled = decision !== undefined
            const canApprove = approvalCanApprove(approval)
            const toolName = approvalToolName(approval)
            return (
              <li key={approval.callRef} className="grid min-w-0 gap-5 py-5">
                <div className="grid min-w-0 gap-3">
                  <div className="grid gap-1">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Approval request</p>
                    {canApprove ? (
                      <Link
                        to="/tools/$toolRef"
                        params={{ toolRef: approval.toolRef }}
                        className="w-fit text-lg font-semibold text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {toolName}
                      </Link>
                    ) : <h3 className="text-lg font-semibold text-foreground">{toolName}</h3>}
                    <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">{approvalToolDescription(approval)}</p>
                  </div>
                  <AeFactList
                    density="compact"
                    className="sm:grid-cols-2 lg:grid-cols-3"
                    facts={approvalFacts(approval)}
                  />
                </div>
                {canApprove ? null : (
                  <Alert>
                    <AlertTitle>Decision facts are incomplete</AlertTitle>
                    <AlertDescription className="grid gap-3">
                      <p>Approval remains unavailable until the accepted Quote can show the exact Tool, Provider, AUD ceiling, effects and data release. You can refresh these details or decline the request now.</p>
                      <Button type="button" variant="outline" className="w-fit" disabled={loading} onClick={onRetry}>
                        {loading ? 'Refreshing details…' : 'Refresh decision details'}
                      </Button>
                    </AlertDescription>
                  </Alert>
                )}
                <div className="flex w-full flex-col gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
                  <Button
                    type="button"
                    className="min-h-touch w-full sm:w-auto"
                    disabled={controlsDisabled || !canApprove}
                    onClick={() => onDecide(approval.callRef, approval.toolRef, 'approve')}
                  >
                    {deciding && decision?.decision === 'approve' ? 'Approving once…' : 'Approve once'}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    className="min-h-touch w-full sm:w-auto"
                    disabled={controlsDisabled}
                    onClick={() => onDecide(approval.callRef, approval.toolRef, 'deny')}
                  >
                    {deciding && decision?.decision === 'deny' ? 'Declining…' : 'Decline'}
                  </Button>
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </AeSection>
  )
}
