import { createFileRoute } from '@tanstack/react-router'

import { AeOnboardingPage } from '@/components/ae/principal-account/onboarding/AeOnboardingPage'
import { sanitizeAuthRedirectTarget } from '@/lib/client/auth-redirect'
import { type OnboardingSearch } from '@/modules/principal-account/onboarding.contracts'

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
  return <AeOnboardingPage {...(redirect === undefined ? {} : { redirect })} />
}
