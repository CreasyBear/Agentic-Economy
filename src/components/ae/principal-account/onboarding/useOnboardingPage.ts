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

import {
  onboardingCompletionDescription,
  type UseOnboardingPageInput,
  type UseOnboardingPageResult,
} from './onboarding.contracts'


export function useOnboardingPage(input: UseOnboardingPageInput): UseOnboardingPageResult {
  const navigate = useNavigate()
  const state = useQuery(api.interactiveOnboarding.readState)
  const completeOnboarding = useMutation(api.interactiveOnboarding.complete)

  const [step, setStep] = useState<1 | 2>(input.step ?? 1)
  const [roleIntent, setRoleIntent] = useState<OnboardingRoleIntent | null>(() =>
    input.roleIntent ?? initialRoleIntentFromRedirect(input.redirect),
  )
  const [workspaceName, setWorkspaceName] = useState(input.workspaceName ?? '')
  const [submitting, setSubmitting] = useState(false)
  const [openingWorkspace, setOpeningWorkspace] = useState(false)
  const [roleInvalid, setRoleInvalid] = useState(false)
  const [nameInvalid, setNameInvalid] = useState(false)
  const workspaceInputRef = useRef<HTMLInputElement>(null)
  const buyerRadioRef = useRef<HTMLButtonElement>(null)
  const supplierRadioRef = useRef<HTMLButtonElement>(null)
  const focusRoleAfterBackRef = useRef(false)

  const finishDisabled = submitting
  const completionDescription = onboardingCompletionDescription(input.redirect, roleIntent)

  const persistProgress = useCallback(
    (next: Readonly<{
      step: 1 | 2
      roleIntent: OnboardingRoleIntent | null
      workspaceName: string
    }>) => {
      void navigate({
        to: '/onboarding',
        replace: true,
        search: {
          ...(input.redirect === undefined ? {} : { redirect: input.redirect }),
          ...(next.step === 1 ? {} : { step: 2 as const }),
          ...(next.roleIntent === null ? {} : { roleIntent: next.roleIntent }),
          ...(next.workspaceName === '' ? {} : { workspaceName: next.workspaceName }),
        },
      })
    },
    [input.redirect, navigate],
  )

  const handleRoleIntentChange = useCallback(
    (intent: OnboardingRoleIntent) => {
      setRoleInvalid(false)
      setRoleIntent(intent)
      persistProgress({ step, roleIntent: intent, workspaceName })
    },
    [persistProgress, step, workspaceName],
  )

  const openWorkspaceStep = useCallback(() => {
    if (roleIntent === null) {
      setRoleInvalid(true)
      buyerRadioRef.current?.focus()
      return
    }
    const nextWorkspaceName =
      workspaceName === '' && state?.phase === 'incomplete'
        ? resolveSuggestedWorkspaceName(state.suggestedWorkspaceName)
        : workspaceName
    setWorkspaceName(nextWorkspaceName)
    setStep(2)
    persistProgress({ step: 2, roleIntent, workspaceName: nextWorkspaceName })
  }, [persistProgress, roleIntent, state, workspaceName])

  useEffect(() => {
    if (state?.phase === 'complete') {
      setOpeningWorkspace(true)
      navigate({ to: input.redirect ?? state.redirectPath })
    }
  }, [state, input.redirect, navigate])

  useEffect(() => {
    if (step !== 2 || workspaceName !== '' || state?.phase !== 'incomplete') return
    const suggestedName = resolveSuggestedWorkspaceName(state.suggestedWorkspaceName)
    setWorkspaceName(suggestedName)
    persistProgress({ step: 2, roleIntent, workspaceName: suggestedName })
  }, [persistProgress, roleIntent, state, step, workspaceName])


  useEffect(() => {
    if (step !== 2) return
    if (window.matchMedia('(min-width: 768px)').matches) {
      workspaceInputRef.current?.focus()
    }
  }, [step])

  useEffect(() => {
    if (step !== 1 || !focusRoleAfterBackRef.current) return
    focusRoleAfterBackRef.current = false
    const target =
      roleIntent === 'supplier' ? supplierRadioRef.current : buyerRadioRef.current
    target?.focus()
  }, [step, roleIntent])

  const finishOnboarding = useCallback(
    async (name: string) => {
      if (roleIntent === null || name.trim().length === 0 || submitting) return
      setSubmitting(true)
      try {
        const result = await completeOnboarding({
          roleIntent,
          workspaceName: name,
          correlationRef: `onboarding:${globalThis.crypto.randomUUID()}`,
        })
        const trimmedName = name.trim()
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
    },
    [roleIntent, submitting, completeOnboarding, input.redirect, navigate],
  )

  const surface: UseOnboardingPageResult['surface'] =
    openingWorkspace || state?.phase === 'complete'
      ? { kind: 'opening' }
      : step === 1
        ? { kind: 'role', roleIntent, roleInvalid }
        : {
            kind: 'workspace',
            workspaceName,
            finishDisabled,
            submitting,
            nameInvalid,
            completionDescription,
          }

  return {
    surface,
    workspaceInputRef,
    buyerRadioRef,
    supplierRadioRef,
    onRoleIntentChange: handleRoleIntentChange,
    onContinue: openWorkspaceStep,
    onWorkspaceNameChange: (value) => {
      setNameInvalid(false)
      setWorkspaceName(value)
      persistProgress({ step, roleIntent, workspaceName: value })
    },
    onBack: () => {
      focusRoleAfterBackRef.current = true
      setStep(1)
      persistProgress({ step: 1, roleIntent, workspaceName })
    },
    onFinish: () => {
      if (workspaceName.trim().length === 0) {
        setNameInvalid(true)
        workspaceInputRef.current?.focus()
        return
      }
      void finishOnboarding(workspaceName)
    },
  }
}
