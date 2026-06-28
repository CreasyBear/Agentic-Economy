import { createFileRoute } from '@tanstack/react-router'

import { AePageHeader } from '@/components/ae/layout/AePageHeader'
import { AePublicShell } from '@/components/ae/layout/AePublicShell'
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
      { title: 'Owner status readback | Agentic Economy' },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: OwnerStatusRoute,
})

function OwnerStatusRoute() {
  const readback = Route.useLoaderData()

  return (
    <AePublicShell>
      <AePageHeader
        eyebrow="Owner readback"
        title="Service page status"
        description="Public page, index, discovery, trust, and capability states stay separate so unavailable work is visible."
      />
      <section className="mx-auto grid w-full max-w-6xl gap-6 px-4 pb-16 md:px-6">
        <AeStatusCard readback={readback} />
        <AeCapabilityList catalog={readback.catalog} />
      </section>
    </AePublicShell>
  )
}
