import { createFileRoute } from '@tanstack/react-router'

import { SharedOperationChat } from '@/components/ae/operation-chat'

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
    <main className="grid min-h-[36rem] place-items-center p-6">
      <section className="max-w-md text-center" role="alert">
        <h1 className="text-lg font-semibold">Shared chat unavailable</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This link is invalid, expired, or has been revoked.
        </p>
      </section>
    </main>
  )
}
