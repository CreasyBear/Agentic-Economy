import type { AeSignInPageProps, UseSignInPageResult } from './sign-in.contracts'
import { projectSignInCopy } from './sign-in.contracts'

export function useSignInPage(input: AeSignInPageProps): UseSignInPageResult {
  const copy = projectSignInCopy(input.redirect)
  const fallbackRedirectUrl = input.redirect ?? '/owner/settings'
  return {
    heading: copy.heading,
    body: copy.body,
    titleId: 'sign-in-context-heading',
    labelledBy: 'sign-in-context-heading',
    stageUrl: '/sign-in',
    fallbackRedirectUrl,
    signUpFallbackRedirectUrl: fallbackRedirectUrl,
    signUpUrl: '/sign-up',
  }
}
