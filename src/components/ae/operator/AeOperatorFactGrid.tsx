export type AeOperatorFact = {
  label: string
  value: string | number
}

export type AeOperatorFactGridProps = {
  facts: readonly AeOperatorFact[]
  columns?: 2 | 3 | 4
}

export function AeOperatorFactGrid({ facts, columns = 3 }: AeOperatorFactGridProps) {
  const columnClass =
    columns === 4
      ? 'md:grid-cols-4'
      : columns === 2
        ? 'sm:grid-cols-2'
        : 'md:grid-cols-3'

  return (
    <dl className={`grid gap-3 ${columnClass}`}>
      {facts.map((fact) => (
        <div key={fact.label} className="rounded-md border border-border bg-muted/30 p-3">
          <dt className="text-xs font-medium uppercase tracking-normal text-secondary">{fact.label}</dt>
          <dd className="mt-1 break-words text-sm font-medium text-primary" data-numeric>
            {fact.value}
          </dd>
        </div>
      ))}
    </dl>
  )
}
