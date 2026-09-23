import { createFileRoute } from '@tanstack/react-router'

import { AdminObjectSearch } from '@/components/ae/admin/object-search/AdminObjectSearch'
import {
  ADMIN_OBJECT_SEARCH_COPY,
  adminObjectSearchSchema,
} from '@/components/ae/admin/object-search/object-search.contracts'
import { operatorRouteOptions } from '@/lib/operator/route-options'

export const Route = createFileRoute('/_operator/admin/search')({
  ...operatorRouteOptions,
  validateSearch: adminObjectSearchSchema,
  head: () => ({
    meta: [
      { title: `${ADMIN_OBJECT_SEARCH_COPY.title} | Agentic Economy` },
      { name: 'description', content: ADMIN_OBJECT_SEARCH_COPY.description },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: AdminSearchRoute,
})

function AdminSearchRoute() {
  const search = Route.useSearch()
  return (
    <AdminObjectSearch
      {...(search.kind === undefined ? {} : { initialKind: search.kind })}
      {...(search.ref === undefined ? {} : { initialRef: search.ref })}
    />
  )
}
