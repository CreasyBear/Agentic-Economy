import { createFileRoute } from '@tanstack/react-router'
import type { ColumnDef } from '@tanstack/react-table'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Card } from '@/components/ui/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'

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
      { title: 'Unmatched asks | Agentic Economy' },
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
      title="Unmatched asks"
      description="Prioritize businesses whose missing details recur in local supply searches."
      currentPath="/admin/search-gaps"
    >
      {readback.kind === 'denied' ? (
        <Alert variant="destructive">
          <AlertTitle>Unmatched asks are not available to this account</AlertTitle>
          <AlertDescription>This view needs an active admin membership. Ask an owner admin to grant one.</AlertDescription>
        </Alert>
      ) : readback.kind === 'unavailable' ? (
        <Alert variant="destructive">
          <AlertTitle>Unmatched asks could not be loaded</AlertTitle>
          <AlertDescription>The source did not answer. This is not a permission problem — refresh to try again.</AlertDescription>
        </Alert>
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
      <Card className="p-6">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-semibold text-foreground">
              Businesses worth contacting: {repeated.length}
            </h2>
            <p className="text-sm text-muted-foreground">
              Seen on {repeatedDayThreshold} or more separate days in the last 30 days. A business
              appeared as a candidate for these searches; it does not mean the searcher wanted it.
            </p>
          </div>
          {readback.businesses.length === 0 ? (
            <Empty className="border border-dashed p-5">
              <EmptyHeader>
                <EmptyTitle>No search history yet</EmptyTitle>
                <EmptyDescription>No local searches were recorded in the last 30 days. When customers search for services near your business, missing details will show here.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : repeated.length === 0 ? (
            <Empty className="border border-dashed p-5">
              <EmptyHeader>
                <EmptyTitle>No recurring businesses yet</EmptyTitle>
                <EmptyDescription>Businesses appeared in searches, but none has been seen on separate days yet. Check back once one recurs.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <AeOperatorDataTable
              columns={businessColumns}
              data={repeated}
              caption="Businesses worth contacting"
              filterPlaceholder="Filter businesses…"
              emptyMessage="No businesses match this filter."
            />
          )}
        </div>
      </Card>

      {seenOnce.length === 0 ? null : (
        <Card className="p-6">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <h2 className="text-lg font-semibold text-foreground">
                Seen on one day only
              </h2>
              <p className="text-sm text-muted-foreground">
                Not yet a pattern. Treat as noise until a second day appears.
              </p>
            </div>
            <AeOperatorDataTable
              columns={businessColumns}
              data={seenOnce}
              caption="Businesses seen on one day"
              filterPlaceholder="Filter businesses…"
            />
          </div>
        </Card>
      )}

      <Card className="p-6">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-semibold text-foreground">
              Searches nobody could answer: {readback.unanswered.length}
            </h2>
            <p className="text-sm text-muted-foreground">
              No business matched these at all. This is missing supply, not missing detail.
            </p>
          </div>
          {readback.unanswered.length === 0 ? (
            <Empty className="border border-dashed p-5">
              <EmptyHeader>
                <EmptyTitle>No unanswered searches</EmptyTitle>
                <EmptyDescription>Every recorded search matched at least one business. Unanswered searches appear here when no business matches a request.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <AeOperatorDataTable
              columns={unansweredColumns}
              data={readback.unanswered}
              caption="Unanswered searches"
              filterPlaceholder="Filter searches…"
              emptyMessage="No searches match this filter."
            />
          )}
        </div>
      </Card>

      {readback.truncated ? (
        <p className="text-sm text-muted-foreground">
          Showing the 500 most recent daily records.
        </p>
      ) : null}
    </div>
  )
}
