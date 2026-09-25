import { useId } from 'react'
import { AeFactList } from '@/components/ae/data/AeFactList'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCurrencyAmount } from '@/modules/money/public'
import type { QuoteConfirmationView } from './object-family.contracts'

export type QuoteConfirmationProps = Readonly<{
  view: QuoteConfirmationView
  onApprove: (callRef: string) => void
  onDeny: (callRef: string) => void
  onFreshQuote: () => void
}>

export function QuoteConfirmation({ view, onApprove, onDeny, onFreshQuote }: QuoteConfirmationProps) {
  const headingId = useId()
  return (
    <Card role="region" data-call-ref={view.callRef} aria-labelledby={headingId} className="min-w-0">
      <CardHeader>
        <CardTitle><h2 id={headingId} tabIndex={-1}>Confirm this Call</h2></CardTitle>
        <Badge variant={view.expired ? 'warning' : 'secondary'} className="w-fit">
          {view.expired ? 'Quote expired' : 'Approval required'}
        </Badge>
      </CardHeader>
      <CardContent className="grid min-w-0 gap-related">
        <AeFactList facts={[
          { label: 'Tool', value: view.toolName },
          { label: view.provider.kind === 'verified' ? 'Verified Provider' : 'Directory Host', value: view.provider.href
            ? <a className="underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2" href={view.provider.href}>{view.provider.name}</a>
            : view.provider.name },
          { label: 'Quote', value: <span className="font-mono tabular-nums">{view.quoteAmount.units === '0' ? 'Free · ' : ''}{formatCurrencyAmount(view.quoteAmount)} per Call</span> },
          { label: 'Expires', value: <time dateTime={new Date(view.expiresAt).toISOString()}>{new Date(view.expiresAt).toLocaleString()}</time> },
          { label: 'Remaining cap after Call', value: <span className="font-mono tabular-nums">{formatCurrencyAmount(view.remainingCap.amount)} · {view.remainingCap.window}</span> },
          { label: 'Input', value: view.inputSummary },
          { label: 'Call reference', value: <span className="break-all font-mono text-xs">{view.callRef}</span> },
          { label: 'Quote reference', value: <span className="break-all font-mono text-xs">{view.quoteRef}</span> },
          ...(view.indicativeAud === undefined ? [] : [{ label: 'AUD equivalent (indicative only)', value: <span className="font-mono tabular-nums">{formatCurrencyAmount(view.indicativeAud)}</span> }]),
        ]} />
      </CardContent>
      <CardFooter className="flex-wrap gap-2">
        {view.expired ? (
          <Button type="button" className="min-h-touch h-auto min-w-0 max-w-full whitespace-normal text-center" onClick={onFreshQuote}>Get a fresh Quote</Button>
        ) : (
          <Button type="button" className="min-h-touch h-auto min-w-0 max-w-full whitespace-normal text-center" disabled={view.pending} onClick={() => onApprove(view.callRef)}>Approve this Call</Button>
        )}
        <Button type="button" variant="outline" className="min-h-touch h-auto min-w-0 max-w-full whitespace-normal text-center" disabled={view.pending} onClick={() => onDeny(view.callRef)}>Not now</Button>
      </CardFooter>
    </Card>
  )
}
