import { createFileRoute } from '@tanstack/react-router'

import { AeOperatorShell } from '@/components/ae/layout/AeOperatorShell'
import { operatorRouteOptions } from '@/lib/operator/route-options'

export const Route = createFileRoute('/_operator/owner/request-problems/$reportRef')({
  ...operatorRouteOptions,
  head: () => ({
    meta: [
      { title: 'Customer problem | Agentic Economy' },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: BusinessProblemRoute,
})

function BusinessProblemRoute() {
  return (
    <AeOperatorShell
      operatorRole="owner"
      title="Customer problem"
      description="This Customer Request support surface is gone. Use /api/v1/operations/call for paid market work."
      currentPath="/owner/request-problems"
    >
      <p className="text-muted-foreground">This quarantined surface is gone.</p>
    </AeOperatorShell>
  )
}
