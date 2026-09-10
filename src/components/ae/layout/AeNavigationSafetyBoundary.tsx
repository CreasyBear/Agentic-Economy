import { useBlocker } from '@tanstack/react-router'
import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'

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
}>

/**
 * Owns navigation interruption only. Dirty comparison, persistence, entered
 * values, and the truth of the latest save remain with the caller.
 */
export function AeNavigationSafetyBoundary({
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
}: AeNavigationSafetyBoundaryProps) {
  const [dialogDismissed, setDialogDismissed] = useState(false)
  const departureTriggerRef = useRef<HTMLElement | null>(null)
  const navigationBlockedDuringSave = useRef(false)
  const shouldBlockNavigation = useCallback(() => {
    if (!state.dirty) return false
    if (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement) {
      departureTriggerRef.current = document.activeElement
    }
    return true
  }, [state.dirty])
  const blocker = useBlocker({
    shouldBlockFn: shouldBlockNavigation,
    enableBeforeUnload: shouldBlockNavigation,
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
    if (state.saveOutcome === 'saved') blocker.proceed()
    else blocker.reset()
  }, [blocker, state.pending, state.saveOutcome])

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
