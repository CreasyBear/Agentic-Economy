import { Link } from '@tanstack/react-router'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import buttonStyles from '@/components/arc/button/button.module.css'
import { presentConnectionProblem } from '@/modules/agent-access/public'

import type { ConsentOutcomeViewProps } from '../authorize-form.contracts'
import './ConsentEvidenceComposition.css'

function ConnectionProblemAlert({ code, technicalReference }: Readonly<{ code: string; technicalReference?: string }>) {
  const presentation = presentConnectionProblem({ code, ...(technicalReference === undefined ? {} : { instance: technicalReference }) })
  return (
    <Alert variant="destructive" className="arc-market arc-consent-outcome">
      <AlertTitle id="consent-outcome-heading" tabIndex={-1}>{presentation.heading}</AlertTitle>
      <AlertDescription className="arc-consent-outcome-body">
        <p>{presentation.outcome}</p>
        <p>{presentation.nextAction}</p>
        {presentation.technicalReference === undefined ? null : (
          <p className="font-mono">Reference: {presentation.technicalReference}</p>
        )}
      </AlertDescription>
    </Alert>
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
      <Alert className="arc-market arc-consent-outcome">
        <AlertTitle id="consent-outcome-heading" tabIndex={-1}>Connected to {clientName}</AlertTitle>
        <AlertDescription className="arc-consent-outcome-body">Return there to continue. This connection remains signed in until it expires or you disconnect it.</AlertDescription>
      </Alert>
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
          className={`${buttonStyles.button} ${buttonStyles.secondary} ${buttonStyles.md} arc-consent-outcome-recovery`}
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
