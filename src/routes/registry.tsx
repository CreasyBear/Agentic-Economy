import { useMemo, useState, type CSSProperties, type FormEvent } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { createServerFn, useServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { Skeleton } from '@astryxdesign/core/Skeleton'
import { Center } from '@astryxdesign/core/Center'
import { Grid } from '@astryxdesign/core/Grid'
import { FormLayout } from '@astryxdesign/core/FormLayout'
import { Heading, Text } from '@astryxdesign/core/Text'
import { Layout, LayoutContent, LayoutHeader } from '@astryxdesign/core/Layout'
import { Section } from '@astryxdesign/core/Section'
import { HStack, StackItem, VStack } from '@astryxdesign/core/Stack'
import { Selector } from '@astryxdesign/core/Selector'
import { TextInput } from '@astryxdesign/core/TextInput'
import { TextArea } from '@astryxdesign/core/TextArea'
import { Toolbar } from '@astryxdesign/core/Toolbar'
import { Token } from '@astryxdesign/core/Token'
import { SearchIcon } from 'lucide-react'

import { AeRegistryFunnelBoot } from '@/components/ae/layout/AeRegistryFunnelBoot'
import { AeProviderCard } from '@/components/ae/primitives/AeProviderCard'
import { AePublicShell } from '@/components/ae/layout/AePublicShell'
import { AeAnimatedNumber } from '@/components/ae/motion/AeAnimatedNumber'
import { emitRegistryResultClick } from '@/lib/observability/registry-click'
import type { PublicBusinessCatalogApiV2Dto, PublicBusinessCatalogApiV2Page } from '@/modules/registry/public'
import { readPublicOfferingRegistryPage, readPublicOfferingRegistrySearchPage } from '@/modules/registry/registry.functions'
import { captureDemandSignalServer, type DemandCaptureServerResult } from '@/modules/demand/demand.functions'

type RegistrySearchParams = {
  q: string
  limit: number
  cursor?: string
}

type RegistryRouteReadback = {
  result: PublicBusinessCatalogApiV2Page
  query: string
  limit: number
}

const defaultRegistryHeadline = 'Who does what, near you.'
const defaultRegistryVisualHeadline = 'Who does what, near you.'

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
      { title: 'Compare local businesses | Agentic Economy' },
      { name: 'description', content: 'Compare local businesses by service, area, and how to reach them.' },
    ],
  }),
  component: RegistryRoute,
})

export async function loadRegistryRouteReadback(deps: RegistrySearchParams): Promise<RegistryRouteReadback> {
  const result =
    deps.q.length === 0
      ? await readPublicOfferingRegistryPage({ limit: deps.limit, ...(deps.cursor === undefined ? {} : { cursor: deps.cursor }) })
      : await readPublicOfferingRegistrySearchPage({ query: deps.q, limit: deps.limit, ...(deps.cursor === undefined ? {} : { cursor: deps.cursor }) })

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
      sorted.sort((a, b) => b.observedAt - a.observedAt)
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
              <Heading level={1} aria-label={hasQuery ? undefined : defaultRegistryHeadline}>
                {hasQuery ? `Results for “${query}”` : defaultRegistryVisualHeadline}
              </Heading>
              <Text type="large" color="secondary" display="block">
                Compare local businesses by service, area, and how to reach them.
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
              {isEmpty ? (
                <RegistryDemandCaptureEmptyState
                  key={query.length > 0 ? `search-${query}` : 'browse-empty'}
                  query={query}
                  showClearSearch={hasQuery}
                />
              ) : null}
              {!isEmpty ? (
                <VStack gap={6}>
                  <HStack vAlign="end" gap={4}>
                    <StackItem size="fill">
                      <VStack gap={1}>
                        <Heading level={2}>Published businesses</Heading>
                      </VStack>
                    </StackItem>
                    <Text color="secondary" display="block"><AeAnimatedNumber value={result.pagination.total} /> {resultSummary(result.pagination.total, query)}</Text>
                  </HStack>
                  {filteredItems.length === 0 ? (
                    <Center>
                      <Text type="supporting" color="secondary">No results found in this category.</Text>
                    </Center>
                  ) : (
                    <RegistryLibraryGrid items={filteredItems} query={query} />
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
              {!isEmpty ? (
                <Card padding={6} className="bg-accent text-on-accent">
                  <HStack vAlign="center" gap={4}>
                    <StackItem size="fill">
                      <VStack gap={1}>
                        <Text type="large" weight="semibold" display="block" className="text-on-accent">Own a service business?</Text>
                        <Text display="block" className="text-on-accent/85">Get found by people ready to ask, in writing.</Text>
                      </VStack>
                    </StackItem>
                    <Button label="List your business, free" variant="secondary" href="/claim" />
                  </HStack>
                </Card>
              ) : null}
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
    <Card padding={5} aria-label="Search business details">
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
        <Toolbar
          label="Filter and sort businesses"
          size="lg"
          gap={2}
          startContent={
            <Selector
              label="Category"
              isLabelHidden
              options={categories}
              value={activeCategory}
              onChange={(value) => setActiveCategory(value ?? 'All')}
            />
          }
          endContent={
            <Selector
              label="Sort by"
              isLabelHidden
              options={['A-Z', 'Z-A', 'Newest']}
              value={sortOrder}
              onChange={(value) => setSortOrder(value ?? 'A-Z')}
            />
          }
        />
      </VStack>
    </Card>
  )
}

function RegistryContextCards() {
  return (
    <Grid columns={{ minWidth: 320 }} gap={4}>
      <Card padding={5}>
        <VStack gap={2}>
          <Text type="large" weight="semibold" color="primary" display="block">Service area, response cue, and next step sit beside the provider.</Text>
          <Text color="secondary" display="block">Search, compare, then choose the next step for the job.</Text>
        </VStack>
      </Card>
      <Card padding={5}>
        <VStack gap={2}>
          <Text type="large" weight="semibold" color="primary" display="block">Assistants can read it too.</Text>
          <Text color="secondary" display="block">Each listing keeps a quiet JSON view for assistants. People still confirm timing, quote, and availability with the business.</Text>
        </VStack>
      </Card>
    </Grid>
  )
}

type DemandCaptureField = 'service' | 'suburb' | 'note' | 'queryText'

function RegistryDemandCaptureEmptyState({ query, showClearSearch }: { query: string; showClearSearch: boolean }) {
  const captureDemandSignal = useServerFn(captureDemandSignalServer)
  const [service, setService] = useState(() => query)
  const [suburb, setSuburb] = useState('')
  const [note, setNote] = useState('')
  const [pending, setPending] = useState(false)
  const [result, setResult] = useState<DemandCaptureServerResult | undefined>()
  const [fieldError, setFieldError] = useState<{ field: DemandCaptureField; message: string } | undefined>()
  const submittedOk = result?.kind === 'ok'

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setResult(undefined)
    setFieldError(undefined)

    const cleanService = service.trim()
    if (cleanService.length === 0) {
      setFieldError({ field: 'service', message: 'Enter what you needed.' })
      return
    }

    const cleanSuburb = suburb.trim()
    if (cleanSuburb.length === 0) {
      setFieldError({ field: 'suburb', message: 'Enter the suburb or local area.' })
      return
    }

    setPending(true)
    try {
      const captured = await captureDemandSignal({
        data: {
          service: cleanService,
          suburb: cleanSuburb,
          ...(note.trim().length === 0 ? {} : { note }),
          ...(query.length === 0 ? {} : { queryText: query }),
        },
      })
      setResult(captured)
      if (captured.kind === 'error' && captured.field !== undefined) {
        setFieldError({ field: captured.field, message: captured.reason })
      }
    } finally {
      setPending(false)
    }
  }

  return (
    <Card padding={6}>
      <Center>
        <VStack gap={4} className="w-full max-w-2xl">
          <VStack gap={2}>
            <Heading level={2}>No businesses here yet.</Heading>
            <Text color="secondary" display="block">Tell us what you needed. We&apos;re expanding here.</Text>
          </VStack>

          {submittedOk ? (
            <Text type="large" weight="semibold" color="primary" display="block" role="status">
              Got it. We're expanding here.
            </Text>
          ) : (
            <form onSubmit={handleSubmit} className="w-full" noValidate>
              <FormLayout>
                <TextInput
                  label="Service needed"
                  htmlName="service"
                  value={service}
                  isDisabled={pending}
                  {...(fieldError?.field === 'service' ? { status: { type: 'error' as const, message: fieldError.message } } : {})}
                  onChange={setService}
                />
                <TextInput
                  label="Suburb"
                  htmlName="suburb"
                  value={suburb}
                  isDisabled={pending}
                  {...(fieldError?.field === 'suburb' ? { status: { type: 'error' as const, message: fieldError.message } } : {})}
                  onChange={setSuburb}
                />
                <TextArea
                  label="Optional note"
                  value={note}
                  rows={3}
                  maxLength={280}
                  isDisabled={pending}
                  {...(fieldError?.field === 'note' ? { status: { type: 'error' as const, message: fieldError.message } } : {})}
                  onChange={setNote}
                />
                {result?.kind === 'error' && fieldError === undefined ? (
                  <Text color="secondary" display="block" role="alert">{result.reason}</Text>
                ) : null}
                <Button
                  label={pending ? 'Saving...' : 'Tell us what you needed'}
                  variant="primary"
                  type="submit"
                  isLoading={pending}
                  isDisabled={pending}
                />
              </FormLayout>
            </form>
          )}

          <HStack gap={2} wrap="wrap" hAlign="center">
            {showClearSearch ? <Button label="Clear search" variant="secondary" href="/registry?q=&limit=10" /> : null}
            <Button label="Own a business? List it free" variant="secondary" href="/claim" />
          </HStack>
        </VStack>
      </Center>
    </Card>
  )
}

function RegistryLibraryGrid({ items, query }: { items: readonly PublicBusinessCatalogApiV2Dto[]; query: string }) {
  return (
    <Grid columns={{ minWidth: 320 }} gap={4} aria-label="Business results">
      {items.map((item, index) => (
        <AeProviderCard
          key={item.slug}
          variant="registry"
          item={item}
          onView={() => { void emitRegistryResultClick({ slug: item.slug, query, position: index + 1 }) }}
        />
      ))}
    </Grid>
  )
}

const thumbnailWrapper: CSSProperties = {
  aspectRatio: '16 / 9',
  overflow: 'hidden',
}




function resultSummary(total: number, query: string): string {
  const label = total === 1 ? 'business' : 'businesses'
  if (query.length > 0) {
    return `${label} for "${query}".`
  }

  return `${label}.`
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
      <Layout
        height="auto"
        contentWidth={1280}
        header={
          <LayoutHeader hasDivider padding={6}>
            <VStack gap={2} aria-label="Loading registry header">
              <Skeleton height="2.75rem" width="22rem" index={0} />
              <Skeleton height="1.5rem" width="28rem" index={1} />
            </VStack>
          </LayoutHeader>
        }
        content={
          <LayoutContent padding={6}>
            <VStack gap={6} aria-busy="true" aria-label="Loading registry">
              <Card padding={5} aria-label="Loading business search controls">
                <VStack gap={4}>
                  <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
                    <VStack gap={2}>
                      <Skeleton height="1rem" width="11rem" index={2} />
                      <Skeleton height="3rem" width="100%" index={3} />
                    </VStack>
                    <Skeleton height="3rem" width="10rem" index={4} />
                  </div>
                  <HStack gap={2} wrap="wrap">
                    <Skeleton height="2.5rem" width="11rem" index={5} />
                    <div className="min-w-0 flex-1" aria-hidden="true" />
                    <Skeleton height="2.5rem" width="8rem" index={6} />
                  </HStack>
                </VStack>
              </Card>

              <Grid columns={{ minWidth: 320 }} gap={4}>
                {Array.from({ length: 2 }, (_, index) => (
                  <Card key={index} padding={5} aria-label="Loading registry context">
                    <VStack gap={2}>
                      <Skeleton height="1.75rem" width={index === 0 ? '84%' : '60%'} index={7 + index} />
                      <Skeleton height="1.25rem" width="92%" index={9 + index} />
                      <Skeleton height="1.25rem" width="68%" index={11 + index} />
                    </VStack>
                  </Card>
                ))}
              </Grid>

              <VStack gap={6} aria-label="Loading published businesses">
                <HStack vAlign="end" gap={4}>
                  <StackItem size="fill">
                    <Skeleton height="2rem" width="16rem" index={13} />
                  </StackItem>
                  <Skeleton height="1.25rem" width="8rem" index={14} />
                </HStack>

                <Grid columns={{ minWidth: 320 }} gap={4} aria-label="Loading business results">
                  {Array.from({ length: 6 }, (_, index) => (
                    <Card key={index} padding={0} className="h-full overflow-hidden" aria-label="Loading business result">
                      <div style={thumbnailWrapper}>
                        <Skeleton height="100%" width="100%" index={15 + index} />
                      </div>
                      <Section variant="transparent" padding={4}>
                        <VStack gap={3}>
                          <HStack vAlign="start" gap={3}>
                            <StackItem size="fill">
                              <VStack gap={1}>
                                <Skeleton height="0.875rem" width="70%" index={21 + index} />
                                <Skeleton height="1.75rem" width="86%" index={27 + index} />
                              </VStack>
                            </StackItem>
                            <Skeleton height="1.75rem" width="5.5rem" index={33 + index} />
                          </HStack>
                          <Skeleton height="2.5rem" width="100%" index={39 + index} />
                          <HStack gap={2} wrap="wrap">
                            <Skeleton height="1.5rem" width="6rem" index={45 + index} />
                            <Skeleton height="1.5rem" width="7rem" index={51 + index} />
                          </HStack>
                          <VStack gap={2}>
                            <Skeleton height="1rem" width="58%" index={57 + index} />
                            <Skeleton height="1rem" width="68%" index={63 + index} />
                          </VStack>
                          <Skeleton height="1.25rem" width="78%" index={69 + index} />
                          <HStack gap={2}>
                            <Skeleton height="2rem" width="6.5rem" index={75 + index} />
                            <Skeleton height="2rem" width="8.5rem" index={81 + index} />
                          </HStack>
                        </VStack>
                      </Section>
                    </Card>
                  ))}
                </Grid>
              </VStack>

              <Card padding={6} aria-label="Loading business owner callout">
                <HStack vAlign="center" gap={4}>
                  <StackItem size="fill">
                    <VStack gap={1}>
                      <Skeleton height="1.5rem" width="13rem" index={87} />
                      <Skeleton height="1.25rem" width="20rem" index={88} />
                    </VStack>
                  </StackItem>
                  <Skeleton height="2.5rem" width="12rem" index={89} />
                </HStack>
              </Card>
            </VStack>
          </LayoutContent>
        }
      />
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
