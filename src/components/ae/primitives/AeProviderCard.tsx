import { useState } from 'react'
import { MapPin } from 'lucide-react'

import { Badge } from '@astryxdesign/core/Badge'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { Text } from '@astryxdesign/core/Text'
import { Token } from '@astryxdesign/core/Token'

import { RouterLink } from '@/components/astryx/RouterLink'
import { AeStatusBadge } from '@/components/ae/status/AeStatusBadge'
import { pillToneForAvailabilityLabel } from '@/lib/ui/provider-presentation'
import { capabilityStatusToAeStatus, firstRequestModeLabel } from '@/lib/ui/status-presentation'
import type { AnswerSource } from '@/modules/answer/public'
import type { PublicRouteServiceContract } from '@/modules/catalog/public'
import type { PublicBusinessCatalogApiV2Dto } from '@/modules/registry/public'

export type AeProviderCardProps =
  | { variant: 'answer'; source: AnswerSource; threadId?: string }
  | { variant: 'registry'; item: PublicBusinessCatalogApiV2Dto; onView?: () => void }
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
          { term: 'Location', description: [source.suburb, source.stateTerritory].filter(Boolean).join(', ') || undefined },
          { term: 'Service area', description: area || undefined },
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


function AeProviderCardRegistry({ item, onView }: { item: PublicBusinessCatalogApiV2Dto; onView?: () => void }) {
  const [copied, setCopied] = useState(false)
  const location = [item.suburb.trim(), item.stateTerritory.trim()].filter(Boolean).join(', ')
  const phone = item.publishedPhone?.trim() ?? ''
  const offeringNames = item.offerings.slice(0, 2).map((offering) => offering.name)
  const price = offeringPrice(item)
  const badges = capabilityBadges(item)

  async function copyDetails() {
    const details = [
      item.name,
      item.category,
      ...(location.length === 0 ? [] : [`Location: ${location}`]),
      ...(offeringNames.length === 0 ? [] : [`Services: ${offeringNames.join(', ')}`]),
      ...(price === undefined ? [] : [`Price: ${price}`]),
      ...(phone.length === 0 ? [] : [`Phone: ${phone}`]),
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
      className="grid h-full content-start gap-3"
      data-variant="registry"
      aria-labelledby={`registry-card-${item.slug}`}
    >
      <div className="grid gap-1">
        <Text type="supporting" color="secondary" display="block">{item.category}</Text>
        <Text id={`registry-card-${item.slug}`} type="large" weight="semibold" color="primary" display="block">{item.name}</Text>
        {location.length === 0 ? null : (
          <span className="flex items-center gap-1">
            <MapPin aria-hidden="true" className="size-3.5 shrink-0 text-secondary" strokeWidth={1.75} />
            <Text type="supporting" color="secondary">{location}</Text>
          </span>
        )}
      </div>

      <TokenList labels={offeringNames} ariaLabel="Published services" />

      {/* Price is the decision fact. It leads, at the weight of the name, the
          way a nightly rate does on a listing card. */}
      {price === undefined ? null : (
        <Text type="large" weight="semibold" color="primary" display="block">{price}</Text>
      )}

      {/* Badge only what is exceptional. Every business can be contacted, so
          "contact available" on every card is noise, not information. */}
      {badges.length === 0 ? null : (
        <ul className="flex flex-wrap gap-2" aria-label="What this business supports">
          {badges.map((badge) => <li key={badge}><Badge label={badge} variant="success" /></li>)}
        </ul>
      )}

      <div className="mt-auto grid grid-cols-1 gap-2 border-t border-border pt-4 sm:grid-cols-2" aria-label="Research actions">
        {phone.length === 0 ? null : (
          <Button
            label={`Call ${phone}`}
            variant="secondary"
            href={`tel:${phone.replace(/[^+\d]/g, '')}`}
            className="min-h-11 w-full"
          />
        )}
        {/* A constant label: the business name is already the card heading, and
            interpolating it here truncates to "View Joondalup Ra…" in a grid. */}
        <Button
          label="View business"
          variant="secondary"
          href={`/${item.slug}?from=registry`}
          className="min-h-11 w-full"
          aria-label={`View ${item.name}`}
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

/**
 * A published price outranks everything else on the card, so it is worth
 * looking for in both places supply can declare it: on the offering itself,
 * and on the access path that actually quotes it.
 */
function offeringPrice(item: PublicBusinessCatalogApiV2Dto): string | undefined {
  for (const offering of item.offerings) {
    const summary = offering.pricingSummary?.trim()
    if (summary !== undefined && summary.length > 0) {
      return summary
    }
    for (const path of offering.accessPaths) {
      if (path.kind !== 'external_operation') {
        continue
      }
      const pathSummary = path.pricingSummary?.trim()
      if (pathSummary !== undefined && pathSummary.length > 0) {
        return pathSummary
      }
    }
  }
  return undefined
}

function capabilityBadges(item: PublicBusinessCatalogApiV2Dto): readonly string[] {
  if (item.accessSummary.aeSupportedAction) {
    return ['AE can complete this']
  }
  if (item.accessSummary.externalOperation) {
    return ['Answers instantly']
  }
  return []
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
        The business publishes these details and confirms each request.
      </Text>
    </Card>
  )
}

/**
 * Facts read as content, not containers. Boxing each fact inside a Card gives
 * every listing four nested cards and makes a simple listing look like a form,
 * so separation comes from a rule and whitespace instead.
 */
function ProviderFacts({ facts }: { facts: Array<{ term: string; description: string | undefined }> }) {
  const present = facts.filter((fact) => fact.description !== undefined && fact.description.trim().length > 0)
  if (present.length === 0) {
    return null
  }

  return (
    <dl className="grid gap-x-6 gap-y-3 border-t border-border pt-3 sm:grid-cols-2">
      {present.map((fact) => (
        <div key={fact.term}>
          <dt><Text type="supporting" color="secondary" display="block">{fact.term}</Text></dt>
          <dd className="mt-0.5"><Text type="supporting" color="primary" weight="medium" display="block">{fact.description}</Text></dd>
        </div>
      ))}
    </dl>
  )
}

function TokenList({ labels, ariaLabel = 'Listed services' }: { labels: readonly string[]; ariaLabel?: string }) {
  if (labels.length === 0) {
    return null
  }

  return (
    <ul className="flex flex-wrap gap-2" aria-label={ariaLabel}>
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
