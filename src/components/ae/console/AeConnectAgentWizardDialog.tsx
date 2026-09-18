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

  // Production budget inputs
  const [perCallAmount, setPerCallAmount] = useState('5.00')
  const [dailyAmount, setDailyAmount] = useState('25.00')
  const [monthlyAmount, setMonthlyAmount] = useState('100.00')

  const [validationError, setValidationError] = useState<string | null>(null)
  const [serverError, setServerError] = useState<string | null>(null)
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
      setValidationError(null)
      setServerError(null)
      idempotencyKeyRef.current = undefined
    }
    if (!isSubmitting) {
      onOpenChange(nextOpen)
    }
  }, [isSubmitting, onOpenChange])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setValidationError(null)
    setServerError(null)

    const trimmedName = name.trim()
    if (trimmedName.length === 0) {
      setValidationError('Agent name is required.')
      return
    }
    if (trimmedName.length > 80) {
      setValidationError('Agent name cannot exceed 80 characters.')
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
        setValidationError('All production spending limits must be valid decimal AUD amounts.')
        return
      }

      if (perCallExact.units === '0' || dailyExact.units === '0' || monthlyExact.units === '0') {
        setValidationError('Production spending limits must be greater than zero.')
        return
      }

      const perCallUnits = BigInt(perCallExact.units)
      const dailyUnits = BigInt(dailyExact.units)
      const monthlyUnits = BigInt(monthlyExact.units)

      if (perCallUnits > dailyUnits) {
        setValidationError('Per-call limit cannot exceed daily limit.')
        return
      }
      if (dailyUnits > monthlyUnits) {
        setValidationError('Daily limit cannot exceed monthly limit.')
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
        setServerError('Could not connect agent. No secret was created. Review your settings and try again.')
      } else {
        idempotencyKeyRef.current = undefined
        setServerError('An unexpected error occurred while connecting the agent.')
      }
    } catch (cause) {
      degrade(cause, undefined, { site: 'AeConnectAgentWizardDialog.submit', reason: 'source_unavailable' })
      setServerError('A network error occurred while connecting the agent. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const isNameValid = name.trim().length > 0 && name.trim().length <= 80

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[500px]" data-slot="dialog-content">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Connect new agent</DialogTitle>
            <DialogDescription>
              Create an authenticated credential and spending policy for your autonomous agent.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-5 py-4">
            {validationError !== null && (
              <Alert variant="destructive">
                <AlertTitle>Validation error</AlertTitle>
                <AlertDescription>{validationError}</AlertDescription>
              </Alert>
            )}

            {serverError !== null && (
              <Alert variant="destructive">
                <AlertTitle>Issuance failed</AlertTitle>
                <AlertDescription>{serverError}</AlertDescription>
              </Alert>
            )}

            {/* Agent Name */}
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
                  if (validationError !== null) setValidationError(null)
                }}
              />
              <p className="text-xs text-muted-foreground">
                Display name for your agent in directory and call activity logs.
              </p>
            </div>

            {/* Environment */}
            <div className="grid gap-2">
              <Label>Environment</Label>
              <RadioGroup
                value={environment}
                onValueChange={(val) => {
                  setEnvironment(val as 'sandbox' | 'production')
                  setValidationError(null)
                }}
                disabled={isSubmitting}
                className="grid grid-cols-2 gap-3"
              >
                <div className="flex items-center gap-2 rounded-md border p-3 hover:bg-accent/50 cursor-pointer">
                  <RadioGroupItem value="sandbox" id="env-sandbox" />
                  <Label htmlFor="env-sandbox" className="cursor-pointer font-medium">Sandbox</Label>
                </div>
                <div className="flex items-center gap-2 rounded-md border p-3 hover:bg-accent/50 cursor-pointer">
                  <RadioGroupItem value="production" id="env-production" />
                  <Label htmlFor="env-production" className="cursor-pointer font-medium">Production</Label>
                </div>
              </RadioGroup>
            </div>

            {/* Authority Mode */}
            <div className="grid gap-2">
              <Label>Authority mode</Label>
              <RadioGroup
                value={authorityMode}
                onValueChange={(val) => setAuthorityMode(val as typeof authorityMode)}
                disabled={isSubmitting}
                className="grid gap-2"
              >
                <div className="flex items-center gap-2 rounded-md border p-3 hover:bg-accent/50 cursor-pointer">
                  <RadioGroupItem value="spending_policy" id="auth-spending-policy" />
                  <div className="grid gap-0.5 cursor-pointer">
                    <Label htmlFor="auth-spending-policy" className="cursor-pointer font-medium">Work within limits</Label>
                    <span className="text-xs text-muted-foreground">Autonomous paid capability purchases up to approved limits.</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 rounded-md border p-3 hover:bg-accent/50 cursor-pointer">
                  <RadioGroupItem value="approval_required" id="auth-approval-required" />
                  <div className="grid gap-0.5 cursor-pointer">
                    <Label htmlFor="auth-approval-required" className="cursor-pointer font-medium">Ask each time</Label>
                    <span className="text-xs text-muted-foreground">Owner approval required for every paid capability purchase.</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 rounded-md border p-3 hover:bg-accent/50 cursor-pointer">
                  <RadioGroupItem value="read_only" id="auth-read-only" />
                  <div className="grid gap-0.5 cursor-pointer">
                    <Label htmlFor="auth-read-only" className="cursor-pointer font-medium">Browse only</Label>
                    <span className="text-xs text-muted-foreground">Free tool discovery and quotes only. Cannot execute paid tools.</span>
                  </div>
                </div>
              </RadioGroup>
            </div>

            {/* Spending limits: Sandbox read-only vs Production editable */}
            {environment === 'sandbox' ? (
              <div className="rounded-md border bg-muted/30 p-3 text-xs grid gap-1">
                <span className="font-medium text-foreground">Sandbox spend limits:</span>
                <p className="text-muted-foreground">
                  Pre-configured safe testing defaults: <span className="font-semibold text-foreground">$1.00 / call</span>, <span className="font-semibold text-foreground">$5.00 / day</span>, <span className="font-semibold text-foreground">$20.00 / month</span> AUD.
                </p>
              </div>
            ) : (
              <div className="grid gap-3 rounded-md border p-3 bg-card">
                <span className="text-xs font-semibold text-foreground">Production spending limits (AUD)</span>
                <div className="grid grid-cols-3 gap-2">
                  <div className="grid gap-1">
                    <Label htmlFor="limit-per-call" className="text-xs">Maximum spend per call</Label>
                    <Input
                      id="limit-per-call"
                      value={perCallAmount}
                      disabled={isSubmitting}
                      onChange={(e) => setPerCallAmount(e.target.value)}
                      placeholder="5.00"
                    />
                  </div>
                  <div className="grid gap-1">
                    <Label htmlFor="limit-daily" className="text-xs">Daily spend limit</Label>
                    <Input
                      id="limit-daily"
                      value={dailyAmount}
                      disabled={isSubmitting}
                      onChange={(e) => setDailyAmount(e.target.value)}
                      placeholder="25.00"
                    />
                  </div>
                  <div className="grid gap-1">
                    <Label htmlFor="limit-monthly" className="text-xs">Monthly spend limit</Label>
                    <Input
                      id="limit-monthly"
                      value={monthlyAmount}
                      disabled={isSubmitting}
                      onChange={(e) => setMonthlyAmount(e.target.value)}
                      placeholder="100.00"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
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
