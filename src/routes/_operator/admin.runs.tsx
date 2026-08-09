import { Outlet, createFileRoute, useLocation } from '@tanstack/react-router'

import { AeHarnessRunList } from '@/components/ae/harness/AeHarnessRunViewer'
import { AeOperatorShell } from '@/components/ae/layout/AeOperatorShell'
import { operatorRouteOptions } from '@/lib/operator/route-options'
import { stringSearch } from '@/lib/operator/string-search'
import {
  readAdminRunViewerListServer,
} from '@/modules/harness/run-viewer.functions'
import {
  HarnessRunViewerEvidenceFilterValues,
  HarnessRunViewerStatusFilterValues,
  type HarnessRunViewerFilters,
} from '@/modules/harness/run-viewer.schema'

export const Route = createFileRoute('/_operator/admin/runs')({
  ...operatorRouteOptions,
  validateSearch: (search: Record<string, unknown>): HarnessRunViewerFilters => compactSearch({
    status: enumSearch(search.status, HarnessRunViewerStatusFilterValues),
    turnId: stringSearch(search.turnId),
    threadId: stringSearch(search.threadId),
    date: stringSearch(search.date),
    hasRunEvidence: enumSearch(search.hasRunEvidence, HarnessRunViewerEvidenceFilterValues),
  }),
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => readAdminRunViewerListServer({ data: deps }),
  head: () => ({
    meta: [
      { title: 'Runs | Agentic Economy' },
      {
        name: 'description',
        content: 'Admin-only answer run evidence viewer scaffold.',
      },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: AdminRunsRoute,
})

function AdminRunsRoute() {
  const filters = Route.useSearch()
  const result = Route.useLoaderData()
  const { pathname } = useLocation()

  if (pathname !== '/admin/runs') {
    return <Outlet />
  }

  return (
    <AeOperatorShell
      operatorRole="admin"
      title="Runs"
      description="Inspect private answer run evidence after admin access is resolved. Raw JSON stays behind the admin detail surface."
      currentPath="/admin/runs"
      navBadges={{ '/admin/runs': result.kind === 'allowed' ? result.rows.length : 0 }}
    >
      <AeHarnessRunList result={result} filters={filters} />
    </AeOperatorShell>
  )
}

function compactSearch(filters: HarnessRunViewerFilters): HarnessRunViewerFilters {
  return {
    ...(filters.status === undefined ? {} : { status: filters.status }),
    ...(filters.turnId === undefined ? {} : { turnId: filters.turnId }),
    ...(filters.threadId === undefined ? {} : { threadId: filters.threadId }),
    ...(filters.date === undefined ? {} : { date: filters.date }),
    ...(filters.hasRunEvidence === undefined ? {} : { hasRunEvidence: filters.hasRunEvidence }),
  }
}


function enumSearch<T extends string>(
  value: unknown,
  values: readonly T[],
): T | undefined {
  if (typeof value !== 'string') {
    return undefined
  }
  const trimmed = value.trim()
  return values.includes(trimmed as T) ? trimmed as T : undefined
}
