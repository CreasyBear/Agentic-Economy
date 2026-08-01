import { Card, CardContent, CardHeader } from '@/components/ui/card'

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
        <Card key={fact.label} className="gap-2 py-4">
          <CardHeader className="gap-1 px-4">
            <dt className="text-xs font-medium uppercase tracking-normal text-muted-foreground">{fact.label}</dt>
          </CardHeader>
          <CardContent className="px-4">
            <dd className="break-words text-sm font-medium text-foreground" data-numeric>
              {fact.value}
            </dd>
          </CardContent>
        </Card>
      ))}
    </dl>
  )
}
