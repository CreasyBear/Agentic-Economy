import { useEffect, useRef, useState } from 'react'
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
  const [balanceIsZero, setBalanceIsZero] = useState(false)
  const [balanceLoading, setBalanceLoading] = useState(false)
  const previousOwnerChatEnabled = useRef<boolean | undefined>(grantStatus?.enabled)

  useEffect(() => {
    if (!model.header.authenticated) {
      setBalanceLabel(undefined)
      setBalanceIsZero(false)
      setBalanceLoading(false)
      return
    }
    let active = true
    setBalanceLoading(true)
    void readAccountFundingBalance().then(balance => {
      if (!active) return
      if (balance.kind !== 'available') {
        setBalanceLabel(undefined)
        setBalanceIsZero(false)
        return
      }
      const { units, exponent } = balance.balance
      const nextLabel = formatDisplayAmount({ currency: 'AUD', units, exponent })
      const isZero = BigInt(units) === 0n
      setBalanceLabel(nextLabel)
      setBalanceIsZero(isZero)
    }, () => {
      if (!active) return
      setBalanceLabel(undefined)
      setBalanceIsZero(false)
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
    if (previousOwnerChatEnabled.current === undefined) {
      previousOwnerChatEnabled.current = ownerChatEnabled
      return
    }
    if (!ownerChatEnabled) {
      previousOwnerChatEnabled.current = false
      return
    }
    if (previousOwnerChatEnabled.current) return
    if (balanceLoading && creditOpen) return
    previousOwnerChatEnabled.current = true
    if (creditOpen && !balanceIsZero) setCreditOpen(false)
  }, [balanceIsZero, balanceLoading, creditOpen, grantStatus, ownerChatEnabled])

  const handleFunded = () => {
    setCreditOpen(false)
    setBalanceRefresh(value => value + 1)
    model.retryLastRequest()
  }

  return (
    <ChatNeedActionsContext.Provider value={needActions}>
      <>
        <ChatLayout
          model={model}
          ownerChatEnabled={ownerChatEnabled}
          enableSpendingBusy={model.header.busy}
          onAddCredit={value => { setShortfall(value); setCreditOpen(true) }}
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

