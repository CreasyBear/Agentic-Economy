import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'

import { AeChat } from '@/components/ae/chat/AeChat'

const homeSearchSchema = z.object({
  q: z.string().max(200).optional().catch(undefined),
})

export const Route = createFileRoute('/')({
  validateSearch: homeSearchSchema,
  head: () => ({ meta: [
    { title: 'Ask Agentic Economy' },
    { name: 'description', content: 'Start with what you know. Agentic Economy helps you clarify the need and compare understandable business options.' },
  ] }),
  component: Home,
})

function Home() {
  const { q } = Route.useSearch()
  const initialQuery = sanitizeInitialQuery(q)
  return <AeChat key={initialQuery || 'new-question'} initialQuery={initialQuery || null} />
}

function sanitizeInitialQuery(query: string | undefined): string {
  if (query === undefined) return ''
  const normalized = query.replace(/\r\n?/g, '\n').trim()
  if (normalized.length === 0 || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(normalized)) return ''
  return normalized.slice(0, 200)
}
