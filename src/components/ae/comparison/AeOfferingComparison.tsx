import { Card } from '@astryxdesign/core/Card'
import { Heading, Text } from '@astryxdesign/core/Text'
import { comparisonSelectionId } from '@/modules/comparison/public'

import type {
  ComparisonCell,
  ComparisonDecisionBrief,
  ComparisonPresentationPlan,
  OfferingComparisonResult,
} from '@/modules/comparison/public'

export type AeOfferingComparisonProps = Readonly<{
  comparison: OfferingComparisonResult
  brief: ComparisonDecisionBrief
  presentation?: ComparisonPresentationPlan
}>

export function AeOfferingComparison({
  comparison,
  brief,
  presentation = {
    mode: 'answer_first',
    density: 'comfortable',
    responsiveComposition: 'answer_then_evidence',
    emphasisIds: [],
  },
}: AeOfferingComparisonProps) {
  const compact = presentation.density === 'concise'
  const guided = presentation.responsiveComposition === 'guided_sections'
  const foreground = new Set(brief.foregroundableFactIds)
  const foregroundRows = comparison.rows.filter((row) => (
    row.cells.some((cell) => foreground.has(cell.factId))
  ))

  return (
    <section
      className={`grid ${compact ? 'gap-4' : guided ? 'gap-8' : 'gap-6'}`}
      aria-labelledby="comparison-result-heading"
      data-presentation-mode={presentation.mode}
      data-presentation-density={presentation.density}
      data-responsive-composition={presentation.responsiveComposition}
    >
      <Card padding={5} className="grid gap-3 border border-border">
        <Heading id="comparison-result-heading" level={2}>
          {comparison.ordering.kind === 'ordered' ? 'Ordered by your priorities' : 'Not ranked'}
        </Heading>
        <Text color="secondary">
          {orderingCopy(comparison)}
        </Text>
        {foregroundRows.length === 0 ? null : (
          <dl className="grid gap-3">
            {foregroundRows.map((row) => (
              <div
                key={row.dimensionId}
                className={`grid gap-2 ${row.cells.some((cell) => presentation.emphasisIds.includes(cell.factId)) ? 'rounded-md ring-2 ring-border p-2' : ''}`}
              >
                <dt className="font-semibold text-primary">{dimensionLabel(row.dimensionId)}</dt>
                {row.cells.map((cell, index) => (
                  <dd key={cell.factId} className="m-0 text-secondary">
                    {comparison.selections[index]?.offering.name ?? 'Offering'}: {formatCell(cell.cell)}
                  </dd>
                ))}
              </div>
            ))}
          </dl>
        )}
      </Card>

      {brief.mandatoryCaveatIds.length === 0 ? null : (
        <Card
          padding={4}
          className="grid gap-2 border border-border"
          role="region"
          aria-label="Important comparison notes"
        >
          {brief.mandatoryCaveatIds.map((caveat) => (
            <Text
              key={caveat}
              type="supporting"
              color="secondary"
              className={presentation.emphasisIds.includes(caveat) ? 'font-semibold text-primary' : undefined}
            >
              {caveatCopy(caveat)}
            </Text>
          ))}
        </Card>
      )}

      <details className="rounded-lg border border-border bg-card p-4">
        <summary className="min-h-11 cursor-pointer py-2 font-semibold text-primary focus-visible:outline-2 focus-visible:outline-offset-4">
          See full comparison
        </summary>
        <div className="mt-4">
          <div className="mb-5 grid gap-3 md:grid-cols-2">
            {comparison.selections.map((selection) => (
              <section
                key={comparisonSelectionId(selection.selection)}
                id={`selected-evidence-${comparisonSelectionId(selection.selection)}`}
                tabIndex={-1}
                className="grid gap-1 rounded-md border border-border p-3 focus-visible:outline-2 focus-visible:outline-offset-4"
                aria-label={`Selected evidence for ${selection.offering.name}`}
              >
                <Heading level={3}>{selection.offering.name}</Heading>
                <Text type="supporting" color="secondary">
                  {selection.business.name} · Revision {selection.offering.revision}
                </Text>
                <Text type="supporting" color="secondary">
                  Published by the business · Observed {formatObservedDate(selection.publication.publishedAt)}
                </Text>
                <Text type="supporting" color="secondary">
                  {selection.projectionDisposition === 'current'
                    ? 'Current when resolved'
                    : selection.projectionDisposition === 'stale'
                      ? 'Out of date when resolved'
                      : 'Some published details were still updating'}
                </Text>
              </section>
            ))}
          </div>
          <div className="hidden overflow-x-auto md:block">
          <table
            className="hidden w-full border-collapse text-left md:table"
            data-comparison-projection="desktop"
          >
            <caption className="sr-only">
              Published facts from the exact Offering revisions selected
            </caption>
            <thead>
              <tr>
                <th scope="col" className="border-b border-border p-3">Published fact</th>
                {comparison.selections.map((selection) => (
                  <th
                    key={`${selection.business.businessId}:${selection.offering.offeringRef}:${selection.offering.revision}`}
                    scope="col"
                    className="border-b border-border p-3"
                  >
                    {selection.offering.name}
                    <span className="block text-sm font-normal text-secondary">
                      {selection.business.name} · Revision {selection.offering.revision}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {comparison.rows.map((row) => (
                <tr key={row.dimensionId}>
                  <th scope="row" className="border-b border-border p-3">
                    {dimensionLabel(row.dimensionId)}
                  </th>
                  {row.cells.map((cell) => (
                    <td
                      key={cell.factId}
                      className="border-b border-border p-3 text-secondary"
                      data-fact-id={cell.factId}
                    >
                      {formatEvidenceCell(cell.cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          <dl
            className="grid gap-4 md:hidden"
            data-comparison-projection="mobile"
            aria-label="Published facts from the exact Offering revisions selected"
          >
            {comparison.rows.flatMap((row) => (
              row.cells.map((cell, index) => (
                <div key={cell.factId} className="grid gap-1 border-b border-border pb-4">
                  <dt className="font-semibold text-primary">
                    {comparison.selections[index]?.offering.name ?? 'Offering'} · {dimensionLabel(row.dimensionId)}
                  </dt>
                  <dd
                    className="m-0 text-secondary"
                    data-fact-id={cell.factId}
                  >
                    {formatEvidenceCell(cell.cell)}
                  </dd>
                </div>
              ))
            ))}
          </dl>
        </div>
      </details>
    </section>
  )
}

function orderingCopy(comparison: OfferingComparisonResult): string {
  if (comparison.ordering.kind === 'ordered') {
    return 'The order uses only the priorities you selected and the first comparable published difference.'
  }
  switch (comparison.ordering.reason) {
    case 'insufficient_selections':
      return 'Add one more Offering to compare.'
    case 'no_priority':
      return 'Choose priorities if you want an evidence-based order. Otherwise, compare the differences side by side.'
    case 'tie':
      return 'These Offerings are tied on your stated priorities.'
    case 'missing_material_fact':
      return 'A material fact is not known or was not supplied for every Offering.'
    case 'stale_fact':
      return 'A fact needed for ordering is out of date.'
    case 'not_comparable':
      return 'The selected fact cannot be compared for every Offering.'
    case 'partial_projection':
      return 'Some published details are still updating.'
    case 'unavailable_selection':
      return 'One or more selected Offering versions are no longer available to compare.'
  }
}

function caveatCopy(caveat: ComparisonDecisionBrief['mandatoryCaveatIds'][number]): string {
  switch (caveat) {
    case 'caveat:insufficient_selections': return 'At least two Offerings are needed for a comparison.'
    case 'caveat:no_priority': return 'No priority order has been applied.'
    case 'caveat:missing_fact': return 'A material fact is not known or was not supplied.'
    case 'caveat:stale_fact': return 'At least one material fact is out of date.'
    case 'caveat:not_comparable': return 'At least one profile-specific fact is not comparable.'
    case 'caveat:partial_projection': return 'Some safely published details may still be updating.'
    case 'caveat:unavailable_selection':
    case 'caveat:selection_refused': return 'A selected Offering version is not available to compare.'
    case 'caveat:tie': return 'The selected priorities do not produce a unique order.'
    case 'caveat:newer_revision': return 'A newer revision exists. The selected revision has not been replaced.'
    case 'caveat:published_information': return 'This comparison uses published information and does not contact a business or run an endpoint.'
  }
}

function formatCell(cell: ComparisonCell): string {
  if (cell.kind === 'unknown') return 'Not known'
  if (cell.kind === 'not_supplied') return 'Not supplied'
  if (cell.kind === 'stale') {
    return cell.lastKnown === undefined
      ? 'Out of date'
      : `Out of date · ${formatKnownValue(cell.lastKnown)}`
  }
  if (cell.kind === 'not_comparable') return 'Not comparable'
  return formatKnownValue(cell.value)
}

function formatKnownValue(value: string | number | { description: string }): string {
  return typeof value === 'object' ? value.description : String(value)
}

function formatEvidenceCell(cell: ComparisonCell): string {
  if (cell.kind === 'not_comparable') {
    return 'Not comparable · Source: Not comparable · Observed: Not established · Currentness: Not established'
  }
  const source = sourceLabel(cell.source)
  const observed = formatObservedDate(cell.observedAt)
  if (cell.kind === 'unknown') {
    return `Not known · Source: ${source} · Observed: ${observed} · Currentness: Not established`
  }
  if (cell.kind === 'not_supplied') {
    return `Not supplied · Source: ${source} · Observed: ${observed} · Currentness: Not established`
  }
  if (cell.kind === 'stale') {
    const value = cell.lastKnown === undefined
      ? 'Out of date'
      : `Out of date · ${formatKnownValue(cell.lastKnown)}`
    return `${value} · Source: ${source} · Observed: ${observed} · Currentness: Out of date`
  }
  return `${formatKnownValue(cell.value)} · Source: ${source} · Observed: ${observed} · Currentness: Current when resolved`
}

function sourceLabel(source: Exclude<ComparisonCell, { kind: 'not_comparable' }>['source']): string {
  switch (source.kind) {
    case 'business_supplied': return 'Published by the business'
    case 'publicly_observed': return 'Publicly observed'
    case 'ae_support': return 'Supported by AE evidence'
  }
}

function formatObservedDate(observedAt: number): string {
  return new Intl.DateTimeFormat('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(observedAt))
}

function dimensionLabel(id: string): string {
  const labels: Readonly<Record<string, string>> = {
    'common:business_name': 'Business',
    'common:offering_name': 'Offering',
    'common:offering_revision': 'Offering revision',
    'professional_service:v1:scope_basis': 'Scope',
    'professional_service:v1:price_basis': 'Price',
    'professional_service:v1:timing_basis': 'Timing',
    'professional_service:v1:service_area': 'Service area',
    'machine_data:v1:interface_format': 'Interface',
    'machine_data:v1:request_method': 'Request method',
    'machine_data:v1:authentication': 'Access',
    'machine_data:v1:price_basis': 'Price',
    'machine_data:v1:freshness_or_update_cadence': 'Update cadence',
  }
  return labels[id] ?? 'Published fact'
}
