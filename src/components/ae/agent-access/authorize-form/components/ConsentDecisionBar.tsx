import { Button } from '@/components/arc/button/button'

import type { ConsentDecisionBarProps } from '../authorize-form.contracts'

import './ConsentChoiceComposition.css'

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
    <div className="arc-market arc-consent-decision-bar">
      <Button
        ref={approveButtonRef}
        type="button"
        aria-describedby="consent-expiry"
        variant={connectionTarget === 'replace_credential' && replacementMode === 'compromise' ? 'danger' : 'primary'}
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
