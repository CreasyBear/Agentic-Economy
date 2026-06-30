import { createFileRoute, redirect } from '@tanstack/react-router'

import { encodeAnswerId } from '@/modules/answer/public'

export const Route = createFileRoute('/ask')({
  validateSearch: (search: Record<string, unknown>) => ({
    q: typeof search.q === 'string' ? search.q : '',
  }),
  beforeLoad: ({ search }) => {
    const query = search.q.trim()
    if (query.length === 0) {
      throw redirect({ to: '/' })
    }

    throw redirect({ to: '/q/$answerId', params: { answerId: encodeAnswerId(query) } })
  },
  component: AskRedirect,
})

function AskRedirect() {
  return null
}
