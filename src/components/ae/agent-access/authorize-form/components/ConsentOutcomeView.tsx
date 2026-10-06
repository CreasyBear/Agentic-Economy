import { Link } from '@tanstack/react-router'

import { AeAlert } from '@/components/ae/shared/alert/AeAlert'
import { presentConnectionProblem } from '@/modules/agent-access/public'

import type { ConsentOutcomeViewProps } from '../authorize-form.contracts'
import { actionLinkClassName } from '@/components/ae/shared/action-link/actionLinkClassName'
import './ConsentEvidenceComposition.css'

function ConnectionProblemAlert({ code, technicalReference }: Readonly<{ code: string; technicalReference?: string }>) {
  const presentation = presentConnectionProblem({ code, ...(technicalReference === undefined ? {} : { instance: technicalReference }) })
  return (
    <AeAlert id="consent-outcome-heading" tabIndex={-1} tone="danger" title={presentation.heading} className="arc-market arc-consent-outcome"><div className="arc-consent-outcome-body">
        <p>{presentation.outcome}</p>
        <p>{presentation.nextAction}</p>
        {presentation.technicalReference === undefined ? null : (
          <p className="font-mono">Reference: {presentation.technicalReference}</p>
        )}
      </div></AeAlert>
  )
}

export function ConsentOutcomeView({
  phase,
  clientName,
  grantRef,
  errorCode,
  errorReference,
  authorizeRecoverySearch,
}: ConsentOutcomeViewProps) {
  if (phase === 'approved') {
    return (
      <AeAlert id="consent-outcome-heading" tabIndex={-1} role="alert" tone="success" title={`Access approved for ${clientName}`} className="arc-market arc-consent-outcome"><div className="arc-consent-outcome-body">Return there to continue. Check the Agents page for authenticated access and Tool results.</div></AeAlert>
    )
  }
  if (phase === 'denied') {
    return <ConnectionProblemAlert code="access_denied" />
  }
  if (phase === 'outcome_unknown') {
    return (
      <div className="arc-market arc-consent-outcome-group">
        <ConnectionProblemAlert code="outcome_unknown" technicalReference={grantRef} />
        <Link
          id="consent-outcome-recovery"
          to="/agent-access/authorize"
          search={authorizeRecoverySearch}
          reloadDocument
          className={`${actionLinkClassName('secondary', 'md')} arc-consent-outcome-recovery`}
        >
          Check approval status
        </Link>
      </div>
    )
  }
  return (
    <ConnectionProblemAlert
      code={errorCode ?? (errorReference === undefined ? 'expired_token' : 'source_unavailable')}
      {...(errorReference === undefined ? {} : { technicalReference: errorReference })}
    />
  )
}
