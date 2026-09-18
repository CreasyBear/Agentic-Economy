'use client'

import { useEffect, useState, useRef } from 'react'
import { Link } from '@tanstack/react-router'
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  Loader2Icon,
  ArrowRightIcon,
} from 'lucide-react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { OwnerConnectReadinessReadback } from '@/modules/money/server'

export type AeConnectReturnPollerProps = Readonly<{
  initialReadiness?: OwnerConnectReadinessReadback
  onPollReadiness: () => Promise<OwnerConnectReadinessReadback>
  onReadinessAchieved?: () => void
  pollIntervalMs?: number
  maxPollTimeMs?: number
}>

type PollerStatus = 'verifying' | 'ready' | 'restricted' | 'timeout' | 'error'

export function AeConnectReturnPoller({
  initialReadiness,
  onPollReadiness,
  onReadinessAchieved,
  pollIntervalMs = 2000,
  maxPollTimeMs = 60000,
}: AeConnectReturnPollerProps) {
  const [, setReadiness] = useState<OwnerConnectReadinessReadback | undefined>(initialReadiness)
  const [status, setStatus] = useState<PollerStatus>(() => {
    if (initialReadiness?.kind === 'available') {
      const isReady = initialReadiness.accounts.some((a) => a.account.state === 'ready')
      const isRestricted = initialReadiness.accounts.some((a) => a.account.state === 'restricted')
      if (isReady) return 'ready'
      if (isRestricted) return 'restricted'
    }
    return 'verifying'
  })

  const startTimeRef = useRef<number | null>(null)
  const pollerRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    if (startTimeRef.current === null) {
      startTimeRef.current = Date.now()
    }
  }, [])

  useEffect(() => {
    if (status === 'ready' || status === 'restricted' || status === 'timeout') {
      return
    }

    const check = async () => {
      const start = startTimeRef.current ?? Date.now()
      if (Date.now() - start > maxPollTimeMs) {
        setStatus('timeout')
        return
      }

      try {
        const next = await onPollReadiness()
        setReadiness(next)
        if (next.kind === 'available') {
          const isReady = next.accounts.some((a) => a.account.state === 'ready')
          const isRestricted = next.accounts.some((a) => a.account.state === 'restricted')
          if (isReady) {
            setStatus('ready')
            onReadinessAchieved?.()
            return
          }
          if (isRestricted) {
            setStatus('restricted')
            return
          }
        }
      } catch (cause) {
        void cause;
        // Continue polling until timeout
      }

      pollerRef.current = setTimeout(() => {
        void check()
      }, pollIntervalMs)
    }

    pollerRef.current = setTimeout(() => {
      void check()
    }, pollIntervalMs)

    return () => {
      if (pollerRef.current) clearTimeout(pollerRef.current)
    }
  }, [maxPollTimeMs, onPollReadiness, onReadinessAchieved, pollIntervalMs, status])

  return (
    <div className="grid gap-3 rounded-lg border bg-card p-4 shadow-xs">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-foreground">Stripe Connect Onboarding</span>
          {status === 'verifying' && (
            <Badge variant="outline" className="gap-1.5 animate-pulse text-muted-foreground">
              <Loader2Icon className="size-3 animate-spin" />
              Verifying with Stripe...
            </Badge>
          )}
          {status === 'ready' && (
            <Badge variant="success" className="gap-1.5">
              <CheckCircle2Icon className="size-3" />
              Payouts Ready
            </Badge>
          )}
          {status === 'restricted' && (
            <Badge variant="destructive" className="gap-1.5">
              <AlertTriangleIcon className="size-3" />
              Action Required
            </Badge>
          )}
          {status === 'timeout' && (
            <Badge variant="warning" className="gap-1.5">
              Verification in Progress
            </Badge>
          )}
        </div>
      </div>

      {status === 'verifying' && (
        <Alert className="border-border bg-muted/30 py-2.5">
          <Loader2Icon className="size-4 animate-spin text-primary" />
          <AlertTitle className="text-xs font-medium">Verifying with Stripe...</AlertTitle>
          <AlertDescription className="text-xs text-muted-foreground">
            We are confirming your bank account details and KYC submission with Stripe. This page updates automatically once verified.
          </AlertDescription>
        </Alert>
      )}

      {status === 'ready' && (
        <Alert className="border-success/30 bg-success/10 text-success py-2.5">
          <CheckCircle2Icon className="size-4 text-success" />
          <AlertTitle className="text-xs font-semibold text-foreground">Payouts Ready</AlertTitle>
          <AlertDescription className="text-xs text-muted-foreground">
            Your bank account is connected and ready to receive monthly settlements. You can now publish callable tools to the market.
          </AlertDescription>
          <div className="pt-2">
            <Button asChild size="sm" className="gap-1.5 min-h-touch">
              <Link to="/owner/operations/new">
                <span>Add your first Tool</span>
                <ArrowRightIcon className="size-3.5" />
              </Link>
            </Button>
          </div>
        </Alert>
      )}

      {status === 'restricted' && (
        <Alert variant="destructive" className="py-2.5">
          <AlertTriangleIcon className="size-4" />
          <AlertTitle className="text-xs font-semibold">Action required by Stripe</AlertTitle>
          <AlertDescription className="text-xs">
            Stripe needs additional verification documents before payouts can be activated. Please return to Stripe Express to resolve outstanding requirements.
          </AlertDescription>
        </Alert>
      )}

      {status === 'timeout' && (
        <Alert className="border-warning-ring bg-warning-subtle text-warning-foreground py-2.5">
          <AlertTriangleIcon className="size-4" />
          <AlertTitle className="text-xs font-semibold">Verification still processing</AlertTitle>
          <AlertDescription className="text-xs">
            Stripe is still processing your verification. You can continue setting up tools, and payouts will activate as soon as Stripe completes verification.
          </AlertDescription>
          <div className="pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                startTimeRef.current = Date.now()
                setStatus('verifying')
              }}
              className="min-h-touch"
            >
              Check again
            </Button>
          </div>
        </Alert>
      )}
    </div>
  )
}
