import { createFileRoute } from '@tanstack/react-router'
import { CircleHelp } from 'lucide-react'

import { AeSupportHelpPage } from '@/components/ae/support/help/AeSupportHelpPage'
import type { SupportSearch } from '@/components/ae/support/help/help.contracts'
import { readCanonicalBaseUrlServer } from '@/lib/server/canonical-url.functions'
import { buildPublicPageHead } from '@/modules/seo/public'

export const Route = createFileRoute('/support')({
  validateSearch: (search: Record<string, unknown>): SupportSearch => {
    const raw = search.callRef
    const callRef = typeof raw === 'string' && raw.trim().length > 0 ? raw.trim() : undefined
    return callRef === undefined ? {} : { callRef }
  },
  staticData: {
    nav: {
      label: 'Help',
      footer: { column: 'Help', order: 0 },
      operatorUtility: { roles: ['owner', 'admin', 'developer'], order: 2, icon: CircleHelp },
    },
  },
  loader: () => readCanonicalBaseUrlServer(),
  head: () => buildPublicPageHead({
    path: '/support',
    title: 'Help | Agentic Economy',
    description: 'Check a Call, continue Provider setup, or contact private support with a safe request reference.',
  }),
  component: SupportRoute,
})

function SupportRoute() {
  const canonicalBaseUrl = Route.useLoaderData()
  const search = Route.useSearch()
  return <AeSupportHelpPage canonicalBaseUrl={canonicalBaseUrl} callRef={search.callRef} />
}
