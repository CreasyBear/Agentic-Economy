import { useMemo } from 'react'

import { Button } from '@/components/arc/button/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

import { PriceAdjustmentChips } from './components/PriceAdjustmentChips'
import { PriceDeltaPreview } from './components/PriceDeltaPreview'
import { PriceRevisionAmountField } from './components/PriceRevisionAmountField'
import { PriceRevisionDiagnosticSlot } from './components/PriceRevisionDiagnosticSlot'
import {
  computeGstPresentation,
  formatAudLabel,
  formatDelta,
  parseDisplayAudPrice,
  parsePositiveAudInput,
} from './price-revision-preview'
import { usePriceRevisionForm } from './usePriceRevisionForm'
import './PriceRevisionComposition.css'

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
      <DialogContent className="arc-market arc-price-revision-dialog">
        <DialogHeader>
          <DialogTitle>Update Price & Publish New Revision</DialogTitle>
          <DialogDescription>
            Change the unit price for {toolName}. This issues an immutable new catalog revision without altering historical quotes or completed calls.
          </DialogDescription>
        </DialogHeader>

        <div className="arc-price-revision-body">
          <div
            role="status"
            className="arc-price-revision-reassurance"
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

        <DialogFooter className="arc-price-revision-actions">
          <Button
            type="button"
            variant="secondary"
            size="md"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            size="md"
            onClick={handleConfirm}
            disabled={pending}
          >
            {pending ? 'Publishing…' : 'Publish New Revision'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
