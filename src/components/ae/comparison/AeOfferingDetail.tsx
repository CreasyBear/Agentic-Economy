import { Card } from '@astryxdesign/core/Card'
import { Heading, Text } from '@astryxdesign/core/Text'

import {
  projectComparisonProfile,
  type ComparisonCell,
  type ResolvedComparisonSelection,
} from '@/modules/comparison/public'

export type AeOfferingDetailProps = Readonly<{
  selection: ResolvedComparisonSelection
  selected: boolean
  onToggle: () => void
  selectionDisabled?: boolean
}>

export function AeOfferingDetail({
  selection,
  selected,
  onToggle,
  selectionDisabled = false,
}: AeOfferingDetailProps) {
  const projected = selection.offering.comparison === undefined
    ? undefined
    : projectComparisonProfile(selection.offering.comparison, selection.resolvedAt)
  const facts = projected?.kind === 'projected'
    ? projected.dimensions.map((fact) => ({
        id: fact.dimensionId,
        label: dimensionLabel(fact.dimensionId),
        cell: fact.cell,
      }))
    : []

  return (
    <article className="grid gap-6" aria-labelledby="offering-detail-heading">
      <header className="grid gap-3">
        <Text type="supporting" color="secondary">{selection.offering.category}</Text>
        <Heading id="offering-detail-heading" level={1}>{selection.offering.name}</Heading>
        <Text>Offered by {selection.business.name}</Text>
        <Text color="secondary">{selection.offering.summary}</Text>
        <Text type="supporting" color="secondary">
          Revision {selection.offering.revision}
        </Text>
        <time
          className="text-sm text-secondary"
          dateTime={new Date(selection.publication.publishedAt).toISOString()}
        >
          Observed {formatDate(selection.publication.publishedAt)}
        </time>
        <button
          type="button"
          aria-pressed={selected}
          disabled={selectionDisabled}
          onClick={onToggle}
          className="min-h-11 justify-self-start rounded-md border border-border px-4 font-semibold focus-visible:outline-2 focus-visible:outline-offset-4"
        >
          {selected ? 'Remove' : 'Add'} {selection.offering.name} {selected ? 'from' : 'to'} comparison
        </button>
      </header>
      <Card padding={4} className="grid gap-4 border border-border">
        <Heading level={2}>What is included</Heading>
        {facts.length === 0 ? (
          <Text color="secondary">Not supplied</Text>
        ) : (
          <dl className="grid gap-3">
            {facts.map((fact) => (
              <div key={fact.id} className="grid gap-1 border-b border-border pb-3 last:border-0">
                <dt className="font-semibold text-primary">{fact.label}</dt>
                <dd className="m-0 text-secondary">{formatCell(fact.cell)}</dd>
              </div>
            ))}
          </dl>
        )}
      </Card>
      <Card padding={4} className="grid gap-2 border border-border">
        <Heading level={2}>Where these details came from</Heading>
        <Text color="secondary">Published by the business</Text>
        <Text color="secondary">
          {selection.projectionDisposition === 'current' ? 'Current when resolved' : 'Some details may be out of date'}
        </Text>
      </Card>
      <Card padding={4} className="grid gap-2 border border-border">
        <Heading level={2}>Revision information</Heading>
        <Text>Revision {selection.offering.revision}</Text>
        {selection.newerCurrentReference === undefined ? null : (
          <Text color="secondary">A newer version is available. Review it before replacing this selection.</Text>
        )}
      </Card>
    </article>
  )
}

function formatCell(cell: ComparisonCell): string {
  if (cell.kind === 'unknown') return 'Not known'
  if (cell.kind === 'not_supplied') return 'Not supplied'
  if (cell.kind === 'stale') return 'Out of date'
  if (cell.kind === 'not_comparable') return 'Not comparable'
  if (typeof cell.value === 'object') return cell.value.description
  return String(cell.value)
}

function dimensionLabel(id: string): string {
  return id.split(':').at(-1)?.replaceAll('_', ' ') ?? id
}

function formatDate(timestamp: number): string {
  return new Intl.DateTimeFormat('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(timestamp))
}
