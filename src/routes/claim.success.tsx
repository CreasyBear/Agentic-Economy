import { Link, createFileRoute } from '@tanstack/react-router'
import { ArrowRightIcon, ExternalLinkIcon } from 'lucide-react'

import { AeEmptyState } from '@/components/ae/feedback/AeEmptyState'
import { AePageHeader } from '@/components/ae/layout/AePageHeader'
import { AePublicShell } from '@/components/ae/layout/AePublicShell'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
  const result = Route.useLoaderData()
  const readback = result.kind === 'available' ? result.readback : undefined

  if (readback === undefined) {
    return (
      <AePublicShell>
        <AePageHeader
          eyebrow="Status needed"
          title="Service page status unavailable"
          description="We could not find a public service page for this request."
        />
        <section className="ae-public-page mx-auto grid w-full max-w-6xl gap-6 px-4 pb-16 md:px-6">
          <AeEmptyState
            title={result.kind === 'not_found' ? 'Service page not found' : 'Service page status unavailable'}
            description={
              result.kind === 'not_found'
                ? 'No public service page matched that slug.'
                : 'Status is unavailable right now. Try again in a moment.'
            }
          />
        </section>
      </AePublicShell>
    )
  }

  const catalog = readback.catalog

  return (
    <AePublicShell>
      <AePageHeader
        eyebrow="Published"
        title="Your service page is published"
        description="The public page is live. Manage it from your owner status page."
        actions={
          <Button asChild>
            <Link to="/owner/status" search={{ slug: catalog.slug }}>
              <ArrowRightIcon data-icon="inline-start" />
              Manage your page
            </Link>
          </Button>
        }
      />
      <section className="ae-public-page mx-auto grid w-full max-w-6xl gap-6 px-4 pb-16 md:px-6">
        <Card className="ae-public-route-card">
          <CardHeader>
            <CardTitle>What was published</CardTitle>
            <CardDescription>Customers can now read this on the public register.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="font-medium text-foreground">Business</dt>
                <dd className="text-muted-foreground">{catalog.name}</dd>
              </div>
              <div>
                <dt className="font-medium text-foreground">Category</dt>
                <dd className="text-muted-foreground">{catalog.category}</dd>
              </div>
              <div>
                <dt className="font-medium text-foreground">Location</dt>
                <dd className="text-muted-foreground">{catalog.suburb}, {catalog.stateTerritory}</dd>
              </div>
              <div>
                <dt className="font-medium text-foreground">Public page</dt>
                <dd className="text-muted-foreground">/{catalog.slug}</dd>
              </div>
            </dl>
            <div className="flex flex-wrap items-center gap-3">
              <Button asChild variant="outline">
                <a href={`/${catalog.slug}`}>
                  <ExternalLinkIcon data-icon="inline-start" />
                  View public page
                </a>
              </Button>
              <Button asChild variant="outline">
                <Link to="/owner/status" search={{ slug: catalog.slug }}>
                  Manage your page
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>
    </AePublicShell>
  )
}
