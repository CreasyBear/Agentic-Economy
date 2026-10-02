import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react'
import { useServerFn } from '@tanstack/react-start'
import { useQuery } from 'convex/react'
import { api } from '../../../../../convex/_generated/api'
import { AddCreditSheet } from '../add-credit/AddCreditSheet'
import type { AddCreditSheetProps } from '../add-credit/add-credit.contracts'
import { useChatNeedActions, useChatSession } from './useChatSession'
import { ChatNeedActionsContext, PaidCallReportOwnerContext } from '../ToolCard'
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
  const reportOwner = useMemo(() => model.header.authenticated && ownerChatEnabled
    ? { onPosted: () => setBalanceRefresh(value => value + 1) } : null, [model.header.authenticated, ownerChatEnabled])
  const [balanceLabel, setBalanceLabel] = useState<string>()
  const [balanceDescription, setBalanceDescription] = useState<string>()
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
      setBalanceDescription(undefined)
      setBalanceLoading(false)
      return
    }
    let active = true
    let expiryTimer: ReturnType<typeof setTimeout> | undefined
    setBalanceLoading(true)
    void readAccountFundingBalance().then(balance => {
      if (!active) return
      if (balance.kind !== 'available') {
        setBalanceLabel(undefined)
        setBalanceDescription(undefined)
        return
      }
      const { units, exponent } = balance.totalBalance ?? balance.balance
      setBalanceLabel(formatDisplayAmount({ currency: 'AUD', units, exponent }))
      const purchased = formatDisplayAmount(balance.balance)
      const promotional = balance.promotionalBalance
      const promotionalUnits = promotional?.units ?? '0'
      const expiry = balance.nextPromotionalExpiryAt
      if (expiry != null) expiryTimer = setTimeout(() => {
        setBalanceLabel(undefined)
        setBalanceDescription(undefined)
        setBalanceRefresh(value => value + 1)
      }, Math.min(2_147_483_647, Math.max(0, expiry - Date.now())))
      const nextExpiry = expiry == null ? undefined : new Intl.DateTimeFormat('en-AU', {
        day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit',
        timeZone: 'Australia/Perth', timeZoneName: 'short',
      }).format(expiry)
      setBalanceDescription(promotional !== undefined && promotionalUnits !== '0'
        ? `Purchased credit ${purchased}. Promotional credit ${formatDisplayAmount(promotional)}.${nextExpiry === undefined ? '' : ` Next promotional credit expiry ${nextExpiry}.`}`
        : `Purchased credit ${purchased}.`)
    }, () => {
      if (!active) return
      setBalanceLabel(undefined)
      setBalanceDescription(undefined)
    }).finally(() => {
      if (active) setBalanceLoading(false)
    })
    return () => { active = false; clearTimeout(expiryTimer) }
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
      <PaidCallReportOwnerContext.Provider value={reportOwner}>
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
          balanceDescription={balanceDescription}
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
      </PaidCallReportOwnerContext.Provider>
    </ChatNeedActionsContext.Provider>
  )
}
