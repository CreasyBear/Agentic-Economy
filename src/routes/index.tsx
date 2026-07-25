import { useEffect, useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import { AeCustomerRequestWorkspace } from '@/components/ae/customer-request/AeCustomerRequestWorkspace'
import { starterPromptsFromSupply, type StarterPrompt } from '@/components/ae/customer-request/AeStarterPrompts'
import { AePublicShell } from '@/components/ae/layout/AePublicShell'
import { readPublicOfferingRegistryPage } from '@/modules/registry/registry.functions'

const homeSearchSchema = z.object({
  q: z.string().max(200).optional().catch(undefined),
})

/**
 * Openings are generated from published listings so the front door shows real
 * reachable supply. A source failure is not worth failing the page over: the
 * strip disappears and the input still works.
 */
const readStarterPrompts = createServerFn().handler(async (): Promise<readonly StarterPrompt[]> => {
  try {
    const page = await readPublicOfferingRegistryPage({ limit: 24 })
    return starterPromptsFromSupply(page.items)
  } catch {
    return []
  }
})

export const Route = createFileRoute('/')({
  validateSearch: homeSearchSchema,
  loader: async () => ({ starterPrompts: await readStarterPrompts() }),
  head: () => ({ meta: [
    { title: 'Ask Agentic Economy' },
    { name: 'description', content: 'Name the outcome. Agentic Economy finds the businesses, compares real options, and carries the work through.' },
  ] }),
  component: Home,
})

function Home() {
  const navigate = useNavigate()
  const { q } = Route.useSearch()
  const { starterPrompts } = Route.useLoaderData()
  const [initialQuery] = useState(() => sanitizeInitialQuery(q))
  useEffect(() => {
    if (initialQuery.length === 0) return
    void navigate({ to: '/', search: {}, replace: true })
  }, [initialQuery, navigate])

  return (
    <AePublicShell>
      <AeCustomerRequestWorkspace initialNeed={initialQuery} starterPrompts={starterPrompts} />
    </AePublicShell>
  )
}

function sanitizeInitialQuery(query: string | undefined): string {
  if (query === undefined) return ''
  const normalized = query.replace(/\r\n?/g, '\n').trim()
  if (normalized.length === 0 || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(normalized)) return ''
  return normalized.slice(0, 200)
}
