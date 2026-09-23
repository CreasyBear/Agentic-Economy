import { createFileRoute, redirect } from '@tanstack/react-router'

import { AePageSkeleton } from '@/components/ae/layout/AePageState'
import { PublicToolDetail } from '@/components/ae/market/public-tool-detail/PublicToolDetail'
import { isPublicToolRef } from '@/modules/capability-supply/public'
import { readToolListingEvidence } from '@/modules/market/server'
import { toolDisplayTitle } from '@/modules/market/tool-view-model'
import { readX402DirectoryCanonicalUrlForToolServer } from '@/modules/market/x402-directory-index.functions'
import {
  readPublicToolDetailRouteServer,
  type PublicToolDetailRouteResult,
} from '@/modules/registry/tool-detail-route.functions'

export { PublicToolDetail } from '@/components/ae/market/public-tool-detail/PublicToolDetail'

export const Route = createFileRoute('/tools/$toolRef')({
  loader: async ({ params }) => {
    if (!isPublicToolRef(params.toolRef)) {
      return { result: { kind: 'invalid_ref' as const, toolRef: params.toolRef }, evidence: undefined }
    }
    const result = await readPublicToolDetailRouteServer({ data: { toolRef: params.toolRef } })
      .catch((): PublicToolDetailRouteResult => ({ kind: 'source_unavailable', toolRef: params.toolRef }))
    if (result.kind === 'found') {
      // Agents use `operation:v1:` refs; a human landing here from a shared
      // link gets the canonical, legible URL when this Tool has one.
      const canonical = await readX402DirectoryCanonicalUrlForToolServer({ data: { toolRef: params.toolRef } }).catch(() => null)
      if (canonical !== null) {
        throw redirect({ to: '/tools/$providerHost/$slug', params: canonical, replace: true })
      }
    }
    const evidence = result.kind === 'found' ? await readToolListingEvidence(result.tool) : undefined
    return { result, evidence }
  },
  head: ({ loaderData }) => {
    if (loaderData?.result.kind !== 'found') {
      return { meta: [
        { title: 'Tool unavailable | Agentic Economy' },
        { name: 'robots', content: 'noindex' },
      ] }
    }
    return { meta: [
      { title: `${toolDisplayTitle(loaderData.result.tool)} | Agentic Economy` },
      { name: 'description', content: loaderData.result.tool.summary },
    ] }
  },
  pendingComponent: ToolDetailPending,
  errorComponent: ToolDetailError,
  component: ToolDetailRoute,
})

function ToolDetailRoute() {
  const data = Route.useLoaderData()
  return (
    <PublicToolDetail
      result={data.result}
      {...(data.evidence === undefined ? {} : { evidence: data.evidence })}
    />
  )
}

function ToolDetailPending() {
  return <AePageSkeleton title="Checking the current capability…" description="Checking the current capability…" shape="detail" />
}

function ToolDetailError() {
  return <PublicToolDetail result={{ kind: 'source_unavailable', toolRef: 'Requested reference' }} />
}
