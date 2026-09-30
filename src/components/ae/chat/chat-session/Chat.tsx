import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react'
import { useServerFn } from '@tanstack/react-start'
import { useQuery } from 'convex/react'
import { api } from '../../../../../convex/_generated/api'
import { AddCreditSheet } from '../add-credit/AddCreditSheet'
import type { AddCreditSheetProps } from '../add-credit/add-credit.contracts'
import { useChatNeedActions, useChatSession } from './useChatSession'
import { ChatNeedActionsContext } from '../ToolCard'
import { ChatLayout } from './components/ChatLayout'
import type { ChatPendingResume, ChatProps } from './chat-session.contracts'
import { readAccountFundingBalanceServer } from '@/modules/money/money.functions'
import { formatDisplayAmount } from '@/modules/money/public'
import { parseRunRequest } from '@/modules/chat/run-request'

export function Chat({ onNewChat: onStartNewChat, ...props }: ChatProps) {
  const previousOwnerChatEnabled = useRef<boolean | undefined>(undefined)
  const pendingRef = useRef<ChatPendingResume | null>(null)
  const resumedPendingRef = useRef(false)
  const enableAttemptRef = useRef(false)
  const preservePendingThreadChangeRef = useRef(false)
  const previousThreadIdRef = useRef(props.threadId)
  const [creditOpen, setCreditOpen] = useState(false)
  const [shortfall, setShortfall] = useState<AddCreditSheetProps['shortfall']>()
  const onNewChat = useCallback(() => {
    if (enableAttemptRef.current && pendingRef.current !== null) {
      preservePendingThreadChangeRef.current = true
    } else {
      pendingRef.current = null
      resumedPendingRef.current = false
      preservePendingThreadChangeRef.current = false
      setCreditOpen(false)
      setShortfall(undefined)
    }
    onStartNewChat()
  }, [onStartNewChat])
  const model = useChatSession({ ...props, onNewChat })
  const grantStatus = useQuery(api.chatTurns.ownerChatGrantStatus,
    model.header.authenticated ? {} : 'skip')
  const needActions = useChatNeedActions()
  const readAccountFundingBalance = useServerFn(readAccountFundingBalanceServer)
  const ownerChatEnabled = grantStatus?.enabled === true
  const [balanceRefresh, setBalanceRefresh] = useState(0)
  const [balanceLabel, setBalanceLabel] = useState<string>()
  const [balanceLoading, setBalanceLoading] = useState(false)
  useEffect(() => {
    if (previousThreadIdRef.current === model.header.threadId) return
    previousThreadIdRef.current = model.header.threadId
    if (preservePendingThreadChangeRef.current) {
      preservePendingThreadChangeRef.current = false
      return
    }
    pendingRef.current = null
    resumedPendingRef.current = false
    setCreditOpen(false)
    setShortfall(undefined)
  }, [model.header.threadId])
  useEffect(() => {
    if (!model.header.busy) enableAttemptRef.current = false
  }, [model.header.busy])

  function resumePending(fundedOrPositiveBalance = false): void {
    if (!creditOpen || !ownerChatEnabled || pendingRef.current === null || resumedPendingRef.current) return
    if (shortfall !== undefined && !fundedOrPositiveBalance) return
    const pending = pendingRef.current
    pendingRef.current = null
    resumedPendingRef.current = true
    setCreditOpen(false)
    // Paying may have just turned on, which moves the person to a new owner-chat thread;
    // resume there explicitly instead of racing the navigation to /t/new.
    if (pending.kind === 'run') void model.onRunTool(pending.run.toolRef, pending.run.input)
    else model.submitText(pending.ask, true)
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
            const last = model.lastUserText()
            pendingRef.current = run !== undefined
              ? { kind: 'run', run }
              : last !== undefined && parseRunRequest(last) === null ? { kind: 'ask', ask: last } : null
            resumedPendingRef.current = false
            preservePendingThreadChangeRef.current = false
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
          onOpenChange={open => {
            setCreditOpen(open)
            if (!open) {
              pendingRef.current = null
              resumedPendingRef.current = false
              enableAttemptRef.current = false
              preservePendingThreadChangeRef.current = false
              setShortfall(undefined)
            }
          }}
          signedIn={model.header.authenticated}
          payingOn={ownerChatEnabled}
          enableBusy={model.header.busy}
          onEnablePaying={() => {
            if (model.header.onEnableSpending === undefined) return
            enableAttemptRef.current = pendingRef.current !== null
            model.header.onEnableSpending()
          }}
          {...(shortfall === undefined ? {} : { shortfall })}
          onFunded={handleFunded}
        />
      </>
    </ChatNeedActionsContext.Provider>
  )
}

