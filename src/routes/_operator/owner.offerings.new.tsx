import { createFileRoute } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useReverification } from '@clerk/tanstack-react-start'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

import { AeOperatorShell } from '@/components/ae/layout/AeOperatorShell'
import { AeSupplySourceNativeStart } from '@/components/ae/supply/AeSupplySourceNativeStart'
import { readOwnerOperationsIdentityDetailServer } from '@/components/ae/offerings/owner-operations.functions'
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

export const Route = createFileRoute('/_operator/owner/offerings/new')({
  ...operatorRouteOptions,
  validateSearch: z.object({
    connection: z.string().trim().min(1).max(300).optional(),
    environment: z.enum(['sandbox', 'production']).optional(),
    draft: z.string().trim().min(1).max(300).optional(),
  }),
  loaderDeps: ({ search }) => ({ connectionRef: search.connection, environment: search.environment, draftRef: search.draft }),
  loader: async ({ deps }) => {
    const identity = await readOwnerOperationsIdentityDetailServer()
    let sourceUnavailable = false
    let connections: Awaited<ReturnType<typeof readOwnerProviderConnectionsServer>> = []
    if (identity.kind === 'available') {
      try { connections = await readOwnerProviderConnectionsServer() } catch { sourceUnavailable = true }
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
        } })
      }
    } else if (!sourceUnavailable && identity.kind === 'available' && deps.draftRef !== undefined) {
      resume = await resumeOwnerSupplySourceDraftServer({ data: {
        businessId: identity.businessId,
        draftRef: deps.draftRef,
      } })
    } } catch { sourceUnavailable = true }
    return { identity, connections, resume, resumeRequested: deps.draftRef !== undefined, sourceUnavailable }
  },
  head: () => ({ meta: [{ title: 'Add service | Agentic Economy' }, { name: 'robots', content: 'noindex' }] }),
  component: NewOwnerOfferingRoute,
})

function NewOwnerOfferingRoute() {
  const { identity, connections, resume, resumeRequested, sourceUnavailable } = Route.useLoaderData()
  const navigate = Route.useNavigate()
  const preview = useServerFn(previewOwnerSupplySourceServer)
  const connect = useServerFn(startOwnerSupplySourceConnectionServer)
  const publishRequest = useServerFn(publishOwnerSupplySourceServer)
  const saveDraft = useServerFn(saveOwnerSupplySourceDraftServer)
  const publish = useReverification(publishRequest)

  return (
    <AeOperatorShell operatorRole="owner" title="Add service" description="Connect the interface you already operate. AE discovers the Operations and validates the one you submit." currentPath="/owner/offerings/new" breadcrumbs={[{ label: 'Operations', href: '/owner/offerings' }, { label: 'Add service' }]}>
      {identity.kind !== 'available' ? <Alert variant="destructive"><AlertTitle>Provider workspace unavailable</AlertTitle><AlertDescription>AE could not confirm the current Business. Return to Operations and try again.</AlertDescription></Alert> : sourceUnavailable ? (
        <Alert variant="destructive"><AlertTitle>Saved source unavailable</AlertTitle><AlertDescription>AE could not read the saved source or current connections. Reload before starting or submitting another connection.</AlertDescription></Alert>
      ) : (<>
        {resumeRequested && resume.kind !== 'available' ? (
          <Alert variant="destructive" className="mb-5"><AlertTitle>Saved source could not be resumed</AlertTitle><AlertDescription>The saved source is unavailable or changed. Review it from Add service before starting another connection.</AlertDescription></Alert>
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
              },
              replace: true,
            })
          }}
          onPublish={(input) => publish({ data: input })}
        />
      </>)}
    </AeOperatorShell>
  )
}
