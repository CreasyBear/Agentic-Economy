import { useEffect, useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import { AeCustomerRequestWorkspace } from '@/components/ae/customer-request/AeCustomerRequestWorkspace'
import { countPublishedStates, supplyFacetsFromListings, type SupplyFacet } from '@/components/ae/customer-request/AeSupplyFacets'
import { AePublicShell } from '@/components/ae/layout/AePublicShell'
import { readPublicOfferingRegistryPage } from '@/modules/registry/registry.functions'

const homeSearchSchema = z.object({
  q: z.string().max(200).optional().catch(undefined),
})

/**
 * The front door states the supply it actually has, so a visitor learns what
 * AE can reach without composing a sentence first. A source failure is not
 * worth failing the page over: the block disappears and the input still works.
 */
type ColdStart = Readonly<{
  facets: readonly SupplyFacet[]
  businessCount: number
  stateCount: number
}>

const readColdStart = createServerFn().handler(async (): Promise<ColdStart> => {
  try {
    // Bounded read: the front door must not grow an unbounded query as supply does.
    const page = await readPublicOfferingRegistryPage({ limit: 200 })
    return {
      facets: supplyFacetsFromListings(page.items),
      businessCount: page.items.length,
      stateCount: countPublishedStates(page.items),
    }
  } catch {
    return { facets: [], businessCount: 0, stateCount: 0 }
  }
})

export const Route = createFileRoute('/')({
  validateSearch: homeSearchSchema,
  loader: async () => ({ coldStart: await readColdStart() }),
  head: () => ({ meta: [
    { title: 'Ask Agentic Economy' },
    { name: 'description', content: 'Name the outcome. Agentic Economy finds the businesses, compares real options, and carries the work through.' },
  ] }),
  component: Home,
})

function Home() {
  const navigate = useNavigate()
  const { q } = Route.useSearch()
  const { coldStart } = Route.useLoaderData()
  const [initialQuery] = useState(() => sanitizeInitialQuery(q))
  useEffect(() => {
    if (initialQuery.length === 0) return
    void navigate({ to: '/', search: {}, replace: true })
  }, [initialQuery, navigate])

  return (
    <AePublicShell>
      <AeCustomerRequestWorkspace
        initialNeed={initialQuery}
        supplyFacets={coldStart.facets}
        supplyBusinessCount={coldStart.businessCount}
        supplyStateCount={coldStart.stateCount}
      />
    </AePublicShell>
  )
}

function sanitizeInitialQuery(query: string | undefined): string {
  if (query === undefined) return ''
  const normalized = query.replace(/\r\n?/g, '\n').trim()
  if (normalized.length === 0 || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(normalized)) return ''
  return normalized.slice(0, 200)
}
