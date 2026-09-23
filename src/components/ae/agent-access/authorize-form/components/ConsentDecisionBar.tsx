import { Button } from '@/components/ui/button'

import type { ConsentDecisionBarProps } from '../authorize-form.contracts'

export function ConsentDecisionBar({
  approveButtonRef,
  pending,
  connectionTarget,
  replacementMode,
  agentTargetsUnavailable,
  approvalLabel,
  onApprove,
  onDeny,
}: ConsentDecisionBarProps) {
  return (
    <div className="flex shrink-0 flex-wrap gap-3 border-t border-border bg-muted/20 p-4 sm:px-5">
      <Button
        ref={approveButtonRef}
        type="button"
        aria-describedby="consent-expiry"
        variant={connectionTarget === 'replace_credential' && replacementMode === 'compromise' ? 'destructive' : 'default'}
        onClick={() => void onApprove()}
        disabled={pending || agentTargetsUnavailable}
      >
        {approvalLabel}
      </Button>
      <Button type="button" aria-describedby="consent-expiry" variant="secondary" onClick={() => void onDeny()} disabled={pending}>
        Decline
      </Button>
    </div>
  )
}
