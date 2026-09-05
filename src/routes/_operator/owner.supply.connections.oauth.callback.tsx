import { Link, createFileRoute, redirect } from '@tanstack/react-router'
import { z } from 'zod'

import { AeOperatorShell } from '@/components/ae/layout/AeOperatorShell'
import { AeSettingsStack } from '@/components/ae/layout/AeSection'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { operatorRouteOptions } from '@/lib/operator/route-options'
import {
  completeOwnerMcpProviderConnectionServer,
  readOwnerProviderConnectionAttemptServer,
} from '@/modules/capability-supply/supply-funnel.functions'

const callbackSearchSchema = z.looseObject({
  attempt: z.string().trim().min(1).max(300).optional(),
  state: z.string().min(16).max(500).optional(),
  code: z.string().min(1).max(8_192).optional(),
  iss: z.url().max(2_048).optional(),
  error: z.string().max(200).optional(),
})

export const Route = createFileRoute('/_operator/owner/supply/connections/oauth/callback')({
  ...operatorRouteOptions,
  validateSearch: callbackSearchSchema,
  loaderDeps: ({ search }) => search,
  loader: async ({ deps, location }) => {
    if (deps.attempt === undefined) {
      return { kind: 'refused' as const, code: 'authorization_denied' as const }
    }
    const attempt = await readOwnerProviderConnectionAttemptServer({ data: { attemptRef: deps.attempt } })
    if (attempt.kind !== 'available') return { kind: 'refused' as const, code: 'not_found' as const }
    const result = await completeOwnerMcpProviderConnectionServer({ data: {
      attemptRef: deps.attempt,
      callbackParameters: [...new URLSearchParams(location.searchStr).entries()],
    } })
    if (result.kind === 'connected' || result.kind === 'replayed') {
      throw redirect({
        to: '/owner/offerings/new',
        search: {
          connection: result.connection.connectionRef,
          environment: attempt.attempt.environment,
          ...((attempt.attempt.draftRef ?? attempt.attempt.candidateDraftRef) === undefined
            ? {}
            : { draft: attempt.attempt.draftRef ?? attempt.attempt.candidateDraftRef }),
        },
        replace: true,
      })
    }
    return result.kind === 'refused'
      ? { ...result, continuationDraftRef: attempt.attempt.draftRef ?? attempt.attempt.candidateDraftRef }
      : result
  },
  head: () => ({ meta: [
    { title: 'Service connection | Agentic Economy' },
    { name: 'robots', content: 'noindex' },
    { name: 'referrer', content: 'no-referrer' },
  ] }),
  component: OwnerMcpOAuthCallbackRoute,
})

function OwnerMcpOAuthCallbackRoute() {
  const result = Route.useLoaderData()
  const connected = result.kind === 'connected' || result.kind === 'replayed'
  const statusUnavailable = result.kind === 'refused' && result.code === 'source_unavailable'
  return (
    <AeOperatorShell
      operatorRole="owner"
      title="Service connection"
      description="Return to Add service after the source confirms authentication."
      currentPath="/owner/offerings/new"
      breadcrumbs={[
        { label: 'Operations', href: '/owner/offerings' },
        { label: 'Add service', href: '/owner/offerings/new' },
        { label: 'Service connection' },
      ]}
    >
      <AeSettingsStack>
        <Alert variant={connected ? 'default' : 'destructive'}>
          <AlertTitle>{connected ? 'Service connected' : statusUnavailable ? 'Connection status unavailable' : 'Service not connected'}</AlertTitle>
          <AlertDescription>
            <p>{connected
              ? 'AE verified the live MCP source and stored its connection. Return to Add service to continue.'
              : 'AE could not confirm the source connection. Return to Add service to review the saved source and current connection status before retrying.'}</p>
              <Button asChild variant="secondary" className="mt-4 min-h-touch">
              <Link to="/owner/offerings/new" search={'continuationDraftRef' in result && result.continuationDraftRef !== undefined
                ? { draft: result.continuationDraftRef }
                : {}}>Return to Add service</Link>
            </Button>
          </AlertDescription>
        </Alert>
      </AeSettingsStack>
    </AeOperatorShell>
  )
}
