import { useId, useState, type ReactNode } from 'react'
import { Badge } from '@astryxdesign/core/Badge'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { Divider } from '@astryxdesign/core/Divider'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { Heading, Text } from '@astryxdesign/core/Text'
import {
  BanknoteIcon,
  BotIcon,
  CalendarClockIcon,
  Code2Icon,
  Globe2Icon,
  MapPinIcon,
  MessageSquareTextIcon,
  PhoneIcon,
} from 'lucide-react'

import type { PublicOfferingSupplyProjection } from '@/modules/catalog/public'
import {
  comparisonSelectionId,
  type ExactOfferingReference,
} from '@/modules/comparison/public'
import { offeringSupportCopy, presentOfferingAccessPath } from './offering-presentation'

export type AeOfferingSupplyListProps = Readonly<{
  offerings: readonly PublicOfferingSupplyProjection[]
  disposition?: 'current' | 'partial' | 'stale'
  observedAt?: number
  business?: Readonly<{ businessId: string; name: string; slug: string }>
  selectedSelectionIds?: readonly string[]
  onToggleComparison?: (input: Readonly<{
    selectionId: string
    reference: ExactOfferingReference
    selected: boolean
  }>) => void
}>

export function AeOfferingSupplyList({
  offerings,
  disposition = 'current',
  observedAt,
  business,
  selectedSelectionIds = [],
  onToggleComparison,
}: AeOfferingSupplyListProps) {
  const selectionFull = selectedSelectionIds.length >= 4
  return (
    <section aria-labelledby="business-offerings-title" className="grid gap-5">
      <div className="flex flex-col gap-3 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="grid gap-1">
          <Text type="supporting" weight="semibold" color="secondary" display="block">SERVICES AND PRODUCTS</Text>
          <Heading id="business-offerings-title" level={2}>What this business offers</Heading>
          <Text as="p" type="supporting" color="secondary">
            Open an Offering to see what it includes and the clearest way to begin.
          </Text>
        </div>
        {offerings.length === 0 ? null : <Badge label={`${offerings.length} published`} variant="neutral" />}
      </div>

      {disposition === 'current' ? null : (
        <Card padding={4} className="border border-border bg-muted/40" role="status">
          <Text weight="semibold" color="primary" display="block">
            {disposition === 'partial' ? 'Some published details are still updating' : 'These are the last safely published details'}
          </Text>
          <Text type="supporting" color="secondary" display="block">
            {observedAt === undefined ? 'Check back before relying on availability.' : `Last updated ${new Date(observedAt).toLocaleDateString('en-AU')}.`}
          </Text>
        </Card>
      )}

      {offerings.length === 0 ? (
        <Card padding={5}>
          <VStack gap={2}>
            <Text weight="semibold" color="primary" display="block">No offerings are published yet</Text>
            <Text color="secondary" display="block">
              The business page remains available while the business prepares what it offers.
            </Text>
          </VStack>
        </Card>
      ) : (
        <div className="grid gap-4">
          {offerings.map((offering) => {
            const selectionId = business === undefined
              ? undefined
              : offeringSelectionId(business.businessId, offering, observedAt)
            return (
              <OfferingCard
                key={offering.offering.offeringRef}
                offering={offering}
                selected={selectionId !== undefined && selectedSelectionIds.includes(selectionId)}
                selectionFull={selectionFull}
                {...(business === undefined ? {} : { business })}
                {...(selectionId === undefined ? {} : { selectionId })}
                {...(observedAt === undefined ? {} : { observedAt })}
                {...(onToggleComparison === undefined ? {} : { onToggleComparison })}
              />
            )
          })}
          {selectionFull && onToggleComparison !== undefined ? (
            <Text type="supporting" color="secondary">
              Comparison list full — remove one to add another.
            </Text>
          ) : null}
        </div>
      )}
    </section>
  )
}

function OfferingCard({
  offering,
  business,
  selectionId,
  observedAt,
  selected,
  selectionFull,
  onToggleComparison,
}: {
  offering: PublicOfferingSupplyProjection
  business?: Readonly<{ businessId: string; name: string; slug: string }>
  selectionId?: string
  observedAt?: number
  selected: boolean
  selectionFull: boolean
  onToggleComparison?: AeOfferingSupplyListProps['onToggleComparison']
}) {
  const support = offeringSupportCopy(offering.support)
  const cardObservedAt = observedAt ?? offering.support.observedAt
  return (
    <Card padding={0} className="grid min-w-0 overflow-hidden border border-border shadow-low" aria-labelledby={`offering-${offering.offering.offeringRef}`}>
      <div className="h-1.5 bg-accent" aria-hidden="true" />
      <div className="grid gap-5 p-5 sm:p-6">
      <div className="grid gap-2">
        <Text type="supporting" weight="semibold" color="secondary" display="block">{offering.offering.category.toUpperCase()}</Text>
        <HStack gap={2} vAlign="center" wrap="wrap">
          <Heading id={`offering-${offering.offering.offeringRef}`} level={3}>{offering.offering.name}</Heading>
        </HStack>
        <Text color="primary" display="block" className="max-w-3xl text-pretty text-base leading-relaxed">{offering.offering.summary}</Text>
        <Text type="supporting" color="secondary" display="block">
          Revision {offering.offering.revision}
          {cardObservedAt === undefined ? null : ` · Observed ${formatDate(cardObservedAt)}`}
        </Text>
        <dl className="grid gap-2 pt-2 text-sm sm:grid-cols-3">
          <OptionalFact icon={<MapPinIcon aria-hidden="true" />} label="Service area" value={offering.offering.serviceAreaSummary ?? 'Not supplied'} />
          <OptionalFact icon={<CalendarClockIcon aria-hidden="true" />} label="Availability" value={offering.offering.availabilitySummary ?? 'Not supplied'} />
          <OptionalFact icon={<BanknoteIcon aria-hidden="true" />} label="Pricing" value={offering.offering.pricingSummary ?? 'Not supplied'} />
        </dl>
        {business === undefined ? null : (
          <div className="flex flex-wrap gap-2 pt-2">
            <Button
              href={`/${encodeURIComponent(business.slug)}/offerings/${encodeURIComponent(offering.offering.offeringRef)}`}
              label="View Offering"
              variant="secondary"
              className="min-h-11"
            />
            {onToggleComparison === undefined || selectionId === undefined ? null : (
              <button
                type="button"
                aria-pressed={selected}
                disabled={!selected && selectionFull}
                className="min-h-11 rounded-md border border-border px-4 font-semibold text-primary focus-visible:outline-2 focus-visible:outline-offset-4 disabled:cursor-not-allowed disabled:opacity-60"
                onClick={() => onToggleComparison({
                  selectionId,
                  reference: {
                    businessId: business.businessId,
                    offeringRef: offering.offering.offeringRef,
                    offeringRevision: offering.offering.revision,
                  },
                  selected: !selected,
                })}
              >
                {selected ? `Remove ${offering.offering.name} from comparison` : `Add ${offering.offering.name} to comparison`}
              </button>
            )}
          </div>
        )}
        {!selected && selectionFull ? (
          <Text type="supporting" color="secondary">Comparison list full — remove one to add another.</Text>
        ) : null}
      </div>

      <Divider />
      <div className="grid gap-3">
        <Text as="div" role="heading" aria-level={4} weight="semibold" color="primary" display="block">Ways to get started</Text>
        {offering.accessPaths.length === 0 ? (
          <Text color="secondary" display="block">No way to get started has been published for this offering.</Text>
        ) : (
          <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2">
            {offering.accessPaths.map((path) => <AccessPathItem key={path.accessPathRef} path={path} />)}
          </ul>
        )}
      </div>

      {support === undefined ? null : (
        <div className="flex gap-3 rounded-lg border border-border-emphasized bg-muted/60 p-4">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-on-accent"><BotIcon className="size-4" aria-hidden="true" /></span>
          <div className="grid gap-0.5">
            <Text weight="semibold" color="primary" display="block">{support.label}</Text>
            <Text type="supporting" color="secondary" display="block">{support.detail}</Text>
          </div>
        </div>
      )}
      </div>
    </Card>
  )
}

function offeringSelectionId(
  businessId: string,
  offering: PublicOfferingSupplyProjection,
  observedAt?: number,
): string {
  return comparisonSelectionId({
    businessId,
    offeringRef: offering.offering.offeringRef,
    offeringRevision: offering.offering.revision,
    projectionObservedAt: observedAt ?? offering.support.observedAt ?? 0,
  })
}

function OptionalFact({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return <div className="grid gap-2 rounded-lg bg-muted/45 p-3"><dt className="flex items-center gap-2 font-medium text-secondary"><span className="text-accent [&>svg]:size-4">{icon}</span>{label}</dt><dd className="m-0 break-words text-primary">{value}</dd></div>
}

function AccessPathItem({ path }: { path: PublicOfferingSupplyProjection['accessPaths'][number] }) {
  const detailsId = useId()
  const [expanded, setExpanded] = useState(false)
  const presentation = presentOfferingAccessPath(path)
  return (
    <li className="group grid min-w-0 content-start gap-3 rounded-lg border border-border bg-card p-4 transition-[border-color,box-shadow,transform] duration-base ease-standard motion-reduce:transition-none hover:border-border-emphasized hover:shadow-low">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-accent">{accessIcon(path.descriptor.kind === 'external_operation' ? 'external_operation' : path.descriptor.channel)}</span>
        <div className="grid min-w-0 gap-1">
          <HStack gap={2} vAlign="center" wrap="wrap">
            <Text weight="semibold" color="primary">{presentation.label}</Text>
        {presentation.provenance === undefined ? null : <Badge label={presentation.provenance} variant="neutral" />}
          </HStack>
          <Text type="supporting" color="secondary" display="block">{presentation.detail}</Text>
        </div>
      </div>
      {presentation.href === undefined ? null : (
        <Button href={presentation.href} label={presentation.external ? 'View published details' : presentation.label} variant="secondary" size="sm" className="min-h-11 w-full sm:w-auto" />
      )}
      {presentation.technical === undefined ? null : (
        <div className="grid gap-2">
          <button
            type="button"
            className="min-h-11 justify-self-start text-sm font-semibold text-primary underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2"
            aria-expanded={expanded}
            aria-controls={detailsId}
            onClick={() => setExpanded((current) => !current)}
          >
            {expanded ? 'Hide technical details' : 'Show technical details'}
          </button>
          {expanded ? (
            <dl id={detailsId} className="grid min-w-0 gap-2 text-sm">
              {presentation.technical.map((fact) => (
                <div key={fact.label} className="grid min-w-0 gap-1">
                  <dt className="text-secondary">{fact.label}</dt>
                  <dd className="m-0 break-all text-primary">{fact.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </div>
      )}
    </li>
  )
}

function accessIcon(kind: 'phone' | 'website' | 'ae_inquiry' | 'external_operation') {
  if (kind === 'phone') return <PhoneIcon className="size-4" aria-hidden="true" />
  if (kind === 'website') return <Globe2Icon className="size-4" aria-hidden="true" />
  if (kind === 'ae_inquiry') return <MessageSquareTextIcon className="size-4" aria-hidden="true" />
  return <Code2Icon className="size-4" aria-hidden="true" />
}

function formatDate(timestamp: number): string {
  return new Intl.DateTimeFormat('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(timestamp))
}
