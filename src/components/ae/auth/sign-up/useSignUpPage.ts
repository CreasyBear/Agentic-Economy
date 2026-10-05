import type { AeSignUpPageProps, UseSignUpPageResult } from './sign-up.contracts'
import { buildSwitchSearch, projectSignUpCopy } from './sign-up.contracts'
import { authSwitchUrl, sanitizeAuthRedirectTarget } from '@/lib/client/auth-redirect'

export function useSignUpPage(input: AeSignUpPageProps): UseSignUpPageResult {
  const redirect = sanitizeAuthRedirectTarget(input.redirect)
  const copy = projectSignUpCopy(redirect)
  return {
    heading: copy.heading,
    body: copy.body,
    titleId: 'sign-up-context-heading',
    labelledBy: 'sign-up-context-heading',
    stageUrl: '/sign-up',
    redirectUrl: redirect ?? '/market',
    signInFallbackRedirectUrl: redirect ?? '/market',
    signInUrl: authSwitchUrl('/sign-in', redirect),
    switchSearch: buildSwitchSearch(redirect),
  }
}
