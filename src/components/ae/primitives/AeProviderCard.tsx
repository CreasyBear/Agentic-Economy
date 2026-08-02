import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { MapPin } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'

import { pillToneForAvailabilityLabel } from '@/lib/ui/provider-presentation'
import { telUri } from '@/lib/ui/tel-uri'
import { copyTextToClipboard } from '@/lib/ui/copy-text-to-clipboard'
import { ProviderFacts, offeringPathLabel } from '@/components/ae/provider-facts'
import type { AnswerSource } from '@/modules/answer/public'
import type { PublicBusinessCatalogApiV2Dto, PublicOfferingDto } from '@/modules/registry/public'

export type AeProviderCardProps =
  | { variant: 'answer'; source: AnswerSource; threadId?: string }
  | { variant: 'registry'; item: PublicBusinessCatalogApiV2Dto; onView?: () => void }
  | { variant: 'offering'; offering: PublicOfferingDto }

export function AeProviderCard(props: AeProviderCardProps) {
  if (props.variant === 'answer') {
    return <AeProviderCardAnswer source={props.source} {...(props.threadId === undefined ? {} : { threadId: props.threadId })} />
  }
  if (props.variant === 'registry') {
    return <AeProviderCardRegistry item={props.item} {...(props.onView === undefined ? {} : { onView: props.onView })} />
  }
  return <AeProviderCardOffering offering={props.offering} />
}

function AeProviderCardAnswer({ source, threadId }: { source: AnswerSource; threadId?: string }) {
  const area = source.serviceArea || source.suburb
  const badgeVariant = badgeVariantForTone(pillToneForAvailabilityLabel(source.availabilityLabel))
  const detailIsInternal = source.detailUrl.startsWith('/') && !source.detailUrl.startsWith('//')
  const detailSearch = threadId === undefined || threadId.length === 0 ? {} : { from: 'thread' as const, id: threadId }
  const grounding = answerCardGrounding(source)

  return (
    <Card
      className="group relative grid gap-4 shadow-low motion-safe:transition motion-safe:duration-base motion-safe:ease-standard hover:shadow-med motion-safe:hover:lift"
      data-variant="answer"
      id={`source-${source.citationIndex}`}
      aria-labelledby={`source-${source.citationIndex}-name`}
    >
      <CardHeader className="flex items-start gap-3 p-4">
        <Badge variant="secondary">#{source.citationIndex}</Badge>
        <div className="min-w-0 flex-1">
          <CardTitle>
            <h2 id={`source-${source.citationIndex}-name`} className="text-lg font-semibold text-foreground">
              {detailIsInternal ? (
                <Link to="/$slug" params={{ slug: source.slug }} search={detailSearch} className="text-foreground underline-offset-4 hover:underline">
                  {source.name}
                </Link>
              ) : (
                <a href={source.detailUrl} className="text-foreground underline-offset-4 hover:underline">{source.name}</a>
              )}
            </h2>
          </CardTitle>
          <p className="block text-sm text-muted-foreground">{source.category}</p>
          {grounding === undefined ? null : <p className="block text-sm text-muted-foreground">{grounding}</p>}
          <p className="block text-sm text-muted-foreground">Choice {source.citationIndex} in this answer</p>
        </div>
        <Badge variant={badgeVariant}>{source.availabilityLabel}</Badge>
      </CardHeader>
      <CardContent className="grid gap-4 p-4 pt-0">
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
          <Button asChild variant="secondary" size="sm" className="min-h-11">
            {detailIsInternal ? (
              <Link to="/$slug" params={{ slug: source.slug }} search={detailSearch}>Ask this business</Link>
            ) : (
              <a href={source.detailUrl}>Ask this business</a>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
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
  const telDestination = telUri(phone)
  const offeringNames = item.offerings.slice(0, 2).map((offering) => offering.name)
  const price = offeringPrice(item)
  const badges = offeringBadges(item)

  async function copyDetails() {
    const details = [
      item.name,
      item.category,
      ...(location.length === 0 ? [] : [`Location: ${location}`]),
      ...(offeringNames.length === 0 ? [] : [`Offerings: ${offeringNames.join(', ')}`]),
      ...(price === undefined ? [] : [`Price: ${price}`]),
      ...(phone.length === 0 ? [] : [`Phone: ${phone}`]),
      `Page: ${window.location.origin}/${item.slug}`,
    ].join('\n')

    try {
      await copyTextToClipboard(details)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  return (
    <Card
      className="grid h-full content-start gap-3"
      data-variant="registry"
      aria-labelledby={`registry-card-${item.slug}`}
    >
      <CardHeader className="grid gap-1 p-4">
        <p className="block text-sm text-muted-foreground">{item.category}</p>
        <CardTitle>
          <h2 id={`registry-card-${item.slug}`} className="text-lg font-semibold text-foreground">{item.name}</h2>
        </CardTitle>
        {location.length === 0 ? null : (
          <span className="flex items-center gap-1">
            <MapPin aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" strokeWidth={1.75} />
            <span className="text-sm text-muted-foreground">{location}</span>
          </span>
        )}
      </CardHeader>
      <CardContent className="grid gap-3 p-4 pt-0">
        <TokenList labels={offeringNames} ariaLabel="Published offerings" />
        {price === undefined ? null : <p className="text-lg font-semibold text-foreground">{price}</p>}
        {badges.length === 0 ? null : (
          <ul className="flex flex-wrap gap-2" aria-label="What this business supports">
            {badges.map((badge) => <li key={badge}><Badge variant="secondary">{badge}</Badge></li>)}
          </ul>
        )}
      </CardContent>
      <CardFooter className="mt-auto grid gap-2 border-t border-border p-4">
        <div aria-label="Research actions" className="grid gap-2">
          <Button asChild variant="default" className="min-h-11 w-full" {...(onView === undefined ? {} : { onClick: onView })}>
            <Link to="/$slug" params={{ slug: item.slug }} aria-label={`View ${item.name}`}>View business</Link>
          </Button>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            {telDestination === undefined ? null : (
              <Button asChild variant="ghost" size="sm" className="min-h-11">
                <a href={telDestination}>Call {phone}</a>
              </Button>
            )}
            <Button variant="ghost" size="sm" type="button" className="min-h-11" onClick={() => { void copyDetails() }}>
              {copied ? 'Details copied' : 'Copy details'}
            </Button>
          </div>
        </div>
      </CardFooter>
    </Card>
  )
}

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

function offeringBadges(item: PublicBusinessCatalogApiV2Dto): readonly string[] {
  if (item.accessSummary.aeSupportedAction) {
    return ['AE can complete this']
  }
  if (item.accessSummary.externalOperation) {
    return ['Online request published']
  }
  return []
}

function AeProviderCardOffering({ offering }: { offering: PublicOfferingDto }) {
  const offeringTitleId = `ae-offering-${offering.offeringRef}`
  const paths = offering.accessPaths.map((path) => path.kind === 'external_operation' ? path.name : offeringPathLabel(path))

  return (
    <Card className="grid gap-4" data-variant="offering" aria-labelledby={offeringTitleId}>
      <CardHeader className="grid gap-1 p-4">
        <CardTitle>
          <h2 id={offeringTitleId} className="text-lg font-semibold text-foreground">{offering.name}</h2>
        </CardTitle>
        <p className="block text-muted-foreground">{offering.summary}</p>
      </CardHeader>
      <CardContent className="grid gap-4 p-4 pt-0">
        <ProviderFacts
          facts={[
            { term: 'Service area', description: offering.serviceAreaSummary },
            { term: 'Availability', description: offering.availabilitySummary },
            { term: 'Pricing', description: offering.pricingSummary },
          ]}
        />
        <TokenList labels={paths} ariaLabel="Published access paths" />
        {offering.support.aeSupportedAction ? (
          <p className="block text-sm text-muted-foreground">AE can help with the next step.</p>
        ) : null}
        <p className="block text-sm text-muted-foreground" role="note">
          The business publishes these details and confirms each request.
        </p>
      </CardContent>
    </Card>
  )
}


function TokenList({ labels, ariaLabel = 'Listed offerings' }: { labels: readonly string[]; ariaLabel?: string }) {
  if (labels.length === 0) {
    return null
  }

  return (
    <ul className="flex flex-wrap gap-2" aria-label={ariaLabel}>
      {labels.map((label) => (
        <li key={label}><Badge variant="outline">{label}</Badge></li>
      ))}
    </ul>
  )
}

function badgeVariantForTone(tone: string): 'outline' | 'secondary' | 'destructive' {
  if (tone === 'available' || tone === 'success') return 'secondary'
  if (tone === 'unavailable' || tone === 'error') return 'destructive'
  return 'outline'
}
