import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { AdminAccountsPage } from '@/components/ae/admin/activity/AdminAccountsPage'
import { recoverableSearch } from '@/lib/client/recoverable-search'
import { operatorRouteOptions } from '@/lib/operator/route-options'

export const Route = createFileRoute('/_operator/admin/accounts')({
  ...operatorRouteOptions,
  validateSearch: recoverableSearch(z.strictObject({ q: z.string().trim().max(120).optional() }), { fieldLabels: { q: 'Account name' } }),
  head: () => ({ meta: [{ title: 'Accounts | Agentic Economy' }, { name: 'robots', content: 'noindex' }] }),
  component: AdminAccountsRoute,
})

function AdminAccountsRoute() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  return <AdminAccountsPage search={search.q ?? ''} rejected={search.rejected} onSearchChange={q => { void navigate({ search: q.length === 0 ? {} : { q }, replace: true }) }} />
}
