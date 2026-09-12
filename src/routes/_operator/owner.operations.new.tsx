import { Link, createFileRoute } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useReverification } from '@clerk/tanstack-react-start'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

import { AeOperatorPage } from '@/components/ae/layout/AeOperatorPage'
import { AeSupplySourceNativeStart } from '@/components/ae/supply/AeSupplySourceNativeStart'
import { readProviderWorkspaceIdentityDetailServer } from '@/components/ae/offerings/provider-workspace.functions'
import { degrade } from '@/lib/observability/degrade'
import {
  filterOwnerSupplyAuthorityOptions,
  previewOwnerSupplySourceServer,
  publishOwnerSupplySourceServer,
  saveOwnerSupplySourceDraftServer,
  readOwnerProviderConnectionsServer,
  resumeOwnerSupplySourceDraftServer,
  startOwnerSupplySourceConnectionServer,
} from '@/modules/capability-supply/supply-funnel.functions'
import { operatorRouteOptions } from '@/lib/operator/route-options'
import { z } from 'zod'

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
  const publishRequest = useServerFn(publishOwnerSupplySourceServer)
  const publish = useReverification(publishRequest)
  return <NewOwnerOfferingRouteView publish={publish} />
}

function NewOwnerOfferingRouteView({ publish }: Readonly<{
  publish: (...args: Parameters<typeof publishOwnerSupplySourceServer>) => Promise<Awaited<ReturnType<typeof publishOwnerSupplySourceServer>>>
}>) {
  const { identity, connections, resume, resumeRequested, sourceUnavailable } = Route.useLoaderData()
  const currentSearch = Route.useSearch()
  const navigate = Route.useNavigate()
  const preview = useServerFn(previewOwnerSupplySourceServer)
  const connect = useServerFn(startOwnerSupplySourceConnectionServer)
  const saveDraft = useServerFn(saveOwnerSupplySourceDraftServer)

  return (
    <AeOperatorPage operatorRole="owner" title="Add Tool" description="Connect the interface you already operate. AE discovers the Tools and validates the one you submit." currentPath="/owner/operations/new" breadcrumbs={[{ label: 'Operations', href: '/owner/operations' }, { label: 'Add Tool' }]}>
      {identity.kind !== 'available' ? (
        <Alert variant="destructive">
          <AlertTitle>Provider workspace unavailable</AlertTitle>
          <AlertDescription className="grid gap-related">
            <p>AE could not confirm the current Business. Return to Operations and try again.</p>
            <Button asChild variant="outline" className="justify-self-start min-h-touch"><Link to="/owner/operations">Return to Operations</Link></Button>
          </AlertDescription>
        </Alert>
      ) : sourceUnavailable ? (
        <Alert variant="destructive"><AlertTitle>Saved source unavailable</AlertTitle><AlertDescription>AE could not read the saved source or current connections. Reload before starting or submitting another connection.</AlertDescription></Alert>
      ) : (<>
        {resumeRequested && resume.kind !== 'available' ? (
          <Alert variant="destructive" className="mb-5"><AlertTitle>Saved source could not be resumed</AlertTitle><AlertDescription>The saved source is unavailable or changed. Review it from Add Tool before starting another connection.</AlertDescription></Alert>
        ) : null}
        <AeSupplySourceNativeStart
          businessRef={identity.businessId}
          connections={filterOwnerSupplyAuthorityOptions(identity.businessId, connections)}
          {...(resume.kind === 'available' ? { initial: resume } : {})}
          onPreview={(source, idempotencyKey) => preview({ data: { businessId: identity.businessId, source, idempotencyKey } })}
          onConnect={(input) => connect({ data: input })}
          onSelectCandidate={(input) => saveDraft({ data: input })}
          onDraftSaved={async (candidateRef, connectionRef) => {
            await navigate({
              search: {
                draft: candidateRef,
                ...(connectionRef === undefined ? {} : { connection: connectionRef }),
                ...(currentSearch.environment === undefined ? {} : { environment: currentSearch.environment }),
              },
              replace: true,
            })
          }}
          onPublish={(input) => publish({ data: input })}
        />
      </>)}
    </AeOperatorPage>
  )
}
