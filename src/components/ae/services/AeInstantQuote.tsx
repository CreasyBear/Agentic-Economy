import { useEffect, useRef, useState, type RefObject } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

import type { ServiceEndpointDto } from '@/modules/registry/public'
import { ProvenanceBadge } from '@/components/ae/status/ProvenanceBadge'
import { formatTimestamp } from '@/lib/ui/format-time'
import type { JsonValue } from '@/modules/capability-contract/public'
import { exactAmountSchema, formatCurrencyAmount, type ExactAmount } from '@/modules/money/public'
import { isRecord } from '@/modules/common/is-record'

type AeInstantQuoteProps = Readonly<{
  endpoint: ServiceEndpointDto
  businessName: string
  businessSlug: string
  emphasized?: boolean
}>

type SandboxQuote = Readonly<{
  provenance: 'ae_sandbox_provider'
  service: string
  price: Readonly<{
    amount: ExactAmount
    unit?: string
    taxTreatment?: 'inclusive' | 'exclusive' | 'unstated'
  }>
  nextAvailable: string
  validUntil: string
}>

type QuoteState =
  | Readonly<{ kind: 'idle' }>
  | Readonly<{ kind: 'loading' }>
  | Readonly<{ kind: 'quoted'; quote: SandboxQuote }>
  | Readonly<{ kind: 'error'; message: string }>

export function AeInstantQuote({ endpoint, businessName, businessSlug, emphasized = true }: AeInstantQuoteProps) {
  const [state, setState] = useState<QuoteState>({ kind: 'idle' })
  const feedbackRef = useRef<HTMLDivElement>(null)
  const businessHref = `/${businessSlug}`

  useEffect(() => {
    if (state.kind === 'idle' || state.kind === 'loading') return
    feedbackRef.current?.focus({ preventScroll: true })
  }, [state])

  async function requestQuote() {
    setState({ kind: 'loading' })

    try {
      const response = await fetch(endpoint.url, {
        method: endpoint.method ?? 'POST',
        headers: { Accept: 'application/json' },
      })
      const payload = await readJson(response)

      if (!response.ok) {
        setState({
          kind: 'error',
          message: "We couldn't get a quote. Try again or see the business details.",
        })
        return
      }

      if (!isSandboxQuote(payload)) {
        setState({ kind: 'error', message: "The quote came back unreadable. Try again or see the business details." })
        return
      }

      setState({ kind: 'quoted', quote: payload })
    } catch {
      setState({ kind: 'error', message: "The quote service couldn't be reached. Try again or see the business details." })
    }
  }

  return (
    <div className="grid gap-3">
      {state.kind === 'quoted' ? (
        <>
          <QuoteCard quote={state.quote} feedbackRef={feedbackRef} businessName={businessName} businessHref={businessHref} emphasized={emphasized} />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="min-h-11 justify-self-start"
            onClick={() => void requestQuote()}
            aria-label="Refresh quote"
          >
            Refresh quote
          </Button>
        </>
      ) : state.kind === 'error' ? (
        <>
          <QuoteErrorCard message={state.message} feedbackRef={feedbackRef} businessHref={businessHref} emphasized={emphasized} />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="min-h-11 justify-self-start"
            onClick={() => void requestQuote()}
          >
            Try again
          </Button>
        </>
      ) : (
        <Button
          type="button"
          variant={emphasized ? 'default' : 'secondary'}
          {...(emphasized ? { 'data-variant': 'primary' } : {})}
          size="default"
          className="min-h-11 w-full justify-self-start sm:w-auto"
          disabled={state.kind === 'loading'}
          onClick={() => void requestQuote()}
          aria-label={state.kind === 'loading' ? 'Getting your quote…' : 'Get a quote'}
        >
          {state.kind === 'loading' ? 'Getting your quote…' : 'Get a quote'}
        </Button>
      )}
    </div>
  )
}

function QuoteCard({
  quote,
  feedbackRef,
  businessName,
  businessHref,
  emphasized,
}: {
  quote: SandboxQuote
  feedbackRef: RefObject<HTMLDivElement | null>
  businessName: string
  businessHref: string
  emphasized: boolean
}) {
  return (
    <Card ref={feedbackRef} tabIndex={-1} role="status" aria-live="polite" className="grid gap-3 bg-muted p-4 focus-visible:outline-2 focus-visible:outline-offset-2 sm:min-w-72">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-base font-semibold text-foreground">Quote</h4>
        <ProvenanceBadge source="ae_sandbox" />
      </div>
      <p className="block text-sm text-muted-foreground">{quote.service}</p>
      <dl className="grid gap-2 text-sm sm:grid-cols-3">
        <QuoteFact label="Price" value={formatQuotePrice(quote.price)} />
        <QuoteFact label="Next available" value={formatQuoteTimestamp(quote.nextAvailable)} />
        <QuoteFact label="Valid until" value={formatQuoteTimestamp(quote.validUntil)} />
      </dl>
      <Button asChild variant={emphasized ? 'default' : 'secondary'} {...(emphasized ? { 'data-variant': 'primary' } : {})} size="default" className="min-h-11 justify-self-start">
        <a href={businessHref}>Contact {businessName}</a>
      </Button>
    </Card>
  )
}

function QuoteErrorCard({
  message,
  feedbackRef,
  businessHref,
  emphasized,
}: {
  message: string
  feedbackRef: RefObject<HTMLDivElement | null>
  businessHref: string
  emphasized: boolean
}) {
  return (
    <Card ref={feedbackRef} tabIndex={-1} role="alert" className="grid gap-3 border-destructive bg-card p-4 focus-visible:outline-2 focus-visible:outline-offset-2">
      <div className="grid gap-1">
        <p className="block font-semibold text-foreground">No quote returned</p>
        <p className="block text-muted-foreground">{message}</p>
      </div>
      <Button asChild variant={emphasized ? 'default' : 'secondary'} {...(emphasized ? { 'data-variant': 'primary' } : {})} size="default" className="min-h-11 justify-self-start">
        <a href={businessHref}>See business details</a>
      </Button>
    </Card>
  )
}

function QuoteFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="m-0 font-semibold text-foreground">{value}</dd>
    </div>
  )
}

async function readJson(response: Response): Promise<JsonValue | undefined> {
  try {
    return await response.json()
  } catch {
    return undefined
  }
}


function isSandboxQuote(value: unknown): value is SandboxQuote {
  if (!isRecord(value) || value.provenance !== 'ae_sandbox_provider') return false
  if (typeof value.service !== 'string' || typeof value.nextAvailable !== 'string' || typeof value.validUntil !== 'string') return false
  if (!isRecord(value.price)) return false
  if (!exactAmountSchema.safeParse(value.price.amount).success) return false
  if (value.price.unit !== undefined && typeof value.price.unit !== 'string') return false
  if (value.price.taxTreatment !== undefined
    && value.price.taxTreatment !== 'inclusive'
    && value.price.taxTreatment !== 'exclusive'
    && value.price.taxTreatment !== 'unstated') return false
  return true
}


function formatQuotePrice(price: SandboxQuote['price']): string {
  const unit = price.unit === undefined ? '' : ` / ${price.unit}`
  const tax = price.taxTreatment === 'inclusive' ? ' incl. tax' : price.taxTreatment === 'exclusive' ? ' + tax' : ''
  return `${formatCurrencyAmount(price.amount)}${unit}${tax}`
}

function formatQuoteTimestamp(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return formatTimestamp(date)
}

