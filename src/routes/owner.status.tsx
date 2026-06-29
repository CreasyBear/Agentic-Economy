import { createFileRoute } from '@tanstack/react-router'

import { AePageHeader } from '@/components/ae/layout/AePageHeader'
import { AePublicShell } from '@/components/ae/layout/AePublicShell'
import { AeStatusCard } from '@/components/ae/status/AeStatusCard'
import { AeCapabilityList } from '@/components/ae/status/AeCapabilityList'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
  const result = Route.useLoaderData()
  const readback = result.kind === 'available' ? result.readback : undefined

  return (
    <AePublicShell>
      <AePageHeader
        eyebrow="Owner readback"
        title="Service page status"
        description="Public page, index, discovery, trust, and capability states stay separate so unavailable work is visible."
      />
      <section className="mx-auto grid w-full max-w-6xl gap-6 px-4 pb-16 md:px-6">
        {readback === undefined ? (
          <Card>
            <CardHeader>
              <CardTitle>{result.kind === 'not_found' ? 'Service page not found' : 'Service page status unavailable'}</CardTitle>
              <CardDescription>
                {result.kind === 'not_found'
                  ? 'No public service page matched that slug.'
                  : 'Source readback is unavailable right now. Try again once source access is restored.'}
              </CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <>
            <AeStatusCard readback={readback} />
            <AeCapabilityList catalog={readback.catalog} />
          </>
        )}
      </section>
    </AePublicShell>
  )
}
