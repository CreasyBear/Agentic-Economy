import { createFileRoute } from '@tanstack/react-router'

import { AeHarnessRunDetail } from '@/components/ae/harness/AeHarnessRunViewer'
import { AeOperatorShell } from '@/components/ae/layout/AeOperatorShell'
import { operatorRouteOptions } from '@/lib/operator/route-options'
import {
  readAdminRunViewerDetailServer,
} from '@/modules/harness/run-viewer.functions'

export const Route = createFileRoute('/admin/runs/$turnId')({
  ...operatorRouteOptions,
  loader: ({ params }) => readAdminRunViewerDetailServer({ data: { turnId: params.turnId } }),
  head: () => ({
    meta: [
      { title: 'Run evidence detail | Agentic Economy' },
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

  return (
    <AeOperatorShell
      operatorRole="admin"
      title="Run evidence detail"
      description="Inspect one answer turn's private run evidence, public projection comparison, and collapsed raw JSON."
      currentPath="/admin/runs"
    >
      <AeHarnessRunDetail result={result} />
    </AeOperatorShell>
  )
}
