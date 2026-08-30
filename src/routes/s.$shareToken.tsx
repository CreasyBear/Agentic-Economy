import { createFileRoute } from '@tanstack/react-router'

import { SharedOperationChat } from '@/components/ae/operation-chat'
import { AePageState } from '@/components/ae/layout/AePageState'

const shareTokenPattern = /^[a-f0-9]{64}$/u

export const Route = createFileRoute('/s/$shareToken')({
  head: () => ({
    meta: [
      { title: 'Shared chat | Agentic Economy' },
      { name: 'robots', content: 'noindex, noarchive' },
      { name: 'referrer', content: 'no-referrer' },
    ],
  }),
  headers: () => ({
    'Cache-Control': 'private, no-store',
    'Referrer-Policy': 'no-referrer',
  }),
  errorComponent: SharedChatUnavailable,
  component: SharedThreadPage,
})

function SharedThreadPage() {
  const { shareToken } = Route.useParams()
  if (!shareTokenPattern.test(shareToken)) return <SharedChatUnavailable />
  return <SharedOperationChat shareToken={shareToken} />
}

function SharedChatUnavailable() {
  return (
    <AePageState
      tone="neutral"
      title="Shared chat unavailable"
      description="This link is invalid, expired, or has been revoked."
    />
  )
}
