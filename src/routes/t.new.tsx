import { createFileRoute } from '@tanstack/react-router'

import { AeChat } from '@/components/ae/chat/AeChat'

type NewThreadRouteSearch = { q?: string }

/**
 * Fresh-thread entry for the surviving market workbench:
 * mounts AeChat with threadId={null} so the blank-welcome state is reachable
 * from a URL, and the initial query auto-starts a live SSE turn that creates
 * the thread and navigates to /t/$threadId. Transient entry: noindex.
 *
 * Path is /t/new (not /t) because a bare t.tsx would become the layout parent
 * of t.$threadId.tsx in TanStack file-based routing and swallow the existing
 * thread route's render.
 */
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
  return <AeChat threadId={null} initialQuery={q ?? null} />
}
