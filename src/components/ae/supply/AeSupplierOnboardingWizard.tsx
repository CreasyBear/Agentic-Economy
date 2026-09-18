'use client'

import { useState } from 'react'
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
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { isValidAbn, normalizeAbn } from '@/modules/money/public'

export type SupplierOnboardingStep = 'profile' | 'payouts' | 'first_tool'

export type AeSupplierOnboardingWizardProps = Readonly<{
  currentStep?: SupplierOnboardingStep
  providerName?: string
  payoutsConfigured?: boolean
  onSaveProfile?: (profile: { name: string; website: string; abn: string }) => Promise<{ kind: 'ok' } | { kind: 'error'; message: string }>
  onConnectPayouts?: () => void | Promise<void>
}>

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
  const [error, setError] = useState<string>()
  const [pending, setPending] = useState(false)

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmedName = name.trim()
    const trimmedWebsite = website.trim()
    const cleanAbn = normalizeAbn(abn)

    if (trimmedName.length === 0) {
      setError('Enter your supplier / brand name.')
      return
    }

    try {
      const parsedUrl = new URL(trimmedWebsite)
      if (parsedUrl.protocol !== 'https:') {
        setError('Provider website must use HTTPS.')
        return
      }
    } catch (cause) {
      void cause;
      setError('Enter a valid HTTPS provider website.')
      return
    }

    if (!isValidAbn(cleanAbn)) {
      setError('Enter a valid 11-digit Australian Business Number (ABN).')
      return
    }

    if (!onSaveProfile) {
      setStep('payouts')
      return
    }

    setPending(true)
    setError(undefined)
    try {
      const result = await onSaveProfile({
        name: trimmedName,
        website: trimmedWebsite,
        abn: cleanAbn,
      })
      if (result.kind === 'ok') {
        setStep('payouts')
      } else {
        setError(result.message)
      }
    } catch (cause) {
      void cause;
      setError('Network error saving provider profile. Try again.')
    } finally {
      setPending(false)
    }
  }

  const stepsHeader = (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 border-b pb-4 mb-4">
      <div className={`flex items-center gap-2 p-2 rounded-md ${step === 'profile' ? 'bg-primary/10 text-primary font-semibold' : 'text-muted-foreground'}`}>
        <Building2Icon className="size-4 shrink-0" />
        <span className="text-xs">1. Business Profile</span>
      </div>
      <div className={`flex items-center gap-2 p-2 rounded-md ${step === 'payouts' ? 'bg-primary/10 text-primary font-semibold' : 'text-muted-foreground'}`}>
        <CreditCardIcon className="size-4 shrink-0" />
        <span className="text-xs">2. Connect Bank Account</span>
      </div>
      <div className={`flex items-center gap-2 p-2 rounded-md ${step === 'first_tool' ? 'bg-primary/10 text-primary font-semibold' : 'text-muted-foreground'}`}>
        <WrenchIcon className="size-4 shrink-0" />
        <span className="text-xs">3. Add First Tool</span>
      </div>
    </div>
  )

  return (
    <div className="grid max-w-2xl gap-4 rounded-xl border bg-card p-6 shadow-xs">
      <div className="grid gap-1">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">
          Supplier Activation
        </h2>
        <p className="text-xs text-muted-foreground">
          Complete the 3-step checklist to start selling tools and receiving automated AUD payouts.
        </p>
      </div>

      {stepsHeader}

      {step === 'profile' && (
        <form onSubmit={(e) => void handleProfileSubmit(e)} className="grid gap-4">
          <Alert className="border-border bg-muted/40 py-2.5">
            <AlertTitle className="text-xs font-semibold">Step 1: Business Profile & Tax Facts</AlertTitle>
            <AlertDescription className="text-xs text-muted-foreground">
              Define your public supplier brand and verify your Australian tax registration for invoice compliance.
            </AlertDescription>
          </Alert>

          {error && (
            <Alert variant="destructive" className="py-2">
              <AlertCircleIcon className="size-4" />
              <AlertDescription className="text-xs">{error}</AlertDescription>
            </Alert>
          )}

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
                  setError(undefined)
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
                  setError(undefined)
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
                  setAbn(e.target.value)
                  setError(undefined)
                }}
                placeholder="51 824 753 556"
                className="text-sm font-mono"
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
              className="gap-2 min-h-touch"
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
              Connect your bank account via Stripe Express to receive monthly tool earnings. All banking and KYC details are securely hosted by Stripe.
            </AlertDescription>
          </Alert>

          <div className="rounded-lg border bg-muted/20 p-4 grid gap-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-semibold block text-foreground">
                  Payout Status: {payoutsConfigured ? 'Ready' : 'Action Required'}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {payoutsConfigured
                    ? 'Bank account connected for monthly settlements.'
                    : 'Connect your Australian bank account or debit card for direct credit.'}
                </span>
              </div>
              {payoutsConfigured && (
                <CheckCircle2Icon className="size-5 text-success" />
              )}
            </div>

            <div className="flex items-center gap-2 pt-2">
              <Button
                type="button"
                onClick={() => void onConnectPayouts?.()}
                className="min-h-touch"
              >
                Set up Payouts with Stripe
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setStep('first_tool')}
                className="min-h-touch"
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
            <Button asChild className="gap-2 min-h-touch mt-2">
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
