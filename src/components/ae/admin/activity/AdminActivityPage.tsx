import { AeOperatorPage } from '@/components/ae/layout/AeOperatorPage'
import { FilterToolbar, type FilterChip, type FilterField } from '@/components/arc/filter-toolbar/filter-toolbar'
import SegmentedControl from '@/components/arc/segmented-control/segmented-control'
import { adminActivitySearchSchema, type AdminActivitySearch } from '@/lib/operator/admin-console/activity'
import { AdminSearchNotice } from '../AdminSearchNotice'
import { PurchaseActivity } from './PurchaseActivity'

const PERIODS = [
  { value: 'today', label: 'Today' },
  { value: 'last_7', label: '7 days' },
  { value: 'last_30', label: '30 days' },
  { value: 'last_90', label: '90 days' },
]
const FILTER_FIELDS = [
  { id: 'status', label: 'Outcome', options: [
    { value: 'completed', label: 'Delivered' },
    { value: 'pending', label: 'Pending' },
    { value: 'reconciliation_required', label: 'Needs reconciliation' },
    { value: 'refused', label: 'Refused' },
    { value: 'refunded', label: 'Refunded' },
  ] },
  { id: 'funding', label: 'Funding', options: [
    { value: 'customer', label: 'Purchased credit' },
    { value: 'promotional', label: 'Includes promotional credit' },
    { value: 'unclassified', label: 'Funding not classified' },
  ] },
] satisfies FilterField[]

export function AdminActivityPage({ search, onSearchChange }: Readonly<{
  search: AdminActivitySearch & { rejected?: string }
  onSearchChange: (search: AdminActivitySearch) => void
}>) {
  const { rejected, ...filters } = search
  const range = filters.range ?? 'today'
  const chips: FilterChip[] = FILTER_FIELDS.flatMap(field => {
    const value = field.id === 'status' ? filters.status : filters.funding
    const option = field.options.find(option => option.value === value)
    return option ? [{ id: field.id, label: field.label, value: option.label }] : []
  })
  if (filters.account !== undefined) chips.push({ id: 'account', label: 'Account', value: filters.account })

  function update(next: unknown) {
    const parsed = adminActivitySearchSchema.safeParse(next)
    if (parsed.success) onSearchChange(parsed.data)
  }

  // ARC returns a display label. Resolve it through the declared field options;
  // never send a presentation label or an unknown menu value to the backend.
  function addFilter(chip: FilterChip) {
    const field = FILTER_FIELDS.find(field => field.id === chip.id)
    const option = field?.options.find(option => option.label === chip.value)
    if (field && option) update({ ...filters, [field.id]: option.value })
  }

  function removeFilter(id: string) {
    if (id !== 'status' && id !== 'funding' && id !== 'account') return
    const { [id]: _removed, ...remaining } = filters
    update(remaining)
  }

  return (
    <AeOperatorPage
      operatorRole="admin" title="Purchases" description="Follow demand through delivery, payment and recovery."
      currentPath="/admin/activity" breadcrumbs={[{ label: 'Admin', href: '/admin' }, { label: 'Purchases' }]} stickyHeader
    >
      <div className="grid min-w-0 gap-section pb-page">
        <AdminSearchNotice rejected={rejected} />
        <div className="grid min-w-0 gap-related">
          <div className="ae-arc min-w-0">
            <SegmentedControl label="Purchase period" options={PERIODS} value={range} onValueChange={value => update({ ...filters, range: value })} />
          </div>
          <p className="text-xs text-muted-foreground">Today is live. Longer periods include completed days in Perth.</p>
          <div className="ae-arc min-w-0">
            <FilterToolbar
              label="Purchase filters" filters={chips}
              onRemove={removeFilter}
              onClearAll={() => update({ range })}
              addFilter={{ fields: FILTER_FIELDS, onAdd: addFilter, align: 'start' }}
            />
          </div>
          {filters.account === undefined ? null : (
            <a className="justify-self-start text-sm underline underline-offset-4" href={`/admin/workspaces/${encodeURIComponent(filters.account)}`}>
              Inspect filtered Account
            </a>
          )}
        </div>
        <PurchaseActivity search={filters} />
      </div>
    </AeOperatorPage>
  )
}
