import { createFileRoute, type SearchSchemaInput } from '@tanstack/react-router'
import { CircleHelp } from 'lucide-react'

import { AeSupportHelpPage } from '@/components/ae/support/help/AeSupportHelpPage'
import type { SupportSearch } from '@/components/ae/support/help/help.contracts'
import { readCanonicalBaseUrlServer } from '@/lib/server/canonical-url.functions'
import { parseCallRef } from '@/modules/capability-execution/call-contracts'
import { buildPublicPageHead } from '@/modules/seo/public'

export const Route = createFileRoute('/support')({
  validateSearch: (
    search: { callRef?: string } & SearchSchemaInput,
  ): SupportSearch => {
    const raw: unknown = search.callRef
    if (raw === undefined || (typeof raw === 'string' && raw.trim().length === 0)) {
      return { callRef: { kind: 'absent' } }
    }
    if (typeof raw !== 'string') return { callRef: { kind: 'malformed' } }
    const parsed = parseCallRef(raw)
    return parsed.kind === 'valid'
      ? { callRef: { kind: 'valid', value: parsed.ref } }
      : { callRef: { kind: 'malformed' } }
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
