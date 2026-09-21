import { createFileRoute } from '@tanstack/react-router'

import {
  readProviderWorkspaceIdentityDetailServer,
  readProviderToolStatusServer,
  readOwnerToolBySlugServer,
} from '@/components/ae/offerings/provider-workspace.functions'
import { AeOwnerToolDetailPage } from '@/components/ae/supply/AeOwnerToolDetailPage'
import { operatorRouteOptions } from '@/lib/operator/route-options'

export const Route = createFileRoute('/_operator/owner/operations/$toolRef')({
  ...operatorRouteOptions,
  loader: async ({ params }) => {
    const identity = await readProviderWorkspaceIdentityDetailServer()
    if (identity.kind !== 'available') {
      return { identity, status: { kind: 'not_found' as const } }
    }
    // Well 8 Lane C: a live reviewed-tier Tool resolves by its canonical
    // slug now (never a colon - see directorySlugBase), server-side and
    // scoped to the owner's own providerKey. A Tool with no current
    // publication yet (draft/unready/incompatible) has no slug at all - it
    // never earns a directory row - so its offeringRef (always
    // `offering:<businessId>:<slug>`, see publish-reconcile.ts) still
    // resolves directly; this is two distinct reference kinds for two
    // distinct lifecycle phases, not a compatibility alias for one.
    let offeringRef: string | undefined = params.toolRef.startsWith('offering:') ? params.toolRef : undefined
    if (offeringRef === undefined) {
      const resolved = await readOwnerToolBySlugServer({ data: { slug: params.toolRef } })
      if (resolved.kind === 'available') offeringRef = resolved.offeringRef
    }
    if (offeringRef === undefined) {
      return { identity, status: { kind: 'not_found' as const } }
    }
    const status = await readProviderToolStatusServer({ data: {
      businessId: identity.businessId,
      offeringRef,
    } })
    return { identity, status }
  },
  head: () => ({
    meta: [
      { title: 'Tool status | Agentic Economy' },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: OwnerSupplyDetailRoute,
})

function OwnerSupplyDetailRoute() {
  const { toolRef } = Route.useParams()
  const result = Route.useLoaderData()
  return <AeOwnerToolDetailPage toolRef={toolRef} identity={result.identity} status={result.status} />
}
