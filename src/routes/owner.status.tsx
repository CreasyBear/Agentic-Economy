import { createFileRoute } from '@tanstack/react-router'

import { AeEmptyState } from '@/components/ae/feedback/AeEmptyState'
import { AeOperatorShell } from '@/components/ae/layout/AeOperatorShell'
import { AeStatusCard } from '@/components/ae/status/AeStatusCard'
import { AeCapabilityList } from '@/components/ae/status/AeCapabilityList'
import { readOwnerStatusServer } from '@/modules/catalog/owner-claim.functions'

type OwnerStatusSearch = {
  slug?: string
}

export const Route = createFileRoute('/owner/status')({
  validateSearch: (search: Record<string, unknown>): OwnerStatusSearch => {
    const slug = typeof search.slug === 'string' && search.slug.trim().length > 0 ? search.slug.trim() : undefined
    return slug === undefined ? {} : { slug }
  },
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => readOwnerStatusServer({ data: deps }),
  head: () => ({
    meta: [
      { title: 'Service page status | Agentic Economy' },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: OwnerStatusRoute,
})

function OwnerStatusRoute() {
  const result = Route.useLoaderData()
  const readback = result.kind === 'available' ? result.readback : undefined

  return (
    <AeOperatorShell
      role="owner"
      eyebrow="Owner status"
      title="Service page status"
      description="Page, search, assistant-readiness, trust, and feature states stay separate so unavailable work is visible."
      currentPath="/owner/status"
    >
      <div className="grid gap-6">
        {readback === undefined ? (
          <AeEmptyState
            title={result.kind === 'not_found' ? 'Service page not found' : 'Service page status unavailable'}
            description={
              result.kind === 'not_found'
                ? 'No public service page matched that slug.'
                : 'Status is unavailable right now. Try again in a moment.'
            }
          />
        ) : (
          <>
            <AeStatusCard readback={readback} />
            <AeCapabilityList catalog={readback.catalog} />
          </>
        )}
      </div>
    </AeOperatorShell>
  )
}
