import { useEffect, useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { z } from 'zod'

import { AeCustomerRequestWorkspace } from '@/components/ae/customer-request/AeCustomerRequestWorkspace'
import { AePublicShell } from '@/components/ae/layout/AePublicShell'

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
  const navigate = useNavigate()
  const { q } = Route.useSearch()
  const [initialQuery] = useState(() => sanitizeInitialQuery(q))
  useEffect(() => {
    if (initialQuery.length === 0) return
    void navigate({ to: '/', search: {}, replace: true })
  }, [initialQuery, navigate])

  return (
    <AePublicShell>
      <AeCustomerRequestWorkspace initialNeed={initialQuery} />
    </AePublicShell>
  )
}

function sanitizeInitialQuery(query: string | undefined): string {
  if (query === undefined) return ''
  const normalized = query.replace(/\r\n?/g, '\n').trim()
  if (normalized.length === 0 || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(normalized)) return ''
  return normalized.slice(0, 200)
}
