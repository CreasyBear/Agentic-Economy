import { useMemo } from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

import { PriceAdjustmentChips } from './components/PriceAdjustmentChips'
import { PriceDeltaPreview } from './components/PriceDeltaPreview'
import { PriceRevisionAmountField } from './components/PriceRevisionAmountField'
import { PriceRevisionDiagnosticSlot } from './components/PriceRevisionDiagnosticSlot'
import { TACTILE } from './price-update-modal.contracts'
import {
  computeGstPresentation,
  formatAudLabel,
  formatDelta,
  parseDisplayAudPrice,
  parsePositiveAudInput,
} from './price-revision-preview'
import { usePriceRevisionForm } from './usePriceRevisionForm'

export { TACTILE } from './price-update-modal.contracts'

export function AePriceUpdateModal({
  open,
  onOpenChange,
  toolName,
  currentPrice,
  onUpdatePrice,
}: Readonly<{
  open: boolean
  onOpenChange: (open: boolean) => void
  toolName: string
  currentPrice?: string
  onUpdatePrice: (newPriceAud: string) => Promise<{ kind: 'applied' | 'refused'; message: string }>
}>) {
  const parsedCurrent = useMemo(
    () => parseDisplayAudPrice(currentPrice),
    [currentPrice],
  )

  const {
    priceAud,
    diagnostic,
    pending,
    applyPercentageAdjustment,
    applyTierValue,
    handlePriceAudChange,
    handleConfirm,
  } = usePriceRevisionForm({
    open,
    onOpenChange,
    onUpdatePrice,
    parsedCurrent,
  })

  const parsedNew = useMemo(() => parsePositiveAudInput(priceAud), [priceAud])

  const formattedCurrent = formatAudLabel(parsedCurrent)
  const formattedNew = formatAudLabel(parsedNew)
  const deltaText = formatDelta(parsedCurrent, parsedNew)

  const gstPresentation = useMemo(() => {
    return computeGstPresentation(priceAud, parsedNew)
  }, [parsedNew, priceAud])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Update Price & Publish New Revision</DialogTitle>
          <DialogDescription>
            Change the unit price for {toolName}. This issues an immutable new catalog revision without altering historical quotes or completed calls.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div
            role="status"
            className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-foreground"
          >
            Existing quotes locked by agents remain valid until their 15-minute expiration. New pricing applies only to subsequent quote requests.
          </div>

          <PriceDeltaPreview
            formattedCurrent={formattedCurrent}
            formattedNew={formattedNew}
            deltaText={deltaText}
            baseText={gstPresentation.baseText}
            gstText={gstPresentation.gstText}
            totalText={gstPresentation.totalText}
          />

          <PriceAdjustmentChips
            priceAud={priceAud}
            pending={pending}
            onPercentageAdjustment={applyPercentageAdjustment}
            onTierValue={applyTierValue}
          />

          <PriceRevisionAmountField
            priceAud={priceAud}
            pending={pending}
            onPriceAudChange={handlePriceAudChange}
          />

          <PriceRevisionDiagnosticSlot
            {...(diagnostic === undefined ? {} : { diagnostic })}
          />
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
            className={cn('min-h-touch', TACTILE)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleConfirm}
            disabled={pending}
            className={cn('min-h-touch', TACTILE)}
          >
            {pending ? 'Publishing…' : 'Publish New Revision'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
