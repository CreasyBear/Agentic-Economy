import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

import type { ServiceDto } from '@/modules/registry/public'
import { AeInstantQuote } from './AeInstantQuote'
import { formatPublishedPrice } from './money'

export type AeServiceRowProps = Readonly<{
  service: ServiceDto
  emphasized?: boolean
  answerRank?: number
}>


export function AeServiceRow({ service, emphasized = false, answerRank }: AeServiceRowProps) {
  const businessHref = `/${service.business.slug}`
  const quoteEndpoint = service.endpoints.find((endpoint) => endpoint.access === 'open')
  const location = [
    service.business.suburb,
    service.business.stateTerritory,
  ].filter((part): part is string => part !== undefined).join(', ')
  const price = service.price === undefined ? 'Not published' : formatPublishedPrice(service.price)
  const priceLabel = quoteEndpoint === undefined ? 'Published price' : 'Example price'
  const timing = quoteEndpoint === undefined ? 'Ask the business' : 'Shown in the example quote'

  return (
    <li className={emphasized ? 'h-full lg:col-span-2' : 'h-full'}>
      <Card
        className={emphasized
          ? 'grid h-full content-start gap-4 border border-ring bg-card p-5'
          : 'grid h-full content-start gap-4 border border-border bg-card p-5'}
      >
        <div className="grid gap-1">
          {answerRank === undefined ? null : (
            <p className="block text-sm font-semibold text-muted-foreground">
              {answerRank === 1 ? 'Best match for your ask' : `Option ${answerRank}`}
            </p>
          )}
          <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-5">
            <div className="grid min-w-0 gap-1">
              <h3 className="block text-lg font-semibold leading-snug text-foreground">{service.name}</h3>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm text-muted-foreground">
                  {service.business.name}{location.length === 0 ? null : ` · ${location}`}
                </p>
                {quoteEndpoint === undefined ? null : <Badge variant="outline">AE example</Badge>}
              </div>
            </div>
            <div className="min-w-0 sm:max-w-52 sm:text-right">
              <p className="block text-sm text-muted-foreground">{priceLabel}</p>
              <p className="block font-semibold text-foreground">{price}</p>
            </div>
          </div>
        </div>

        <dl className="grid gap-3 border-t border-border pt-4 sm:grid-cols-2">
          <div className="grid gap-1">
            <dt className="text-sm font-medium text-muted-foreground">What you get</dt>
            <dd className="m-0 text-foreground">{service.summary}</dd>
          </div>
          <div className="grid gap-1">
            <dt className="text-sm font-medium text-muted-foreground">When</dt>
            <dd className="m-0 text-foreground">{timing}</dd>
          </div>
        </dl>

        <div className="mt-auto border-t border-border pt-4">
          {quoteEndpoint === undefined ? (
            <Button asChild variant={emphasized ? 'default' : 'secondary'} {...(emphasized ? { 'data-variant': 'primary' } : {})} size="default" className="min-h-11 w-full sm:w-auto">
              <a href={businessHref}>See business details</a>
            </Button>
          ) : (
            <AeInstantQuote
              endpoint={quoteEndpoint}
              businessName={service.business.name}
              businessSlug={service.business.slug}
              emphasized={emphasized}
            />
          )}
        </div>
      </Card>
    </li>
  )
}


