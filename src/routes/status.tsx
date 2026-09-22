import { createFileRoute } from '@tanstack/react-router'

import { AeSystemStatus } from '@/components/ae/status/system-status/AeSystemStatus'
import { buildPublicPageHead } from '@/modules/seo/public'
import { readStatusProbesServer } from '@/routes/-status.functions'

export const Route = createFileRoute('/status')({
  staticData: {
    nav: {
      label: 'Status',
      footer: { column: 'Help', order: 1 },
    },
  },
  loader: () => readStatusProbesServer(),
  head: () => buildPublicPageHead({
    path: '/status',
    title: 'Status | Agentic Economy',
    description: 'Current Agentic Economy website, Tool API, machine discovery, release identity, and catalogue freshness status.',
  }),
  component: StatusRoute,
})

function StatusRoute() {
  const loaded = Route.useLoaderData()
  return <AeSystemStatus loaded={loaded} />
}
