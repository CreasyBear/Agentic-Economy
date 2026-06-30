import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/ask')({
  validateSearch: (search: Record<string, unknown>) => ({
    q: typeof search.q === 'string' ? search.q : '',
  }),
  beforeLoad: ({ search }) => {
    const query = search.q.trim()
    if (query.length === 0) {
      throw redirect({ to: '/', search: { q: '' } })
    }

    throw redirect({ to: '/', search: { q: query } })
  },
  component: AskRedirect,
})

function AskRedirect() {
  return null
}
