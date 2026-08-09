import { cva } from 'class-variance-authority'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'

import type { ServiceDto } from '@/modules/registry/public'
import { MagicNumber } from '@/components/ae/magic/MagicNumber'
import { MagicTilt } from '@/components/ae/magic/MagicTilt'
import { ProvenanceBadge } from '@/components/ae/status/ProvenanceBadge'
import { AeInstantQuote } from './AeInstantQuote'
import { formatPublishedPrice } from './money'

export type AeServiceRowProps = Readonly<{
  service: ServiceDto
  emphasized?: boolean
  answerRank?: number
}>

const rankLabel = cva('block text-sm font-semibold', {
  variants: {
    emphasized: { true: 'text-foreground', false: 'text-muted-foreground' },
  },
  defaultVariants: { emphasized: false },
})

/**
 * One shortlist option on the Ask results, using the same card anatomy and
 * chrome as `AeOfferingCard` (the single buyer card). The emphasized rank
 * conveys ordering through the caption + primary CTA, never a different border.
 */
export function AeServiceRow({ service, emphasized = false, answerRank }: AeServiceRowProps) {
  const businessHref = `/${service.id}`
  const quoteEndpoint = service.endpoints.find((endpoint) => endpoint.ae.access === 'open')
  const location = [
    service.ae.suburb,
    service.ae.stateTerritory,
  ].filter((part): part is string => part !== undefined).join(', ')
  const source = service.ae.source
  const firstOffering = service.ae.offerings[0]
  const pricedOffering = service.ae.offerings.find((offering) => offering.price !== undefined)
  const price = pricedOffering?.price === undefined ? 'Not published' : formatPublishedPrice(pricedOffering.price)
  const priceLabel = source === 'ae_sandbox' ? 'Price' : 'Published price'
  const timing = quoteEndpoint === undefined ? 'Ask the business' : 'See the business for timing'

  return (
    <li className={emphasized ? 'h-full lg:col-span-2' : 'h-full'}>
      <MagicTilt>
        <Card className="grid h-full gap-4" data-variant="offering">
        <CardHeader className="grid gap-1 p-5">
          {answerRank === undefined ? null : (
            <p className={rankLabel({ emphasized })}>
              {answerRank === 1 ? 'Best match for your ask' : `Option ${answerRank}`}
            </p>
          )}
          <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-5">
            <div className="grid min-w-0 gap-1">
              <h3 className="block text-lg font-semibold leading-snug text-foreground">{service.name}</h3>
              <p className="text-sm text-muted-foreground">
                {firstOffering?.name ?? service.category}{location.length === 0 ? null : ` · ${location}`}
                <span className="ml-2 inline-flex align-middle"><ProvenanceBadge source={source} /></span>
              </p>
            </div>
            <div className="min-w-0 sm:max-w-52 sm:text-right">
              <p className="block text-sm text-muted-foreground">{priceLabel}</p>
              {price === 'Not published' ? (
                <p className="block font-semibold text-foreground">{price}</p>
              ) : (
                <MagicNumber value={price} className="block font-semibold text-foreground" />
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="grid gap-3 p-5 pt-0">
          <dl className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1">
              <dt className="text-sm font-medium text-muted-foreground">What you get</dt>
              <dd className="m-0 text-foreground">{firstOffering?.summary ?? service.category}</dd>
            </div>
            <div className="grid gap-1">
              <dt className="text-sm font-medium text-muted-foreground">When</dt>
              <dd className="m-0 text-foreground">{timing}</dd>
            </div>
          </dl>
          <div className="mt-auto flex">
            {quoteEndpoint === undefined ? (
              <Button asChild variant={emphasized ? 'default' : 'secondary'} {...(emphasized ? { 'data-variant': 'primary' } : {})} size="default" className="min-h-11 w-full sm:w-auto">
                <a href={businessHref}>See business details</a>
              </Button>
            ) : (
              <AeInstantQuote
                endpoint={quoteEndpoint}
                businessName={service.name}
                businessSlug={service.id}
                emphasized={emphasized}
              />
            )}
          </div>
        </CardContent>
        </Card>
      </MagicTilt>
    </li>
  )
}
