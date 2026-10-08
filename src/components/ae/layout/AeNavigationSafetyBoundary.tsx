import { useNavigationSafetyPublisher } from './AeNavigationSafetyContext'
import { useBlocker, useRouter } from '@tanstack/react-router'
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react'

import { AeConfirmDialog } from '@/components/ae/feedback/AeConfirmDialog'

export type AeNavigationSaveOutcome = 'idle' | 'saved' | 'failed' | 'outcome_unknown'

export type AeNavigationSafetyState = Readonly<{
  dirty: boolean
  pending: boolean
  saveOutcome: AeNavigationSaveOutcome
}>

type AeNavigationSafetyBoundaryProps = Readonly<{
  children: ReactNode
  state: AeNavigationSafetyState
  title: string
  pendingTitle: string
  description: string
  pendingDescription: string
  saveActionRef: RefObject<HTMLElement | null>
  headingRef: RefObject<HTMLElement | null>
  confirmLabel?: string
  cancelLabel?: string
  pendingCancelLabel?: string
  blockSearchChanges?: boolean
}>

/**
 * Owns navigation interruption only. Dirty comparison, persistence, entered
 * values, and the truth of the latest save remain with the caller.
 * Requires current draft dirty/pending state from its owner.
 * Ensures a queued departure resumes only after a confirmed save with no edits left.
 * Invariant a completed earlier save cannot discard a newer draft.
 * On failed, unknown or still-dirty completion, cancel departure and retain the form.
 */
function AeNavigationSafetyBlocker({
  children,
  state,
  title,
  pendingTitle,
  description,
  pendingDescription,
  saveActionRef,
  headingRef,
  confirmLabel = 'Leave anyway',
  cancelLabel = 'Continue editing',
  pendingCancelLabel = 'Keep waiting',
  blockSearchChanges = false,
}: AeNavigationSafetyBoundaryProps) {
  const [dialogDismissed, setDialogDismissed] = useState(false)
  const departureTriggerRef = useRef<HTMLElement | null>(null)
  const navigationBlockedDuringSave = useRef(false)
  const shouldBlockNavigation = useCallback(({ current, next }: {
    current: { pathname: string; search?: unknown }
    next: { pathname: string; search?: unknown }
  }) => {
    if (!state.dirty || (current.pathname === next.pathname
      && (!blockSearchChanges || JSON.stringify(current.search ?? {}) === JSON.stringify(next.search ?? {})))) return false
    if (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement) {
      departureTriggerRef.current = document.activeElement
    }
    return true
  }, [state.dirty, blockSearchChanges])
  const blocker = useBlocker({
    shouldBlockFn: shouldBlockNavigation,
    enableBeforeUnload: () => state.dirty,
    withResolver: true,
  })

  useEffect(() => {
    if (blocker.status === 'idle') {
      navigationBlockedDuringSave.current = false
      setDialogDismissed(false)
      return
    }
    if (state.pending) navigationBlockedDuringSave.current = true
  }, [blocker.status, state.pending])

  useEffect(() => {
    if (
      blocker.status !== 'blocked'
      || !navigationBlockedDuringSave.current
      || state.pending
    ) return
    navigationBlockedDuringSave.current = false
    setDialogDismissed(false)
    if (state.saveOutcome === 'saved' && !state.dirty) blocker.proceed()
    else blocker.reset()
  }, [blocker, state.dirty, state.pending, state.saveOutcome])

  return (
    <>
      {children}
      <AeConfirmDialog
        open={blocker.status === 'blocked' && !dialogDismissed}
        onOpenChange={(open) => {
          if (open || blocker.status !== 'blocked') return
          if (state.pending) {
            setDialogDismissed(true)
            return
          }
          blocker.reset()
        }}
        title={state.pending ? pendingTitle : title}
        description={state.pending ? pendingDescription : description}
        confirmLabel={confirmLabel}
        cancelLabel={state.pending ? pendingCancelLabel : cancelLabel}
        showConfirm={!state.pending}
        returnFocusRef={departureTriggerRef}
        returnFocusFallbackRefs={[saveActionRef, headingRef]}
        onConfirm={() => {
          if (blocker.status === 'blocked') blocker.proceed()
        }}
      />
    </>
  )
}

export function AeNavigationSafetyBoundary(props: AeNavigationSafetyBoundaryProps) {
  const publish = useNavigationSafetyPublisher()
  const [owner] = useState(() => Symbol('navigation-safety-owner'))
  const focusOwner = useCallback(() => {
    for (const target of [props.saveActionRef.current, props.headingRef.current]) {
      if (!target?.isConnected || target.matches(':disabled')) continue
      target.focus()
      target.scrollIntoView?.({ block: 'center' })
      return
    }
  }, [props.saveActionRef, props.headingRef])
  // Layout publication withholds upstream Account switching before paint. The
  // existing route blocker remains the sole owner of deliberate departure.
  useLayoutEffect(() => {
    const guarded = props.state.dirty || props.state.pending || props.state.saveOutcome === 'outcome_unknown'
    publish?.(owner, guarded ? { pending: props.state.pending, unknown: props.state.saveOutcome === 'outcome_unknown', focus: focusOwner } : undefined)
    return () => publish?.(owner, undefined)
  }, [focusOwner, owner, props.state.dirty, props.state.pending, props.state.saveOutcome, publish])
  const router = useRouter({ warn: false })
  if (!router) return props.children
  return <AeNavigationSafetyBlocker {...props} />
}
