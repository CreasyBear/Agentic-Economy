'use client'

import { isReverificationCancelledError } from '@clerk/shared/error'

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'

import { degrade } from '@/lib/observability/degrade'
import type { Rule4Diagnostic } from '@/lib/ui/diagnostic'
import { toast } from '@/lib/ui/toast'
import type { AgentAccessKeyIssueResult } from '@/modules/agent-access/issue-key.contracts'
import {
  isZeroExactAmount,
  parseSpendingLimitTriple,
  validateSpendingLimitOrder,
} from '@/modules/agent-access/spending-policy.view-model'
import { createRuntimeId } from '@/modules/common/runtime-id'

import type {
  ConnectAgentAuthorityMode,
  ConnectAgentWizardDraft,
  ConnectAgentWizardPorts,
  ConnectAgentWizardViewState,
} from './connect-agent-wizard.contracts'
import {
  AGENT_KEY_DRAFT_DEFAULTS,
} from './agent-key-draft'
import {
  mapIssueErrorDiagnostic,
  mapNetworkDiagnostic,
  mapUnexpectedDiagnostic,
  mapValidationDiagnostic,
  spendingOrderViolationMessage,
} from './connect-agent-wizard-diagnostics'

const DEFAULT_PER_CALL = AGENT_KEY_DRAFT_DEFAULTS.perCallAmount
const DEFAULT_DAILY = AGENT_KEY_DRAFT_DEFAULTS.dailyAmount
const DEFAULT_MONTHLY = AGENT_KEY_DRAFT_DEFAULTS.monthlyAmount

export const CONNECT_AGENT_WIZARD_LIMIT_IDS = {
  perCall: 'limit-per-call',
  daily: 'limit-daily',
  monthly: 'limit-monthly',
} as const

export const CONNECT_AGENT_WIZARD_SANDBOX_DISPLAY = {
  perCall: 'A$1.00 / call',
  daily: 'A$5.00 / day',
  monthly: 'A$20.00 / month',
} as const

export const CONNECT_AGENT_WIZARD_LIMIT_PLACEHOLDERS = {
  perCall: '5.00',
  daily: '25.00',
  monthly: '100.00',
} as const

function resetWizardFields(
  setters: Readonly<{
    setName: (v: string) => void
    setAuthorityMode: (v: ConnectAgentAuthorityMode) => void
    setPerCallAmount: (v: string) => void
    setDailyAmount: (v: string) => void
    setMonthlyAmount: (v: string) => void
    setDiagnostic: (v: Rule4Diagnostic | null) => void
  }>,
): void {
  setters.setName('')
  setters.setAuthorityMode('spending_policy')
  setters.setPerCallAmount(DEFAULT_PER_CALL)
  setters.setDailyAmount(DEFAULT_DAILY)
  setters.setMonthlyAmount(DEFAULT_MONTHLY)
  setters.setDiagnostic(null)
}

export function useConnectAgentWizard({
  deploymentEnvironment: environment,
  open = true,
  onOpenChange,
  onIssue,
  onSuccess,
  initialDraft,
  onDraftChange,
}: ConnectAgentWizardPorts) {
  const [name, setName] = useState(initialDraft?.name ?? '')
  const [authorityMode, setAuthorityMode] =
    useState<ConnectAgentAuthorityMode>(initialDraft?.authorityMode ?? 'spending_policy')

  const [perCallAmount, setPerCallAmount] = useState(initialDraft?.perCallAmount ?? DEFAULT_PER_CALL)
  const [dailyAmount, setDailyAmount] = useState(initialDraft?.dailyAmount ?? DEFAULT_DAILY)
  const [monthlyAmount, setMonthlyAmount] = useState(initialDraft?.monthlyAmount ?? DEFAULT_MONTHLY)

  const [diagnostic, setDiagnostic] = useState<Rule4Diagnostic | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [nameInvalid, setNameInvalid] = useState(false)

  const idempotencyKeyRef = useRef<string | undefined>(undefined)
  const nameInputRef = useRef<HTMLInputElement>(null)
  const draftRef = useRef({
    name,
    environment,
    authorityMode,
    perCallAmount,
    dailyAmount,
    monthlyAmount,
  })

  const wasOpenRef = useRef(open)
  useEffect(() => {
    const becameOpen = open && !wasOpenRef.current
    wasOpenRef.current = open
    if (!becameOpen) return
    const draft = initialDraft ?? AGENT_KEY_DRAFT_DEFAULTS
    draftRef.current = { ...draft, environment }
    setName(draft.name)
    setAuthorityMode(draft.authorityMode)
    setPerCallAmount(draft.perCallAmount)
    setDailyAmount(draft.dailyAmount)
    setMonthlyAmount(draft.monthlyAmount)
  }, [open, initialDraft, environment])

  const publishDraft = useCallback((patch: Partial<ConnectAgentWizardDraft>) => {
    const draft = { ...draftRef.current, ...patch, environment }
    draftRef.current = draft
    onDraftChange?.(draft)
  }, [onDraftChange, environment])

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen && !isSubmitting) {
        resetWizardFields({
          setName,
          setAuthorityMode,
          setPerCallAmount,
          setDailyAmount,
          setMonthlyAmount,
          setDiagnostic,
        })
        setNameInvalid(false)
        draftRef.current = { ...AGENT_KEY_DRAFT_DEFAULTS, environment }
        idempotencyKeyRef.current = undefined
      }
      if (!isSubmitting) {
        onOpenChange(nextOpen)
      }
    },
    [isSubmitting, onOpenChange, environment],
  )

  const handleNameChange = useCallback(
    (value: string) => {
      setName(value)
      setNameInvalid(false)
      publishDraft({ name: value })
      if (diagnostic !== null) {
        setDiagnostic(null)
      }
    },
    [diagnostic, publishDraft],
  )

  const handleAuthorityChange = useCallback((value: ConnectAgentAuthorityMode) => {
    setAuthorityMode(value)
    publishDraft({ authorityMode: value })
  }, [publishDraft])

  const handlePerCallAmountChange = useCallback((value: string) => {
    setPerCallAmount(value)
    publishDraft({ perCallAmount: value })
  }, [publishDraft])

  const handleDailyAmountChange = useCallback((value: string) => {
    setDailyAmount(value)
    publishDraft({ dailyAmount: value })
  }, [publishDraft])

  const handleMonthlyAmountChange = useCallback((value: string) => {
    setMonthlyAmount(value)
    publishDraft({ monthlyAmount: value })
  }, [publishDraft])

  const handleSubmit = async (e: Pick<FormEvent, 'preventDefault'>) => {
    e.preventDefault()
    setDiagnostic(null)

    const trimmedName = name.trim()
    if (trimmedName.length === 0) {
      setNameInvalid(true)
      setDiagnostic(mapValidationDiagnostic('Agent name is required.'))
      nameInputRef.current?.focus()
      return
    }
    if (trimmedName.length > 80) {
      setNameInvalid(true)
      setDiagnostic(mapValidationDiagnostic('Agent name cannot exceed 80 characters.'))
      nameInputRef.current?.focus()
      return
    }
    setNameInvalid(false)

    let perCallExact
    let dailyExact
    let monthlyExact

    if (environment === 'production') {
      const parsed = parseSpendingLimitTriple(
        perCallAmount,
        dailyAmount,
        monthlyAmount,
        { trim: true },
      )

      if (parsed === undefined) {
        setDiagnostic(
          mapValidationDiagnostic(
            'All production spending limits must be valid decimal AUD amounts.',
          ),
        )
        return
      }

      perCallExact = parsed.maximumSpendPerCall
      dailyExact = parsed.maximumDailySpend
      monthlyExact = parsed.maximumMonthlySpend

      if (
        isZeroExactAmount(perCallExact)
        || isZeroExactAmount(dailyExact)
        || isZeroExactAmount(monthlyExact)
      ) {
        setDiagnostic(
          mapValidationDiagnostic('Production spending limits must be greater than zero.'),
        )
        return
      }

      const orderViolation = validateSpendingLimitOrder(perCallExact, dailyExact, monthlyExact)
      if (orderViolation !== null) {
        setDiagnostic(mapValidationDiagnostic(spendingOrderViolationMessage(orderViolation)))
        return
      }
    }

    if (idempotencyKeyRef.current === undefined) {
      idempotencyKeyRef.current = createRuntimeId('agent-issue')
    }

    const payload: Record<string, unknown> = {
      name: trimmedName,
      idempotencyKey: idempotencyKeyRef.current,
      environment,
      authorityMode,
    }

    if (environment === 'production') {
      payload.maximumSpendPerCall = perCallExact
      payload.maximumDailySpend = dailyExact
      payload.maximumMonthlySpend = monthlyExact
    }

    setIsSubmitting(true)

    try {
      const result = await onIssue({ data: payload }) as AgentAccessKeyIssueResult | undefined

      if (result?.kind === 'created' || result?.kind === 'replayed') {
        idempotencyKeyRef.current = undefined
        setIsSubmitting(false)
        onOpenChange(false)
        onSuccess?.({
          keyId: result.keyId,
          secret: result.secret,
          displayName: trimmedName,
          environment,
        })
        return
      }

      if (result?.kind === 'error') {
        if (result.retryable) {
          toast.error('Issuance temporarily unavailable. Please retry.')
        } else {
          idempotencyKeyRef.current = undefined
          if (result.code === 'missing_auth') {
            toast.error('Sign in as the access owner, then try again.')
          } else {
            toast.error('Could not connect agent. Please check your inputs.')
          }
        }
        setDiagnostic(mapIssueErrorDiagnostic(result.code))
      } else {
        idempotencyKeyRef.current = undefined
        setDiagnostic(mapUnexpectedDiagnostic())
      }
    } catch (cause) {
      if (isReverificationCancelledError(cause)) return
      degrade(cause, undefined, {
        site: 'AeConnectAgentWizardDialog.submit',
        reason: 'source_unavailable',
      })
      setDiagnostic(mapNetworkDiagnostic())
    } finally {
      setIsSubmitting(false)
    }
  }

  const trimmedNameLength = name.trim().length
  const isNameValid = trimmedNameLength > 0 && trimmedNameLength <= 80

  const view: ConnectAgentWizardViewState = {
    name,
    nameLength: name.length,
    isNameValid,
    nameInvalid,
    environment,
    authorityMode,
    perCallAmount,
    dailyAmount,
    monthlyAmount,
    diagnostic,
    isSubmitting,
    spendingPresentation: environment === 'sandbox' ? 'sandbox-static' : 'editable',
  }

  return {
    view,
    nameInputRef,
    handleOpenChange,
    handleSubmit,
    handleNameChange,
    setAuthorityMode: handleAuthorityChange,
    setPerCallAmount: handlePerCallAmountChange,
    setDailyAmount: handleDailyAmountChange,
    setMonthlyAmount: handleMonthlyAmountChange,
  }
}
