import { createFileRoute } from '@tanstack/react-router'

import { AeOnboardingPage } from '@/components/ae/principal-account/onboarding/AeOnboardingPage'
import { sanitizeAuthRedirectTarget } from '@/lib/client/auth-redirect'
import { type OnboardingSearch } from '@/modules/principal-account/onboarding.contracts'

export const Route = createFileRoute('/onboarding')({
  staticData: { shellMode: 'minimal' },
  validateSearch: (search: Record<string, unknown>): OnboardingSearch => {
    const redirect = sanitizeAuthRedirectTarget(search.redirect)
    const requestedStep = search.step === 2 || search.step === '2' ? 2 : undefined
    const roleIntent =
      search.roleIntent === 'buyer' || search.roleIntent === 'supplier'
        ? search.roleIntent
        : undefined
    const step = requestedStep === 2 && roleIntent !== undefined ? 2 : undefined
    const workspaceName =
      step === 2 &&
      typeof search.workspaceName === 'string' &&
      search.workspaceName.length <= 200
        ? search.workspaceName
        : undefined
    return {
      ...(redirect === undefined || redirect.startsWith('/onboarding') ? {} : { redirect }),
      ...(step === undefined ? {} : { step }),
      ...(roleIntent === undefined ? {} : { roleIntent }),
      ...(workspaceName === undefined ? {} : { workspaceName }),
    }
  },
  head: () => ({
    meta: [
      { title: 'Finish workspace | Agentic Economy' },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: OnboardingRoute,
})

function OnboardingRoute() {
  return <AeOnboardingPage {...Route.useSearch()} />
}
