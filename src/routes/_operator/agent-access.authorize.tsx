import { Link, createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'

import { AeAgentAccessAuthorizeForm } from '@/components/ae/agent-access/AeAgentAccessAuthorizeForm'
import { AeOperatorShell } from '@/components/ae/layout/AeOperatorShell'
import {
  OperatorRouteError,
  OperatorRouteNotFound,
  OperatorRoutePending,
} from '@/components/ae/layout/AeOperatorRouteStates'
import { AeSettingsStack } from '@/components/ae/layout/AeSection'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { readAgentAccessConsentServer } from '@/lib/server/agent-access-consent.functions'
import { readAgentConsentDetails } from '@/modules/agent-access/public'

export const Route = createFileRoute('/_operator/agent-access/authorize')({
  validateSearch: z.object({
    user_code: z.string().trim().min(3).max(32).optional(),
    grant_ref: z.string().trim().min(3).max(160).optional(),
    state: z.string().max(2_048).optional(),
  }),
  loaderDeps: ({ search }) => ({
    userCode: search.user_code,
    grantRef: search.grant_ref,
    state: search.state,
  }),
  ssr: false,
  loader: async ({ deps }) => {
    if ((deps.userCode === undefined) === (deps.grantRef === undefined)) return { kind: 'missing' as const }
    const response = await readAgentAccessConsentServer({ data: {
      ...(deps.userCode === undefined ? {} : { userCode: deps.userCode }),
      ...(deps.grantRef === undefined ? {} : { grantRef: deps.grantRef }),
    } })
    if (response.status < 200 || response.status >= 300) throw new Error('authorization_unavailable')
    const details = readAgentConsentDetails(response.html)
    if (details.state === 'outcome_unknown' && details.grantRef !== undefined) {
      return { kind: 'outcome_unknown' as const, grantRef: details.grantRef }
    }
    if (details.state === 'succeeded' && details.grantRef !== undefined) {
      return { kind: 'succeeded' as const, grantRef: details.grantRef }
    }
    if (details.grantRef === undefined
      || details.grantRevision === undefined
      || details.flow === undefined
      || details.clientName === undefined
      || details.mode === undefined
      || details.environment === undefined
      || details.operationAccess === undefined
      || details.operationRefs === undefined
      || details.expiresInSeconds === undefined
      || details.accessSummary === undefined) {
      throw new Error('authorization_details_missing')
    }
    return {
      kind: 'ready' as const,
      locator: deps.userCode === undefined
        ? { kind: 'grant_ref' as const, value: deps.grantRef! }
        : { kind: 'user_code' as const, value: deps.userCode },
      ...(deps.state === undefined ? {} : { oauthState: deps.state }),
      details: {
        ...details,
        grantRef: details.grantRef,
        grantRevision: details.grantRevision,
        flow: details.flow,
        clientName: details.clientName,
        mode: details.mode,
        environment: details.environment,
        operationAccess: details.operationAccess,
        operationRefs: details.operationRefs,
        expiresInSeconds: details.expiresInSeconds,
        accessSummary: details.accessSummary,
      },
    }
  },
  head: () => ({ meta: [
    { title: 'Review agent access | Agentic Economy' },
    { name: 'robots', content: 'noindex' },
  ] }),
  pendingComponent: OperatorRoutePending,
  errorComponent: OperatorRouteError,
  notFoundComponent: OperatorRouteNotFound,
  component: AgentAccessAuthorizeRoute,
})

function AgentAccessAuthorizeRoute() {
  const loaded = Route.useLoaderData()
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
      <AeOperatorShell operatorRole="owner" title="Review agent access" description="Confirm the current result before taking another action." currentPath="/agent-access">
        <AeSettingsStack>
          <Alert variant="destructive">
            <AlertTitle>Check the current access status</AlertTitle>
            <AlertDescription>
              <p>The approval may have completed. Do not submit it again.</p>
              <p className="mt-2 break-all">Request reference: {loaded.grantRef}</p>
              <Button asChild variant="secondary" className="mt-4 min-h-touch">
                <Link to="/agent-access">Open Agents</Link>
              </Button>
            </AlertDescription>
          </Alert>
        </AeSettingsStack>
      </AeOperatorShell>
    )
  }
  if (loaded.kind === 'succeeded') {
    return (
      <AeOperatorShell operatorRole="owner" title="Review agent access" description="This request has already completed." currentPath="/agent-access">
        <AeSettingsStack>
          <Alert>
            <AlertTitle>Access approved</AlertTitle>
            <AlertDescription>
              <p>This approval has completed. Open Agents for the current credential status.</p>
              <p className="mt-2 break-all">Request reference: {loaded.grantRef}</p>
              <Button asChild variant="secondary" className="mt-4 min-h-touch">
                <Link to="/agent-access">Open Agents</Link>
              </Button>
            </AlertDescription>
          </Alert>
        </AeSettingsStack>
      </AeOperatorShell>
    )
  }
  return (
    <AeOperatorShell operatorRole="owner" title="Review agent access" description="Choose what this agent may do, then approve or decline." currentPath="/agent-access">
      <AeSettingsStack>
        <Alert variant="destructive">
          <AlertTitle>This access request is missing a code</AlertTitle>
          <AlertDescription>Start a new request from your agent.</AlertDescription>
        </Alert>
      </AeSettingsStack>
    </AeOperatorShell>
  )
}
