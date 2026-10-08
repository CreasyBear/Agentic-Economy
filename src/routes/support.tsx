import { createFileRoute, useHydrated, useLocation, type SearchSchemaInput } from '@tanstack/react-router'
import { CircleHelp } from 'lucide-react'

import { AeSupportHelpPage } from '@/components/ae/support/help/AeSupportHelpPage'
import { SUPPORT_TOPIC_ANCHORS, supportTopicForHash, type SupportSearch } from '@/components/ae/support/help/help.contracts'
import { readSupportHelpPageServer } from '@/components/ae/support/help/support-help.functions'
import { parseCallRef } from '@/modules/capability-execution/call-contracts'
import { buildPublicPageHead } from '@/modules/seo/public'

export const Route = createFileRoute('/support')({
  validateSearch: (search: { callRef?: string } & SearchSchemaInput): SupportSearch => (
    search.callRef === undefined ? {} : { callRef: typeof search.callRef === 'string' ? search.callRef : '' }
  ),
  staticData: {
    nav: {
      label: 'Help',
      footer: { column: 'Help', order: 0 },
      operatorUtility: { roles: ['owner', 'admin', 'developer'], order: 2, icon: CircleHelp },
    },
  },
  loader: () => readSupportHelpPageServer(),
  head: () => buildPublicPageHead({
    path: '/support',
    title: 'Help | Agentic Economy',
    description: 'Check a Call, continue Provider setup, or contact private support with a safe request reference.',
  }),
  component: SupportRoute,
})

function SupportRoute() {
  const { canonicalBaseUrl, documentation } = Route.useLoaderData()
  const navigate = Route.useNavigate()
  const hydrated = useHydrated()
  const hash = useLocation({ select: location => location.hash })
  const { callRef } = Route.useSearch()
  const parsed = callRef === undefined ? undefined : parseCallRef(callRef)
  const reference = parsed === undefined
    ? { kind: 'absent' } as const
    : parsed.kind === 'valid'
      ? { kind: 'valid', value: parsed.ref } as const
      : { kind: 'malformed' } as const
  return <AeSupportHelpPage canonicalBaseUrl={canonicalBaseUrl} callRef={reference} {...(documentation === undefined ? {} : { documentation })} initialTopic={hydrated ? supportTopicForHash(hash) : 'status'} onTopicChange={topic => { void navigate({ hash: SUPPORT_TOPIC_ANCHORS[topic], search: current => current, replace: true, resetScroll: false }) }} />
}
