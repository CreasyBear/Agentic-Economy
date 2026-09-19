import { Link } from '@tanstack/react-router'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { buttonVariants } from '@/components/ui/button-variants'
import { presentConnectionProblem } from '@/modules/agent-access/public'

import type { ConsentOutcomeViewProps } from '../authorize-form.contracts'

function ConnectionProblemAlert({ code, technicalReference }: Readonly<{ code: string; technicalReference?: string }>) {
  const presentation = presentConnectionProblem({ code, ...(technicalReference === undefined ? {} : { instance: technicalReference }) })
  return (
    <Alert variant="destructive">
      <AlertTitle>{presentation.heading}</AlertTitle>
      <AlertDescription className="grid gap-2">
        <p>{presentation.outcome}</p>
        <p>{presentation.nextAction}</p>
        {presentation.technicalReference === undefined ? null : (
          <p className="font-mono text-xs">Reference: {presentation.technicalReference}</p>
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
      <Alert><AlertTitle>Connected to {clientName}</AlertTitle><AlertDescription>Return there to continue. This connection remains signed in until it expires or you disconnect it.</AlertDescription></Alert>
    )
  }
  if (phase === 'denied') {
    return <ConnectionProblemAlert code="access_denied" />
  }
  if (phase === 'outcome_unknown') {
    return (
      <div className="grid gap-3">
        <ConnectionProblemAlert code="outcome_unknown" technicalReference={grantRef} />
        <Link
          to="/agent-access/authorize"
          search={authorizeRecoverySearch}
          reloadDocument
          className={buttonVariants({ variant: 'secondary' })}
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
