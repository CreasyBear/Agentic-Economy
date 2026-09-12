import { Link } from '@tanstack/react-router'

import { AeFactList } from '@/components/ae/data/AeFactList'
import { AeSection } from '@/components/ae/layout/AeSection'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import type { PendingCallApproval } from '@/modules/capability-execution/call-approval.functions'
import { approvalFacts } from './agent-operator-console-model'

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
        <Alert variant="destructive">
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
            return (
              <li key={approval.callRef} className="grid min-w-0 gap-4 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                <div className="grid min-w-0 gap-3">
                  <div className="grid gap-1">
                    <p className="text-sm font-medium text-muted-foreground">Tool</p>
                    <Link
                      to="/tools/$toolRef"
                      params={{ toolRef: approval.toolRef }}
                      className="break-all font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {approval.toolRef}
                    </Link>
                  </div>
                  <AeFactList
                    density="compact"
                    facts={approvalFacts(approval)}
                  />
                </div>
                <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
                  <Button
                    type="button"
                    className="min-h-touch w-full sm:w-auto"
                    disabled={controlsDisabled}
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
