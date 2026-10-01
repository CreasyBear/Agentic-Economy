import { createFileRoute } from '@tanstack/react-router'
import { AdminActivityPage } from '@/components/ae/admin/activity/AdminActivityPage'
import { adminActivitySearchSchema } from '@/lib/operator/admin-console/activity'
import { recoverableSearch } from '@/lib/client/recoverable-search'
import { operatorRouteOptions } from '@/lib/operator/route-options'

export const Route = createFileRoute('/_operator/admin/activity')({
  ...operatorRouteOptions,
  validateSearch: recoverableSearch(adminActivitySearchSchema, { identifierKeys: ['account'], fieldLabels: { range: 'Period', status: 'Outcome', funding: 'Funding' } }),
  head: () => ({ meta: [{ title: 'Purchases | Agentic Economy' }, { name: 'robots', content: 'noindex' }] }),
  component: AdminActivityRoute,
})

function AdminActivityRoute() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  return <AdminActivityPage search={search} onSearchChange={next => { void navigate({ search: next, replace: true }) }} />
}
