import { useEffect, useState } from 'react'

import type { Rule4Diagnostic } from '@/lib/ui/diagnostic'
import { toast } from '@/lib/ui/toast'
import {
  formatExactAmount,
  parseDecimalExactAmount,
  type ExactAmount,
} from '@/modules/money/public'

import {
  INVALID_PRICE_DIAGNOSTIC,
  PUBLISH_FAILURE_DIAGNOSTIC,
} from './price-update-modal.contracts'
import { computePercentageAdjustedPrice } from './price-revision-preview'

export type UsePriceRevisionFormInput = Readonly<{
  open: boolean
  onOpenChange: (open: boolean) => void
  onUpdatePrice: (newPriceAud: string) => Promise<{ kind: 'applied' | 'refused'; message: string }>
  parsedCurrent: ExactAmount | undefined
}>

export function usePriceRevisionForm({
  open,
  onOpenChange,
  onUpdatePrice,
  parsedCurrent,
}: UsePriceRevisionFormInput) {
  const [priceAud, setPriceAud] = useState('')
  const [diagnostic, setDiagnostic] = useState<Rule4Diagnostic>()
  const [pending, setPending] = useState(false)

  useEffect(() => {
    if (open) {
      setPriceAud('')
      setDiagnostic(undefined)
      setPending(false)
    }
  }, [open])

  function applyPercentageAdjustment(factor: number) {
    const next = computePercentageAdjustedPrice(factor, parsedCurrent, priceAud)
    if (next === undefined) return
    setPriceAud(next)
    setDiagnostic(undefined)
  }

  function applyTierValue(value: string) {
    setPriceAud(value)
    setDiagnostic(undefined)
  }

  function handlePriceAudChange(value: string) {
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
    } catch (cause) {
      void cause
      setDiagnostic(PUBLISH_FAILURE_DIAGNOSTIC)
    } finally {
      setPending(false)
    }
  }

  return {
    priceAud,
    diagnostic,
    pending,
    applyPercentageAdjustment,
    applyTierValue,
    handlePriceAudChange,
    handleConfirm,
  }
}
