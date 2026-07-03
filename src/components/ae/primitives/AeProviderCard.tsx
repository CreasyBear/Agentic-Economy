import { Badge } from '@astryxdesign/core/Badge'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { Text } from '@astryxdesign/core/Text'
import { Token } from '@astryxdesign/core/Token'

import { AeStatusBadge } from '@/components/ae/status/AeStatusBadge'
import { buildProviderPresentation, pillToneForAvailabilityLabel } from '@/lib/ui/provider-presentation'
import { capabilityStatusToAeStatus, firstRequestModeLabel } from '@/lib/ui/status-presentation'
import type { AnswerSource } from '@/modules/answer/public'
import type { PublicRouteServiceContract } from '@/modules/catalog/public'
import type { PublicBusinessCatalogApiDto } from '@/modules/registry/public'

export type AeProviderCardProps =
  | { variant: 'answer'; source: AnswerSource }
  | { variant: 'registry'; item: PublicBusinessCatalogApiDto }
  | { variant: 'capability'; service: PublicRouteServiceContract }

export function AeProviderCard(props: AeProviderCardProps) {
  if (props.variant === 'answer') {
    return <AeProviderCardAnswer source={props.source} />
  }
  if (props.variant === 'registry') {
    return <AeProviderCardRegistry item={props.item} />
  }
  return <AeProviderCardCapability service={props.service} />
}

function AeProviderCardAnswer({ source }: { source: AnswerSource }) {
  const area = source.serviceArea || source.suburb
  const badgeVariant = badgeVariantForTone(pillToneForAvailabilityLabel(source.availabilityLabel))

  return (
    <Card padding={4} className="grid gap-4" data-variant="answer" id={`source-${source.citationIndex}`}>
      <div className="flex items-start gap-3">
        <Badge label={String(source.citationIndex)} variant="neutral" />
        <div className="min-w-0 flex-1">
          <Text type="large" weight="semibold" color="primary" display="block">
            <a href={source.detailUrl} className="text-primary underline-offset-4 hover:underline">{source.name}</a>
          </Text>
          <Text type="supporting" color="secondary" display="block">{source.category}</Text>
          {source.trustCue.length > 0 ? <Text type="supporting" color="secondary" display="block">{source.trustCue}</Text> : null}
        </div>
        <Badge label={source.availabilityLabel} variant={badgeVariant} />
      </div>
      <ProviderFacts
        facts={[
          { term: 'Service area', description: area || 'Check area' },
          { term: 'Hours', description: source.hoursLabel },
          ...(source.freshnessLabel !== undefined && source.freshnessLabel.length > 0
            ? [{ term: 'Updated', description: source.freshnessLabel }]
            : []),
        ]}
      />
      <TokenList labels={source.services.slice(0, 4).map((service) => service.name)} />
      <div className="flex flex-wrap gap-2">
        {source.inquiryUrl !== undefined ? <Button label="Send inquiry" variant="primary" size="sm" href={source.inquiryUrl} /> : null}
        <Button label={source.inquiryUrl === undefined ? source.nextStepLabel : 'View details'} variant="secondary" size="sm" href={source.detailUrl} />
      </div>
    </Card>
  )
}

function AeProviderCardRegistry({ item }: { item: PublicBusinessCatalogApiDto }) {
  const presentation = buildProviderPresentation(item, { serviceChipLimit: 3 })
  const summary =
    presentation.primaryServiceSummary ??
    item.services[0]?.summary ??
    'Published details for customers.'
  const badgeVariant = badgeVariantForTone(pillToneForAvailabilityLabel(presentation.availabilityLabel))

  return (
    <Card padding={0} className="grid h-full overflow-hidden" data-variant="registry" aria-labelledby={`registry-card-${item.slug}`}>
      <figure className="aspect-[16/9] overflow-hidden bg-card">
        <img className="h-full w-full object-cover" src={presentation.image.url} alt={presentation.image.alt} loading="lazy" />
      </figure>
      <div className="grid gap-4 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Text type="supporting" color="secondary" display="block">{item.category} · {presentation.locationLabel}</Text>
            <Text id={`registry-card-${item.slug}`} type="large" weight="semibold" color="primary" display="block">{item.name}</Text>
          </div>
          <Badge label={presentation.availabilityLabel} variant={badgeVariant} />
        </div>
        <Text color="secondary" display="block">{summary}</Text>
        {presentation.trustCue.length > 0 ? <Text type="supporting" color="secondary" display="block">{presentation.trustCue}</Text> : null}
        <TokenList labels={presentation.serviceChips.map((service) => service.label)} />
        <ProviderFacts facts={[{ term: 'Service area', description: presentation.serviceArea }, { term: 'Response', description: presentation.responseFallbackLabel }]} />
        <Text type="supporting" color="primary" display="block"><strong>Best next step:</strong> {presentation.nextStepLabel}</Text>
        <div className="flex flex-wrap items-center gap-2">
          <Button label="View details" variant="primary" size="sm" href={`/${item.slug}?from=registry`} />
          <a className="text-sm text-secondary underline-offset-4 hover:underline" href={`/api/businesses/${encodeURIComponent(item.slug)}`}>
            Get as agent JSON
          </a>
        </div>
      </div>
    </Card>
  )
}

function AeProviderCardCapability({ service }: { service: PublicRouteServiceContract }) {
  const serviceTitleId = `ae-service-${service.serviceId}`

  return (
    <Card padding={4} className="grid gap-4" data-variant="capability" aria-labelledby={serviceTitleId}>
      <div>
        <Text id={serviceTitleId} type="large" weight="semibold" color="primary" display="block">{service.name}</Text>
        <Text color="secondary" display="block">{service.summary}</Text>
      </div>
      <ProviderFacts
        facts={[
          { term: 'Service area', description: service.serviceArea },
          { term: 'Hours', description: service.hoursOrUnknown },
          { term: 'First request', description: firstRequestModeLabel(service.firstRequest.mode) },
          { term: 'Public note', description: service.firstRequest.publicDisclosure },
        ]}
      />
      <ul className="flex flex-wrap gap-2">
        {service.capabilities.map((capability) => (
          <li key={`${capability.serviceId}:${capability.kind}`}>
            <AeStatusBadge status={capabilityStatusToAeStatus(capability.status)} />
          </li>
        ))}
      </ul>
      <Text type="supporting" color="secondary" display="block" role="note">
        This page does not book, charge, or take action for the business.
      </Text>
    </Card>
  )
}

function ProviderFacts({ facts }: { facts: Array<{ term: string; description: string }> }) {
  return (
    <dl className="grid gap-3 sm:grid-cols-2">
      {facts.map((fact) => (
        <div key={fact.term} className="rounded-md border border-border bg-surface p-3">
          <dt><Text type="supporting" color="secondary" weight="medium">{fact.term}</Text></dt>
          <dd className="mt-1"><Text type="supporting" color="primary">{fact.description}</Text></dd>
        </div>
      ))}
    </dl>
  )
}

function TokenList({ labels }: { labels: readonly string[] }) {
  if (labels.length === 0) {
    return null
  }

  return (
    <ul className="flex flex-wrap gap-2" aria-label="Listed services">
      {labels.map((label) => (
        <li key={label}><Token size="sm" label={label} /></li>
      ))}
    </ul>
  )
}

function badgeVariantForTone(tone: string): 'neutral' | 'success' | 'warning' | 'error' {
  if (tone === 'available' || tone === 'success') return 'success'
  if (tone === 'limited' || tone === 'warning') return 'warning'
  if (tone === 'unavailable' || tone === 'error') return 'error'
  return 'neutral'
}
