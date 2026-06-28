import { Link, createFileRoute } from '@tanstack/react-router'
import { ArrowRightIcon } from 'lucide-react'

import { AeStatusCard } from '@/components/ae/status/AeStatusCard'
import { AeCapabilityList } from '@/components/ae/status/AeCapabilityList'
import { AePageHeader } from '@/components/ae/layout/AePageHeader'
import { AePublicShell } from '@/components/ae/layout/AePublicShell'
import { Button } from '@/components/ui/button'
import { readOwnerStatusServer } from '@/modules/catalog/owner-claim.functions'

type ClaimSuccessSearch = {
  slug?: string
}

export const Route = createFileRoute('/claim/success')({
  validateSearch: (search: Record<string, unknown>): ClaimSuccessSearch => {
    const slug = typeof search.slug === 'string' && search.slug.trim().length > 0 ? search.slug.trim() : undefined
    return slug === undefined ? {} : { slug }
  },
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => readOwnerStatusServer({ data: deps }),
  head: () => ({
    meta: [
      { title: 'Your service page is published | Agentic Economy' },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: ClaimSuccessRoute,
})

function ClaimSuccessRoute() {
  const readback = Route.useLoaderData()

  return (
    <AePublicShell>
      <AePageHeader
        eyebrow="Published"
        title="Your service page is published"
        description="The public page is available. Index and discovery readbacks remain separate so you can see what is queued or degraded."
        actions={
          <Button asChild>
            <Link to="/owner/status" search={{ slug: readback.catalog.slug }}>
              <ArrowRightIcon data-icon="inline-start" />
              View owner status
            </Link>
          </Button>
        }
      />
      <section className="mx-auto grid w-full max-w-6xl gap-6 px-4 pb-16 md:px-6">
        <AeStatusCard readback={readback} />
        <AeCapabilityList catalog={readback.catalog} />
      </section>
    </AePublicShell>
  )
}
