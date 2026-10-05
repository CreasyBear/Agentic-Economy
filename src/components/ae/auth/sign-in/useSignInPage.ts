import type { AeSignInPageProps, UseSignInPageResult } from './sign-in.contracts'
import { projectSignInCopy, resolveSignInRedirectTarget } from './sign-in.contracts'
import { authSwitchUrl } from '@/lib/client/auth-redirect'

export function useSignInPage(input: AeSignInPageProps): UseSignInPageResult {
  const copy = projectSignInCopy(input.redirect)
  const fallbackRedirectUrl = resolveSignInRedirectTarget(input.redirect)
  return {
    heading: copy.heading,
    body: copy.body,
    titleId: 'sign-in-context-heading',
    labelledBy: 'sign-in-context-heading',
    stageUrl: '/sign-in',
    fallbackRedirectUrl,
    signUpFallbackRedirectUrl: fallbackRedirectUrl,
    signUpUrl: authSwitchUrl('/sign-up', input.redirect),
  }
}
