import { useMemo, useState, type CSSProperties } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { Badge } from '@astryxdesign/core/Badge'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { Center } from '@astryxdesign/core/Center'
import { DropdownMenu } from '@astryxdesign/core/DropdownMenu'
import { Grid } from '@astryxdesign/core/Grid'
import { Heading, Text } from '@astryxdesign/core/Text'
import { Layout, LayoutContent, LayoutHeader } from '@astryxdesign/core/Layout'
import { OverflowList } from '@astryxdesign/core/OverflowList'
import { Section } from '@astryxdesign/core/Section'
import { HStack, StackItem, VStack } from '@astryxdesign/core/Stack'
import { TextInput } from '@astryxdesign/core/TextInput'
import { ToggleButton, ToggleButtonGroup } from '@astryxdesign/core/ToggleButton'
import { Token } from '@astryxdesign/core/Token'
import { SearchIcon } from 'lucide-react'

import { AeRegistryFunnelBoot } from '@/components/ae/layout/AeRegistryFunnelBoot'
import { AePublicShell } from '@/components/ae/layout/AePublicShell'
import { AeAnimatedNumber } from '@/components/ae/motion/AeAnimatedNumber'
import { buildProviderPresentation, pillToneForAvailabilityLabel } from '@/lib/ui/provider-presentation'
import type { PublicBusinessCatalogApiDto, PublicBusinessCatalogApiPage } from '@/modules/registry/public'
import { readPublicRegistryCatalogPage, readPublicRegistrySearchPage } from '@/modules/registry/registry.functions'

type RegistrySearchParams = {
  q: string
  limit: number
  cursor?: string
}

type RegistryRouteReadback = {
  result: PublicBusinessCatalogApiPage
  query: string
  limit: number
}

const defaultRegistryHeadline = 'Find local service details before you contact a business.'
const defaultRegistryVisualHeadline = 'Find local service details.'

const registrySearchParamsSchema = z.object({
  q: z.string(),
  limit: z.number(),
  cursor: z.string().optional(),
})

export const readRegistryRouteServer = createServerFn()
  .validator((data) => registrySearchParamsSchema.parse(data))
  .handler(({ data }) =>
    loadRegistryRouteReadback({
      q: data.q,
      limit: data.limit,
      ...(data.cursor === undefined ? {} : { cursor: data.cursor }),
    }),
  )

export const Route = createFileRoute('/registry')({
  validateSearch: (search: Record<string, unknown>): RegistrySearchParams => {
    const q = typeof search.q === 'string' ? search.q.trim().slice(0, 120) : ''
    const limitValue = typeof search.limit === 'string' ? Number(search.limit) : Number(search.limit ?? 10)
    const limit = Number.isFinite(limitValue) ? Math.min(Math.max(Math.trunc(limitValue), 1), 20) : 10
    const cursor = typeof search.cursor === 'string' && search.cursor.trim().length > 0 ? search.cursor.trim() : undefined

    return { q, limit, ...(cursor === undefined ? {} : { cursor }) }
  },
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => readRegistryRouteServer({ data: deps }),
  pendingComponent: RegistryLoading,
  errorComponent: RegistryError,
  head: () => ({
    meta: [
      { title: 'Local business discovery | Agentic Economy' },
      { name: 'description', content: 'Find claimed local service businesses and see the details they have published for customers.' },
    ],
  }),
  component: RegistryRoute,
})

export async function loadRegistryRouteReadback(deps: RegistrySearchParams): Promise<RegistryRouteReadback> {
  const result =
    deps.q.length === 0
      ? await readPublicRegistryCatalogPage({ limit: deps.limit, ...(deps.cursor === undefined ? {} : { cursor: deps.cursor }) })
      : await readPublicRegistrySearchPage({ query: deps.q, limit: deps.limit, ...(deps.cursor === undefined ? {} : { cursor: deps.cursor }) })

  return { result, query: deps.q, limit: deps.limit }
}

function RegistryRoute() {
  const { result, query, limit } = Route.useLoaderData()
  const hasQuery = query.length > 0
  const isEmpty = result.items.length === 0
  const [activeCategory, setActiveCategory] = useState('All')
  const [sortOrder, setSortOrder] = useState('A-Z')
  const categories = useMemo(() => ['All', ...Array.from(new Set(result.items.map((item) => item.category))).sort()], [result.items])
  const effectiveCategory = categories.includes(activeCategory) ? activeCategory : 'All'
  const filteredItems = useMemo(() => {
    const categorized =
      effectiveCategory === 'All' ? result.items : result.items.filter((item) => item.category === effectiveCategory)
    const sorted = [...categorized]
    if (sortOrder === 'A-Z') {
      sorted.sort((a, b) => a.name.localeCompare(b.name))
    } else if (sortOrder === 'Z-A') {
      sorted.sort((a, b) => b.name.localeCompare(a.name))
    } else if (sortOrder === 'Newest') {
      sorted.sort((a, b) => b.updatedAt - a.updatedAt)
    }
    return sorted
  }, [effectiveCategory, result.items, sortOrder])

  return (
    <AePublicShell>
      <AeRegistryFunnelBoot query={query} />
      <Layout
        height="auto"
        contentWidth={1280}
        header={
          <LayoutHeader hasDivider padding={6}>
            <VStack gap={2}>
              <Text type="supporting" weight="medium" color="secondary" display="block">Browse published service pages</Text>
              <Heading level={1} aria-label={hasQuery ? undefined : defaultRegistryHeadline}>
                {hasQuery ? `Results for “${query}”` : defaultRegistryVisualHeadline}
              </Heading>
              <Text type="large" color="secondary" display="block">
                Search business-supplied pages, compare service areas and next steps, then contact the business with clearer expectations.
              </Text>
            </VStack>
          </LayoutHeader>
        }
        content={
          <LayoutContent padding={6}>
            <VStack gap={6}>
              <RegistrySearchControls
                key={query}
                initialSearch={query}
                limit={limit}
                categories={categories}
                activeCategory={effectiveCategory}
                setActiveCategory={setActiveCategory}
                sortOrder={sortOrder}
                setSortOrder={setSortOrder}
              />
              <RegistryContextCards />
              {isEmpty && !hasQuery ? (
                <RegistryEmptyState title="No businesses published yet" description="Claimed business pages will appear here once owners publish customer-ready details." />
              ) : null}
              {isEmpty && hasQuery ? (
                <RegistryEmptyState
                  title="No matching business yet"
                  description="Try a business name, suburb, or service."
                  action={<Button label="Clear search" variant="secondary" href="/registry?q=&limit=10" />}
                />
              ) : null}
              {!isEmpty ? (
                <VStack gap={6}>
                  <HStack vAlign="end" gap={4}>
                    <StackItem size="fill">
                      <VStack gap={1}>
                        <Text type="supporting" weight="medium" color="secondary" display="block">Published businesses</Text>
                        <Heading level={2}>Comparable local service pages</Heading>
                      </VStack>
                    </StackItem>
                    <Text color="secondary" display="block"><AeAnimatedNumber value={result.pagination.total} /> {resultSummary(result.pagination.total, query)}</Text>
                  </HStack>
                  {filteredItems.length === 0 ? (
                    <Center>
                      <Text type="supporting" color="secondary">No results found in this category.</Text>
                    </Center>
                  ) : (
                    <RegistryLibraryGrid items={filteredItems} />
                  )}
                  <RegistryPagination
                    query={query}
                    limit={limit}
                    {...(result.pagination.cursor === undefined ? {} : { cursor: result.pagination.cursor })}
                    {...(result.pagination.nextCursor === undefined ? {} : { nextCursor: result.pagination.nextCursor })}
                    hasMore={result.pagination.hasMore}
                  />
                </VStack>
              ) : null}
              <Card padding={5}>
                <HStack vAlign="center" gap={4}>
                  <StackItem size="fill">
                    <VStack gap={1}>
                      <Text type="large" weight="semibold" color="primary" display="block">Own a service business?</Text>
                      <Text color="secondary" display="block">Publish the services, areas, and first-contact details customers should see before they get in touch.</Text>
                    </VStack>
                  </StackItem>
                  <Button label="List/claim your business" variant="primary" href="/claim" />
                </HStack>
              </Card>
            </VStack>
          </LayoutContent>
        }
      />
    </AePublicShell>
  )
}

function RegistrySearchControls({
  initialSearch,
  limit,
  categories,
  activeCategory,
  setActiveCategory,
  sortOrder,
  setSortOrder,
}: {
  initialSearch: string
  limit: number
  categories: string[]
  activeCategory: string
  setActiveCategory: (value: string) => void
  sortOrder: string
  setSortOrder: (value: string) => void
}) {
  const [search, setSearch] = useState(() => initialSearch)

  return (
    <Card padding={5} aria-label="Search published business details">
      <VStack gap={4}>
        <form action="/registry" method="get" className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
          <input type="hidden" name="limit" value={String(limit)} />
          <TextInput
            label="Business, service, or place"
            htmlName="q"
            value={search}
            onChange={setSearch}
            placeholder="emergency plumber parramatta"
            startIcon={<SearchIcon aria-hidden="true" />}
            size="lg"
          />
          <Button label="Search businesses" variant="primary" type="submit" />
        </form>
        <Text type="supporting" color="secondary" display="block">Published details only. The business confirms timing, quote, and availability.</Text>
        <HStack vAlign="center" gap={4}>
          <StackItem size="fill">
            <ToggleButtonGroup label="Filter by category" value={activeCategory} onChange={(value) => setActiveCategory(value ?? 'All')}>
              <OverflowList
                gap={1}
                behavior="observeParent"
                overflowRenderer={(overflowItems) => (
                  <DropdownMenu
                    button={{ label: `+${overflowItems.length}`, variant: 'ghost', size: 'lg' }}
                    items={overflowItems.flatMap(({ index }) => {
                      const category = categories[index]
                      if (category === undefined) return []
                      return [{ label: category, onClick: () => setActiveCategory(category) }]
                    })}
                  />
                )}
              >
                {categories.map((category) => (
                  <ToggleButton key={category} label={category} value={category} size="lg" />
                ))}
              </OverflowList>
            </ToggleButtonGroup>
          </StackItem>
          <DropdownMenu
            button={{ label: sortOrder, size: 'lg' }}
            items={[
              { label: 'A-Z', onClick: () => setSortOrder('A-Z') },
              { label: 'Z-A', onClick: () => setSortOrder('Z-A') },
              { label: 'Newest', onClick: () => setSortOrder('Newest') },
            ]}
          />
        </HStack>
      </VStack>
    </Card>
  )
}

function RegistryContextCards() {
  return (
    <Grid columns={{ minWidth: 320 }} gap={4}>
      <Card padding={5}>
        <VStack gap={2}>
          <Text type="supporting" weight="medium" color="secondary" display="block">Compare what is published</Text>
          <Text type="large" weight="semibold" color="primary" display="block">Service area, response cue, and next step sit beside the provider.</Text>
          <Text color="secondary" display="block">Registry browsing is for quick comparison. For a cited answer to a specific job, start from Ask on the home page.</Text>
        </VStack>
      </Card>
      <Card padding={5}>
        <VStack gap={2}>
          <Text type="large" weight="semibold" color="primary" display="block">Assistants read the same details.</Text>
          <Text color="secondary" display="block">Each listing keeps a quiet JSON view for assistants. People still confirm timing, quote, and availability with the business.</Text>
        </VStack>
      </Card>
    </Grid>
  )
}

function RegistryEmptyState({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) {
  return (
    <Card padding={6}>
      <Center>
        <VStack gap={3}>
          <Heading level={2}>{title}</Heading>
          <Text color="secondary" display="block">{description}</Text>
          {action}
        </VStack>
      </Center>
    </Card>
  )
}

function RegistryLibraryGrid({ items }: { items: readonly PublicBusinessCatalogApiDto[] }) {
  return (
    <Grid columns={{ minWidth: 320 }} gap={4} aria-label="Business results">
      {items.map((item) => <RegistryLibraryCard key={item.slug} item={item} />)}
    </Grid>
  )
}

const thumbnailWrapper: CSSProperties = {
  aspectRatio: '16 / 9',
  overflow: 'hidden',
}

const thumbnailImage: CSSProperties = {
  width: '100%',
  height: '100%',
  objectFit: 'cover',
}

function RegistryLibraryCard({ item }: { item: PublicBusinessCatalogApiDto }) {
  const presentation = buildProviderPresentation(item, { serviceChipLimit: 2 })
  const summary = presentation.primaryServiceSummary ?? item.services[0]?.summary ?? 'Published details for customers.'
  const badgeVariant = badgeVariantForTone(pillToneForAvailabilityLabel(presentation.availabilityLabel))

  return (
    <Card padding={0} aria-labelledby={`registry-card-${item.slug}`} className="h-full overflow-hidden">
      <div style={thumbnailWrapper}>
        <img src={presentation.image.url} alt={presentation.image.alt} style={thumbnailImage} loading="lazy" />
      </div>
      <Section variant="transparent" padding={4}>
        <VStack gap={3}>
          <HStack vAlign="start" gap={3}>
            <StackItem size="fill">
              <VStack gap={1}>
                <Text type="supporting" color="secondary" display="block">{item.category} · {presentation.locationLabel}</Text>
                <Heading id={`registry-card-${item.slug}`} level={3}>{item.name}</Heading>
              </VStack>
            </StackItem>
            <Badge label={presentation.availabilityLabel} variant={badgeVariant} />
          </HStack>
          <Text type="body" size="sm" color="secondary" display="block">{summary}</Text>
          <TokenList labels={presentation.serviceChips.map((service) => service.label)} />
          <CompactProviderFacts facts={[{ term: 'Service area', description: presentation.serviceArea }, { term: 'Response', description: presentation.responseFallbackLabel }]} />
          <Text type="supporting" color="primary" display="block"><strong>Best next step:</strong> {presentation.nextStepLabel}</Text>
          <HStack gap={2}>
            <Button label="View details" variant="primary" size="sm" href={`/${item.slug}?from=registry`} />
            <Button label="Get as agent JSON" variant="ghost" size="sm" href={`/api/businesses/${encodeURIComponent(item.slug)}`} />
          </HStack>
        </VStack>
      </Section>
    </Card>
  )
}

function CompactProviderFacts({ facts }: { facts: Array<{ term: string; description: string }> }) {
  return (
    <dl className="grid gap-2">
      {facts.map((fact) => (
        <div key={fact.term} className="grid gap-0.5">
          <dt><Text type="supporting" color="secondary" weight="medium">{fact.term}</Text></dt>
          <dd><Text type="supporting" color="primary">{fact.description}</Text></dd>
        </div>
      ))}
    </dl>
  )
}

function TokenList({ labels }: { labels: readonly string[] }) {
  if (labels.length === 0) {
    return null
  }

  return (
    <ul className="flex flex-wrap gap-2" aria-label="Listed services">
      {labels.map((label) => (
        <li key={label}><Token size="sm" label={label} /></li>
      ))}
    </ul>
  )
}

function badgeVariantForTone(tone: string): 'neutral' | 'success' | 'warning' | 'error' {
  if (tone === 'available' || tone === 'success') return 'success'
  if (tone === 'limited' || tone === 'warning') return 'warning'
  if (tone === 'unavailable' || tone === 'error') return 'error'
  return 'neutral'
}

function resultSummary(total: number, query: string): string {
  const label = total === 1 ? 'matching business' : 'matching businesses'
  if (query.length > 0) {
    return `${label} for "${query}".`
  }

  return total === 1 ? 'published business.' : 'published businesses.'
}

function RegistryPagination({ query, limit, cursor, nextCursor, hasMore }: { query: string; limit: number; cursor?: string; nextCursor?: string; hasMore: boolean }) {
  return (
    <nav aria-label="Business results pagination" className="flex items-center justify-between gap-3">
      <div className="min-h-10 flex items-center">
        {cursor !== undefined ? <Button label="Back to start" variant="secondary" href={`/registry?q=${encodeURIComponent(query)}&limit=${limit}`} /> : <Text type="supporting" color="secondary">First page</Text>}
      </div>
      {hasMore && nextCursor !== undefined ? (
        <Button label="Next" variant="secondary" href={`/registry?q=${encodeURIComponent(query)}&limit=${limit}&cursor=${encodeURIComponent(nextCursor)}`} />
      ) : (
        <Button label="Next" type="button" variant="secondary" isDisabled />
      )}
    </nav>
  )
}

function RegistryLoading() {
  return (
    <AePublicShell>
      <section className="mx-auto grid w-full max-w-7xl gap-4 px-4 py-8 md:px-6">
        {Array.from({ length: 6 }, (_, index) => <div key={index} className="h-40 rounded-md border border-border bg-card" />)}
      </section>
    </AePublicShell>
  )
}

function RegistryError({ error }: { error: Error }) {
  return (
    <AePublicShell>
      <section className="mx-auto w-full max-w-3xl px-4 py-8 md:px-6">
        <Card padding={5} variant="red" role="alert" className="grid gap-2">
          <Text type="large" weight="semibold" color="primary" display="block">Registry did not load</Text>
          <Text color="secondary" display="block">{error.message}</Text>
        </Card>
      </section>
    </AePublicShell>
  )
}
