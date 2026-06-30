import { createFileRoute } from '@tanstack/react-router'

import { AeChat } from '@/components/ae/chat/AeChat'

const MAX_QUERY_LENGTH = 200

export type HomeSearch = {
  q: string
}

export const Route = createFileRoute('/')({
  validateSearch: (search: Record<string, unknown>): HomeSearch => ({
    q: typeof search.q === 'string' ? search.q.slice(0, MAX_QUERY_LENGTH).trim() : '',
  }),
  component: Home,
})

function Home() {
  const { q } = Route.useSearch()
  return <AeChat initialQuery={q.length > 0 ? q : null} />
}
