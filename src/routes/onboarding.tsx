import { useMutation, useQuery } from 'convex/react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'

import { AePublicPage } from '@/components/ae/layout/AePublicPage'
import { AeSiteAuthPanel, AeSiteAuthStage } from '@/components/ae/website'
import { Button } from '@/components/ui/button'
import { FieldDescription, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { sanitizeAuthRedirectTarget } from '@/lib/client/auth-redirect'
import { api } from '../../convex/_generated/api'

type OnboardingSearch = {
  redirect?: string
}

type OnboardingRoleIntent = 'buyer' | 'supplier'

export const Route = createFileRoute('/onboarding')({
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
  const [roleIntent, setRoleIntent] = useState<OnboardingRoleIntent | null>(null)
  const [workspaceName, setWorkspaceName] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (state?.phase === 'complete') {
      navigate({ to: redirect ?? state.redirectPath })
    }
  }, [state, redirect, navigate])

  if (state?.phase === 'complete') {
    return null
  }

  const finishDisabled = workspaceName.trim().length === 0 || submitting

  async function handleFinish() {
    if (roleIntent === null || finishDisabled) return
    setSubmitting(true)
    try {
      const result = await completeOnboarding({
        roleIntent,
        workspaceName,
        correlationRef: `onboarding:${globalThis.crypto.randomUUID()}`,
      })
      navigate({ to: redirect ?? result.redirectPath })
    } finally {
      setSubmitting(false)
    }
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
          {step === 1 ? (
            <div className="grid gap-section">
              <RadioGroup
                value={roleIntent ?? ''}
                onValueChange={(value) => setRoleIntent(value as OnboardingRoleIntent)}
                className="grid gap-3"
              >
                <Label className="min-h-touch cursor-pointer rounded-md border border-border p-4">
                  <div className="flex gap-3">
                    <RadioGroupItem value="buyer" aria-label="Buyer / Agent Operator" className="mt-1" />
                    <div className="grid gap-1">
                      <span className="font-medium text-foreground">Buyer / Agent Operator</span>
                      <FieldDescription>
                        Discover Tools, run Calls, and manage spending for your agents.
                      </FieldDescription>
                    </div>
                  </div>
                </Label>
                <Label className="min-h-touch cursor-pointer rounded-md border border-border p-4">
                  <div className="flex gap-3">
                    <RadioGroupItem value="supplier" aria-label="Supplier / Tool Provider" className="mt-1" />
                    <div className="grid gap-1">
                      <span className="font-medium text-foreground">Supplier / Tool Provider</span>
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
                onClick={() => {
                  if (state?.phase === 'incomplete') {
                    setWorkspaceName(state.suggestedWorkspaceName)
                  }
                  setStep(2)
                }}
              >
                Continue
              </Button>
            </div>
          ) : (
            <div className="grid gap-section">
              <div className="grid gap-related">
                <h2 className="text-base font-medium text-foreground">Workspace name</h2>
                <div className="grid gap-2">
                  <FieldLabel htmlFor="onboarding-workspace-name">Workspace name</FieldLabel>
                  <Input
                    id="onboarding-workspace-name"
                    aria-label="Workspace name"
                    value={workspaceName}
                    onChange={(event) => setWorkspaceName(event.currentTarget.value)}
                    autoComplete="organization"
                  />
                </div>
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
                  Finish setup
                </Button>
              </div>
            </div>
          )}
        </AeSiteAuthPanel>
      </AeSiteAuthStage>
    </AePublicPage>
  )
}
