import { Link } from '@tanstack/react-router'

import { AeAgentAccessAuthorizeForm } from '@/components/ae/agent-access/authorize-form/AeAgentAccessAuthorizeForm'
import { AeOperatorPage } from '@/components/ae/layout/AeOperatorPage'
import { AeSettingsStack } from '@/components/ae/layout/AeSection'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import buttonStyles from '@/components/arc/button/button.module.css'
import '../authorize-form/ConsentComposition.css'
import { presentConnectionProblem } from '@/modules/agent-access/public'

import type { AgentAccessAuthorizeLoaded } from './authorize.contracts'

export type AeAgentAccessAuthorizePageProps = Readonly<{ loaded: AgentAccessAuthorizeLoaded }>

function OpenAgentsLink({ grantRef, state }: Readonly<{ grantRef?: string; state?: string }>) {
  return (
    <Link
      to="/agent-access"
      search={grantRef === undefined ? {} : { grantRef, ...(state === undefined ? {} : { state }) }}
      className={`${buttonStyles.button} ${buttonStyles.secondary} ${buttonStyles.md} arc-consent-page-outcome-link`}
    >
      Open Agents
    </Link>
  )
}

export function AeAgentAccessAuthorizePage({ loaded }: AeAgentAccessAuthorizePageProps) {
  if (loaded.kind === 'ready') {
    return <AeAgentAccessAuthorizeForm
      key={loaded.details.grantRef}
      locator={loaded.locator}
      {...(loaded.oauthState === undefined ? {} : { oauthState: loaded.oauthState })}
      details={loaded.details}
    />
  }
  if (loaded.kind === 'outcome_unknown') {
    return (
      <AeOperatorPage operatorRole="owner" title="Review Agent access" description="Confirm the current result before taking another action." currentPath="/agent-access">
        <AeSettingsStack className="arc-market arc-consent-page-outcome">
          <Alert variant="destructive">
            <AlertTitle>Check the current access status</AlertTitle>
            <AlertDescription>
              <p>The approval may have completed. Do not submit it again.</p>
              <p className="mt-2 break-all">Request reference: {loaded.grantRef}</p>
              <OpenAgentsLink grantRef={loaded.grantRef} {...(loaded.oauthState === undefined ? {} : { state: loaded.oauthState })} />
            </AlertDescription>
          </Alert>
        </AeSettingsStack>
      </AeOperatorPage>
    )
  }
  if (loaded.kind === 'succeeded') {
    return (
      <AeOperatorPage operatorRole="owner" title="Review Agent access" description="This request has already completed." currentPath="/agent-access">
        <AeSettingsStack className="arc-market arc-consent-page-outcome">
          <Alert>
            <AlertTitle>Access approved</AlertTitle>
            <AlertDescription>
              <p>This approval has completed. Open Agents for the current credential status.</p>
              <p className="mt-2 break-all">Request reference: {loaded.grantRef}</p>
              <OpenAgentsLink grantRef={loaded.grantRef} {...(loaded.oauthState === undefined ? {} : { state: loaded.oauthState })} />
            </AlertDescription>
          </Alert>
        </AeSettingsStack>
      </AeOperatorPage>
    )
  }
  if (loaded.kind === 'problem') {
    const presentation = presentConnectionProblem({ code: loaded.code })
    return (
      <AeOperatorPage operatorRole="owner" title="Review Agent access" description="This request cannot be used." currentPath="/agent-access">
        <AeSettingsStack className="arc-market arc-consent-page-outcome">
          <Alert variant="destructive">
            <AlertTitle>{presentation.heading}</AlertTitle>
            <AlertDescription>
              <p>{presentation.outcome}</p>
              <p className="mt-2">{presentation.nextAction}</p>
              <OpenAgentsLink />
            </AlertDescription>
          </Alert>
        </AeSettingsStack>
      </AeOperatorPage>
    )
  }
  return (
    <AeOperatorPage operatorRole="owner" title="Review Agent access" description="Choose what this Agent may do, then approve or decline." currentPath="/agent-access">
      <AeSettingsStack className="arc-market arc-consent-page-outcome">
        <Alert variant="destructive">
          <AlertTitle>This access request is missing a code</AlertTitle>
          <AlertDescription>
            <p>Start a new request from your Agent.</p>
            <OpenAgentsLink />
          </AlertDescription>
        </Alert>
      </AeSettingsStack>
    </AeOperatorPage>
  )
}
