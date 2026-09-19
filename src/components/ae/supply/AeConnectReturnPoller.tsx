'use client'

import { useEffect, useState, useRef, type ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  ExternalLinkIcon,
  Loader2Icon,
  ArrowRightIcon,
} from 'lucide-react'

import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { buttonVariants } from '@/components/ui/button-variants'
import { cn } from '@/lib/utils'
import { toast } from '@/lib/ui/toast'
import type { OwnerConnectReadinessReadback } from '@/modules/money/server'

import {
  READY_DESCRIPTION,
  READY_TITLE,
  RESTRICTED_DIAGNOSTIC,
  SHELL,
  TACTILE,
  TIMEOUT_DIAGNOSTIC,
  VERIFYING_DESCRIPTION,
  VERIFYING_TITLE,
  type ConnectReturnDiagnostic,
} from './connect-return-poller-copy'

export type AeConnectReturnPollerProps = Readonly<{
  initialReadiness?: OwnerConnectReadinessReadback
  onPollReadiness: () => Promise<OwnerConnectReadinessReadback>
  onReadinessAchieved?: () => void
  onResumeVerification?: () => void | Promise<void>
  pollIntervalMs?: number
  maxPollTimeMs?: number
}>

type PollerStatus = 'verifying' | 'ready' | 'restricted' | 'timeout' | 'error'

function isRestrictedAccount(
  entry: OwnerConnectReadinessReadback & { kind: 'available' },
): boolean {
  return entry.accounts.some(
    (a) =>
      a.account.state === 'restricted' ||
      a.account.detailsSubmitted === false ||
      a.payout.payoutState === 'held_kyc',
  )
}

function isReadyAccount(entry: OwnerConnectReadinessReadback & { kind: 'available' }): boolean {
  return entry.accounts.some((a) => a.account.state === 'ready')
}

function statusFromReadiness(readiness?: OwnerConnectReadinessReadback): PollerStatus | null {
  if (readiness?.kind !== 'available') return null
  if (isReadyAccount(readiness)) return 'ready'
  if (isRestrictedAccount(readiness)) return 'restricted'
  return null
}

function ConnectRule4Playbook({
  diagnostic,
  variant = 'destructive',
  children,
}: Readonly<{
  diagnostic: ConnectReturnDiagnostic
  variant?: 'destructive' | 'default'
  children?: ReactNode
}>) {
  return (
    <Alert variant={variant} className="py-2.5">
      <AlertTriangleIcon className="size-4" />
      <div className="col-start-2 grid gap-related text-xs">
        <PlaybookSection title="What happened" body={diagnostic.whatHappened} />
        <PlaybookSection title="Financial impact" body={diagnostic.financialImpact} />
        <PlaybookSection title="Next step" body={diagnostic.nextStep} />
        {children}
      </div>
    </Alert>
  )
}

function PlaybookSection({ title, body }: Readonly<{ title: string; body: ReactNode }>) {
  return (
    <div className="grid gap-intra">
      <h3 className="text-xs font-medium text-muted-foreground">{title}</h3>
      <p className="text-xs text-foreground">{body}</p>
    </div>
  )
}

export function AeConnectReturnPoller({
  initialReadiness,
  onPollReadiness,
  onReadinessAchieved,
  onResumeVerification,
  pollIntervalMs = 2000,
  maxPollTimeMs = 60000,
}: AeConnectReturnPollerProps) {
  const [readiness, setReadiness] = useState<OwnerConnectReadinessReadback | undefined>(
    initialReadiness,
  )
  const [status, setStatus] = useState<PollerStatus>(() => {
    const derived = statusFromReadiness(initialReadiness)
    if (derived) return derived
    return 'verifying'
  })

  const startTimeRef = useRef<number | null>(null)
  const pollerRef = useRef<NodeJS.Timeout | null>(null)
  const hasToastedRef = useRef(false)

  const detailsSubmitted =
    readiness?.kind === 'available'
      ? readiness.accounts.every((a) => a.account.detailsSubmitted)
      : true

  useEffect(() => {
    if (startTimeRef.current === null) {
      startTimeRef.current = Date.now()
    }
  }, [])

  useEffect(() => {
    if (status !== 'ready' || hasToastedRef.current) return
    hasToastedRef.current = true
    toast.success('Payout setup verified', {
      description: 'Your bank account is ready to receive automated settlements.',
    })
  }, [status])

  useEffect(() => {
    if (initialReadiness === undefined) return
    setReadiness(initialReadiness)
    if (status !== 'verifying') return
    const derived = statusFromReadiness(initialReadiness)
    if (derived) setStatus(derived)
  }, [initialReadiness, status])

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
          if (isReadyAccount(next)) {
            setStatus('ready')
            onReadinessAchieved?.()
            return
          }
          if (isRestrictedAccount(next)) {
            setStatus('restricted')
            return
          }
        }
      } catch (cause) {
        void cause
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

  const shellClassName = cn('grid gap-3 rounded-lg border bg-card p-4 shadow-xs', SHELL)

  return (
    <div className={shellClassName}>
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
        <div className="grid gap-2 rounded-lg border border-border bg-muted/30 p-3">
          <div className="flex items-center gap-2">
            <div className="relative flex size-2.5 items-center justify-center">
              <span
                className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-75 motion-reduce:animate-none"
              />
              <span className="relative inline-flex size-1.5 rounded-full bg-primary" />
            </div>
            <h4 className="text-xs font-medium text-foreground">{VERIFYING_TITLE}</h4>
          </div>
          <p className="text-xs text-muted-foreground">{VERIFYING_DESCRIPTION}</p>
        </div>
      )}

      {status === 'ready' && (
        <div className="grid gap-2 rounded-lg border border-success-ring bg-success-subtle p-3">
          <div className="flex items-start gap-2">
            <CheckCircle2Icon className="size-5 shrink-0 text-success" />
            <div className="grid min-w-0 gap-1">
              <h4 className="text-sm font-semibold text-foreground">{READY_TITLE}</h4>
              <p className="text-xs text-muted-foreground">{READY_DESCRIPTION}</p>
            </div>
          </div>
          <Link
            to="/owner/operations/new"
            className={cn(buttonVariants({ size: 'sm' }), 'gap-1.5 min-h-touch w-fit', TACTILE)}
          >
            <span>Add your first Tool</span>
            <ArrowRightIcon className="size-3.5" />
          </Link>
        </div>
      )}

      {status === 'restricted' && (
        <ConnectRule4Playbook diagnostic={RESTRICTED_DIAGNOSTIC}>
          <div className="pt-1">
            <Button
              type="button"
              size="sm"
              className={cn('gap-1.5 min-h-touch', TACTILE)}
              onClick={() => void onResumeVerification?.()}
            >
              <ExternalLinkIcon className="size-3.5" />
              <span>
                {detailsSubmitted ? 'Update verification documents' : 'Resume Stripe verification'}
              </span>
            </Button>
          </div>
        </ConnectRule4Playbook>
      )}

      {status === 'timeout' && (
        <ConnectRule4Playbook diagnostic={TIMEOUT_DIAGNOSTIC} variant="default">
          <div className="pt-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={cn('min-h-touch', TACTILE)}
              onClick={() => {
                startTimeRef.current = Date.now()
                setStatus('verifying')
              }}
            >
              Check again
            </Button>
          </div>
        </ConnectRule4Playbook>
      )}
    </div>
  )
}
