import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { setResponseHeader } from '@tanstack/react-start/server'
import { Card } from '@astryxdesign/core/Card'
import { Heading, Text } from '@astryxdesign/core/Text'
import { z } from 'zod'

import { AeOfferingDetail } from '@/components/ae/comparison/AeOfferingDetail'
import { AeShortlistBar } from '@/components/ae/comparison/AeShortlistBar'
import { AePublicShell } from '@/components/ae/layout/AePublicShell'
import {
  offeringApiDtoToSupplyView,
  offeringSupportCopy,
  presentOfferingAccessPath,
} from '@/components/ae/offerings/offering-presentation'
import { createComparisonOfferingReadPort } from '@/modules/comparison/comparison.functions'
import {
  appendComparisonUrlState,
  comparisonSelectionId,
  parseComparisonUrlState,
  resolveComparisonSelections,
  serializeComparisonUrlState,
  type ComparisonSelectionRef,
} from '@/modules/comparison/public'
import { readPublicOfferingRegistryBusinessDetail } from '@/modules/registry/registry.functions'
import {
  normalizeComparisonRouteSearch,
  type ComparisonRouteSearch,
} from './compare'

const offeringDetailInput = z.object({
  slug: z.string().min(1).max(180),
  offeringRef: z.string().min(1).max(300),
  search: z.object({
    selection: z.array(z.string().max(1_500)).max(5),
    priority: z.array(z.string().max(120)).max(4),
  }),
})

export const readOfferingDetailRouteServer = createServerFn({ method: 'GET' })
  .validator((data) => offeringDetailInput.parse(data))
  .handler(async ({ data }) => {
    setResponseHeader('Cache-Control', 'no-store')
    const parsed = parseComparisonUrlState(toSearchParams(data.search))
    const state = parsed.kind === 'accepted'
      ? parsed.state
      : { version: 'offering-comparison:v1' as const, selections: [], priorities: [] }
    const businessResult = await readPublicOfferingRegistryBusinessDetail({
      slug: data.slug,
    })
    if (businessResult.kind === 'not_found') {
      return {
        ...businessResult,
        state,
        searchRefused: parsed.kind === 'refused',
      }
    }
    const supply = offeringApiDtoToSupplyView(businessResult.business)
    const offering = supply.offerings.find((candidate) => (
      candidate.offering.offeringRef === data.offeringRef
    ))
    if (offering === undefined) {
      return {
        kind: 'not_found' as const,
        code: 'offering_not_found' as const,
        state,
        searchRefused: parsed.kind === 'refused',
      }
    }
    const detailSelection: ComparisonSelectionRef = {
      businessId: businessResult.business.businessId,
      offeringRef: offering.offering.offeringRef,
      offeringRevision: offering.offering.revision,
      projectionObservedAt: supply.observedAt,
    }
    const port = createComparisonOfferingReadPort()
    const [shortlist, detail] = await Promise.all([
      resolveComparisonSelections({
        state,
        resolvedAt: Date.now(),
        port,
      }),
      resolveComparisonSelections({
        state: {
          version: 'offering-comparison:v1',
          selections: [detailSelection],
          priorities: [],
        },
        resolvedAt: Date.now(),
        port,
      }),
    ])
    return {
      kind: 'found' as const,
      business: businessResult.business,
      supply,
      offering,
      state,
      searchRefused: parsed.kind === 'refused',
      shortlist,
      detail: detail.selections[0],
    }
  })

export const Route = createFileRoute('/$slug/offerings/$offeringRef')({
  validateSearch: normalizeComparisonRouteSearch,
  loaderDeps: ({ search }) => search,
  loader: ({ params, deps }) => readOfferingDetailRouteServer({
    data: {
      slug: params.slug,
      offeringRef: params.offeringRef,
      search: deps,
    },
  }),
  head: ({ loaderData }) => ({
    meta: loaderData?.kind === 'found'
      ? [
          { title: `${loaderData.offering.offering.name} | ${loaderData.business.name}` },
          { name: 'description', content: loaderData.offering.offering.summary },
        ]
      : [
          { title: 'Offering unavailable | Agentic Economy' },
          { name: 'robots', content: 'noindex' },
        ],
  }),
  component: OfferingDetailRoute,
})

function OfferingDetailRoute() {
  const data = Route.useLoaderData()
  const params = Route.useParams()
  if (data.kind !== 'found' || data.detail === undefined) {
    return (
      <AePublicShell>
        <div className="mx-auto grid w-full max-w-4xl gap-4 px-4 py-12 md:px-6">
          <Heading level={1}>Offering unavailable</Heading>
          <Text color="secondary">This Offering is not publicly available right now.</Text>
          <a
            className="font-semibold underline"
            href={appendComparisonUrlState(`/${encodeURIComponent(params.slug)}`, data.state)}
          >
            Back to business
          </a>
        </div>
      </AePublicShell>
    )
  }

  const selectionId = comparisonSelectionId(data.detail.selection)
  const selected = data.state.selections.some((selection) => (
    comparisonSelectionId(selection) === selectionId
  ))
  const toggle = () => {
    const selections = selected
      ? data.state.selections.filter((selection) => (
          comparisonSelectionId(selection) !== selectionId
        ))
      : data.state.selections.length >= 4
        ? data.state.selections
        : [...data.state.selections, data.detail!.selection]
    window.location.assign(
      `/${encodeURIComponent(params.slug)}/offerings/${encodeURIComponent(params.offeringRef)}${serializeComparisonUrlState({
        selections,
        priorities: data.state.priorities,
      })}`,
    )
  }
  const presentation = data.offering.accessPaths.map(presentOfferingAccessPath)
  const support = offeringSupportCopy(data.offering.support)

  return (
    <AePublicShell>
      <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-10 md:px-6">
        <nav aria-label="Breadcrumb" className="text-sm text-secondary">
          <a
            href={appendComparisonUrlState('/registry?q=&limit=10', data.state)}
            className="underline"
          >
            Businesses
          </a>
          {' / '}
          <a
            href={appendComparisonUrlState(`/${encodeURIComponent(data.business.slug)}`, data.state)}
            className="underline"
          >
            {data.business.name}
          </a>
          {' / '}
          <span aria-current="page">{data.offering.offering.name}</span>
        </nav>

        {data.searchRefused ? (
          <Card padding={4} role="status">
            <Text color="secondary">The comparison state in this link was not valid, so no Offerings were selected.</Text>
          </Card>
        ) : null}

        <AeOfferingDetail
          selection={data.detail}
          selected={selected}
          onToggle={toggle}
          selectionDisabled={!selected && data.state.selections.length >= 4}
        />

        <Card padding={5} className="grid gap-4" aria-labelledby="offering-published-ways">
          <Heading id="offering-published-ways" level={2}>Ways this Offering is published</Heading>
          {presentation.length === 0 ? (
            <Text color="secondary">No published way to get started is available.</Text>
          ) : (
            <ul className="m-0 grid list-none gap-3 p-0">
              {presentation.map((path) => (
                <li key={path.accessPathRef} className="grid gap-2 border-b border-border pb-3 last:border-0">
                  <Text weight="semibold">{path.label}</Text>
                  <Text color="secondary">{path.detail}</Text>
                  {path.href === undefined ? null : (
                    <a
                      href={path.href}
                      rel={path.external ? 'noopener noreferrer' : undefined}
                      referrerPolicy={path.external ? 'no-referrer' : undefined}
                      className="min-h-11 justify-self-start py-2 font-semibold underline"
                    >
                      View published details
                    </a>
                  )}
                  {path.technical === undefined ? null : (
                    <details>
                      <summary className="min-h-11 cursor-pointer py-2 font-semibold">
                        Show technical details
                      </summary>
                      <dl className="grid gap-2">
                        {path.technical.map((fact) => (
                          <div key={fact.label}>
                            <dt className="font-semibold">{fact.label}</dt>
                            <dd className="m-0 break-all text-secondary">{fact.value}</dd>
                          </div>
                        ))}
                      </dl>
                    </details>
                  )}
                </li>
              ))}
            </ul>
          )}
          {support === undefined ? null : (
            <div className="grid gap-1">
              <Text weight="semibold">{support.label}</Text>
              <Text type="supporting" color="secondary">{support.detail}</Text>
            </div>
          )}
        </Card>

        {data.shortlist.selections.length === 0 ? null : (
          <AeShortlistBar
            selections={data.shortlist.selections}
            compareHref={`/compare${serializeComparisonUrlState(data.state)}`}
            onRemove={(removeId) => {
              window.location.assign(
                `/${encodeURIComponent(params.slug)}/offerings/${encodeURIComponent(params.offeringRef)}${serializeComparisonUrlState({
                  selections: data.state.selections.filter((selection) => (
                    comparisonSelectionId(selection) !== removeId
                  )),
                  priorities: data.state.priorities,
                })}`,
              )
            }}
          />
        )}
      </div>
    </AePublicShell>
  )
}

function toSearchParams(search: ComparisonRouteSearch): URLSearchParams {
  const params = new URLSearchParams()
  for (const selection of search.selection) params.append('selection', selection)
  for (const priority of search.priority) params.append('priority', priority)
  return params
}
