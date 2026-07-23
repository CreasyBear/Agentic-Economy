import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { setResponseHeader } from '@tanstack/react-start/server'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { Heading, Text } from '@astryxdesign/core/Text'
import { z } from 'zod'
import { useState } from 'react'

import { AeOfferingComparison } from '@/components/ae/comparison/AeOfferingComparison'
import { AeShortlistBar } from '@/components/ae/comparison/AeShortlistBar'
import { AePublicShell } from '@/components/ae/layout/AePublicShell'
import { createComparisonOfferingReadPort } from '@/modules/comparison/comparison.functions'
import {
  buildComparisonBrief,
  comparisonPresentationDigest,
  comparisonSelectionId,
  compareOfferings,
  appendComparisonUrlState,
  parseComparisonUrlState,
  resolveComparisonSelections,
  resolveComparisonPresentation,
  serializeComparisonUrlState,
  type ComparisonOfferingReadPort,
  type ComparisonPriorityId,
  type ComparisonSelectionRef,
  type ResolvedComparisonSelection,
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
    selection: boundedSelectionStrings(search.selection, 5),
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
  const brief = buildComparisonBrief(comparison)
  const semanticDigest = comparisonPresentationDigest({ comparison, brief })
  const presentation = resolveComparisonPresentation({
    semanticDigest,
    brief,
    adapter: { kind: 'disabled' },
  })
  return {
    kind: 'ready' as const,
    state: parsed.state,
    canonicalSearch: serializeComparisonUrlState(parsed.state),
    resolution,
    comparison,
    brief,
    semanticDigest,
    presentation,
  }
}

function CompareRoute() {
  const [feedback, setFeedback] = useState('')
  const readback = Route.useLoaderData()
  if (readback.kind === 'refused') {
    return (
      <AePublicShell>
        <div className="mx-auto grid w-full max-w-5xl gap-6 px-4 py-10 md:px-6">
          <Heading level={1}>Compare Offerings</Heading>
          <Card padding={5} className="grid gap-3" role="status">
            <Heading level={2}>This comparison link is not valid</Heading>
            <Text color="secondary">
              Choose Offerings again. Nothing was contacted or run.
            </Text>
            <Button label="Browse businesses" href="/registry?q=&limit=10" variant="primary" />
          </Card>
        </div>
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
      <div
        className="mx-auto grid w-full max-w-7xl gap-8 px-4 py-10 md:px-6"
        data-semantic-digest={readback.semanticDigest}
      >
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
              selectionRefs={readback.state.selections}
              resolvedSelections={readback.resolution.selections}
              priorities={readback.state.priorities}
              onFeedback={setFeedback}
            />

            {import.meta.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E === 'true' ? (
              <Card padding={4} className="grid gap-1 border border-border" role="note">
                <Text weight="semibold">Local demo evidence</Text>
                <Text type="supporting" color="secondary">
                  These labelled fixture records demonstrate the comparison loop. They do not prove live supply, provider availability, fulfilment, or customer value.
                </Text>
              </Card>
            ) : null}

            <AeOfferingComparison
              comparison={readback.comparison}
              brief={readback.brief}
              presentation={readback.presentation.plan}
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
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="min-h-11 rounded-md border border-border px-4 font-semibold"
                      onClick={() => focusSelectedEvidence(selection)}
                    >
                      View selected
                    </button>
                    <a
                      href={appendComparisonUrlState(
                        `/${encodeURIComponent(selection.business.slug)}/offerings/${encodeURIComponent(selection.newerCurrentReference.offeringRef)}`,
                        readback.state,
                      )}
                      className="inline-flex min-h-11 items-center rounded-md border border-border px-4 font-semibold"
                    >
                      Review current
                    </a>
                    <button
                      type="button"
                      className="min-h-11 rounded-md border border-border px-4 font-semibold"
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
                  </div>
                </Card>
              )
            ))}

            <ShareComparison
              href={`/compare${readback.canonicalSearch}`}
              onFeedback={setFeedback}
            />
            <p
              className="min-h-5 text-sm text-secondary"
              role="status"
              aria-live="polite"
              aria-atomic="true"
            >
              {feedback}
            </p>
          </>
        )}
      </div>
    </AePublicShell>
  )
}

export function PriorityControls({
  selectionRefs,
  resolvedSelections,
  priorities,
  onFeedback,
}: Readonly<{
  selectionRefs: readonly ComparisonSelectionRef[]
  resolvedSelections: readonly ResolvedComparisonSelection[]
  priorities: readonly ComparisonPriorityId[]
  onFeedback: (message: string) => void
}>) {
  const relevant = relevantPriorityOptions(resolvedSelections)
  const relevantIds = new Set(relevant.map(([priority]) => priority))
  const [draft, setDraft] = useState<readonly ComparisonPriorityId[]>(
    priorities.filter((priority) => relevantIds.has(priority)),
  )

  const update = (next: readonly ComparisonPriorityId[], message: string) => {
    setDraft(next)
    onFeedback(message)
  }

  return (
    <Card padding={5} className="grid gap-3" aria-labelledby="comparison-priorities-heading">
      <Heading id="comparison-priorities-heading" level={2}>Your priorities</Heading>
      <Text color="secondary">
        Priority order matters. AE uses the first comparable difference and does not fill in missing facts.
      </Text>
      <ol className="grid gap-2" aria-label="Applied priority order">
        {draft.map((priority, index) => {
          const option = PRIORITY_OPTIONS.find(([id]) => id === priority)
          if (option === undefined) return null
          return (
            <li key={priority} className="flex flex-wrap items-center gap-2 rounded-md border border-border p-3">
              <span className="mr-auto font-semibold">{index + 1}. {option[1]}</span>
              <button
                type="button"
                className="min-h-11 rounded-md border border-border px-3 font-semibold disabled:opacity-50"
                disabled={index === 0}
                onClick={() => update(movePriority(draft, index, index - 1), `${option[1]} moved up.`)}
              >
                Move up
              </button>
              <button
                type="button"
                className="min-h-11 rounded-md border border-border px-3 font-semibold disabled:opacity-50"
                disabled={index === draft.length - 1}
                onClick={() => update(movePriority(draft, index, index + 1), `${option[1]} moved down.`)}
              >
                Move down
              </button>
              <button
                type="button"
                className="min-h-11 rounded-md border border-border px-3 font-semibold"
                onClick={() => update(draft.filter((candidate) => candidate !== priority), `${option[1]} removed.`)}
              >
                Remove
              </button>
            </li>
          )
        })}
      </ol>
      <div className="flex flex-wrap gap-2" aria-label="Available priorities">
        {relevant.filter(([priority]) => !draft.includes(priority)).map(([priority, label]) => (
          <button
            key={priority}
            type="button"
            className="min-h-11 rounded-md border border-border px-4 font-semibold"
            onClick={() => {
              if (draft.length >= 3) {
                onFeedback('Maximum 3 priorities — remove one before adding another.')
                return
              }
              update([...draft, priority], `${label} added as priority ${draft.length + 1}.`)
            }}
          >
            Add {label}
          </button>
        ))}
      </div>
      {relevant.length === 0 ? (
        <Text type="supporting" color="secondary">
          No registered priority applies to the selected Offering profiles.
        </Text>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <a
          href={`/compare${serializeComparisonUrlState({ selections: selectionRefs, priorities: draft })}`}
          className="inline-flex min-h-11 items-center rounded-md border border-border px-4 font-semibold"
        >
          Apply priorities
        </a>
        {draft.length === 0 ? null : (
          <button
            type="button"
            className="min-h-11 px-2 font-semibold underline underline-offset-4"
            onClick={() => update([], 'Priorities cleared. Apply to update the comparison.')}
          >
            Clear priorities
          </button>
        )}
      </div>
    </Card>
  )
}

export function ShareComparison({
  href,
  onFeedback,
}: {
  href: string
  onFeedback: (message: string) => void
}) {
  return (
    <Card padding={4} className="grid gap-2">
      <Heading level={2}>Share this comparison</Heading>
      <button
        type="button"
        className="min-h-11 justify-self-start rounded-md border border-border px-4 font-semibold"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(
              new URL(href, window.location.origin).toString(),
            )
            onFeedback('Comparison link copied.')
          } catch {
            onFeedback('Could not copy the comparison link. Copy it from the address bar.')
          }
        }}
      >
        Copy comparison link
      </button>
    </Card>
  )
}

const PRIORITY_OPTIONS = [
  ['professional_service:v1:lowest_total_price', 'Lowest published total price'],
  ['machine_data:v1:lowest_request_price', 'Lowest published request price'],
  ['machine_data:v1:no_authentication_preferred', 'No authentication preferred'],
  ['machine_data:v1:graphql_preferred', 'GraphQL preferred'],
] as const satisfies readonly (readonly [ComparisonPriorityId, string])[]

function relevantPriorityOptions(
  selections: readonly ResolvedComparisonSelection[],
): readonly (readonly [ComparisonPriorityId, string])[] {
  const profileIds = new Set(selections.flatMap((selection) => (
    selection.offering.comparison?.profile.profileId === undefined
      ? []
      : [selection.offering.comparison.profile.profileId]
  )))
  if (
    selections.length === 0
    || profileIds.size !== 1
    || selections.some((selection) => selection.offering.comparison === undefined)
  ) {
    return []
  }
  return PRIORITY_OPTIONS.filter(([priority]) => (
    priority.startsWith('professional_service:v1:')
      ? profileIds.has('professional_service:v1')
      : profileIds.has('machine_data:v1')
  ))
}

function focusSelectedEvidence(selection: ResolvedComparisonSelection) {
  const target = document.getElementById(
    `selected-evidence-${comparisonSelectionId(selection.selection)}`,
  )
  const disclosure = target?.closest('details')
  if (disclosure instanceof HTMLDetailsElement) disclosure.open = true
  target?.focus()
  target?.scrollIntoView({ block: 'center' })
}

function movePriority(
  priorities: readonly ComparisonPriorityId[],
  from: number,
  to: number,
): readonly ComparisonPriorityId[] {
  if (to < 0 || to >= priorities.length) return priorities
  const next = [...priorities]
  const [moved] = next.splice(from, 1)
  if (moved === undefined) return priorities
  next.splice(to, 0, moved)
  return next
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

function boundedSelectionStrings(input: unknown, maximum: number): string[] {
  const values = Array.isArray(input) ? input : input === undefined ? [] : [input]
  return values
    .flatMap((value) => (
      typeof value === 'string'
        ? [value]
        : isPlainSearchObject(value)
          ? [JSON.stringify(value)]
          : []
    ))
    .slice(0, maximum)
}

function isPlainSearchObject(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null && !Array.isArray(input)
}

function selectionKey(selection: ComparisonSelectionRef): string {
  const values = [
    selection.businessId,
    selection.offeringRef,
    String(selection.offeringRevision),
  ]
  return `selection:${values.map((value) => `${value.length}:${value}`).join('')}`
}
