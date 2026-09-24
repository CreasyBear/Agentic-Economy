import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { ComparisonTableProps } from './generative.contracts'

export function ComparisonTable({ view }: ComparisonTableProps) {
  if (view.options.length < 2) return null
  const rows = view.rows.filter((row) => row.label !== 'Best for' || view.options.every((option) => row.cells[option.id]?.source))
  return (
    <section aria-label="Compare details" className="min-w-0">
      <h3 className="mb-3 text-base font-semibold">Compare details</h3>
      <Table className="min-w-max text-sm tabular-nums" containerClassName="min-w-0">
        <TableHeader>
          <TableRow className="border-border/50 hover:bg-transparent">
            <TableHead scope="col" className="sticky left-0 z-10 min-w-28 bg-background font-sans text-[0.8125rem] normal-case tracking-normal">Detail</TableHead>
            {view.options.map((option) => <TableHead key={option.id} scope="col" className="min-w-40 max-w-56 font-sans text-[0.8125rem] normal-case tracking-normal whitespace-normal"><a href={option.href} className="font-medium underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring">{option.name}</a></TableHead>)}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => <TableRow key={row.label} className="border-border/50 hover:bg-muted/40">
            <TableHead scope="row" className="sticky left-0 z-10 min-w-28 bg-background font-sans text-[0.8125rem] normal-case tracking-normal whitespace-normal">{row.label}</TableHead>
            {view.options.map((option) => <TableCell key={option.id} className="min-w-40 max-w-56 whitespace-normal break-words">{row.cells[option.id]?.value ?? 'Not provided'}{row.cells[option.id]?.source ? <small className="block text-muted-foreground">{row.cells[option.id]!.source}</small> : null}</TableCell>)}
          </TableRow>)}
        </TableBody>
      </Table>
    </section>
  )
}
