'use client'

import { useCallback, useRef, useState, type FormEvent } from 'react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
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
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { degrade } from '@/lib/observability/degrade'
import { toast } from '@/lib/ui/toast'
import { createRuntimeId } from '@/modules/common/runtime-id'
import { AUD_EXPONENT, parseDecimalExactAmount } from '@/modules/money/public'

export type IssuedAgentAccessReveal = Readonly<{
  keyId: string
  secret: string
  displayName: string
  environment: 'sandbox' | 'production'
}>

export type AgentAccessKeyIssueResult =
  | Readonly<{ kind: 'created' | 'replayed'; keyId: string; secret: string }>
  | Readonly<{ kind: 'error'; code: string; retryable: boolean }>

type WizardDiagnostic = Readonly<{
  title: string
  financialImpact: string
  nextStep: string
}>

const FINANCIAL_SAFE_NO_SECRET =
  'A$0.00 deducted — your balance is safe. No secret was created.'

function mapValidationDiagnostic(message: string): WizardDiagnostic {
  return {
    title: 'Check your settings',
    financialImpact: FINANCIAL_SAFE_NO_SECRET,
    nextStep: message,
  }
}

function mapIssueErrorDiagnostic(code: string): WizardDiagnostic {
  switch (code) {
    case 'missing_auth':
      return {
        title: 'Sign-in required',
        financialImpact: FINANCIAL_SAFE_NO_SECRET,
        nextStep: 'Sign in as the access owner, then try again.',
      }
    case 'invalid_input':
      return {
        title: 'Could not connect agent',
        financialImpact: FINANCIAL_SAFE_NO_SECRET,
        nextStep: 'Review agent name, environment, and spending limits, then try again.',
      }
    case 'idempotency_conflict':
      return {
        title: 'Request conflict',
        financialImpact: FINANCIAL_SAFE_NO_SECRET,
        nextStep: 'Wait a moment, then submit again to create a fresh credential.',
      }
    case 'issuance_unavailable':
      return {
        title: 'Issuance temporarily unavailable',
        financialImpact: FINANCIAL_SAFE_NO_SECRET,
        nextStep: 'Retry in a few seconds. Your settings were not applied.',
      }
    default:
      return {
        title: 'Could not connect agent',
        financialImpact: FINANCIAL_SAFE_NO_SECRET,
        nextStep: 'Review your settings and try again. Contact support if this persists.',
      }
  }
}

function mapNetworkDiagnostic(): WizardDiagnostic {
  return {
    title: 'Connection interrupted',
    financialImpact: FINANCIAL_SAFE_NO_SECRET,
    nextStep: 'Check your network connection and try again.',
  }
}

function mapUnexpectedDiagnostic(): WizardDiagnostic {
  return {
    title: 'Something went wrong',
    financialImpact: FINANCIAL_SAFE_NO_SECRET,
    nextStep: 'Try again. Contact support if the problem continues.',
  }
}

export interface AeConnectAgentWizardDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onIssue: (args: { data: Record<string, unknown> }) => Promise<AgentAccessKeyIssueResult>
  onSuccess?: (reveal: IssuedAgentAccessReveal) => void
}

export function AeConnectAgentWizardDialog({
  open,
  onOpenChange,
  onIssue,
  onSuccess,
}: Readonly<AeConnectAgentWizardDialogProps>) {
  const [name, setName] = useState('')
  const [environment, setEnvironment] = useState<'sandbox' | 'production'>('sandbox')
  const [authorityMode, setAuthorityMode] = useState<'spending_policy' | 'read_only' | 'approval_required'>('spending_policy')

  const [perCallAmount, setPerCallAmount] = useState('5.00')
  const [dailyAmount, setDailyAmount] = useState('25.00')
  const [monthlyAmount, setMonthlyAmount] = useState('100.00')

  const [diagnostic, setDiagnostic] = useState<WizardDiagnostic | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const idempotencyKeyRef = useRef<string | undefined>(undefined)

  const handleOpenChange = useCallback((nextOpen: boolean) => {
    if (!nextOpen && !isSubmitting) {
      setName('')
      setEnvironment('sandbox')
      setAuthorityMode('spending_policy')
      setPerCallAmount('5.00')
      setDailyAmount('25.00')
      setMonthlyAmount('100.00')
      setDiagnostic(null)
      idempotencyKeyRef.current = undefined
    }
    if (!isSubmitting) {
      onOpenChange(nextOpen)
    }
  }, [isSubmitting, onOpenChange])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setDiagnostic(null)

    const trimmedName = name.trim()
    if (trimmedName.length === 0) {
      setDiagnostic(mapValidationDiagnostic('Agent name is required.'))
      return
    }
    if (trimmedName.length > 80) {
      setDiagnostic(mapValidationDiagnostic('Agent name cannot exceed 80 characters.'))
      return
    }

    let perCallExact
    let dailyExact
    let monthlyExact

    if (environment === 'production') {
      perCallExact = parseDecimalExactAmount('AUD', perCallAmount.trim(), AUD_EXPONENT)
      dailyExact = parseDecimalExactAmount('AUD', dailyAmount.trim(), AUD_EXPONENT)
      monthlyExact = parseDecimalExactAmount('AUD', monthlyAmount.trim(), AUD_EXPONENT)

      if (perCallExact === undefined || dailyExact === undefined || monthlyExact === undefined) {
        setDiagnostic(mapValidationDiagnostic('All production spending limits must be valid decimal AUD amounts.'))
        return
      }

      if (perCallExact.units === '0' || dailyExact.units === '0' || monthlyExact.units === '0') {
        setDiagnostic(mapValidationDiagnostic('Production spending limits must be greater than zero.'))
        return
      }

      const perCallUnits = BigInt(perCallExact.units)
      const dailyUnits = BigInt(dailyExact.units)
      const monthlyUnits = BigInt(monthlyExact.units)

      if (perCallUnits > dailyUnits) {
        setDiagnostic(mapValidationDiagnostic('Per-call limit cannot exceed daily limit.'))
        return
      }
      if (dailyUnits > monthlyUnits) {
        setDiagnostic(mapValidationDiagnostic('Daily limit cannot exceed monthly limit.'))
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
      degrade(cause, undefined, { site: 'AeConnectAgentWizardDialog.submit', reason: 'source_unavailable' })
      setDiagnostic(mapNetworkDiagnostic())
    } finally {
      setIsSubmitting(false)
    }
  }

  const isNameValid = name.trim().length > 0 && name.trim().length <= 80

  const envCardBase =
    'grid min-h-touch cursor-pointer gap-1 rounded-md border border-border bg-container p-3 hover:bg-muted/60 has-[[data-checked]]:border-foreground enabled:active:scale-[0.98] transition-transform duration-100 ease-out motion-reduce:transition-none motion-reduce:active:scale-100'

  const authorityCardBase =
    'grid min-h-touch cursor-pointer grid-cols-[auto_minmax(0,1fr)] items-start gap-3 rounded-md border border-border px-3 py-3 has-[[data-checked]]:border-foreground has-[[data-checked]]:bg-muted enabled:active:scale-[0.98] transition-transform duration-100 ease-out motion-reduce:transition-none motion-reduce:active:scale-100'

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[620px]" data-slot="dialog-content">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Connect new agent</DialogTitle>
            <DialogDescription>
              Step 1 of 2 · Set policy
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-5 py-4">
            {diagnostic !== null ? (
              <div aria-live="polite">
                <Alert variant="destructive">
                  <AlertTitle>{diagnostic.title}</AlertTitle>
                  <AlertDescription className="grid gap-1">
                    <span>{diagnostic.financialImpact}</span>
                    <span>{diagnostic.nextStep}</span>
                  </AlertDescription>
                </Alert>
              </div>
            ) : null}

            <div className="grid gap-2">
              <Label htmlFor="agent-name">Agent name</Label>
              <Input
                id="agent-name"
                placeholder="e.g. Research Bot"
                value={name}
                maxLength={80}
                autoFocus
                autoComplete="off"
                disabled={isSubmitting}
                onChange={(e) => {
                  setName(e.target.value)
                  if (diagnostic !== null) setDiagnostic(null)
                }}
              />
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                  Display name for your agent in directory and call activity logs.
                </p>
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                  {name.length}/80
                </span>
              </div>
            </div>

            <div className="grid gap-2">
              <span className="text-sm font-medium leading-none">Environment</span>
              <RadioGroup
                value={environment}
                onValueChange={(val) => {
                  setEnvironment(val as 'sandbox' | 'production')
                  setDiagnostic(null)
                }}
                disabled={isSubmitting}
                className="grid grid-cols-2 gap-3"
              >
                <Label
                  htmlFor="env-sandbox"
                  className={`${envCardBase} has-[[data-checked]]:bg-muted`}
                >
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="sandbox" id="env-sandbox" />
                    <span className="font-medium">Sandbox</span>
                  </div>
                  <span className="text-xs text-muted-foreground pl-6">
                    Safe testing defaults. No live catalogue spend.
                  </span>
                </Label>
                <Label
                  htmlFor="env-production"
                  className={`${envCardBase} has-[[data-checked]]:border-warning-ring has-[[data-checked]]:bg-warning-subtle`}
                >
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="production" id="env-production" />
                    <span className="font-medium">Production</span>
                  </div>
                  <span className="text-xs text-muted-foreground pl-6">
                    Live prepaid credit. Limits are hard caps.
                  </span>
                </Label>
              </RadioGroup>
            </div>

            <div className="grid gap-2">
              <span className="text-sm font-medium leading-none">Authority mode</span>
              <RadioGroup
                value={authorityMode}
                onValueChange={(val) => setAuthorityMode(val as typeof authorityMode)}
                disabled={isSubmitting}
                className="grid gap-2"
              >
                <Label htmlFor="auth-spending-policy" className={authorityCardBase}>
                  <RadioGroupItem value="spending_policy" id="auth-spending-policy" className="mt-0.5" />
                  <div className="grid gap-0.5">
                    <span className="font-medium">Work within limits</span>
                    <span className="text-xs text-muted-foreground">Autonomous paid capability purchases up to approved limits.</span>
                  </div>
                </Label>
                <Label htmlFor="auth-approval-required" className={authorityCardBase}>
                  <RadioGroupItem value="approval_required" id="auth-approval-required" className="mt-0.5" />
                  <div className="grid gap-0.5">
                    <span className="font-medium">Ask each time</span>
                    <span className="text-xs text-muted-foreground">Owner approval required for every paid capability purchase.</span>
                  </div>
                </Label>
                <Label htmlFor="auth-read-only" className={authorityCardBase}>
                  <RadioGroupItem value="read_only" id="auth-read-only" className="mt-0.5" />
                  <div className="grid gap-0.5">
                    <span className="font-medium">Browse only</span>
                    <span className="text-xs text-muted-foreground">Free tool discovery and quotes only. Cannot execute paid tools.</span>
                  </div>
                </Label>
              </RadioGroup>
            </div>

            <div className="rounded-md border p-3">
              <div className="grid grid-cols-3 gap-2">
                <div className="grid gap-1">
                  <Label htmlFor="limit-per-call" className="text-xs">
                    Max spend per call (A$)
                  </Label>
                  {environment === 'sandbox' ? (
                    <p className="font-mono text-sm tabular-nums text-muted-foreground">A$1.00 / call</p>
                  ) : (
                    <Input
                      id="limit-per-call"
                      className="font-mono text-sm tabular-nums"
                      inputMode="decimal"
                      value={perCallAmount}
                      disabled={isSubmitting}
                      onChange={(e) => setPerCallAmount(e.target.value)}
                      placeholder="5.00"
                    />
                  )}
                </div>
                <div className="grid gap-1">
                  <Label htmlFor="limit-daily" className="text-xs">
                    Daily spend limit (A$)
                  </Label>
                  {environment === 'sandbox' ? (
                    <p className="font-mono text-sm tabular-nums text-muted-foreground">A$5.00 / day</p>
                  ) : (
                    <Input
                      id="limit-daily"
                      className="font-mono text-sm tabular-nums"
                      inputMode="decimal"
                      value={dailyAmount}
                      disabled={isSubmitting}
                      onChange={(e) => setDailyAmount(e.target.value)}
                      placeholder="25.00"
                    />
                  )}
                </div>
                <div className="grid gap-1">
                  <Label htmlFor="limit-monthly" className="text-xs">
                    Monthly spend limit (A$)
                  </Label>
                  {environment === 'sandbox' ? (
                    <p className="font-mono text-sm tabular-nums text-muted-foreground">A$20.00 / month</p>
                  ) : (
                    <Input
                      id="limit-monthly"
                      className="font-mono text-sm tabular-nums"
                      inputMode="decimal"
                      value={monthlyAmount}
                      disabled={isSubmitting}
                      onChange={(e) => setMonthlyAmount(e.target.value)}
                      placeholder="100.00"
                    />
                  )}
                </div>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Per-call ≤ daily ≤ monthly. AUD, GST-inclusive prepaid credit.
              </p>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={isSubmitting}
              onClick={() => handleOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!isNameValid || isSubmitting}
            >
              {isSubmitting ? 'Creating…' : 'Connect agent'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
