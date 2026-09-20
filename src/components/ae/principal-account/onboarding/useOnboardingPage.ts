import { useMutation, useQuery } from 'convex/react'
import { useNavigate } from '@tanstack/react-router'
import { useCallback, useEffect, useRef, useState } from 'react'

import { toast } from '@/lib/ui/toast'
import {
  initialRoleIntentFromRedirect,
  onboardingCompletionDiagnostic,
  resolveSuggestedWorkspaceName,
  type OnboardingRoleIntent,
} from '@/modules/principal-account/onboarding.contracts'
import { api } from '../../../../../convex/_generated/api'

import type { UseOnboardingPageInput, UseOnboardingPageResult } from './onboarding.contracts'

function isTypingTarget(target: EventTarget | null): boolean {
  if (target === null || !(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable
}

export function useOnboardingPage(input: UseOnboardingPageInput): UseOnboardingPageResult {
  const navigate = useNavigate()
  const state = useQuery(api.interactiveOnboarding.readState)
  const completeOnboarding = useMutation(api.interactiveOnboarding.complete)

  const [step, setStep] = useState<1 | 2>(1)
  const [roleIntent, setRoleIntent] = useState<OnboardingRoleIntent | null>(() =>
    initialRoleIntentFromRedirect(input.redirect),
  )
  const [workspaceName, setWorkspaceName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [openingWorkspace, setOpeningWorkspace] = useState(false)
  const workspaceInputRef = useRef<HTMLInputElement>(null)

  const finishDisabled = workspaceName.trim().length === 0 || submitting
  const continueDisabled = roleIntent === null

  const openWorkspaceStep = useCallback(() => {
    if (state?.phase === 'incomplete') {
      setWorkspaceName(resolveSuggestedWorkspaceName(state.suggestedWorkspaceName))
    }
    setStep(2)
  }, [state])

  useEffect(() => {
    if (state?.phase === 'complete') {
      setOpeningWorkspace(true)
      navigate({ to: input.redirect ?? state.redirectPath })
    }
  }, [state, input.redirect, navigate])

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (isTypingTarget(event.target)) return
      if (event.key === '1') {
        setRoleIntent('buyer')
        return
      }
      if (event.key === '2') {
        setRoleIntent('supplier')
        return
      }
      if (event.key === 'Enter' && step === 1 && roleIntent !== null) {
        event.preventDefault()
        openWorkspaceStep()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [step, roleIntent, openWorkspaceStep])

  useEffect(() => {
    if (step !== 2) return
    if (window.matchMedia('(min-width: 768px)').matches) {
      workspaceInputRef.current?.focus()
    }
  }, [step])

  const handleFinish = useCallback(async () => {
    if (roleIntent === null || finishDisabled) return
    setSubmitting(true)
    try {
      const result = await completeOnboarding({
        roleIntent,
        workspaceName,
        correlationRef: `onboarding:${globalThis.crypto.randomUUID()}`,
      })
      const trimmedName = workspaceName.trim()
      const successTitle =
        roleIntent === 'buyer'
          ? "Workspace created. Let's make your first Call"
          : 'Workspace created. Welcome to Provider Operations'
      toast.success(successTitle, { description: trimmedName })
      setOpeningWorkspace(true)
      navigate({ to: input.redirect ?? result.redirectPath })
    } catch (error: unknown) {
      const diagnostic = onboardingCompletionDiagnostic(error)
      toast.error(diagnostic.title, { description: diagnostic.description })
    } finally {
      setSubmitting(false)
    }
  }, [roleIntent, finishDisabled, workspaceName, completeOnboarding, input.redirect, navigate])

  const surface: UseOnboardingPageResult['surface'] =
    openingWorkspace || state?.phase === 'complete'
      ? { kind: 'opening' }
      : step === 1
        ? { kind: 'role', roleIntent, continueDisabled }
        : { kind: 'workspace', workspaceName, finishDisabled, submitting }

  return {
    surface,
    workspaceInputRef,
    onRoleIntentChange: setRoleIntent,
    onContinue: openWorkspaceStep,
    onWorkspaceNameChange: setWorkspaceName,
    onBack: () => setStep(1),
    onFinish: handleFinish,
  }
}
