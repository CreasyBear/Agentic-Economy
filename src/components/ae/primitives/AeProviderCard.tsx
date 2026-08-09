import { Link } from '@tanstack/react-router'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

import { pillToneForAvailabilityLabel } from '@/lib/ui/provider-presentation'
import { ProviderFacts } from '@/components/ae/provider-facts'
import type { AnswerSource } from '@/modules/answer/public'

export type AeProviderCardProps = { variant: 'answer'; source: AnswerSource; threadId?: string }

export function AeProviderCard(props: AeProviderCardProps) {
  if (props.variant !== 'answer') {
    return null
  }
  return <AeProviderCardAnswer source={props.source} {...(props.threadId === undefined ? {} : { threadId: props.threadId })} />
}

function AeProviderCardAnswer({ source, threadId }: { source: AnswerSource; threadId?: string }) {
  const area = source.serviceArea || source.suburb
  const badgeVariant = badgeVariantForTone(pillToneForAvailabilityLabel(source.availabilityLabel))
  const detailIsInternal = source.detailUrl.startsWith('/') && !source.detailUrl.startsWith('//')
  const detailSearch = threadId === undefined || threadId.length === 0 ? {} : { from: 'thread' as const, id: threadId }
  const grounding = answerCardGrounding(source)

  return (
    <Card
      className="grid gap-4"
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
