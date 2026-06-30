import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'

import { AdminAnalyticsPanel } from '@/components/ae/operator/AdminAnalyticsPanel'
import { AeOperatorShell } from '@/components/ae/layout/AeOperatorShell'
import { AeAdminReadbackPanel } from '@/components/ae/readback/AeAdminReadbackPanel'
import { readAdminAnalyticsServer } from '@/modules/observability/funnel.functions'
import {
  readAdminIndexHealthThroughSource,
} from '@/modules/security/admin-readback.functions'

const readAdminIndexHealthServer = createServerFn().handler(() => readAdminIndexHealthThroughSource())

export const Route = createFileRoute('/admin/index-health')({
  loader: async () => ({
    readback: await readAdminIndexHealthServer(),
    analytics: await readAdminAnalyticsServer(),
  }),
  head: () => ({
    meta: [
      { title: 'Index health | Agentic Economy' },
      {
        name: 'description',
        content: 'Check catalog and projection readbacks before public discovery files ship.',
      },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: AdminIndexHealthRoute,
})

function AdminIndexHealthRoute() {
  const { readback, analytics } = Route.useLoaderData()

  return (
    <AeOperatorShell
      role="admin"
      title="Index health"
      description="Check catalog and projection readbacks before public discovery files are allowed to ship."
      currentPath="/admin/index-health"
    >
      <div className="grid gap-6">
        <AdminAnalyticsPanel
          activationSummary={analytics.activationSummary}
          {...(analytics.posthogAppUrl === undefined ? {} : { posthogAppUrl: analytics.posthogAppUrl })}
        />
        <AeAdminReadbackPanel
          title="Index readback"
          description="Denied reads return no private rows; authorized reads show source, attempt, repair, and affected public surfaces."
          readback={readback}
        />
      </div>
    </AeOperatorShell>
  )
}
