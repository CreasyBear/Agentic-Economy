import { createFileRoute } from '@tanstack/react-router'

import { AeHarnessRunDetail } from '@/components/ae/harness/AeHarnessRunViewer'
import { AeOperatorShell } from '@/components/ae/layout/AeOperatorShell'
import { operatorRouteOptions } from '@/lib/operator/route-options'
import {
  readAdminRunViewerDetailServer,
} from '@/modules/answer-thread/run-viewer.functions'

export const Route = createFileRoute('/_operator/admin/runs/$turnId')({
  ...operatorRouteOptions,
  loader: ({ params }) => readAdminRunViewerDetailServer({ data: { turnId: params.turnId } }),
  head: () => ({
    meta: [
      { title: 'Run detail | Agentic Economy' },
      {
        name: 'description',
        content: 'Admin-only answer run evidence detail scaffold.',
      },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: AdminRunDetailRoute,
})

function AdminRunDetailRoute() {
  const params = Route.useParams()
  const result = Route.useLoaderData()
  const detailPath = `/admin/runs/${params.turnId}`

  return (
    <AeOperatorShell
      operatorRole="admin"
      title="Run detail"
      description="Inspect one answer turn's private run evidence, public projection comparison, and collapsed raw JSON."
      currentPath={detailPath}
    >
      <AeHarnessRunDetail result={result} />
    </AeOperatorShell>
  )
}
