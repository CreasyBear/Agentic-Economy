import { createFileRoute } from '@tanstack/react-router'

import { Chat } from '@/components/ae/chat'

type NewThreadRouteSearch = { q?: string }

export function validateNewThreadSearch(search: Record<string, unknown>): NewThreadRouteSearch {
  const q = typeof search.q === 'string' ? search.q.trim() : ''
  return q.length === 0 ? {} : { q }
}

export const Route = createFileRoute('/t/new')({
  validateSearch: validateNewThreadSearch,
  head: () => ({
    meta: [
      { title: 'New chat | Agentic Economy' },
      { name: 'robots', content: 'noindex' },
      { name: 'referrer', content: 'no-referrer' },
    ],
  }),
  component: NewThreadPage,
})

function NewThreadPage() {
  const { q } = Route.useSearch()
  const navigate = Route.useNavigate()
  const openThread = (threadId: string) => void navigate({
    to: '/t/$threadId',
    params: { threadId },
  })
  return (
    <Chat
      threadId={null}
      initialPrompt={q ?? ''}
      onThreadCreated={openThread}
      onOpenThread={openThread}
      onNewChat={() => void navigate({ to: '/t/new' })}
    />
  )
}
