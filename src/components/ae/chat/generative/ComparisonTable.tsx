import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { ComparisonTableProps } from './generative.contracts'

export function ComparisonTable({ view }: ComparisonTableProps) {
  if (view.options.length < 2) return null
  const rows = view.rows.filter((row) => row.label !== 'Best for' || view.options.every((option) => row.cells[option.id]?.source))
  const pairs = Array.from({ length: Math.ceil(view.options.length / 2) }, (_, index) => view.options.slice(index * 2, index * 2 + 2))
  return (
    <section aria-label="Compare details" className="min-w-0">
      <h3 className="mb-3 text-base font-semibold">Compare details</h3>
      <div className="grid min-w-0 gap-4 md:hidden">
        {pairs.map((pair) => (
          <div key={pair[0]!.id} className="min-w-0 rounded-card border border-border p-3">
            <div className="grid grid-cols-2 gap-2 border-b border-border pb-3">
              {pair.map((option) => <a key={option.id} href={option.href} className="min-w-0 break-words font-medium underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring">{option.name}</a>)}
            </div>
            {rows.map((row) => (
              <div key={row.label} className="border-b border-border py-3 last:border-b-0">
                <p className="mb-1 text-xs font-medium text-muted-foreground">{row.label}</p>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  {pair.map((option) => <div key={option.id} className="min-w-0 break-words">
                    {row.cells[option.id]?.value ?? 'Not provided'}
                    {row.cells[option.id]?.source ? <small className="block text-muted-foreground">{row.cells[option.id]!.source}</small> : null}
                  </div>)}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
      <Table containerClassName="hidden md:block min-w-0">
        <TableHeader><TableRow><TableHead scope="col">Detail</TableHead>{view.options.map((option) => <TableHead key={option.id} scope="col"><a href={option.href} className="font-medium underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring">{option.name}</a></TableHead>)}</TableRow></TableHeader>
        <TableBody>{rows.map((row) => <TableRow key={row.label}><TableHead scope="row" className="whitespace-normal">{row.label}</TableHead>{view.options.map((option) => <TableCell key={option.id} className="min-w-32 max-w-56 whitespace-normal break-words">{row.cells[option.id]?.value ?? 'Not provided'}{row.cells[option.id]?.source ? <small className="block text-muted-foreground">{row.cells[option.id]!.source}</small> : null}</TableCell>)}</TableRow>)}</TableBody>
      </Table>
    </section>
  )
}
