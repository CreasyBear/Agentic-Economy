import { createFileRoute, redirect } from '@tanstack/react-router'
import { z } from 'zod'

import { AeOwnerMcpOAuthCallback } from '@/components/ae/supply/AeOwnerMcpOAuthCallback'
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
      return { kind: 'refused' as const, code: 'not_found' as const }
    }
    const attempt = await readOwnerProviderConnectionAttemptServer({ data: { attemptRef: deps.attempt } })
    if (attempt.kind !== 'available') return { kind: 'refused' as const, code: 'not_found' as const }
    const result = await completeOwnerMcpProviderConnectionServer({ data: {
      attemptRef: deps.attempt,
      callbackParameters: [...new URLSearchParams(location.searchStr).entries()],
    } })
    if (result.kind === 'connected' || result.kind === 'replayed') {
      throw redirect({
        to: '/owner/operations/new',
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
      ? {
          ...result,
          continuationDraftRef: attempt.attempt.draftRef ?? attempt.attempt.candidateDraftRef,
          environment: attempt.attempt.environment,
        }
      : result
  },
  head: () => ({ meta: [
    { title: 'Provider connection | Agentic Economy' },
    { name: 'robots', content: 'noindex' },
    { name: 'referrer', content: 'no-referrer' },
  ] }),
  component: OwnerMcpOAuthCallbackRoute,
})

function OwnerMcpOAuthCallbackRoute() {
  return <AeOwnerMcpOAuthCallback result={Route.useLoaderData()} />
}
