import { createFileRoute, Link, useSearch } from '@tanstack/react-router'
import { ExternalLinkIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'

import { AeCopyPublicUrlButton } from '@/components/ae/forms/AeCopyPublicUrlButton'
import { AePageHeader } from '@/components/ae/layout/AePageHeader'
import { AePublicShell } from '@/components/ae/layout/AePublicShell'
import { readOwnerClaimSuccessServer } from '@/modules/catalog/owner-claim.functions'

type ClaimSuccessSearch = {
  slug?: string
  source?: 'supply'
}

export const Route = createFileRoute('/claim/success')({
  validateSearch: (search: Record<string, unknown>): ClaimSuccessSearch => {
    const slug = typeof search.slug === 'string' && search.slug.trim().length > 0 ? search.slug.trim() : undefined
    const source = search.source === 'supply' ? 'supply' : undefined
    return slug === undefined ? (source === undefined ? {} : { source }) : { slug, ...(source === undefined ? {} : { source }) }
  },
  loaderDeps: ({ search }) => search,
  loader: async ({ deps }) => await readOwnerClaimSuccessServer({ data: deps }),
  head: ({ loaderData }) => {
    const title = loaderData?.kind === 'available'
      ? loaderData.projectionMode === 'local_preview'
        ? 'Service page preview | Agentic Economy'
        : 'Your service page is live | Agentic Economy'
      : loaderData?.kind === 'not_found'
        ? 'Service page not found | Agentic Economy'
        : 'Service page status unavailable | Agentic Economy'
    return {
      meta: [
        { title },
        { name: 'robots', content: 'noindex' },
      ],
    }
  },
  component: ClaimSuccessRoute,
})

function ClaimSuccessRoute() {
  const pageState = Route.useLoaderData()
  const search = useSearch({ from: '/claim/success' })

  if (pageState.kind !== 'available') {
    return (
      <AePublicShell>
        <AePageHeader
          eyebrow={pageState.kind === 'not_found' ? 'Status needed' : 'Source unavailable'}
          title={pageState.kind === 'not_found' ? 'Service page not found' : 'Service page status unavailable'}
          description={pageState.kind === 'not_found'
            ? 'No public service page matched that slug.'
            : 'The public source could not confirm this page right now. Try again in a moment.'}
        />
        <section className="mx-auto grid w-full max-w-6xl gap-6 px-4 pb-16 md:px-6">
          <Empty className="border border-border bg-card p-5">
            <EmptyHeader>
              <EmptyTitle>{pageState.kind === 'not_found' ? 'Service page not found' : 'Service page status unavailable'}</EmptyTitle>
              <EmptyDescription>
                {pageState.kind === 'not_found'
                  ? 'No public service page matched that slug.'
                  : 'Status is unavailable right now. Try again in a moment.'}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </section>
      </AePublicShell>
    )
  }

  const catalog = pageState.catalog
  const isPreview = pageState.projectionMode === 'local_preview'

  return (
    <AePublicShell>
      <AePageHeader
        eyebrow={isPreview ? 'Preview' : 'Live'}
        title={isPreview ? 'Your service page is ready to preview.' : 'Your service page is live.'}
        description={isPreview
          ? 'This local preview uses fixture data. Connect the public source before sharing it.'
          : 'People can now find it and reach you from the public page.'}
        actions={(
          <div className="flex flex-wrap gap-2">
            {search.source === 'supply' ? <Button asChild variant="default"><Link to="/owner/supply">List an API service</Link></Button> : null}
            <Button asChild variant="default"><Link to="/owner/status" search={{ slug: catalog.slug }}>Manage your page</Link></Button>
          </div>
        )}
      />
      <section className="mx-auto grid w-full max-w-6xl gap-6 px-4 pb-16 md:px-6">
        <Card className="bg-brand p-6 text-on-brand">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <div className="grid gap-1">
                <p className="block text-lg font-semibold text-on-brand">{isPreview ? 'Preview only.' : 'Your page is discoverable now.'}</p>
                <p className="block text-on-brand/85">
                  {isPreview
                    ? 'Open the local preview to review the page. It is not a live or discoverable public listing.'
                    : 'Share the link, or open it to see what customers and their assistants will read.'}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {isPreview ? <Badge variant="secondary">Preview</Badge> : <AeCopyPublicUrlButton slug={catalog.slug} variant="secondary" statusClassName="text-on-brand" />}
              <Button asChild variant="secondary">
                <a href={`/${catalog.slug}`}><ExternalLinkIcon aria-hidden="true" />{isPreview ? 'Open preview' : 'View public page'}</a>
              </Button>
            </div>
          </div>
        </Card>
        <Card className="grid gap-4 p-5">
          <div className="grid gap-1.5">
            <h2 className="text-lg font-semibold text-foreground">{isPreview ? 'What is in this preview' : 'What is live'}</h2>
            <p className="block text-muted-foreground">
              {isPreview ? 'The local preview renders these submitted details.' : 'Customers can now read these details on the public service page.'}
            </p>
          </div>
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
              <dt className="font-medium text-foreground">{isPreview ? 'Preview path' : 'Public page'}</dt>
              <dd className="text-muted-foreground">/{catalog.slug}</dd>
            </div>
          </dl>
        </Card>
      </section>
    </AePublicShell>
  )
}
