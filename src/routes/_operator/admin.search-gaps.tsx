import { createFileRoute } from '@tanstack/react-router'
import type { ColumnDef } from '@tanstack/react-table'
import { Banner } from '@astryxdesign/core/Banner'
import { Card } from '@astryxdesign/core/Card'
import { VStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'

import { AeOperatorShell } from '@/components/ae/layout/AeOperatorShell'
import {
  AeOperatorDataTable,
  AeOperatorSortableHeader,
} from '@/components/ae/operator/AeOperatorDataTable'
import { operatorRouteOptions } from '@/lib/operator/route-options'
import { readSearchGapOutreachServer } from '@/modules/demand/demand.functions'
import type {
  SearchGapFactCount,
  SearchGapOutreachReadback,
} from '@/modules/demand/demand.functions'
import type { SearchGapFact } from '@/modules/demand/public'

/** Third person: this table is about other people's businesses. */
const operatorFactLabels: Readonly<Record<SearchGapFact, string>> = {
  price: 'price',
  availability: 'opening hours',
  location: 'location',
  contact: 'contact method',
  service_detail: 'services',
}

const repeatedDayThreshold = 2

export const Route = createFileRoute('/_operator/admin/search-gaps')({
  ...operatorRouteOptions,
  loader: async () => ({
    readback: await readSearchGapOutreachServer()
      .catch((): SearchGapOutreachReadback => ({ kind: 'unavailable' })),
  }),
  head: () => ({
    meta: [
      { title: 'Search gaps | Agentic Economy' },
      {
        name: 'description',
        content: 'Prioritize businesses whose missing details recur in local supply searches.',
      },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: AdminSearchGapsRoute,
})

type AvailableOutreach = Extract<SearchGapOutreachReadback, { kind: 'available' }>
type OutreachBusiness = AvailableOutreach['businesses'][number]
type UnansweredSearch = AvailableOutreach['unanswered'][number]

type OutreachColumn<Row> = ColumnDef<Row, unknown>

const describeFactCounts = (factCounts: readonly SearchGapFactCount[]): string =>
  factCounts.map((entry) => `${operatorFactLabels[entry.fact]} (${entry.searches})`).join(', ')

const businessColumns: OutreachColumn<OutreachBusiness>[] = [
  {
    accessorKey: 'slug',
    header: ({ column }) => AeOperatorSortableHeader({ label: 'Business', column }),
  },
  {
    accessorKey: 'searches',
    header: ({ column }) => AeOperatorSortableHeader({ label: 'Searches', column }),
  },
  {
    accessorKey: 'distinctDays',
    header: ({ column }) => AeOperatorSortableHeader({ label: 'Days seen', column }),
  },
  {
    id: 'missingDetails',
    header: 'Missing details',
    accessorFn: (row) => describeFactCounts(row.factCounts),
  },
  {
    accessorKey: 'lastQueryText',
    header: 'Example search',
  },
  {
    id: 'openBusiness',
    header: 'Page',
    cell: ({ row }) => (
      <a
        className="underline underline-offset-2"
        href={`/${row.original.slug}`}
        target="_blank"
        rel="noreferrer"
      >
        Open
      </a>
    ),
  },
]

const unansweredColumns: OutreachColumn<UnansweredSearch>[] = [
  { accessorKey: 'queryText', header: 'Search' },
  { accessorKey: 'surface', header: 'Where' },
  {
    accessorKey: 'searches',
    header: ({ column }) => AeOperatorSortableHeader({ label: 'Times', column }),
  },
]

function AdminSearchGapsRoute() {
  const { readback } = Route.useLoaderData()

  return (
    <AeOperatorShell
      operatorRole="admin"
      title="Search gaps"
      description="Prioritize businesses whose missing details recur in local supply searches."
      currentPath="/admin/search-gaps"
    >
      {readback.kind === 'denied' ? (
        <Banner
          status="error"
          title="Search gaps are not available to this account"
          description="This view needs an active admin membership. Ask an owner admin to grant one."
        />
      ) : readback.kind === 'unavailable' ? (
        <Banner
          status="error"
          title="Search gaps could not be loaded"
          description="The source did not answer. This is not a permission problem — refresh to try again."
        />
      ) : (
        <SearchGapReadback readback={readback} />
      )}
    </AeOperatorShell>
  )
}

function SearchGapReadback({ readback }: Readonly<{ readback: AvailableOutreach }>) {
  const repeated = readback.businesses.filter(
    (business) => business.distinctDays >= repeatedDayThreshold,
  )
  const seenOnce = readback.businesses.filter(
    (business) => business.distinctDays < repeatedDayThreshold,
  )

  return (
    <div className="grid gap-6">
      <Card padding={6}>
        <VStack gap={4}>
          <VStack gap={1}>
            <Text as="h2" type="large" weight="semibold" color="primary" display="block">
              Businesses worth contacting: {repeated.length}
            </Text>
            <Text type="supporting" color="secondary" display="block">
              Seen on {repeatedDayThreshold} or more separate days in the last 30 days. A business
              appeared as a candidate for these searches; it does not mean the searcher wanted it.
            </Text>
          </VStack>
          {readback.businesses.length === 0 ? (
            <Text color="secondary" display="block">No searches recorded in the last 30 days.</Text>
          ) : repeated.length === 0 ? (
            <Text color="secondary" display="block">
              No business has recurred across separate days yet.
            </Text>
          ) : (
            <AeOperatorDataTable
              columns={businessColumns}
              data={repeated}
              filterPlaceholder="Filter businesses…"
            />
          )}
        </VStack>
      </Card>

      {seenOnce.length === 0 ? null : (
        <Card padding={6}>
          <VStack gap={4}>
            <VStack gap={1}>
              <Text as="h2" type="large" weight="semibold" color="primary" display="block">
                Seen on one day only
              </Text>
              <Text type="supporting" color="secondary" display="block">
                Not yet a pattern. Treat as noise until a second day appears.
              </Text>
            </VStack>
            <AeOperatorDataTable
              columns={businessColumns}
              data={seenOnce}
              filterPlaceholder="Filter businesses…"
            />
          </VStack>
        </Card>
      )}

      <Card padding={6}>
        <VStack gap={4}>
          <VStack gap={1}>
            <Text as="h2" type="large" weight="semibold" color="primary" display="block">
              Searches nobody could answer: {readback.unanswered.length}
            </Text>
            <Text type="supporting" color="secondary" display="block">
              No business matched these at all. This is missing supply, not missing detail.
            </Text>
          </VStack>
          {readback.unanswered.length === 0 ? (
            <Text color="secondary" display="block">
              Every recorded search matched at least one business.
            </Text>
          ) : (
            <AeOperatorDataTable
              columns={unansweredColumns}
              data={readback.unanswered}
              filterPlaceholder="Filter searches…"
            />
          )}
        </VStack>
      </Card>

      {readback.truncated ? (
        <Text type="supporting" color="secondary" display="block">
          Showing the 500 most recent daily records.
        </Text>
      ) : null}
    </div>
  )
}
