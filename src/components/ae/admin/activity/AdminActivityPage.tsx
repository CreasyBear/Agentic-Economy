import { AeOperatorPage } from '@/components/ae/layout/AeOperatorPage'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { adminActivitySearchSchema, type AdminActivitySearch } from '@/lib/operator/admin-console/activity'
import { AdminSearchNotice } from '../AdminSearchNotice'
import { PurchaseActivity } from './PurchaseActivity'

const FILTERS = {
  range: [['today', 'Today'], ['last_7', 'Last 7 completed days'], ['last_30', 'Last 30 completed days'], ['last_90', 'Last 90 completed days']],
  status: [['all', 'All outcomes'], ['completed', 'Delivered'], ['pending', 'Pending'], ['reconciliation_required', 'Needs reconciliation'], ['refused', 'Refused'], ['refunded', 'Refunded']],
  funding: [['all', 'All funding'], ['customer', 'Purchased credit'], ['promotional', 'Includes promotional credit'], ['unclassified', 'Funding not classified']],
} as const

export function AdminActivityPage({ search, onSearchChange }: Readonly<{ search: AdminActivitySearch & { rejected?: string }; onSearchChange: (search: AdminActivitySearch) => void }>) {
  return <AeOperatorPage operatorRole="admin" title="Purchases" description="Follow demand through delivery, payment and recovery."
    currentPath="/admin/activity" breadcrumbs={[{ label: 'Admin', href: '/admin' }, { label: 'Purchases' }]} stickyHeader>
    <div className="grid gap-section pb-page">
      <AdminSearchNotice rejected={search.rejected} />
      <div className="flex flex-wrap gap-related">{(Object.keys(FILTERS) as (keyof typeof FILTERS)[]).map(key => <div className="grid gap-1.5" key={key}>
        <span className="text-xs font-medium text-muted-foreground">{key === 'range' ? 'Period' : key === 'status' ? 'Outcome' : 'Funding'}</span>
        <Select value={search[key] ?? (key === 'range' ? 'today' : 'all')}
          onValueChange={value => {
            const { rejected: _rejected, ...filters } = search
            const parsed = adminActivitySearchSchema.safeParse({ ...filters, [key]: value })
            if (parsed.success) onSearchChange(parsed.data)
          }}>
          <SelectTrigger aria-label={key === 'range' ? 'Period' : key === 'status' ? 'Outcome' : 'Funding'}><SelectValue>{FILTERS[key].find(([value]) => value === (search[key] ?? (key === 'range' ? 'today' : 'all')))?.[1]}</SelectValue></SelectTrigger>
          <SelectContent>{FILTERS[key].map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
        </Select>
      </div>)}</div>
      {search.account === undefined ? null : <p className="text-sm">Account: <a className="underline underline-offset-4" href={`/admin/workspaces/${encodeURIComponent(search.account)}`}>{search.account}</a>
        {' · '}<button type="button" className="underline underline-offset-4" onClick={() => { const { account: _account, ...rest } = search; onSearchChange(rest) }}>Clear Account filter</button></p>}
      <PurchaseActivity search={search} />
    </div>
  </AeOperatorPage>
}
