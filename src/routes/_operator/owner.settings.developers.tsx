import { createFileRoute } from '@tanstack/react-router'

import { AeWorkspaceDevelopers } from '@/components/ae/settings/AeWorkspaceDevelopers'
import { operatorRouteOptions } from '@/lib/operator/route-options'

export const Route = createFileRoute('/_operator/owner/settings/developers')({
  ...operatorRouteOptions,
  head: () => ({
    meta: [
      { title: 'Keys and APIs | Agentic Economy' },
      { name: 'description', content: 'Caller keys, agent setup, and machine-readable files.' },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: OwnerSettingsDevelopersRoute,
})

function OwnerSettingsDevelopersRoute() {
  return <AeWorkspaceDevelopers />
}
