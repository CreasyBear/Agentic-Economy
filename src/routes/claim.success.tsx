import { createFileRoute } from '@tanstack/react-router'
import { ExternalLinkIcon } from 'lucide-react'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { Link } from '@astryxdesign/core/Link'
import { HStack, StackItem, VStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'

import { AeCopyPublicUrlButton } from '@/components/ae/forms/AeCopyPublicUrlButton'
import { AeEmptyState } from '@/components/ae/feedback/AeEmptyState'
import { AePageHeader } from '@/components/ae/layout/AePageHeader'
import { AePublicShell } from '@/components/ae/layout/AePublicShell'
import { readOwnerClaimSuccessServer } from '@/modules/catalog/owner-claim.functions'

type ClaimSuccessSearch = {
  slug?: string
}

export const Route = createFileRoute('/claim/success')({
  validateSearch: (search: Record<string, unknown>): ClaimSuccessSearch => {
    const slug = typeof search.slug === 'string' && search.slug.trim().length > 0 ? search.slug.trim() : undefined
    return slug === undefined ? {} : { slug }
  },
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => readOwnerClaimSuccessServer({ data: deps }),
  head: () => ({
    meta: [
      { title: 'Your service page is live | Agentic Economy' },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: ClaimSuccessRoute,
})

function ClaimSuccessRoute() {
  const pageState = Route.useLoaderData()

  if (pageState.kind !== 'available') {
    return (
      <AePublicShell>
        <AePageHeader
          eyebrow="Status needed"
          title="Service page status unavailable"
          description="We could not find a public service page for this request."
        />
        <section className="mx-auto grid w-full max-w-6xl gap-6 px-4 pb-16 md:px-6">
          <AeEmptyState
            title={pageState.kind === 'not_found' ? 'Service page not found' : 'Service page status unavailable'}
            description={
              pageState.kind === 'not_found'
                ? 'No public service page matched that slug.'
                : 'Status is unavailable right now. Try again in a moment.'
            }
          />
        </section>
      </AePublicShell>
    )
  }

  const catalog = pageState.catalog

  return (
    <AePublicShell>
      <AePageHeader
        eyebrow="Live"
        title="Your service page is live."
        description="People can now find it and reach you from the public page."
        actions={(
          <Button label="Manage your page" variant="primary" href={`/owner/status?slug=${encodeURIComponent(catalog.slug)}`} />
        )}
      />
      <section className="mx-auto grid w-full max-w-6xl gap-6 px-4 pb-16 md:px-6">
        <Card padding={6} className="bg-accent text-on-accent">
          <HStack vAlign="center" gap={4} wrap="wrap">
            <StackItem size="fill">
              <VStack gap={1}>
                <Text type="large" weight="semibold" display="block" className="text-on-accent">Your page is discoverable now.</Text>
                <Text display="block" className="text-on-accent/85">Share the link, or open it to see what customers and their assistants will read.</Text>
              </VStack>
            </StackItem>
            <AeCopyPublicUrlButton slug={catalog.slug} />
            <Button label="View public page" variant="secondary" href={`/${catalog.slug}`} icon={<ExternalLinkIcon aria-hidden="true" />} />
          </HStack>
        </Card>
        <Card padding={5} className="grid gap-4">
          <div className="grid gap-1.5">
            <Text type="large" weight="semibold" color="primary" display="block">What is live</Text>
            <Text color="secondary" display="block">Customers can now read these details on the public service page.</Text>
          </div>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="font-medium text-primary">Business</dt>
              <dd className="text-secondary">{catalog.name}</dd>
            </div>
            <div>
              <dt className="font-medium text-primary">Category</dt>
              <dd className="text-secondary">{catalog.category}</dd>
            </div>
            <div>
              <dt className="font-medium text-primary">Location</dt>
              <dd className="text-secondary">{catalog.suburb}, {catalog.stateTerritory}</dd>
            </div>
            <div>
              <dt className="font-medium text-primary">Public page</dt>
              <dd className="text-secondary">/{catalog.slug}</dd>
            </div>
          </dl>
        </Card>
      </section>
    </AePublicShell>
  )
}
