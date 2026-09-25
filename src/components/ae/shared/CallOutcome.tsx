import { AeFactList } from '@/components/ae/data/AeFactList'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button-variants'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCurrencyAmount } from '@/modules/money/public'
import type { CallOutcomeView } from './object-family.contracts'

export type CallOutcomeProps = Readonly<{ view: CallOutcomeView }>

export function CallOutcome({ view }: CallOutcomeProps) {
  return (
    <Card role="region" aria-label="Call outcome" className="min-w-0">
      <CardHeader>
        <CardTitle><h2 className="text-lg" tabIndex={-1}>Call outcome</h2></CardTitle>
        <Badge className="w-fit" variant={view.purchaseKind === 'delivered' || view.purchaseKind === 'refunded'
          ? 'success' : view.purchaseKind === 'uncertain' ? 'warning' : 'secondary'}>{view.label}</Badge>
      </CardHeader>
      <CardContent className="grid min-w-0 gap-related">
        <p className="text-sm text-muted-foreground">{view.detail}</p>
        <AeFactList facts={[
          { label: 'Delivery', value: view.delivery },
          { label: 'Payment', value: view.payment },
          ...(view.amount === undefined ? [] : [{ label: view.amountLabel ?? 'Amount', value: <span className="font-mono tabular-nums">{formatCurrencyAmount(view.amount)}</span> }]),
          { label: 'Call reference', value: <span className="break-all font-mono text-xs">{view.callRef}</span> },
        ]} />
      </CardContent>
      {view.receiptHref === undefined ? null : (
        <CardFooter>
          <a href={view.receiptHref} className={buttonVariants({ variant: 'outline', className: 'min-h-touch focus-visible:outline-2 focus-visible:outline-offset-2' })}>View Call receipt</a>
        </CardFooter>
      )}
    </Card>
  )
}
