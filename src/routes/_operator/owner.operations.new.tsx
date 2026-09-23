import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import {
  AeOwnerSupplySourceStartPage,
  type AeOwnerSupplySourceStartPageProps,
} from '@/components/ae/supply/AeOwnerSupplySourceStartPage'
import { readProviderWorkspaceIdentityDetailServer } from '@/components/ae/offerings/provider-workspace.functions'
import { degrade } from '@/lib/observability/degrade'
import { operatorRouteOptions } from '@/lib/operator/route-options'
import {
  readOwnerProviderConnectionsServer,
  resumeOwnerSupplySourceDraftServer,
} from '@/modules/capability-supply/supply-funnel.functions'

export const Route = createFileRoute('/_operator/owner/operations/new')({
  ...operatorRouteOptions,
  validateSearch: z.object({
    connection: z.string().trim().min(1).max(300).optional(),
    environment: z.enum(['sandbox', 'production']).optional(),
    draft: z.string().trim().min(1).max(300).optional(),
  }),
  loaderDeps: ({ search }) => ({ connectionRef: search.connection, environment: search.environment, draftRef: search.draft }),
  loader: async ({ deps }) => {
    const identity = await readProviderWorkspaceIdentityDetailServer()
    let sourceUnavailable = false
    let connections: Awaited<ReturnType<typeof readOwnerProviderConnectionsServer>> = []
    if (identity.kind === 'available') {
      try { connections = await readOwnerProviderConnectionsServer() } catch (cause) {
        sourceUnavailable = degrade(cause, true, { site: 'ownerOfferingsNewLoadConnections', reason: 'source_unavailable' })
      }
    }
    let resume: Awaited<ReturnType<typeof resumeOwnerSupplySourceDraftServer>> = { kind: 'not_found' }
    try { if (!sourceUnavailable && identity.kind === 'available'
      && deps.draftRef !== undefined
      && deps.connectionRef !== undefined) {
      const connection = connections.find((candidate) => (
        candidate.connectionRef === deps.connectionRef
        && candidate.businessId === identity.businessId
        && candidate.available
      ))
      if (connection !== undefined) {
        resume = await resumeOwnerSupplySourceDraftServer({ data: {
          businessId: identity.businessId,
          draftRef: deps.draftRef,
          connectionRef: connection.connectionRef,
          ...(deps.environment === undefined ? {} : { environment: deps.environment }),
        } })
      }
    } else if (!sourceUnavailable && identity.kind === 'available' && deps.draftRef !== undefined) {
      resume = await resumeOwnerSupplySourceDraftServer({ data: {
        businessId: identity.businessId,
        draftRef: deps.draftRef,
        ...(deps.environment === undefined ? {} : { environment: deps.environment }),
      } })
    } } catch (cause) {
      sourceUnavailable = degrade(cause, true, { site: 'ownerOfferingsNewResumeDraft', reason: 'source_unavailable' })
    }
    return { identity, connections, resume, resumeRequested: deps.draftRef !== undefined, sourceUnavailable }
  },
  head: () => ({ meta: [{ title: 'Add Tool | Agentic Economy' }, { name: 'robots', content: 'noindex' }] }),
  component: NewOwnerOfferingRoute,
})

function NewOwnerOfferingRoute() {
  const data = Route.useLoaderData()
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  return (
    <AeOwnerSupplySourceStartPage
      data={data}
      search={search as AeOwnerSupplySourceStartPageProps['search']}
      navigate={navigate}
    />
  )
}
