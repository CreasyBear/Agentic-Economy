import type { AeSignUpPageProps, UseSignUpPageResult } from './sign-up.contracts'
import {
  buildOnboardingRedirectUrl,
  buildSwitchSearch,
  projectSignUpCopy,
} from './sign-up.contracts'

export function useSignUpPage(input: AeSignUpPageProps): UseSignUpPageResult {
  const copy = projectSignUpCopy(input.redirect)
  return {
    heading: copy.heading,
    body: copy.body,
    titleId: 'sign-up-context-heading',
    labelledBy: 'sign-up-context-heading',
    stageUrl: '/sign-up',
    onboardingRedirectUrl: buildOnboardingRedirectUrl(input.redirect),
    signInFallbackRedirectUrl: input.redirect ?? '/owner/settings',
    signInUrl: '/sign-in',
    switchSearch: buildSwitchSearch(input.redirect),
  }
}
