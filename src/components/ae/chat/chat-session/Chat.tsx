import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { useServerFn } from '@tanstack/react-start'
import { useQuery } from 'convex/react'
import { api } from '../../../../../convex/_generated/api'
import { AddCreditSheet } from '../add-credit/AddCreditSheet'
import type { AddCreditSheetProps } from '../add-credit/add-credit.contracts'
import { useChatNeedActions, useChatSession } from './useChatSession'
import { ChatNeedActionsContext } from '../ToolCard'
import { ChatLayout } from './components/ChatLayout'
import type { ChatProps } from './chat-session.contracts'
import { readAccountFundingBalanceServer } from '@/modules/money/money.functions'
import { formatDisplayAmount } from '@/modules/money/public'

export function Chat(props: ChatProps) {
  const model = useChatSession(props)
  const grantStatus = useQuery(api.chatTurns.ownerChatGrantStatus,
    model.header.authenticated ? {} : 'skip')
  const needActions = useChatNeedActions()
  const readAccountFundingBalance = useServerFn(readAccountFundingBalanceServer)
  const ownerChatEnabled = grantStatus?.enabled === true
  const [creditOpen, setCreditOpen] = useState(false)
  const [shortfall, setShortfall] = useState<AddCreditSheetProps['shortfall']>()
  const [balanceRefresh, setBalanceRefresh] = useState(0)
  const [balanceLabel, setBalanceLabel] = useState<string>()
  const [balanceLoading, setBalanceLoading] = useState(false)
  const previousOwnerChatEnabled = useRef<boolean | undefined>(grantStatus?.enabled)
  const pendingRef = useRef<{ ask: string | undefined; run: { toolRef: string; title: string } | undefined } | null>(null)
  const resumedPendingRef = useRef(false)

  function resumePending(fundedOrPositiveBalance = false): void {
    if (!creditOpen || !ownerChatEnabled || pendingRef.current === null || resumedPendingRef.current) return
    if (shortfall !== undefined && !fundedOrPositiveBalance) return
    const pending = pendingRef.current
    pendingRef.current = null
    resumedPendingRef.current = true
    setCreditOpen(false)
    // Paying may have just turned on, which moves the person to a new owner-chat thread;
    // resume there explicitly instead of racing the navigation to /t/new.
    if (pending.run !== undefined) model.onRunTool(pending.run.toolRef, pending.run.title, pending.ask, true)
    else if (pending.ask !== undefined) model.submitText(pending.ask, true)
  }
  const resumePendingAfterPayingOn = useEffectEvent((funded: boolean) => resumePending(funded))
  useEffect(() => {
    if (!model.header.authenticated) {
      setBalanceLabel(undefined)
      setBalanceLoading(false)
      return
    }
    let active = true
    setBalanceLoading(true)
    void readAccountFundingBalance().then(balance => {
      if (!active) return
      if (balance.kind !== 'available') {
        setBalanceLabel(undefined)
        return
      }
      const { units, exponent } = balance.balance
      setBalanceLabel(formatDisplayAmount({ currency: 'AUD', units, exponent }))
    }, () => {
      if (!active) return
      setBalanceLabel(undefined)
    }).finally(() => {
      if (active) setBalanceLoading(false)
    })
    return () => { active = false }
  }, [balanceRefresh, model.header.authenticated, readAccountFundingBalance])

  useEffect(() => {
    if (grantStatus === undefined) {
      previousOwnerChatEnabled.current = undefined
      return
    }
    if (!ownerChatEnabled) {
      previousOwnerChatEnabled.current = false
      return
    }
    if (creditOpen && shortfall === undefined) {
      previousOwnerChatEnabled.current = true
      resumePendingAfterPayingOn(false)
      return
    }
    if (previousOwnerChatEnabled.current === undefined) {
      previousOwnerChatEnabled.current = true
      return
    }
    if (previousOwnerChatEnabled.current) return
    if (creditOpen && (balanceLoading || balanceLabel === undefined)) return
    previousOwnerChatEnabled.current = true
    if (creditOpen && balanceLabel !== 'A$0.00') resumePendingAfterPayingOn(true)
  }, [balanceLabel, balanceLoading, creditOpen, grantStatus, ownerChatEnabled, shortfall])

  const handleFunded = () => {
    setBalanceRefresh(value => value + 1)
    resumePending(true)
  }

  return (
    <ChatNeedActionsContext.Provider value={needActions}>
      <>
        <ChatLayout
          model={model}
          ownerChatEnabled={ownerChatEnabled}
          enableSpendingBusy={model.header.busy}
          onAddCredit={(value, run) => {
            pendingRef.current = { ask: model.lastUserText(), run }
            resumedPendingRef.current = false
            setShortfall(value)
            setCreditOpen(true)
          }}
          balanceLabel={balanceLabel}
          {...(grantStatus !== undefined && model.header.onEnableSpending !== undefined
            ? { onEnableSpending: model.header.onEnableSpending }
            : {})}
        />
        <AddCreditSheet
          open={creditOpen}
          onOpenChange={setCreditOpen}
          signedIn={model.header.authenticated}
          payingOn={ownerChatEnabled}
          enableBusy={model.header.busy}
          onEnablePaying={() => model.header.onEnableSpending?.()}
          {...(shortfall === undefined ? {} : { shortfall })}
          onFunded={handleFunded}
        />
      </>
    </ChatNeedActionsContext.Provider>
  )
}

