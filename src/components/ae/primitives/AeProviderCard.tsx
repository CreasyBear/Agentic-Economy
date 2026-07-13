import { useState } from 'react'
import { MapPin } from 'lucide-react'

import { Badge } from '@astryxdesign/core/Badge'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { Text } from '@astryxdesign/core/Text'
import { Token } from '@astryxdesign/core/Token'

import { RouterLink } from '@/components/astryx/RouterLink'
import { AeStatusBadge } from '@/components/ae/status/AeStatusBadge'
import { buildProviderPresentation, pillToneForAvailabilityLabel } from '@/lib/ui/provider-presentation'
import { capabilityStatusToAeStatus, firstRequestModeLabel } from '@/lib/ui/status-presentation'
import { buildListingTrustProjection, NO_REPLY_HISTORY, type TrustFact } from '@/lib/ui/trust-projection'
import type { AnswerSource } from '@/modules/answer/public'
import type { PublicRouteServiceContract } from '@/modules/catalog/public'
import type { PublicBusinessCatalogApiDto } from '@/modules/registry/public'

export type AeProviderCardProps =
  | { variant: 'answer'; source: AnswerSource; threadId?: string }
  | { variant: 'registry'; item: PublicBusinessCatalogApiDto; onView?: () => void }
  | { variant: 'capability'; service: PublicRouteServiceContract }

export function AeProviderCard(props: AeProviderCardProps) {
  if (props.variant === 'answer') {
    return <AeProviderCardAnswer source={props.source} {...(props.threadId === undefined ? {} : { threadId: props.threadId })} />
  }
  if (props.variant === 'registry') {
    return <AeProviderCardRegistry item={props.item} {...(props.onView === undefined ? {} : { onView: props.onView })} />
  }
  return <AeProviderCardCapability service={props.service} />
}

function AeProviderCardAnswer({ source, threadId }: { source: AnswerSource; threadId?: string }) {
  const area = source.serviceArea || source.suburb
  const badgeVariant = badgeVariantForTone(pillToneForAvailabilityLabel(source.availabilityLabel))
  const detailHref = appendThreadOrigin(source.detailUrl, threadId)
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
        </div>
        <Badge label={source.availabilityLabel} variant={badgeVariant} />
      </div>
      <ProviderFacts
        facts={[
          { term: 'Location', description: [source.suburb, source.stateTerritory].filter(Boolean).join(', ') || 'Location not published' },
          { term: 'Service area', description: area || 'Service area not published here' },
          { term: 'Reply posture', description: NO_REPLY_HISTORY },
          { term: 'Hours', description: source.hoursLabel },
          ...(source.freshnessLabel !== undefined && source.freshnessLabel.length > 0
            ? [{ term: 'Updated', description: source.freshnessLabel }]
            : []),
        ]}
      />
      <TokenList labels={source.services.slice(0, 4).map((service) => service.name)} />
      <div className="flex flex-wrap gap-2">
        <Button label="Ask this business" variant="secondary" size="sm" className="min-h-11" href={detailHref} />
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


function AeProviderCardRegistry({ item, onView }: { item: PublicBusinessCatalogApiDto; onView?: () => void }) {
  const presentation = buildProviderPresentation(item, { serviceChipLimit: 3 })
  const trust = buildListingTrustProjection(item)
  const [copied, setCopied] = useState(false)
  const location = [item.suburb.trim(), item.stateTerritory.trim()].filter(Boolean).join(', ') || 'Location not published here'
  const serviceArea = trustFactLabel(trust.serviceArea)
  const hours = trustFactLabel(trust.hours)
  const phone = trustFactLabel(trust.phone)

  async function copyDetails() {
    const details = [
      item.name,
      item.category,
      `Location: ${location}`,
      `Service area: ${serviceArea}`,
      `Phone: ${phone}`,
      `Page: ${window.location.origin}/${item.slug}`,
    ].join('\n')

    try {
      await navigator.clipboard.writeText(details)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  return (
    <Card
      padding={4}
      className="grid h-full content-start gap-4"
      data-variant="registry"
      aria-labelledby={`registry-card-${item.slug}`}
    >
      <div className="grid gap-1">
        <Text type="supporting" color="secondary" display="block">{item.category}</Text>
        <Text id={`registry-card-${item.slug}`} type="large" weight="semibold" color="primary" display="block">{item.name}</Text>
        <span className="flex items-center gap-1">
          <MapPin aria-hidden="true" className="size-3.5 shrink-0 text-secondary" strokeWidth={1.75} />
          <Text type="supporting" color="secondary">{location}</Text>
        </span>
      </div>

      <TokenList labels={presentation.serviceChips.map((service) => service.label)} />
      <ProviderFacts facts={[
        { term: 'Service area', description: serviceArea },
        { term: 'Hours', description: hours },
        { term: 'Phone', description: phone },
        { term: 'Reply posture', description: trust.replyPosture.kind === 'observed' ? NO_REPLY_HISTORY : trust.replyPosture.label },
      ]} />
      <div className="mt-auto grid grid-cols-1 gap-2 border-t border-border pt-4 sm:grid-cols-2" aria-label="Research actions">
        {trust.phone.kind === 'published' ? (
          <Button
            label={`Call ${trust.phone.value}`}
            variant="secondary"
            href={`tel:${trust.phone.value.replace(/[^+\d]/g, '')}`}
            className="min-h-11 w-full"
          />
        ) : null}
        <Button
          label={`View ${item.name}`}
          variant="secondary"
          href={`/${item.slug}?from=registry`}
          className="min-h-11 w-full"
          {...(onView === undefined ? {} : { onClick: onView })}
        />
        <Button
          label={copied ? 'Details copied' : 'Copy details'}
          variant="secondary"
          type="button"
          className="min-h-11 w-full"
          onClick={() => { void copyDetails() }}
        />
      </div>
    </Card>
  )
}

function trustFactLabel(fact: TrustFact): string {
  return fact.kind === 'published' ? fact.value : fact.label
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
