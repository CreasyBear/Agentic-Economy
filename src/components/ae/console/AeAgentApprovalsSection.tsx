import { Link } from '@tanstack/react-router'

import { AeFactList } from '@/components/ae/data/AeFactList'
import { AeSection } from '@/components/ae/layout/AeSection'
import { Button } from '@/components/arc/button/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import type { PendingCallApproval } from '@/modules/capability-execution/call-approval.functions'
import './AgentApprovalComposition.css'
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
      <div className="arc-market arc-agent-approvals">
        {loading && approvals.length === 0 ? (
          <div className="arc-agent-approvals__loading" aria-busy="true" aria-label="Loading waiting approvals">
            <Skeleton aria-hidden="true" className="h-touch w-full arc-agent-approvals__skeleton" />
            <Skeleton aria-hidden="true" className="h-touch w-full arc-agent-approvals__skeleton" />
          </div>
        ) : null}
        {error === undefined ? null : (
          <Alert>
            <AlertTitle>Waiting approvals unavailable</AlertTitle>
            <AlertDescription>
              <p>{error}</p>
              <Button type="button" variant="secondary" className="arc-agent-approvals__alert-action" disabled={loading} onClick={onRetry}>
                {loading ? 'Refreshing approvals…' : 'Refresh approvals'}
              </Button>
            </AlertDescription>
          </Alert>
        )}
        {approvals.length === 0 ? null : (
          <ol className="arc-agent-approvals__list">
            {approvals.map((approval) => {
              const deciding = decision?.callRef === approval.callRef
              const controlsDisabled = decision !== undefined
              const canApprove = approvalCanApprove(approval)
              const toolName = approvalToolName(approval)
              return (
                <li key={approval.callRef} className="arc-agent-approvals__item">
                  <div className="arc-agent-approvals__content">
                    <div className="arc-agent-approvals__tool">
                      {canApprove ? (
                        <Link
                          to="/tools/$toolRef"
                          params={{ toolRef: approval.toolRef }}
                          className="arc-agent-approvals__tool-link"
                        >
                          {toolName}
                        </Link>
                      ) : <h3 className="arc-agent-approvals__tool-name">{toolName}</h3>}
                      <p className="arc-agent-approvals__description">{approvalToolDescription(approval)}</p>
                    </div>
                    <AeFactList
                      density="compact"
                      className="arc-agent-approvals__facts"
                      facts={approvalFacts(approval)}
                    />
                  </div>
                  {canApprove ? null : (
                    <Alert>
                      <AlertTitle>Decision facts are incomplete</AlertTitle>
                      <AlertDescription>
                        <p>Approval remains unavailable until the accepted Quote can show the exact Tool, Provider, AUD ceiling, effects and data release. You can refresh these details or decline the request now.</p>
                        <Button type="button" variant="secondary" className="arc-agent-approvals__alert-action" disabled={loading} onClick={onRetry}>
                          {loading ? 'Refreshing details…' : 'Refresh decision details'}
                        </Button>
                      </AlertDescription>
                    </Alert>
                  )}
                  <div className="arc-agent-approvals__actions">
                    <Button
                      type="button"
                      variant="primary"
                      className="arc-agent-approvals__action"
                      disabled={controlsDisabled || !canApprove}
                      onClick={() => onDecide(approval.callRef, approval.toolRef, 'approve')}
                    >
                      {deciding && decision?.decision === 'approve' ? 'Approving once…' : 'Approve once'}
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      className="arc-agent-approvals__action"
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
      </div>
    </AeSection>
  )
}
