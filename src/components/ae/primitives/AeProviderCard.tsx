import { MapPin } from 'lucide-react'
import { Link } from '@tanstack/react-router'

import { Badge } from '@astryxdesign/core/Badge'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { Text } from '@astryxdesign/core/Text'
import { Token } from '@astryxdesign/core/Token'

import { RouterLink } from '@/components/astryx/RouterLink'
import { AeStatusBadge } from '@/components/ae/status/AeStatusBadge'
import { buildProviderPresentation, pillToneForAvailabilityLabel } from '@/lib/ui/provider-presentation'
import { capabilityStatusToAeStatus, firstRequestModeLabel } from '@/lib/ui/status-presentation'
import type { AnswerSource } from '@/modules/answer/public'
import type { PublicRouteServiceContract } from '@/modules/catalog/public'
import type { PublicBusinessCatalogApiDto } from '@/modules/registry/public'

export type AeProviderCardProps =
  | { variant: 'answer'; source: AnswerSource; threadId?: string }
  | { variant: 'registry'; item: PublicBusinessCatalogApiDto }
  | { variant: 'capability'; service: PublicRouteServiceContract }

export function AeProviderCard(props: AeProviderCardProps) {
  if (props.variant === 'answer') {
    return <AeProviderCardAnswer source={props.source} {...(props.threadId === undefined ? {} : { threadId: props.threadId })} />
  }
  if (props.variant === 'registry') {
    return <AeProviderCardRegistry item={props.item} />
  }
  return <AeProviderCardCapability service={props.service} />
}

function AeProviderCardAnswer({ source, threadId }: { source: AnswerSource; threadId?: string }) {
  const area = source.serviceArea || source.suburb
  const badgeVariant = badgeVariantForTone(pillToneForAvailabilityLabel(source.availabilityLabel))
  const inquiryPath = answerCardInquiryPath(source)
  const detailHref = appendThreadOrigin(source.detailUrl, threadId)
  const inquiryHref = source.inquiryUrl === undefined ? undefined : appendThreadOrigin(source.inquiryUrl, threadId)
  const grounding = answerCardGrounding(source)

  return (
    <Card
      padding={4}
      className="group relative grid gap-4 shadow-low motion-safe:transition motion-safe:duration-base motion-safe:ease-standard hover:shadow-med motion-safe:hover:lift"
      data-variant="answer"
      id={`source-${source.citationIndex}`}
      aria-labelledby={`source-${source.citationIndex}-name`}
    >
      <div className="flex items-start gap-3">
        <Badge label={`#${source.citationIndex}`} variant="neutral" />
        <div className="min-w-0 flex-1">
          <Text
            id={`source-${source.citationIndex}-name`}
            type="large"
            weight="semibold"
            color="primary"
            display="block"
          >
            <RouterLink href={detailHref} className="text-primary underline-offset-4 hover:underline">{source.name}</RouterLink>
          </Text>
          <Text type="supporting" color="secondary" display="block">{source.category}</Text>
          {grounding === undefined ? null : <Text type="supporting" color="secondary" display="block">{grounding}</Text>}
          <Text type="supporting" color="secondary" display="block">Choice {source.citationIndex} in this answer</Text>
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
      <div className="rounded-md border border-border bg-surface p-3" role="note">
        <Text type="supporting" color="secondary" weight="medium" display="block">Inquiry path</Text>
        <Text type="supporting" color="primary" display="block">{inquiryPath.description}</Text>
      </div>
      <div className="flex flex-wrap gap-2">
        {inquiryHref !== undefined ? (
          <Button label={inquiryPath.actionLabel} variant="primary" size="sm" href={inquiryHref} />
        ) : null}
        <Button
          label={source.inquiryUrl === undefined ? inquiryPath.actionLabel : 'Review listing'}
          variant="secondary"
          size="sm"
          href={detailHref}
        />
      </div>
    </Card>
  )
}

function appendThreadOrigin(href: string, threadId: string | undefined): string {
  if (threadId === undefined || threadId.length === 0) {
    return href
  }

  const separator = href.includes('?') ? '&' : '?'
  return `${href}${separator}from=thread&id=${encodeURIComponent(threadId)}`
}

function answerCardInquiryPath(source: AnswerSource): { description: string; actionLabel: string } {
  if (source.inquiryUrl !== undefined) {
    return {
      description:
        'AE inquiry form published for owner review. The business still confirms timing, quote, and availability.',
      actionLabel: 'Open inquiry form',
    }
  }

  return {
    description: 'No AE inquiry form is published yet. Review the listing before using its contact guidance.',
    actionLabel: source.nextStepLabel.length > 0 ? source.nextStepLabel : 'Review listing',
  }
}
function answerCardGrounding(source: AnswerSource): string | undefined {
  const serviceCategory = source.services.find((service) => service.category.trim().length > 0)?.category.trim() ?? source.category.trim()
  const place = [source.suburb.trim(), source.stateTerritory.trim()].filter((part) => part.length > 0).join(', ')
  const listedFor = [serviceCategory.length > 0 ? `Listed for ${serviceCategory}` : '', place.length > 0 ? `in ${place}` : '']
    .filter((part) => part.length > 0)
    .join(' ')
  const facts = [
    listedFor,
    source.freshnessLabel?.trim() ?? '',
  ].filter((part) => part.length > 0)

  return facts.length === 0 ? undefined : facts.join(' · ')
}


function AeProviderCardRegistry({ item }: { item: PublicBusinessCatalogApiDto }) {
  const presentation = buildProviderPresentation(item, { serviceChipLimit: 3 })
  const summary =
    presentation.primaryServiceSummary ??
    item.services[0]?.summary ??
    'Published details for customers.'
  const badgeVariant = badgeVariantForTone(pillToneForAvailabilityLabel(presentation.availabilityLabel))

  return (
    <Card
      padding={0}
      className="group relative grid h-full overflow-hidden bg-card shadow-low motion-safe:transition motion-safe:duration-base motion-safe:ease-standard hover:shadow-high motion-safe:hover:lift focus-within:shadow-high"
      data-variant="registry"
      aria-labelledby={`registry-card-${item.slug}`}
    >
      <figure className="aspect-video overflow-hidden bg-accent-muted">
        <img
          className="h-full w-full object-cover"
          src={presentation.image.url}
          alt={presentation.image.alt}
          onError={(event) => {
            const image = event.currentTarget
            if (image.dataset.fallback === '1') {
              image.style.visibility = 'hidden'
              return
            }
            image.dataset.fallback = '1'
            image.src = '/images/illustration/cat-default.png'
          }}
          loading="lazy"
        />
      </figure>
      <div className="grid content-start gap-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Text id={`registry-card-${item.slug}`} type="large" weight="semibold" color="primary" display="block">{item.name}</Text>
            <span className="mt-0.5 flex items-center gap-1">
              <MapPin aria-hidden="true" className="size-3.5 shrink-0 text-secondary" strokeWidth={1.75} />
              <Text type="supporting" color="secondary">{item.category} · {presentation.locationLabel}</Text>
            </span>
          </div>
          <Badge label={presentation.availabilityLabel} variant={badgeVariant} />
        </div>
        <Text color="secondary" display="block" className="line-clamp-2">{summary}</Text>
        {presentation.trustCue.length > 0 ? <Text type="supporting" color="secondary" display="block">{presentation.trustCue}</Text> : null}
        <TokenList labels={presentation.serviceChips.map((service) => service.label)} />
        <ProviderFacts facts={[{ term: 'Service area', description: presentation.serviceArea }, { term: 'Response', description: presentation.responseFallbackLabel }]} />
        <Text type="supporting" color="primary" display="block"><strong>Best next step:</strong> {presentation.nextStepLabel}</Text>
        <div className="mt-1 flex flex-wrap items-center gap-3 border-t border-border pt-4">
          <Link to="/$slug" params={{ slug: item.slug }} search={{ from: 'registry' }} aria-label={`View ${item.name}`} className="text-sm font-semibold text-accent underline-offset-4 after:absolute after:inset-0 hover:underline">View details</Link>
          <a className="relative z-10 ml-auto text-sm text-secondary underline-offset-4 hover:underline" href={`/api/businesses/${encodeURIComponent(item.slug)}`}>Get as agent JSON</a>
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
