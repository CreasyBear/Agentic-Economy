import { AeComparisonTable } from '@/components/ae/shared/comparison-table/AeComparisonTable'
import type { ComparisonTableProps } from './generative.contracts'

export function ComparisonTable({ view }: ComparisonTableProps) {
  if (view.options.length < 2) return null
  const rows = view.rows.filter((row) => row.label !== 'Best for' || view.options.every((option) => row.cells[option.id]?.source))
  return (
    <section aria-label="Compare details" className="arc-market arc-chat min-w-0">
      <AeComparisonTable title="Compare details" description="Compare the reported facts and their sources before choosing."
        columns={view.options.map(option => ({ id: option.id, name: option.name, caption: option.seller?.name ?? option.host ?? '', action: <a href={option.href}>Inspect option</a> }))}
        sections={[{ id: 'details', title: 'Reported facts', rows: rows.map(row => ({ id: row.label, feature: row.label,
          values: Object.fromEntries(view.options.map(option => [option.id, row.cells[option.id]?.value ?? 'Not provided'])),
          sources: Object.fromEntries(view.options.flatMap(option => {
            const source = row.cells[option.id]?.source
            return source === undefined ? [] : [[option.id, source]]
          })),
          retainWhenSame: row.label === 'Price' || row.label === 'Readiness',
        })) }]} />
    </section>
  )
}
