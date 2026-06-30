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
    <dl className={`ae-operator-fact-grid grid gap-3 ${columnClass}`}>
      {facts.map((fact) => (
        <div key={fact.label} className="ae-operator-stat-cell">
          <dt className="text-xs font-medium uppercase tracking-normal text-muted-foreground">{fact.label}</dt>
          <dd className="mt-1 break-words text-sm font-medium text-foreground" data-numeric>
            {fact.value}
          </dd>
        </div>
      ))}
    </dl>
  )
}
