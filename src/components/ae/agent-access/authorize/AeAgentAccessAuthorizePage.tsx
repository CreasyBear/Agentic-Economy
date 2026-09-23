import { Link } from '@tanstack/react-router'

import { AeAgentAccessAuthorizeForm } from '@/components/ae/agent-access/authorize-form/AeAgentAccessAuthorizeForm'
import { AeOperatorPage } from '@/components/ae/layout/AeOperatorPage'
import { AeSettingsStack } from '@/components/ae/layout/AeSection'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { buttonVariants } from '@/components/ui/button-variants'
import { cn } from '@/lib/utils'
import { presentConnectionProblem } from '@/modules/agent-access/public'

import type { AgentAccessAuthorizeLoaded } from './authorize.contracts'

export type AeAgentAccessAuthorizePageProps = Readonly<{ loaded: AgentAccessAuthorizeLoaded }>

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
        <AeSettingsStack>
          <Alert variant="destructive">
            <AlertTitle>Check the current access status</AlertTitle>
            <AlertDescription>
              <p>The approval may have completed. Do not submit it again.</p>
              <p className="mt-2 break-all">Request reference: {loaded.grantRef}</p>
              <Link
                to="/agent-access"
                className={cn(buttonVariants({ variant: 'secondary' }), 'mt-4 min-h-touch')}
              >
                Open Agents
              </Link>
            </AlertDescription>
          </Alert>
        </AeSettingsStack>
      </AeOperatorPage>
    )
  }
  if (loaded.kind === 'succeeded') {
    return (
      <AeOperatorPage operatorRole="owner" title="Review Agent access" description="This request has already completed." currentPath="/agent-access">
        <AeSettingsStack>
          <Alert>
            <AlertTitle>Access approved</AlertTitle>
            <AlertDescription>
              <p>This approval has completed. Open Agents for the current credential status.</p>
              <p className="mt-2 break-all">Request reference: {loaded.grantRef}</p>
              <Link
                to="/agent-access"
                className={cn(buttonVariants({ variant: 'secondary' }), 'mt-4 min-h-touch')}
              >
                Open Agents
              </Link>
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
        <AeSettingsStack>
          <Alert variant="destructive">
            <AlertTitle>{presentation.heading}</AlertTitle>
            <AlertDescription>
              <p>{presentation.outcome}</p>
              <p className="mt-2">{presentation.nextAction}</p>
            </AlertDescription>
          </Alert>
        </AeSettingsStack>
      </AeOperatorPage>
    )
  }
  return (
    <AeOperatorPage operatorRole="owner" title="Review Agent access" description="Choose what this Agent may do, then approve or decline." currentPath="/agent-access">
      <AeSettingsStack>
        <Alert variant="destructive">
          <AlertTitle>This access request is missing a code</AlertTitle>
          <AlertDescription>Start a new request from your Agent.</AlertDescription>
        </Alert>
      </AeSettingsStack>
    </AeOperatorPage>
  )
}
