import { createFileRoute } from '@tanstack/react-router'

import { AeOperatorShell } from '@/components/ae/layout/AeOperatorShell'
import { operatorRouteOptions } from '@/lib/operator/route-options'

export const Route = createFileRoute('/_operator/admin/request-problems')({
  ...operatorRouteOptions,
  head: () => ({
    meta: [
      { title: 'Failed asks | Agentic Economy' },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: RequestProblemsRoute,
})

function RequestProblemsRoute() {
  return (
    <AeOperatorShell
      operatorRole="admin"
      title="Failed asks"
      description="This Customer Request support surface is gone. Use /api/v1/operations/call for paid market work."
      currentPath="/admin/request-problems"
    >
      <p className="text-muted-foreground">This quarantined surface is gone.</p>
    </AeOperatorShell>
  )
}
