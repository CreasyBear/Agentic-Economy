'use client'

import { ExternalLink, Lock } from 'lucide-react'
import { useState } from 'react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from '@/lib/ui/toast'
import type {
  CardBrandDisplay,
  ExpiryBadgeKind,
  SavedPaymentMethodsSummary,
} from '@/modules/money/saved-payment-methods.view-model'

export type AeSavedPaymentMethodsCardProps = Readonly<{
  summary?: SavedPaymentMethodsSummary
  isLoading?: boolean
  onManage: () => Promise<{ portalUrl?: string } | void> | void
  nowMs?: number
}>

function cardBrandDisplay(brand: string): CardBrandDisplay {
  const normalized = brand.trim().toLowerCase()
  switch (normalized) {
    case 'visa':
      return { label: 'Visa', letters: 'V' }
    case 'mastercard':
      return { label: 'Mastercard', letters: 'MC' }
    case 'amex':
      return { label: 'Amex', letters: 'AX' }
    case 'discover':
      return { label: 'Discover', letters: 'D' }
    case 'diners':
      return { label: 'Diners Club', letters: 'DC' }
    case 'jcb':
      return { label: 'JCB', letters: 'JCB' }
    case 'unionpay':
      return { label: 'UnionPay', letters: 'UP' }
    case 'eftpos_au':
      return { label: 'Eftpos', letters: 'EF' }
    default:
      return { label: 'Card', letters: '•' }
  }
}

function formatExpiry(expMonth: number, expYear: number): string {
  const month = String(expMonth).padStart(2, '0')
  const year = String(expYear).slice(-2)
  return `${month}/${year}`
}

function expiryEndMs(expMonth: number, expYear: number): number {
  return new Date(expYear, expMonth, 0, 23, 59, 59, 999).getTime()
}

function expiryBadgeKind(expMonth: number, expYear: number, nowMs: number): ExpiryBadgeKind | null {
  const endMs = expiryEndMs(expMonth, expYear)
  if (endMs < nowMs) {
    return 'expired'
  }
  const remainingMs = endMs - nowMs
  if (remainingMs <= 30 * 24 * 60 * 60 * 1000) {
    return 'expires_soon'
  }
  return null
}

const CTA_PRESS_CLASS =
  'min-h-touch enabled:active:scale-[0.98] transition-transform duration-100 ease-out motion-reduce:transition-none motion-reduce:active:scale-100'

const TRUST_LINE_COPY = 'Stored securely by Stripe, never touches our servers.'

const PORTAL_HELPER_COPY =
  "Opens Stripe's hosted customer portal to add, update, or remove cards."

function StripeTrustLine() {
  return (
    <div className="flex min-h-[1.25rem] items-center gap-1.5 text-xs text-muted-foreground">
      <Lock className="size-3.5 shrink-0" aria-hidden="true" />
      <span>{TRUST_LINE_COPY}</span>
    </div>
  )
}

function PortalHelperText() {
  return <p className="min-h-[2.5rem] text-xs text-muted-foreground">{PORTAL_HELPER_COPY}</p>
}

function DiagnosticSlot({ showError }: { showError: boolean }) {
  return (
    <div className="min-h-[5.5rem]" aria-live="polite">
      {showError ? (
        <Alert variant="destructive">
          <AlertTitle className="text-sm font-medium">Could not open Stripe billing portal.</AlertTitle>
          <AlertDescription className="grid gap-1 text-xs">
            <span>A$0.00 charged — your payment methods are unchanged.</span>
            <span>Please check your network connection or try again in a few moments.</span>
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  )
}

export function AeSavedPaymentMethodsCard({
  summary,
  isLoading = false,
  onManage,
  nowMs,
}: AeSavedPaymentMethodsCardProps) {
  const [managing, setManaging] = useState(false)
  const [portalDiagnostic, setPortalDiagnostic] = useState(false)
  const [mountNow] = useState(() => nowMs ?? Date.now())
  const effectiveNow = nowMs ?? mountNow

  async function handleManage() {
    if (managing) return
    setManaging(true)
    setPortalDiagnostic(false)
    try {
      const result = await onManage()
      if (result && typeof result.portalUrl === 'string' && result.portalUrl.trim().length > 0) {
        window.location.assign(result.portalUrl)
      } else {
        throw new Error('portal_url_missing')
      }
    } catch (cause) {
      void cause
      setPortalDiagnostic(true)
      toast.error('Could not open Stripe billing portal.', {
        description: 'Please check your network connection or try again in a few moments.',
      })
    } finally {
      setManaging(false)
    }
  }

  if (isLoading) {
    return (
      <div
        className="grid gap-3 border-t border-border pt-4"
        aria-busy="true"
        role="status"
        aria-label="Loading payment methods"
      >
        <Skeleton className="h-5 w-40" />
        <Skeleton className="min-h-[4.5rem] w-full" />
        <Skeleton className="h-4 w-72 max-w-full" />
        <Skeleton className="min-h-[2.5rem] w-full" />
        <Skeleton className="min-h-[5.5rem] w-full" />
        <Skeleton className="h-10 w-44" />
      </div>
    )
  }

  const ready = summary?.kind === 'ready' && summary.hasPaymentMethod

  return (
    <div className="grid gap-3 border-t border-border pt-4">
      <h3 className="font-medium">Payment methods</h3>

      <div className="min-h-[4.5rem]">
        {ready ? (
          <div className="grid gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <div
                className="flex size-9 shrink-0 items-center justify-center rounded-md border border-border bg-muted font-mono text-[10px] font-semibold uppercase tabular-nums text-foreground"
                aria-hidden="true"
              >
                {cardBrandDisplay(summary.card.brand).letters}
              </div>
              <Badge variant="secondary">{cardBrandDisplay(summary.card.brand).label}</Badge>
              {summary.card.isDefault === true ? (
                <Badge variant="outline">Default</Badge>
              ) : null}
            </div>
            <p
              className="font-mono text-sm tabular-nums text-foreground"
              aria-label={`Card ending in ${summary.card.last4}`}
            >
              {`•••• ${summary.card.last4}`}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-mono text-sm tabular-nums text-muted-foreground">
                {`Expires ${formatExpiry(summary.card.expMonth, summary.card.expYear)}`}
              </p>
              {(() => {
                const kind = expiryBadgeKind(summary.card.expMonth, summary.card.expYear, effectiveNow)
                if (kind === 'expired') {
                  return <Badge variant="destructive">Expired</Badge>
                }
                if (kind === 'expires_soon') {
                  return (
                    <Badge variant="outline" className="border-warning/50 text-warning">
                      Expires next month
                    </Badge>
                  )
                }
                return null
              })()}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No saved card. Add a card to enable automatic credit recharge and seamless tool calls.
          </p>
        )}
      </div>

      <StripeTrustLine />
      <PortalHelperText />
      <DiagnosticSlot showError={portalDiagnostic} />

      {ready ? (
        <Button
          type="button"
          variant="secondary"
          disabled={managing}
          className={CTA_PRESS_CLASS}
          onClick={() => {
            void handleManage()
          }}
        >
          {managing ? 'Opening…' : 'Manage in Stripe'}
          <ExternalLink className="size-4 shrink-0" aria-hidden="true" />
        </Button>
      ) : (
        <Button
          type="button"
          disabled={managing}
          className={CTA_PRESS_CLASS}
          onClick={() => {
            void handleManage()
          }}
        >
          {managing ? 'Opening…' : 'Add card'}
          <ExternalLink className="size-4 shrink-0" aria-hidden="true" />
        </Button>
      )}
    </div>
  )
}
