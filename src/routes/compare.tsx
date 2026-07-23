import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { setResponseHeader } from '@tanstack/react-start/server'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { Heading, Text } from '@astryxdesign/core/Text'
import { z } from 'zod'

import { AeOfferingComparison } from '@/components/ae/comparison/AeOfferingComparison'
import { AeShortlistBar } from '@/components/ae/comparison/AeShortlistBar'
import { AePublicShell } from '@/components/ae/layout/AePublicShell'
import { createComparisonOfferingReadPort } from '@/modules/comparison/comparison.functions'
import {
  buildComparisonBrief,
  compareOfferings,
  parseComparisonUrlState,
  resolveComparisonSelections,
  serializeComparisonUrlState,
  type ComparisonOfferingReadPort,
  type ComparisonPriorityId,
  type ComparisonSelectionRef,
} from '@/modules/comparison/public'

export const comparisonRouteMetadata = {
  canonicalPath: '/compare',
  robots: 'noindex,follow',
  cacheControl: 'no-store',
} as const

export type ComparisonRouteSearch = Readonly<{
  selection: readonly string[]
  priority: readonly string[]
}>

const comparisonRouteSearchSchema = z.object({
  selection: z.array(z.string().max(1_500)).max(5),
  priority: z.array(z.string().max(120)).max(4),
})

export const readComparisonRouteServer = createServerFn({ method: 'GET' })
  .validator((data) => comparisonRouteSearchSchema.parse(data))
  .handler(async ({ data }) => {
    setResponseHeader('Cache-Control', comparisonRouteMetadata.cacheControl)
    return buildComparisonRouteReadback(
      data,
      createComparisonOfferingReadPort(),
    )
  })

export const Route = createFileRoute('/compare')({
  validateSearch: normalizeComparisonRouteSearch,
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => readComparisonRouteServer({ data: deps }),
  head: () => ({
    meta: [
      { title: 'Compare Offerings | Agentic Economy' },
      { name: 'description', content: 'Compare published facts from the exact Offering versions you selected.' },
      { name: 'robots', content: comparisonRouteMetadata.robots },
    ],
    links: [{ rel: 'canonical', href: comparisonRouteMetadata.canonicalPath }],
  }),
  component: CompareRoute,
})

export function normalizeComparisonRouteSearch(
  search: Record<string, unknown>,
): ComparisonRouteSearch {
  return {
    selection: boundedStrings(search.selection, 5),
    priority: boundedStrings(search.priority, 4),
  }
}

export async function buildComparisonRouteReadback(
  search: ComparisonRouteSearch,
  port: ComparisonOfferingReadPort,
) {
  const parsed = parseComparisonUrlState(toUrlSearchParams(search))
  if (parsed.kind === 'refused') return parsed
  const resolution = await resolveComparisonSelections({
    state: parsed.state,
    resolvedAt: Date.now(),
    port,
  })
  const comparison = compareOfferings({
    selections: resolution.selections,
    priorities: parsed.state.priorities,
    refusedSelectionCount: resolution.refusals.length,
  })
  return {
    kind: 'ready' as const,
    state: parsed.state,
    canonicalSearch: serializeComparisonUrlState(parsed.state),
    resolution,
    comparison,
    brief: buildComparisonBrief(comparison),
  }
}

function CompareRoute() {
  const readback = Route.useLoaderData()
  if (readback.kind === 'refused') {
    return (
      <AePublicShell>
        <main className="mx-auto grid w-full max-w-5xl gap-6 px-4 py-10 md:px-6">
          <Heading level={1}>Compare Offerings</Heading>
          <Card padding={5} className="grid gap-3" role="status">
            <Heading level={2}>This comparison link is not valid</Heading>
            <Text color="secondary">
              Choose Offerings again. Nothing was contacted or run.
            </Text>
            <Button label="Browse businesses" href="/registry?q=&limit=10" variant="primary" />
          </Card>
        </main>
      </AePublicShell>
    )
  }

  const replace = (selectionId: string, next: ComparisonSelectionRef) => {
    const selections = readback.state.selections.map((selection) => (
      selectionKey(selection) === selectionId ? next : selection
    ))
    navigateToComparison(selections, readback.state.priorities)
  }

  return (
    <AePublicShell>
      <main className="mx-auto grid w-full max-w-7xl gap-8 px-4 py-10 md:px-6">
        <header className="grid gap-2">
          <Heading level={1}>Compare Offerings</Heading>
          <Text type="large" color="secondary">
            Compare published facts from the exact versions you selected. Nothing here contacts a business or runs an endpoint.
          </Text>
          <Text type="supporting" color="secondary">
            {readback.state.selections.length} of 4 selected
          </Text>
        </header>

        {readback.state.selections.length === 0 ? (
          <Card padding={5} className="grid gap-3">
            <Heading level={2}>Choose Offerings to compare</Heading>
            <Text color="secondary">Browse published Offerings and add up to four exact versions.</Text>
            <Button label="Browse businesses" href="/registry?q=&limit=10" variant="primary" />
          </Card>
        ) : (
          <>
            <AeShortlistBar
              selections={readback.resolution.selections}
              compareHref={readback.canonicalSearch}
              onRemove={(selectionId) => {
                navigateToComparison(
                  readback.state.selections.filter((selection) => (
                    selectionKey(selection) !== selectionId
                  )),
                  readback.state.priorities,
                )
              }}
            />

            {readback.resolution.refusals.length === 0 ? null : (
              <Card padding={5} className="grid gap-3" aria-label="Unavailable Offering versions">
                {readback.resolution.refusals.map(({ selection }) => (
                  <div key={selectionKey(selection)} className="grid gap-2 border-b border-border pb-3 last:border-0">
                    <Heading level={3}>No longer available to compare</Heading>
                    <Text color="secondary">This Offering version is not available to compare.</Text>
                    <button
                      type="button"
                      className="min-h-11 justify-self-start rounded-md border border-border px-4 font-semibold"
                      onClick={() => navigateToComparison(
                        readback.state.selections.filter((candidate) => (
                          selectionKey(candidate) !== selectionKey(selection)
                        )),
                        readback.state.priorities,
                      )}
                    >
                      Remove it
                    </button>
                  </div>
                ))}
              </Card>
            )}

            <PriorityControls
              selections={readback.state.selections}
              priorities={readback.state.priorities}
            />

            <AeOfferingComparison
              comparison={readback.comparison}
              brief={readback.brief}
            />

            {readback.resolution.selections.map((selection) => (
              selection.newerCurrentReference === undefined ? null : (
                <Card
                  key={selectionKey(selection.selection)}
                  padding={4}
                  className="grid gap-2"
                >
                  <Text weight="semibold">
                    {selection.offering.name} has a newer published revision.
                  </Text>
                  <Text type="supporting" color="secondary">
                    Revision {selection.offering.revision} remains selected until you replace it.
                  </Text>
                  <button
                    type="button"
                    className="min-h-11 justify-self-start rounded-md border border-border px-4 font-semibold"
                    onClick={() => replace(
                      selectionKey(selection.selection),
                      {
                        ...selection.newerCurrentReference!,
                        projectionObservedAt: selection.selection.projectionObservedAt,
                      },
                    )}
                  >
                    Use revision {selection.newerCurrentReference.offeringRevision}
                  </button>
                </Card>
              )
            ))}

            <ShareComparison href={`/compare${readback.canonicalSearch}`} />
          </>
        )}
      </main>
    </AePublicShell>
  )
}

function PriorityControls({
  selections,
  priorities,
}: Readonly<{
  selections: readonly ComparisonSelectionRef[]
  priorities: readonly ComparisonPriorityId[]
}>) {
  return (
    <Card padding={5} className="grid gap-3" aria-labelledby="comparison-priorities-heading">
      <Heading id="comparison-priorities-heading" level={2}>Your priorities</Heading>
      <Text color="secondary">
        Priority order matters. AE uses the first comparable difference and does not fill in missing facts.
      </Text>
      <div className="flex flex-wrap gap-2">
        {([
          ['professional_service:v1:lowest_total_price', 'Lowest published total price'],
          ['machine_data:v1:lowest_request_price', 'Lowest published request price'],
          ['machine_data:v1:no_authentication_preferred', 'No authentication preferred'],
          ['machine_data:v1:graphql_preferred', 'GraphQL preferred'],
        ] as const).map(([priority, label]) => {
          const selected = priorities.includes(priority)
          const next = selected
            ? priorities.filter((candidate) => candidate !== priority)
            : [...priorities, priority].slice(0, 3)
          return (
            <a
              key={priority}
              href={`/compare${serializeComparisonUrlState({ selections, priorities: next })}`}
              className="inline-flex min-h-11 items-center rounded-md border border-border px-4 font-semibold focus-visible:outline-2 focus-visible:outline-offset-4"
            >
              {selected ? 'Remove' : 'Add'} {label}
            </a>
          )
        })}
      </div>
      {priorities.length >= 3 ? (
        <Text type="supporting" color="secondary">Maximum 3 priorities.</Text>
      ) : null}
      {priorities.length === 0 ? null : (
        <a
          href={`/compare${serializeComparisonUrlState({ selections, priorities: [] })}`}
          className="min-h-11 justify-self-start py-2 font-semibold underline underline-offset-4"
        >
          Clear priorities
        </a>
      )}
    </Card>
  )
}

function ShareComparison({ href }: { href: string }) {
  return (
    <Card padding={4} className="grid gap-2">
      <Heading level={2}>Share this comparison</Heading>
      <button
        type="button"
        className="min-h-11 justify-self-start rounded-md border border-border px-4 font-semibold"
        onClick={() => {
          void navigator.clipboard.writeText(new URL(href, window.location.origin).toString())
        }}
      >
        Copy comparison link
      </button>
    </Card>
  )
}

function navigateToComparison(
  selections: readonly ComparisonSelectionRef[],
  priorities: readonly ComparisonPriorityId[],
) {
  window.location.assign(`/compare${serializeComparisonUrlState({ selections, priorities })}`)
}

function toUrlSearchParams(search: ComparisonRouteSearch): URLSearchParams {
  const params = new URLSearchParams()
  for (const selection of search.selection) params.append('selection', selection)
  for (const priority of search.priority) params.append('priority', priority)
  return params
}

function boundedStrings(input: unknown, maximum: number): string[] {
  const values = Array.isArray(input) ? input : input === undefined ? [] : [input]
  return values
    .filter((value): value is string => typeof value === 'string')
    .slice(0, maximum)
}

function selectionKey(selection: ComparisonSelectionRef): string {
  const values = [
    selection.businessId,
    selection.offeringRef,
    String(selection.offeringRevision),
  ]
  return `selection:${values.map((value) => `${value.length}:${value}`).join('')}`
}
