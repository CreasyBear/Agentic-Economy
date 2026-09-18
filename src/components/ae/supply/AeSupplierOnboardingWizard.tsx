'use client'

import { useEffect, useState } from 'react'
import { Link } from '@tanstack/react-router'
import {
  Building2Icon,
  CreditCardIcon,
  WrenchIcon,
  CheckCircle2Icon,
  AlertCircleIcon,
  ArrowRightIcon,
} from 'lucide-react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { toast } from '@/lib/ui/toast'
import { isValidAbn, normalizeAbn } from '@/modules/money/public'

export type SupplierOnboardingStep = 'profile' | 'payouts' | 'first_tool'

export type AeSupplierOnboardingWizardProps = Readonly<{
  currentStep?: SupplierOnboardingStep
  providerName?: string
  payoutsConfigured?: boolean
  onSaveProfile?: (profile: { name: string; website: string; abn: string }) => Promise<{ kind: 'ok' } | { kind: 'error'; message: string }>
  onConnectPayouts?: () => void | Promise<void>
}>

type Rule4Diagnostic = Readonly<{
  whatHappened: string
  financialImpact: string
  nextStep: string
}>

const TACTILE =
  'enabled:active:scale-[0.98] transition-transform duration-100 ease-out motion-reduce:transition-none motion-reduce:active:scale-100'
const SHELL = 'min-h-[28rem]'
const SLOT = 'min-h-[3rem]'
const ABN_INPUT_CLASS = 'text-sm font-mono tabular-nums'

const FINANCIAL_NO_UPDATE = 'A$0.00 affected — profile was not updated.'

const STEP_META: ReadonlyArray<{
  id: SupplierOnboardingStep
  label: string
  duration: string
  icon: typeof Building2Icon
}> = [
  { id: 'profile', label: '1. Provider Identity', duration: '~2 mins', icon: Building2Icon },
  { id: 'payouts', label: '2. Payout Account (Stripe)', duration: '~3 mins', icon: CreditCardIcon },
  { id: 'first_tool', label: '3. First Tool Publication', duration: '~1 min', icon: WrenchIcon },
]

export function formatAbnDisplay(digits: string): string {
  const clean = digits.replace(/\D/g, '').slice(0, 11)
  if (clean.length <= 2) return clean
  if (clean.length <= 5) return `${clean.slice(0, 2)} ${clean.slice(2)}`
  if (clean.length <= 8) return `${clean.slice(0, 2)} ${clean.slice(2, 5)} ${clean.slice(5)}`
  return `${clean.slice(0, 2)} ${clean.slice(2, 5)} ${clean.slice(5, 8)} ${clean.slice(8)}`
}

function diagnosticForProfileValidation(
  trimmedName: string,
  trimmedWebsite: string,
  cleanAbn: string,
): Rule4Diagnostic | undefined {
  if (trimmedName.length === 0) {
    return {
      whatHappened: 'Enter your supplier / brand name.',
      financialImpact: FINANCIAL_NO_UPDATE,
      nextStep: 'Enter the public name shown on Tool cards and invoices.',
    }
  }

  try {
    const parsedUrl = new URL(trimmedWebsite)
    if (parsedUrl.protocol !== 'https:') {
      return {
        whatHappened: 'Enter a valid HTTPS provider website.',
        financialImpact: FINANCIAL_NO_UPDATE,
        nextStep: 'Use a full https:// origin, for example https://api.acme.example.com.',
      }
    }
  } catch (cause) {
    void cause
    return {
      whatHappened: 'Enter a valid HTTPS provider website.',
      financialImpact: FINANCIAL_NO_UPDATE,
      nextStep: 'Use a full https:// origin, for example https://api.acme.example.com.',
    }
  }

  if (!isValidAbn(cleanAbn)) {
    return {
      whatHappened: 'Invalid Australian Business Number (ABN).',
      financialImpact: FINANCIAL_NO_UPDATE,
      nextStep: 'Enter an 11-digit ABN with valid ATO checksum or check ABN Lookup.',
    }
  }

  return undefined
}

const SAVE_FAILURE_DIAGNOSTIC: Rule4Diagnostic = {
  whatHappened: 'Could not save provider profile.',
  financialImpact: FINANCIAL_NO_UPDATE,
  nextStep: 'Please check connection and try again.',
}

export function AeSupplierOnboardingWizard({
  currentStep = 'profile',
  providerName,
  payoutsConfigured = false,
  onSaveProfile,
  onConnectPayouts,
}: AeSupplierOnboardingWizardProps) {
  const [step, setStep] = useState<SupplierOnboardingStep>(currentStep)
  const [name, setName] = useState(providerName ?? '')
  const [website, setWebsite] = useState('')
  const [abn, setAbn] = useState('')
  const [diagnostic, setDiagnostic] = useState<Rule4Diagnostic>()
  const [pending, setPending] = useState(false)
  const [profileCompleted, setProfileCompleted] = useState(
    currentStep === 'payouts' || currentStep === 'first_tool',
  )
  const [firstToolVisited, setFirstToolVisited] = useState(currentStep === 'first_tool')

  useEffect(() => {
    setStep(currentStep)
    if (currentStep === 'payouts' || currentStep === 'first_tool') {
      setProfileCompleted(true)
    }
    if (currentStep === 'first_tool') {
      setFirstToolVisited(true)
    }
  }, [currentStep])

  const isVisited = (stepId: SupplierOnboardingStep): boolean => {
    if (stepId === 'profile') return true
    if (stepId === 'payouts') return profileCompleted
    return firstToolVisited
  }

  const isCompleted = (stepId: SupplierOnboardingStep): boolean => {
    if (stepId === 'profile') return profileCompleted
    if (stepId === 'payouts') return payoutsConfigured
    return false
  }

  const goToStep = (stepId: SupplierOnboardingStep) => {
    if (!isVisited(stepId)) return
    setStep(stepId)
    if (stepId === 'first_tool') setFirstToolVisited(true)
    setDiagnostic(undefined)
  }

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmedName = name.trim()
    const trimmedWebsite = website.trim()
    const cleanAbn = normalizeAbn(abn)

    const validationError = diagnosticForProfileValidation(trimmedName, trimmedWebsite, cleanAbn)
    if (validationError !== undefined) {
      setDiagnostic(validationError)
      return
    }

    if (!onSaveProfile) {
      setProfileCompleted(true)
      setStep('payouts')
      return
    }

    setPending(true)
    setDiagnostic(undefined)
    try {
      const result = await onSaveProfile({
        name: trimmedName,
        website: trimmedWebsite,
        abn: cleanAbn,
      })
      if (result.kind === 'ok') {
        toast.success('Provider profile saved')
        setProfileCompleted(true)
        setStep('payouts')
      } else {
        setDiagnostic({
          whatHappened: result.message,
          financialImpact: FINANCIAL_NO_UPDATE,
          nextStep: SAVE_FAILURE_DIAGNOSTIC.nextStep,
        })
      }
    } catch (cause) {
      void cause
      setDiagnostic(SAVE_FAILURE_DIAGNOSTIC)
    } finally {
      setPending(false)
    }
  }

  const diagnosticSlot = (
    <div className={SLOT} aria-live="polite">
      {diagnostic !== undefined ? (
        <Alert variant="destructive" className="py-2">
          <AlertCircleIcon className="size-4" />
          <AlertTitle className="text-xs">{diagnostic.whatHappened}</AlertTitle>
          <AlertDescription className="text-xs grid gap-0.5">
            <span>{diagnostic.financialImpact}</span>
            <span>{diagnostic.nextStep}</span>
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  )

  const stepsHeader = (
    <nav aria-label="Supplier activation" className="grid grid-cols-1 sm:grid-cols-3 gap-3 border-b pb-4 mb-4">
      {STEP_META.map(({ id, label, duration, icon: Icon }) => {
        const active = step === id
        const completed = isCompleted(id)
        const visited = isVisited(id)
        return (
          <button
            key={id}
            type="button"
            disabled={!visited}
            aria-current={active ? 'step' : undefined}
            onClick={() => goToStep(id)}
            className={`flex flex-col items-start gap-0.5 p-2 rounded-md text-left disabled:opacity-50 disabled:cursor-not-allowed ${TACTILE} ${
              active ? 'bg-primary/10 text-primary font-semibold' : 'text-muted-foreground'
            }`}
          >
            <span className="flex items-center gap-2 w-full">
              {completed ? (
                <CheckCircle2Icon className="size-4 shrink-0" aria-hidden />
              ) : (
                <Icon className="size-4 shrink-0" aria-hidden />
              )}
              <span className="text-xs">{label}</span>
              {completed ? <span className="sr-only">Completed</span> : null}
            </span>
            <span className="text-[10px] text-muted-foreground/80 font-normal pl-6">{duration}</span>
          </button>
        )
      })}
    </nav>
  )

  return (
    <div className={`grid max-w-2xl gap-4 rounded-xl border bg-card p-6 shadow-xs ${SHELL}`}>
      <div className="grid gap-1">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">
          Supplier Activation
        </h2>
        <p className="text-xs text-muted-foreground">
          Complete the 3-step checklist to start selling tools and receiving automated AUD payouts.
        </p>
      </div>

      {stepsHeader}

      {diagnosticSlot}

      {step === 'profile' && (
        <form onSubmit={(e) => void handleProfileSubmit(e)} className="grid gap-4">
          <Alert className="border-border bg-muted/40 py-2.5">
            <AlertTitle className="text-xs font-semibold">Step 1: Business Profile & Tax Facts</AlertTitle>
            <AlertDescription className="text-xs text-muted-foreground">
              Define your public supplier brand and verify your Australian tax registration for invoice compliance.
            </AlertDescription>
          </Alert>

          <FieldGroup className="grid gap-3">
            <Field>
              <FieldLabel htmlFor="supplier-name" className="text-xs">
                Supplier / Brand Name
              </FieldLabel>
              <Input
                id="supplier-name"
                value={name}
                disabled={pending}
                onChange={(e) => {
                  setName(e.target.value)
                  setDiagnostic(undefined)
                }}
                placeholder="e.g. Acme AI Systems"
                className="text-sm"
              />
              <FieldDescription className="text-[11px]">
                The public name displayed on Tool cards and invoices.
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel htmlFor="supplier-website" className="text-xs">
                Provider Website (HTTPS)
              </FieldLabel>
              <Input
                id="supplier-website"
                type="url"
                value={website}
                disabled={pending}
                onChange={(e) => {
                  setWebsite(e.target.value)
                  setDiagnostic(undefined)
                }}
                placeholder="https://api.acme.example.com"
                className="text-sm font-mono"
              />
              <FieldDescription className="text-[11px]">
                The secure endpoint origin that controls your capability supply.
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel htmlFor="supplier-abn" className="text-xs">
                Australian Business Number (ABN)
              </FieldLabel>
              <Input
                id="supplier-abn"
                value={abn}
                disabled={pending}
                onChange={(e) => {
                  const formatted = formatAbnDisplay(e.target.value)
                  setAbn(formatted)
                  setDiagnostic(undefined)
                }}
                placeholder="51 824 753 556"
                className={ABN_INPUT_CLASS}
              />
              <FieldDescription className="text-[11px]">
                Your 11-digit ABN for GST attribution and Australian Tax Invoice issuance.
              </FieldDescription>
            </Field>
          </FieldGroup>

          <div className="flex justify-end pt-2">
            <Button
              type="submit"
              disabled={pending}
              className={`gap-2 min-h-touch ${TACTILE}`}
            >
              <span>{pending ? 'Saving profile...' : 'Continue to Payouts'}</span>
              <ArrowRightIcon className="size-4" />
            </Button>
          </div>
        </form>
      )}

      {step === 'payouts' && (
        <div className="grid gap-4">
          <Alert className="border-border bg-muted/40 py-2.5">
            <CreditCardIcon className="size-4 text-primary" />
            <AlertTitle className="text-xs font-semibold">Step 2: Connect Bank Account via Stripe Express</AlertTitle>
            <AlertDescription className="text-xs text-muted-foreground">
              Stripe Express securely hosts KYC and identity verification. Direct credit settlements are deposited into your Australian bank account (BSB + Account Number). Agentic Economy never stores account numbers.
            </AlertDescription>
          </Alert>

          <div className="rounded-lg border bg-muted/20 p-4 grid gap-3">
            <div className="flex items-center justify-between gap-3">
              <div className="grid gap-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-semibold text-foreground">Payout Status</span>
                  {payoutsConfigured ? (
                    <Badge variant="success" className="gap-1">
                      <CheckCircle2Icon className="size-3" />
                      Ready
                    </Badge>
                  ) : (
                    <Badge variant="warning" className="gap-1">
                      <AlertCircleIcon className="size-3" />
                      Action Required
                    </Badge>
                  )}
                </div>
                <span className="text-[11px] text-muted-foreground">
                  {payoutsConfigured
                    ? 'Bank account connected for monthly settlements.'
                    : 'Connect your Australian bank account or debit card for direct credit.'}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2 flex-wrap">
              <Button
                type="button"
                onClick={() => void onConnectPayouts?.()}
                className={`min-h-touch ${TACTILE}`}
              >
                Set up Payouts with Stripe
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setFirstToolVisited(true)
                  setStep('first_tool')
                }}
                className={`min-h-touch ${TACTILE}`}
              >
                Skip for now
              </Button>
            </div>
          </div>
        </div>
      )}

      {step === 'first_tool' && (
        <div className="grid gap-4">
          <Alert className="border-border bg-muted/40 py-2.5">
            <WrenchIcon className="size-4 text-primary" />
            <AlertTitle className="text-xs font-semibold">Step 3: Add Your First Tool</AlertTitle>
            <AlertDescription className="text-xs text-muted-foreground">
              Import an OpenAPI specification, MCP server definition, or x402 payment contract to publish your first callable tool.
            </AlertDescription>
          </Alert>

          <div className="rounded-lg border bg-muted/20 p-6 flex flex-col items-center justify-center text-center gap-3">
            <WrenchIcon className="size-8 text-primary/80" />
            <div>
              <h3 className="text-sm font-semibold text-foreground">Ready to connect supply</h3>
              <p className="text-xs text-muted-foreground max-w-sm">
                AE provides instant schema validation, pricing config, and a zero-cost test console.
              </p>
            </div>
            <Button asChild className={`gap-2 min-h-touch mt-2 ${TACTILE}`}>
              <Link to="/owner/operations/new">
                <span>Import OpenAPI / MCP Tool</span>
                <ArrowRightIcon className="size-4" />
              </Link>
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
