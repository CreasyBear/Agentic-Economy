import { createFileRoute } from '@tanstack/react-router'

import { AePageSkeleton } from '@/components/ae/layout/AePageState'
import { PublicToolDetail } from '@/components/ae/market/public-tool-detail/PublicToolDetail'
import { isPublicToolRef } from '@/modules/capability-supply/public'
import { toolDisplayTitle } from '@/modules/market/tool-view-model'
import {
  readPublicToolDetailRouteServer,
  type PublicToolDetailRouteResult,
} from '@/modules/market/tool-detail-route.functions'

export { PublicToolDetail } from '@/components/ae/market/public-tool-detail/PublicToolDetail'

export const Route = createFileRoute('/tools/$toolRef')({
  loader: async ({ params }) => {
    if (!isPublicToolRef(params.toolRef)) {
      return { result: { kind: 'invalid_ref' as const, toolRef: params.toolRef }, evidence: undefined }
    }
    const result = await readPublicToolDetailRouteServer({ data: { toolRef: params.toolRef } })
      .catch((): PublicToolDetailRouteResult => ({ kind: 'source_unavailable', toolRef: params.toolRef }))
    const evidence = result.kind === 'found' ? result.evidence : undefined
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
  return <PublicToolDetail result={data.result} />
}

function ToolDetailPending() {
  return <AePageSkeleton title="Loading this Tool…" description="Loading this Tool…" shape="detail" />
}

function ToolDetailError() {
  const { toolRef } = Route.useParams()
  return <PublicToolDetail result={{ kind: 'source_unavailable', toolRef }} />
}
