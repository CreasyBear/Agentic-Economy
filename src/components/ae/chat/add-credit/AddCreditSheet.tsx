import { useCallback, useEffect, useState } from 'react'

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { formatDisplayAmount } from '@/modules/money/public'
import type { AddCreditSheetProps } from './add-credit.contracts'
import { suggestedAddCreditAmount } from './add-credit.contracts'
import { AddCreditPanel } from './components/AddCreditPanel'
import { useAddCredit } from './useAddCredit'

export function AddCreditSheet({
  open,
  onOpenChange,
  signedIn,
  payingOn,
  enableBusy,
  onEnablePaying,
  shortfall,
  onFunded,
}: AddCreditSheetProps) {
  const [signInHref, setSignInHref] = useState('/sign-in')
  const { amount, exceedsLargest } = suggestedAddCreditAmount(shortfall)
  const handleFunded = useCallback(() => {
    onOpenChange(false)
    onFunded()
  }, [onFunded, onOpenChange])
  const creditStepActive = open && signedIn && payingOn
  const {
    selected,
    setSelected,
    begin,
    busy,
    waitingForCredit,
    problem,
    balance,
  } = useAddCredit(creditStepActive, handleFunded)

  useEffect(() => {
    if (!open) return
    setSignInHref(`/sign-in?redirect_url=${encodeURIComponent(window.location.href)}`)
    setSelected(amount)
  }, [amount, open, setSelected, shortfall?.exponent, shortfall?.units])

  const balanceLabel = balance === null
    ? null
    : formatDisplayAmount({ currency: 'AUD', units: balance.units, exponent: balance.exponent })

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[85dvh] gap-0 overflow-y-auto rounded-t-2xl px-4 pb-6 pt-8 sm:inset-y-0 sm:left-auto sm:right-0 sm:h-full sm:max-h-none sm:w-full sm:max-w-md sm:rounded-none sm:border-l sm:border-t-0 sm:px-6 sm:py-8">
        <SheetHeader className="px-0 pb-5 pt-0">
          <SheetTitle>Add credit</SheetTitle>
          <SheetDescription>Keep this conversation open while you add credit.</SheetDescription>
        </SheetHeader>
        <AddCreditPanel
          signedIn={signedIn}
          payingOn={payingOn}
          enableBusy={enableBusy}
          onEnablePaying={onEnablePaying}
          signInHref={signInHref}
          selected={selected}
          onSelect={setSelected}
          onBegin={begin}
          busy={busy}
          waitingForCredit={waitingForCredit}
          problem={problem}
          balanceLabel={balanceLabel}
          shortfallTooLarge={exceedsLargest}
        />
      </SheetContent>
    </Sheet>
  )
}
