import { flexRender, getCoreRowModel, useReactTable, type ColumnDef, type VisibilityState } from '@tanstack/react-table'
import Decimal from 'decimal.js'
import { CheckIcon, HeartIcon, InfoIcon, PlusIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type { X402DirectoryEntry, X402DirectoryInput } from '@/modules/market/x402-directory'
import { directoryMetadataFlags } from '@/modules/market/x402-directory-metadata'
import { directoryNetwork, minimumDirectoryUsdPrice } from '@/modules/market/x402-directory-index'
import type { SavedDirectoryTool } from './DirectorySavedTools'
import { DirectoryToolIdentity } from './DirectoryToolIdentity'
import { directoryCount, directoryDate, directoryNetworkLabel, directoryPrice, directoryTitle } from './directory-presentation'

type Props = Readonly<{
  entries: readonly X402DirectoryEntry[]
  sourceInput: X402DirectoryInput
  onSelect: (item: SavedDirectoryTool) => void
  onSave: (item: SavedDirectoryTool) => void
  isSaved: (resource: string) => boolean
  onCompare?: (item: SavedDirectoryTool) => void
  isCompared?: (resource: string) => boolean
  compareDisabled?: boolean
}>

const payerExplanation = 'Distinct paying addresses per Tool in the last 30 days, reported by Coinbase Bazaar. These are not people or Customers.'

function priceFacts(entry: X402DirectoryEntry, network: string | undefined) {
  const prices = entry.prices.filter(price => network === undefined || directoryNetwork(price.network) === directoryNetwork(network))
  const minimum = minimumDirectoryUsdPrice(entry, network)
  const price = minimum === undefined ? prices[0] : prices.find(option => {
    if (option.symbol !== 'USDC' || option.decimalAmount === undefined) return false
    try { return new Decimal(option.decimalAmount).eq(minimum) } catch { return false }
  })
  const display = { ...entry, prices: price === undefined ? [] : [price] }
  return { price: directoryPrice(display), network: directoryNetworkLabel(display), count: prices.length }
}

function Payers({ entry }: Readonly<{ entry: X402DirectoryEntry }>) {
  const count = entry.activity?.payers30d
  return count === undefined ? <span className="text-xs text-muted-foreground">Not reported</span> : <span className="font-medium tabular-nums" title={`${count.toLocaleString('en-AU')} distinct paying addresses in the last 30 days`}>{directoryCount(count)}</span>
}

function RequestDetails({ entry }: Readonly<{ entry: X402DirectoryEntry }>) {
  const flags = directoryMetadataFlags(entry)
  const count = entry.input?.fields.length ?? 0
  return flags.hasInputFields || flags.hasOutputExample ? <span className="flex flex-col gap-1 text-xs">{flags.hasInputFields ? <span>{count}{entry.input?.fieldsTruncated ? '+' : ''} request {count === 1 ? 'field' : 'fields'}</span> : null}{flags.hasOutputExample ? <span>Output example</span> : null}</span> : <span className="text-xs text-muted-foreground">Not published</span>
}

/** TanStack owns table display; the supplied page order and global search remain server-owned. */
export function DirectoryToolTable({ entries, sourceInput, onSelect, onSave, isSaved, onCompare, isCompared, compareDisabled }: Props) {
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({ calls: false })
  const data = useMemo(() => [...entries], [entries])
  function item(entry: X402DirectoryEntry): SavedDirectoryTool { return { entry, search: sourceInput } }
  function actions(entry: X402DirectoryEntry) {
    const title = directoryTitle(entry), saved = isSaved(entry.resource), compared = isCompared?.(entry.resource) === true
    return <div className="flex items-center gap-1"><Button type="button" variant="ghost" size="icon-sm" aria-label={`${saved ? 'Unsave' : 'Save'} ${title}`} aria-pressed={saved} onClick={() => onSave(item(entry))}><HeartIcon className={cn(saved && 'fill-current')} /></Button>{onCompare === undefined ? null : <Button type="button" variant="ghost" size="icon-sm" aria-label={`${compared ? 'Remove' : 'Add'} ${title} ${compared ? 'from' : 'to'} comparison`} aria-pressed={compared} disabled={compareDisabled === true && !compared} onClick={() => onCompare(item(entry))}>{compared ? <CheckIcon /> : <PlusIcon />}</Button>}</div>
  }
  function identity(entry: X402DirectoryEntry) {
    return <div className="flex min-w-0 items-start gap-3"><DirectoryToolIdentity entry={entry} className="size-10 shrink-0" /><div className="min-w-0 flex flex-col gap-1.5"><button type="button" aria-label={`View Tool: ${directoryTitle(entry)}`} onClick={() => onSelect(item(entry))} className="line-clamp-2 max-w-full rounded-sm text-left text-sm leading-snug font-semibold text-foreground underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring">{directoryTitle(entry)}</button><p className="truncate text-xs text-muted-foreground" title={entry.provider}>{entry.provider}</p>{entry.category === undefined ? null : <Badge variant="secondary" className="max-w-full truncate text-[0.65rem] font-normal">{entry.category}</Badge>}</div></div>
  }
  const columns: ColumnDef<X402DirectoryEntry>[] = [
    { id: 'tool', header: 'Tool / Provider', cell: ({ row }) => identity(row.original), enableHiding: false },
    { id: 'price', header: 'Provider price', cell: ({ row }) => {
      const price = priceFacts(row.original, sourceInput.network)
      return <div><p className="text-xs font-medium tabular-nums">{price.price}</p><p className="mt-1 text-[0.6875rem] text-muted-foreground">{price.network ?? 'Per Call'}{price.count > 1 ? ` · ${price.count} options` : ''}</p></div>
    } },
    { id: 'payers', header: () => <Tooltip><TooltipTrigger asChild><button type="button" className="inline-flex items-center gap-1 text-left" aria-label="Payers in 30 days: metric explanation">Payers · 30d<InfoIcon className="size-3" /></button></TooltipTrigger><TooltipContent className="max-w-64 text-xs leading-relaxed">{payerExplanation}</TooltipContent></Tooltip>, cell: ({ row }) => <Payers entry={row.original} /> },
    { id: 'details', header: 'Published details', cell: ({ row }) => <RequestDetails entry={row.original} /> },
    { id: 'updated', header: 'Updated', cell: ({ row }) => row.original.provenance?.updatedAt === undefined ? <span className="text-xs text-muted-foreground">Not reported</span> : <time className="text-xs text-muted-foreground" dateTime={row.original.provenance.updatedAt}>{directoryDate(row.original.provenance.updatedAt)}</time> },
    { id: 'calls', header: 'Calls · 30d', cell: ({ row }) => row.original.activity?.calls30d === undefined ? <span className="text-xs text-muted-foreground">Not reported</span> : <span className="text-xs tabular-nums" title={`${row.original.activity.calls30d.toLocaleString('en-AU')} Calls in the last 30 days`}>{directoryCount(row.original.activity.calls30d)}</span> },
    { id: 'actions', header: () => <span className="sr-only">Save and compare</span>, cell: ({ row }) => actions(row.original), enableHiding: false },
  ]
  const table = useReactTable({ data, columns, getRowId: entry => entry.resource, getCoreRowModel: getCoreRowModel(), manualFiltering: true, manualSorting: true, manualPagination: true, state: { columnVisibility }, onColumnVisibilityChange: setColumnVisibility })
  if (entries.length === 0) return <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">No Tools on this page. Adjust the filters or continue to the next page.</p>
  return <TooltipProvider><div className="flex flex-col gap-3">
    <div className="hidden items-center justify-between gap-4 md:flex"><p className="text-xs text-muted-foreground">Published prices per Call · source activity over 30 days</p><Label className="text-xs font-normal"><Checkbox checked={table.getColumn('calls')?.getIsVisible() === true} onCheckedChange={checked => table.getColumn('calls')?.toggleVisibility(checked === true)} />Show Calls</Label></div>
    <div className="hidden overflow-hidden rounded-xl border md:block"><Table aria-label="Tool comparison table" className="min-w-[620px] table-fixed"><TableHeader className="bg-muted/40">{table.getHeaderGroups().map(group => <TableRow key={group.id}>{group.headers.map(header => <TableHead key={header.id} className={cn('px-3 text-[0.625rem] whitespace-normal', header.column.id === 'tool' ? 'w-[31%]' : header.column.id === 'actions' ? 'w-20' : header.column.id === 'price' ? 'w-[16%]' : '')}>{flexRender(header.column.columnDef.header, header.getContext())}</TableHead>)}</TableRow>)}</TableHeader><TableBody>{table.getRowModel().rows.map(row => <TableRow key={row.id} data-state={isCompared?.(row.original.resource) ? 'selected' : undefined}>{row.getVisibleCells().map(cell => <TableCell key={cell.id} className="px-3 py-4 align-top break-words whitespace-normal">{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>)}</TableRow>)}</TableBody></Table></div>
    <ul aria-label="Tools" className="divide-y rounded-xl border md:hidden">{entries.map(entry => {
      const price = priceFacts(entry, sourceInput.network)
      return <li key={entry.resource} className="flex flex-col gap-4 p-4"><div className="flex items-start justify-between gap-2"><div className="min-w-0">{identity(entry)}</div>{actions(entry)}</div><p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">{entry.description}</p><div className="grid grid-cols-2 gap-4"><div><p className="text-[0.6875rem] text-muted-foreground">Provider price · per Call</p><p className="mt-1 break-words text-sm font-medium tabular-nums">{price.price}</p><p className="mt-1 text-xs text-muted-foreground">{price.network}</p></div><div><p className="text-[0.6875rem] text-muted-foreground" title={payerExplanation}>Paying addresses · 30 days</p><p className="mt-1"><Payers entry={entry} /></p><p className="mt-1"><RequestDetails entry={entry} /></p></div></div></li>
    })}</ul>
  </div></TooltipProvider>
}
