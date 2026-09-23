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

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { buttonVariants } from '@/components/ui/button-variants'
import { cn } from '@/lib/utils'
import { toast } from '@/lib/ui/toast'
import { getStatusPresentation } from '@/lib/ui/status-presentation'
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

function PlaybookSection({ title, body }: Readonly<{ title: string; body: ReactNode }>) {
  return (
    <div className="grid gap-intra">
      <h3 className="text-xs font-medium text-muted-foreground">{title}</h3>
      <p className="text-xs text-foreground">{body}</p>
    </div>
  )
}

function statusCopy(status: PollerStatus): Readonly<{
  title: string
  description: string
  diagnostic: ConnectReturnDiagnostic | undefined
}> {
  switch (status) {
    case 'ready':
      return { title: READY_TITLE, description: READY_DESCRIPTION, diagnostic: undefined }
    case 'restricted':
      return { title: '', description: '', diagnostic: RESTRICTED_DIAGNOSTIC }
    case 'timeout':
      return { title: '', description: '', diagnostic: TIMEOUT_DIAGNOSTIC }
    case 'verifying':
    case 'error':
      return { title: VERIFYING_TITLE, description: VERIFYING_DESCRIPTION, diagnostic: undefined }
    default: {
      const _exhaustive: never = status
      return _exhaustive
    }
  }
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
  const [paused, setPaused] = useState(false)

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
    if (paused) {
      if (pollerRef.current) clearTimeout(pollerRef.current)
      return
    }

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
  }, [maxPollTimeMs, onPollReadiness, onReadinessAchieved, paused, pollIntervalMs, status])

  const shellClassName = cn('grid gap-3 rounded-lg border bg-card p-4 shadow-xs', SHELL)
  const copy = statusCopy(status)

  return (
    <div className={shellClassName}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">Stripe Connect Onboarding</span>
          {status === 'verifying' && (
            <Badge variant="outline" className="gap-1.5 animate-pulse text-muted-foreground">
              <Loader2Icon className="size-3 animate-spin" />
              {paused ? getStatusPresentation('paused').label : 'Verifying with Stripe...'}
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
        {status === 'verifying' ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn('min-h-touch w-fit', TACTILE)}
            onClick={() => setPaused((current) => !current)}
          >
            {paused ? 'Resume' : 'Pause'}
          </Button>
        ) : null}
      </div>

      <div
        role="status"
        aria-live="polite"
        className={cn(
          'grid gap-2 rounded-lg border p-3',
          status === 'ready' && 'border-success-ring bg-success-subtle',
          status === 'restricted' && 'border-destructive/40 bg-destructive/5',
          (status === 'verifying' || status === 'timeout' || status === 'error') &&
            'border-border bg-muted/30',
        )}
      >
        <div className="flex items-start gap-2">
          {status === 'verifying' ? (
            <div className="relative mt-1 flex size-2.5 shrink-0 items-center justify-center">
              <span
                className={cn(
                  'absolute inline-flex size-full rounded-full bg-primary opacity-75',
                  paused ? undefined : 'animate-ping motion-reduce:animate-none',
                )}
              />
              <span className="relative inline-flex size-1.5 rounded-full bg-primary" />
            </div>
          ) : null}
          {status === 'ready' ? (
            <CheckCircle2Icon className="size-5 shrink-0 text-success" />
          ) : null}
          {(status === 'restricted' || status === 'timeout') ? (
            <AlertTriangleIcon className="size-4 shrink-0" />
          ) : null}
          {copy.title.length > 0 ? (
            <div className="grid min-w-0 gap-1">
              <h4 className="text-xs font-medium text-foreground sm:text-sm">{copy.title}</h4>
              <p className="text-xs text-muted-foreground">{copy.description}</p>
            </div>
          ) : null}
        </div>

        {copy.diagnostic === undefined ? null : (
          <div className="grid gap-related text-xs">
            <PlaybookSection title="What happened" body={copy.diagnostic.whatHappened} />
            <PlaybookSection title="Financial impact" body={copy.diagnostic.financialImpact} />
            <PlaybookSection title="Next step" body={copy.diagnostic.nextStep} />
          </div>
        )}

        {status === 'ready' ? (
          <Link
            to="/owner/operations/new"
            className={cn(buttonVariants({ size: 'sm' }), 'gap-1.5 min-h-touch w-fit', TACTILE)}
          >
            <span>Add your first Tool</span>
            <ArrowRightIcon className="size-3.5" />
          </Link>
        ) : null}

        {status === 'restricted' ? (
          <div className="pt-1">
            <Button
              type="button"
              size="sm"
              className={cn('gap-1.5 min-h-touch w-fit', TACTILE)}
              onClick={() => void onResumeVerification?.()}
            >
              <ExternalLinkIcon className="size-3.5" />
              <span>
                {detailsSubmitted ? 'Update verification documents' : 'Resume Stripe verification'}
              </span>
            </Button>
          </div>
        ) : null}

        {status === 'timeout' ? (
          <div className="pt-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={cn('min-h-touch w-fit', TACTILE)}
              onClick={() => {
                startTimeRef.current = Date.now()
                setPaused(false)
                setStatus('verifying')
              }}
            >
              Check again
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
