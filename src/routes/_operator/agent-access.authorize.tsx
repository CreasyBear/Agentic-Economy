import { createFileRoute } from '@tanstack/react-router'
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
import { readAgentAccessConsentServer } from '@/lib/server/agent-access-consent.functions'
import { readAgentConsentDetails } from '@/modules/agent-access/public'

export const Route = createFileRoute('/_operator/agent-access/authorize')({
  validateSearch: z.object({ user_code: z.string().trim().min(3).max(32).optional() }),
  loaderDeps: ({ search }) => ({ userCode: search.user_code }),
  ssr: false,
  loader: async ({ deps }) => {
    if (deps.userCode === undefined) return { kind: 'missing' as const }
    const response = await readAgentAccessConsentServer({ data: { userCode: deps.userCode } })
    if (response.status < 200 || response.status >= 300) throw new Error('authorization_unavailable')
    const details = readAgentConsentDetails(response.html)
    if (details.grantRef === undefined || details.clientName === undefined || details.mode === undefined) {
      throw new Error('authorization_details_missing')
    }
    return {
      kind: 'ready' as const,
      userCode: deps.userCode,
      details: {
        ...details,
        grantRef: details.grantRef,
        clientName: details.clientName,
        mode: details.mode,
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
    return <AeAgentAccessAuthorizeForm key={loaded.details.grantRef} userCode={loaded.userCode} details={loaded.details} />
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
