import { useMutation, useQuery } from 'convex/react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useCallback, useEffect, useRef, useState } from 'react'

import { AePublicPage } from '@/components/ae/layout/AePublicPage'
import { AeSiteAuthPanel, AeSiteAuthStage } from '@/components/ae/website'
import { Button } from '@/components/ui/button'
import { FieldDescription, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { sanitizeAuthRedirectTarget } from '@/lib/client/auth-redirect'
import { toast } from '@/lib/ui/toast'
import {
  initialRoleIntentFromRedirect,
  onboardingCompletionDiagnostic,
  resolveSuggestedWorkspaceName,
  type OnboardingRoleIntent,
  type OnboardingSearch,
} from '@/modules/principal-account/onboarding.contracts'
import { api } from '../../convex/_generated/api'

const roleCardClassName =
  'min-h-touch cursor-pointer rounded-md border border-border bg-container p-4 hover:bg-muted/60 data-[selected=true]:border-foreground data-[selected=true]:bg-muted enabled:active:scale-[0.98] transition-transform duration-100 ease-out motion-reduce:transition-none motion-reduce:active:scale-100'

function isTypingTarget(target: EventTarget | null): boolean {
  if (target === null || !(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable
}

export const Route = createFileRoute('/onboarding')({
  staticData: { shellMode: 'minimal' },
  validateSearch: (search: Record<string, unknown>): OnboardingSearch => {
    const redirect = sanitizeAuthRedirectTarget(search.redirect)
    if (redirect === undefined || redirect.startsWith('/onboarding')) {
      return {}
    }
    return { redirect }
  },
  head: () => ({
    meta: [
      { title: 'Set up your workspace | Agentic Economy' },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: OnboardingRoute,
})

function OnboardingRoute() {
  const { redirect } = Route.useSearch()
  const navigate = useNavigate()
  const state = useQuery(api.interactiveOnboarding.readState)
  const completeOnboarding = useMutation(api.interactiveOnboarding.complete)

  const [step, setStep] = useState<1 | 2>(1)
  const [roleIntent, setRoleIntent] = useState<OnboardingRoleIntent | null>(() =>
    initialRoleIntentFromRedirect(redirect),
  )
  const [workspaceName, setWorkspaceName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [openingWorkspace, setOpeningWorkspace] = useState(false)
  const workspaceInputRef = useRef<HTMLInputElement>(null)

  const finishDisabled = workspaceName.trim().length === 0 || submitting

  const openWorkspaceStep = useCallback(() => {
    if (state?.phase === 'incomplete') {
      setWorkspaceName(resolveSuggestedWorkspaceName(state.suggestedWorkspaceName))
    }
    setStep(2)
  }, [state])

  useEffect(() => {
    if (state?.phase === 'complete') {
      setOpeningWorkspace(true)
      navigate({ to: redirect ?? state.redirectPath })
    }
  }, [state, redirect, navigate])

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
      navigate({ to: redirect ?? result.redirectPath })
    } catch (error: unknown) {
      const diagnostic = onboardingCompletionDiagnostic(error)
      toast.error(diagnostic.title, { description: diagnostic.description })
    } finally {
      setSubmitting(false)
    }
  }, [roleIntent, finishDisabled, workspaceName, completeOnboarding, redirect, navigate])

  if (openingWorkspace || state?.phase === 'complete') {
    return (
      <AePublicPage>
        <AeSiteAuthStage labelledBy="onboarding-opening-heading" url="/onboarding">
          <AeSiteAuthPanel
            eyebrow="Account"
            title="Opening your workspace"
            titleId="onboarding-opening-heading"
            body="One moment while we take you to your workspace."
          >
            <div
              className="flex min-h-96 items-center justify-center rounded-md border border-border bg-container p-4"
              data-slot="onboarding-opening"
            >
              <p className="text-sm text-muted-foreground">Opening your workspace...</p>
            </div>
          </AeSiteAuthPanel>
        </AeSiteAuthStage>
      </AePublicPage>
    )
  }

  return (
    <AePublicPage>
      <AeSiteAuthStage labelledBy="onboarding-context-heading" url="/onboarding">
        <AeSiteAuthPanel
          eyebrow="Account"
          title="Set up your workspace"
          titleId="onboarding-context-heading"
          body="Choose how you’ll use Agentic Economy and name your workspace."
        >
          <div className="grid min-h-96 gap-section">
            <div className="grid gap-related">
              <p className="text-sm text-muted-foreground">Step {step} of 2</p>
              <div className="grid grid-cols-2 gap-2" aria-hidden>
                <div
                  className="h-0.5 bg-muted transition-[background-color] duration-100 ease-out data-[active=true]:bg-foreground"
                  data-active={step >= 1}
                />
                <div
                  className="h-0.5 bg-muted transition-[background-color] duration-100 ease-out data-[active=true]:bg-foreground"
                  data-active={step >= 2}
                />
              </div>
            </div>

            {step === 1 ? (
              <div className="grid gap-section">
                <RadioGroup
                  value={roleIntent ?? ''}
                  onValueChange={(value) => setRoleIntent(value as OnboardingRoleIntent)}
                  className="grid gap-3"
                >
                  <Label
                    className={roleCardClassName}
                    data-selected={roleIntent === 'buyer'}
                  >
                    <div className="flex gap-3">
                      <RadioGroupItem value="buyer" aria-label="Buyer / Agent Operator" className="mt-1" />
                      <div className="grid flex-1 gap-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium text-foreground">Buyer / Agent Operator</span>
                          <kbd className="text-xs text-muted-foreground font-mono">1</kbd>
                        </div>
                        <FieldDescription>
                          Discover Tools, run Calls, and manage spending for your agents.
                        </FieldDescription>
                      </div>
                    </div>
                  </Label>
                  <Label
                    className={roleCardClassName}
                    data-selected={roleIntent === 'supplier'}
                  >
                    <div className="flex gap-3">
                      <RadioGroupItem value="supplier" aria-label="Supplier / Tool Provider" className="mt-1" />
                      <div className="grid flex-1 gap-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium text-foreground">Supplier / Tool Provider</span>
                          <kbd className="text-xs text-muted-foreground font-mono">2</kbd>
                        </div>
                        <FieldDescription>
                          Publish Tools, connect sources, and manage Provider operations.
                        </FieldDescription>
                      </div>
                    </div>
                  </Label>
                </RadioGroup>
                <Button
                  type="button"
                  className="min-h-touch w-full"
                  disabled={roleIntent === null}
                  onClick={openWorkspaceStep}
                >
                  Continue
                </Button>
              </div>
            ) : (
              <div className="grid gap-section">
                <div className="grid gap-2">
                  <FieldLabel htmlFor="onboarding-workspace-name">Workspace name</FieldLabel>
                  <Input
                    ref={workspaceInputRef}
                    id="onboarding-workspace-name"
                    aria-label="Workspace name"
                    value={workspaceName}
                    onChange={(event) => setWorkspaceName(event.currentTarget.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && !finishDisabled) {
                        event.preventDefault()
                        void handleFinish()
                      }
                    }}
                    autoComplete="organization"
                  />
                </div>
                <div className="grid gap-related sm:grid-cols-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-touch w-full"
                    disabled={submitting}
                    onClick={() => setStep(1)}
                  >
                    Back
                  </Button>
                  <Button
                    type="button"
                    className="min-h-touch w-full"
                    disabled={finishDisabled}
                    onClick={() => void handleFinish()}
                  >
                    {submitting ? 'Creating workspace...' : 'Finish setup'}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </AeSiteAuthPanel>
      </AeSiteAuthStage>
    </AePublicPage>
  )
}
