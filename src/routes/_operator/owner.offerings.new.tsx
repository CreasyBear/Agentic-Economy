import { createFileRoute } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useReverification } from '@clerk/tanstack-react-start'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

import { AeOperatorShell } from '@/components/ae/layout/AeOperatorShell'
import { AeSupplySourceNativeStart } from '@/components/ae/supply/AeSupplySourceNativeStart'
import { readOwnerOfferingSupplyServer } from '@/components/ae/offerings/owner-offering.functions'
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
  }),
  loaderDeps: ({ search }) => ({ connectionRef: search.connection, environment: search.environment }),
  loader: async ({ deps }) => {
    const offerings = await readOwnerOfferingSupplyServer()
    const connections = offerings.kind === 'available'
      ? await readOwnerProviderConnectionsServer()
      : []
    let resume: Awaited<ReturnType<typeof resumeOwnerSupplySourceDraftServer>> = { kind: 'not_found' }
    if (offerings.kind === 'available' && deps.connectionRef !== undefined && deps.environment !== undefined) {
      const connection = connections.find((candidate) => (
        candidate.connectionRef === deps.connectionRef
        && candidate.businessId === offerings.businessId
        && candidate.available
        && candidate.sourceEnvironment === deps.environment
      ))
      if (connection !== undefined) {
        resume = await resumeOwnerSupplySourceDraftServer({ data: {
          businessId: offerings.businessId,
          connectionRef: connection.connectionRef,
        } })
      }
    } else if (offerings.kind === 'available') {
      resume = await resumeOwnerSupplySourceDraftServer({ data: { businessId: offerings.businessId } })
    }
    return { offerings, connections, resume }
  },
  head: () => ({ meta: [{ title: 'Add service | Agentic Economy' }, { name: 'robots', content: 'noindex' }] }),
  component: NewOwnerOfferingRoute,
})

function NewOwnerOfferingRoute() {
  const { offerings, connections, resume } = Route.useLoaderData()
  const preview = useServerFn(previewOwnerSupplySourceServer)
  const connect = useServerFn(startOwnerSupplySourceConnectionServer)
  const publishRequest = useServerFn(publishOwnerSupplySourceServer)
  const saveDraft = useServerFn(saveOwnerSupplySourceDraftServer)
  const publish = useReverification(publishRequest)

  return (
    <AeOperatorShell operatorRole="owner" title="Add service" description="Connect the interface you already operate. AE discovers the Operations and validates the one you submit." currentPath="/owner/offerings/new" breadcrumbs={[{ label: 'Operations', href: '/owner/offerings' }, { label: 'Add service' }]}>
      {offerings.kind !== 'available' ? <Alert variant="destructive"><AlertTitle>Provider workspace unavailable</AlertTitle><AlertDescription>AE could not confirm the current Business. Return to Operations and try again.</AlertDescription></Alert> : (
        <AeSupplySourceNativeStart
          businessRef={offerings.businessId}
          connections={filterOwnerSupplyAuthorityOptions(offerings.businessId, connections)}
          {...(resume.kind === 'available' ? { initial: resume } : {})}
          onPreview={(source, idempotencyKey) => preview({ data: { businessId: offerings.businessId, source, idempotencyKey } })}
          onConnect={(input) => connect({ data: input })}
          onSelectCandidate={(input) => saveDraft({ data: input })}
          onPublish={(input) => publish({ data: input })}
        />
      )}
    </AeOperatorShell>
  )
}
