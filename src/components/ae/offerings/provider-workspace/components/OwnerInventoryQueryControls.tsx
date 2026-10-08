import { useEffect, useId, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ownerInventoryQuery, type OwnerInventoryQuery, type OwnerInventorySort } from '@/lib/operator/owner-inventory-search'

const inventorySortItems = [
  { value: 'updated_desc', label: 'Most recently updated' },
  { value: 'updated_asc', label: 'Least recently updated' },
  { value: 'name_asc', label: 'Tool name A–Z' },
  { value: 'name_desc', label: 'Tool name Z–A' },
  { value: 'relevance', label: 'Search relevance' },
] as const

/** Mount in the record grid's action slot so empty search pages keep their recovery controls. */
export function OwnerInventoryQueryControls({ query, pending = false, onApply }: Readonly<{
  query: OwnerInventoryQuery
  pending?: boolean
  onApply: (query: OwnerInventoryQuery) => void
}>) {
  const id = useId()
  const normalized = ownerInventoryQuery(query)
  const [text, setText] = useState(normalized.q ?? '')
  const [sort, setSort] = useState<OwnerInventorySort>(normalized.sort ?? 'updated_desc')
  useEffect(() => {
    setText(normalized.q ?? '')
    setSort(normalized.sort ?? 'updated_desc')
  }, [normalized.q, normalized.sort])
  const searching = text.trim().length > 0
  const globalSort = sort === 'relevance' ? 'updated_desc' : sort

  return <form aria-label="Search and sort all Provider Tools" className="flex min-w-0 flex-wrap items-end gap-2" onSubmit={(event) => {
    event.preventDefault()
    if (!pending) onApply(ownerInventoryQuery({ q: text, sort: globalSort }))
  }}>
    <div className="grid min-w-0 flex-1 gap-1 sm:min-w-56">
      <label htmlFor={`${id}-query`} className="text-xs font-medium">Search all Tools</label>
      <Input id={`${id}-query`} type="search" value={text} maxLength={120} disabled={pending}
        placeholder="Name, summary or category" aria-describedby={`${id}-help`}
        onChange={(event) => setText(event.target.value)} />
    </div>
    <div className="grid gap-1">
      <label id={`${id}-sort-label`} htmlFor={`${id}-sort`} className="text-xs font-medium">Sort all Tools</label>
      <Select value={searching ? 'relevance' : globalSort} items={inventorySortItems} disabled={pending || searching}
        onValueChange={(value) => { if (value && value !== 'relevance') setSort(value as OwnerInventorySort) }}>
        <SelectTrigger id={`${id}-sort`} aria-labelledby={`${id}-sort-label`}><SelectValue /></SelectTrigger>
        <SelectContent>{inventorySortItems.filter(({ value }) => searching || value !== 'relevance').map(({ value, label }) =>
          <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
      </Select>
    </div>
    <Button type="submit" disabled={pending}>{pending ? 'Loading…' : 'Apply'}</Button>
    {(text !== '' || normalized.q !== undefined || query.cursor !== undefined) ? <Button type="button" variant="outline" disabled={pending} onClick={() => {
      setText('')
      setSort(globalSort)
      onApply(ownerInventoryQuery({ sort: globalSort }))
    }}>Reset search</Button> : null}
    <p id={`${id}-help`} className="w-full text-xs text-muted-foreground">Search matches words in Tool names, summaries and categories across this Provider. Search results use relevance order. IDs and protocol names are not searched.</p>
  </form>
}
