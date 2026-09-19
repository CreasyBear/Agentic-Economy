import { useEffect, useMemo, useState } from 'react'
import { ArrowRight } from 'lucide-react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from '@/lib/ui/toast'
import { cn } from '@/lib/utils'
import {
  AUD_EXPONENT,
  calculateAudGstSplit,
  compareExactAmounts,
  formatExactAmount,
  parseDecimalExactAmount,
  rescaleExactAmount,
  type ExactAmount,
} from '@/modules/money/public'

export const TACTILE =
  'enabled:active:scale-[0.98] transition-transform duration-100 ease-out motion-reduce:transition-none motion-reduce:active:scale-100'

const INVALID_PRICE_DIAGNOSTIC = {
  whatHappened: 'Invalid AUD price amount.',
  financialImpact: 'A$0.00 affected — pricing revision not published.',
  nextStep:
    'Enter a valid positive dollar amount with up to 2 decimal places (e.g. 0.15).',
} as const

const PUBLISH_FAILURE_DIAGNOSTIC = {
  whatHappened: 'Failed to publish pricing revision.',
  financialImpact: 'A$0.00 affected — existing price remains active.',
  nextStep: 'Please check your connection and try publishing again.',
} as const

const PERCENT_ADJUSTMENTS = [
  { label: '+10%', factor: 1.1 },
  { label: '+25%', factor: 1.25 },
  { label: '-10%', factor: 0.9 },
] as const

const TIER_CHIP_VALUES = ['0.05', '0.10', '0.25', '0.50'] as const

type PriceDiagnostic = Readonly<{
  whatHappened: string
  financialImpact: string
  nextStep: string
}>

function parseDisplayAudPrice(display?: string): ExactAmount | undefined {
  if (display === undefined || display.trim() === '') return undefined
  const match = display.match(/(\d+(?:\.\d+)?)/u)
  if (match === null) return undefined
  const parsed = parseDecimalExactAmount('AUD', match[1], 2)
  if (parsed === undefined || BigInt(parsed.units) <= 0n) return undefined
  return parsed
}

function parsePositiveAudInput(value: string): ExactAmount | undefined {
  const trimmed = value.trim()
  if (trimmed === '') return undefined
  const parsed = parseDecimalExactAmount('AUD', trimmed, 2)
  if (parsed === undefined || BigInt(parsed.units) <= 0n) return undefined
  return parsed
}

function formatAudLabel(amount: ExactAmount | undefined): string {
  if (amount === undefined) return '—'
  const formatted = formatExactAmount(amount)
  if (formatted === undefined) return '—'
  return `A$${formatted}`
}

function formatDelta(
  current: ExactAmount | undefined,
  next: ExactAmount | undefined,
): string {
  if (current === undefined || next === undefined) return '—'
  const comparison = compareExactAmounts(current, next)
  if (comparison === undefined) return '—'
  if (comparison === 0) return 'No change'
  const currentUnits = BigInt(current.units)
  const nextUnits = BigInt(next.units)
  const differenceUnits =
    nextUnits > currentUnits ? nextUnits - currentUnits : currentUnits - nextUnits
  const differenceDollars = Number(differenceUnits) / 100
  if (comparison < 0) return `+A$${differenceDollars.toFixed(2)}`
  return `-A$${differenceDollars.toFixed(2)}`
}

function roundAudChipValue(value: number): string {
  const rounded = Math.max(0.01, Math.round(value * 100) / 100)
  return rounded.toFixed(2)
}

function microUnitsFromAudInput(value: string): string | undefined {
  const parsed = parsePositiveAudInput(value)
  if (parsed === undefined) return undefined
  const micro = rescaleExactAmount(parsed, AUD_EXPONENT)
  return micro?.units
}

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
  const [diagnostic, setDiagnostic] = useState<PriceDiagnostic>()
  const [pending, setPending] = useState(false)

  useEffect(() => {
    if (open) {
      setPriceAud('')
      setDiagnostic(undefined)
      setPending(false)
    }
  }, [open])

  const parsedCurrent = useMemo(
    () => parseDisplayAudPrice(currentPrice),
    [currentPrice],
  )
  const parsedNew = useMemo(() => parsePositiveAudInput(priceAud), [priceAud])

  const formattedCurrent = formatAudLabel(parsedCurrent)
  const formattedNew = formatAudLabel(parsedNew)
  const deltaText = formatDelta(parsedCurrent, parsedNew)

  const gstPresentation = useMemo(() => {
    const grossMicroUnits = microUnitsFromAudInput(priceAud)
    if (grossMicroUnits === undefined) {
      return { baseText: '—', gstText: '—', totalText: '—' }
    }
    const split = calculateAudGstSplit(grossMicroUnits, 1_000)
    if (split === undefined) {
      return { baseText: '—', gstText: '—', totalText: '—' }
    }
    const baseText = `A$${(Number(split.netUnits) / 1_000_000).toFixed(4)}`
    const gstText = `A$${(Number(split.gstUnits) / 1_000_000).toFixed(4)}`
    const totalFormatted = formatExactAmount(parsedNew)
    const totalText =
      totalFormatted === undefined ? '—' : `A$${totalFormatted}`
    return { baseText, gstText, totalText }
  }, [parsedNew, priceAud])

  function applyPercentageAdjustment(factor: number) {
    const base =
      parsedCurrent ?? parsePositiveAudInput(priceAud) ?? undefined
    if (base === undefined) return
    const dollars = Number(base.units) / 100
    setPriceAud(roundAudChipValue(dollars * factor))
    setDiagnostic(undefined)
  }

  function applyTierValue(value: string) {
    setPriceAud(value)
    setDiagnostic(undefined)
  }

  async function handleConfirm() {
    setDiagnostic(undefined)
    const trimmed = priceAud.trim()
    const parsed = parseDecimalExactAmount('AUD', trimmed, 2)
    if (parsed === undefined || BigInt(parsed.units) <= 0n) {
      setDiagnostic(INVALID_PRICE_DIAGNOSTIC)
      return
    }

    const normalized = formatExactAmount(parsed)
    if (normalized === undefined) {
      setDiagnostic(INVALID_PRICE_DIAGNOSTIC)
      return
    }

    setPending(true)
    try {
      const result = await onUpdatePrice(normalized)
      if (result.kind === 'applied') {
        toast.success('Pricing revision published', {
          description: `New price of A$${normalized} is now live in the catalog.`,
        })
        onOpenChange(false)
      } else {
        setDiagnostic(PUBLISH_FAILURE_DIAGNOSTIC)
      }
    } catch {
      setDiagnostic(PUBLISH_FAILURE_DIAGNOSTIC)
    } finally {
      setPending(false)
    }
  }

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

          <div className="min-h-[8.5rem] rounded-lg border border-border bg-muted/30 p-3 grid gap-2.5">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-muted-foreground">Current Price:</span>
              <span className="font-mono tabular-nums">{formattedCurrent}</span>
              <ArrowRight className="size-3.5 text-muted-foreground" aria-hidden />
              <span className="text-muted-foreground">New Price:</span>
              <span className="font-mono tabular-nums">{formattedNew}</span>
              <Badge variant="outline" className="font-mono tabular-nums text-xs">
                {deltaText}
              </Badge>
            </div>
            <div className="grid gap-1 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Base price</span>
                <span className="font-mono tabular-nums">{gstPresentation.baseText}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">GST (10%)</span>
                <span className="font-mono tabular-nums">{gstPresentation.gstText}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Total Buyer Consideration</span>
                <span className="font-mono tabular-nums font-semibold">
                  {gstPresentation.totalText}
                </span>
              </div>
            </div>
          </div>

          <div className="grid gap-2">
            <span className="text-xs font-medium text-muted-foreground">Adjust by percentage</span>
            <div className="flex flex-wrap gap-2">
              {PERCENT_ADJUSTMENTS.map((chip) => (
                <button
                  key={chip.label}
                  type="button"
                  className={cn(
                    'inline-flex min-h-touch items-center rounded-full border border-border bg-container px-3 py-1 font-mono text-xs font-medium tabular-nums text-foreground hover:bg-muted/60',
                    TACTILE,
                  )}
                  aria-pressed={false}
                  disabled={pending}
                  onClick={() => applyPercentageAdjustment(chip.factor)}
                >
                  {chip.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-2">
            <span className="text-xs font-medium text-muted-foreground">Set tier price</span>
            <div className="flex flex-wrap gap-2">
              {TIER_CHIP_VALUES.map((chipValue) => (
                <button
                  key={chipValue}
                  type="button"
                  className={cn(
                    'inline-flex min-h-touch items-center rounded-full border border-border bg-container px-3 py-1 font-mono text-xs font-medium tabular-nums text-foreground hover:bg-muted/60',
                    TACTILE,
                  )}
                  aria-pressed={priceAud === chipValue}
                  disabled={pending}
                  onClick={() => applyTierValue(chipValue)}
                >
                  A${chipValue}
                </button>
              ))}
            </div>
          </div>

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
                onChange={(e) => {
                  setPriceAud(e.target.value)
                  setDiagnostic(undefined)
                }}
                placeholder="0.10"
                className="pl-8 font-mono text-sm tabular-nums"
                disabled={pending}
              />
            </div>
          </div>

          <div className="min-h-[2.5rem]" role="status" aria-live="polite">
            {diagnostic ? (
              <Alert variant="destructive" className="py-2">
                <AlertTitle className="text-xs font-semibold">{diagnostic.whatHappened}</AlertTitle>
                <AlertDescription className="grid gap-0.5 text-xs">
                  <span className="font-mono tabular-nums">{diagnostic.financialImpact}</span>
                  <span>{diagnostic.nextStep}</span>
                </AlertDescription>
              </Alert>
            ) : null}
          </div>
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
