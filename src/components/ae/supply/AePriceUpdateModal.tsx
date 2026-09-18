import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatExactAmount, parseDecimalExactAmount } from '@/modules/money/public'

const INVALID_PRICE_MESSAGE = 'Enter a valid AUD price with up to 2 decimal places (0.00 or greater).'

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
  const [priceAud, setPriceAud] = useState('')
  const [error, setError] = useState<string>()
  const [pending, setPending] = useState(false)

  async function handleConfirm() {
    setError(undefined)
    const trimmed = priceAud.trim()
    const parsed = parseDecimalExactAmount('AUD', trimmed, 2)
    if (parsed === undefined) {
      setError(INVALID_PRICE_MESSAGE)
      return
    }

    const normalized = formatExactAmount(parsed)
    if (normalized === undefined) {
      setError(INVALID_PRICE_MESSAGE)
      return
    }

    setPending(true)
    try {
      const result = await onUpdatePrice(normalized)
      if (result.kind === 'applied') {
        onOpenChange(false)
      } else {
        setError(result.message)
      }
    } catch (cause) {
      void cause;
      setError('Failed to update price. Please try again.')
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Update Price & Publish New Revision</DialogTitle>
          <DialogDescription>
            Change the unit price for {toolName}. This issues an immutable new catalog revision without altering historical quotes or completed calls.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          {currentPrice ? (
            <p className="text-xs text-muted-foreground">
              Current price: {currentPrice}
            </p>
          ) : null}

          <div className="grid gap-2">
            <Label htmlFor="ae-new-price-input" className="text-sm font-semibold">
              New Price per Call (AUD)
            </Label>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-xs text-muted-foreground">A$</span>
              <Input
                id="ae-new-price-input"
                type="text"
                inputMode="decimal"
                value={priceAud}
                onChange={(e) => setPriceAud(e.target.value)}
                placeholder="0.10"
                className="pl-8 font-mono text-sm"
                disabled={pending}
              />
            </div>
            {error ? <p className="text-xs text-destructive">{error}</p> : null}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button
            type="button"
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
