import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'

import { AeConnectionHandoff } from '@/components/ae/supply/connection-handoff/AeConnectionHandoff'
import { operatorRouteOptions } from '@/lib/operator/route-options'
import { readOwnerProviderConnectionAttemptServer } from '@/modules/capability-supply/supply-funnel.functions'

export const Route = createFileRoute('/_operator/owner/supply/connections/new')({
  ...operatorRouteOptions,
  validateSearch: z.object({
    attempt: z.string().trim().min(1).max(300).optional(),
  }),
  loaderDeps: ({ search }) => ({ attemptRef: search.attempt }),
  loader: async ({ deps }) => deps.attemptRef === undefined
    ? { kind: 'not_found' as const }
    : await readOwnerProviderConnectionAttemptServer({ data: { attemptRef: deps.attemptRef } }),
  head: () => ({ meta: [
    { title: 'Connect Provider | Agentic Economy' },
    { name: 'robots', content: 'noindex' },
  ] }),
  component: OwnerProviderConnectionHandoffRoute,
})

function OwnerProviderConnectionHandoffRoute() {
  const loaded = Route.useLoaderData()
  return <AeConnectionHandoff loaded={loaded} />
}
