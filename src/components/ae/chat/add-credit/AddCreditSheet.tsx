import { useCallback, useEffect, useState } from 'react'

import { Drawer, DrawerContent } from '@/components/ae/shared/base-ui/drawer/drawer'
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
  const creditStepActive = open && signedIn
  const {
    selected,
    setSelected,
    begin,
    busy,
    paymentStatus,
    checkPayment,
    problem,
    balance,
    constraints,
  } = useAddCredit(creditStepActive, handleFunded)

  useEffect(() => {
    if (!open) return
    setSignInHref(`/sign-in?redirect_url=${encodeURIComponent(window.location.href)}`)
    setSelected(amount)
  }, [amount, open, setSelected, shortfall?.exponent, shortfall?.units])

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent side="right" title="Add credit" description="Keep this conversation open while you add credit." data-phone-bottom>
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
          paymentStatus={paymentStatus}
          onCheckPayment={checkPayment}
          problem={problem}
          balance={balance}
          constraints={constraints}
          shortfallTooLarge={exceedsLargest}
        />
        <a
          href="/trust"
          target="_blank"
          rel="noreferrer"
          className="mt-5 w-fit text-sm text-muted-foreground underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          Trust centre (opens in a new tab)
        </a>
      </DrawerContent>
    </Drawer>
  )
}
