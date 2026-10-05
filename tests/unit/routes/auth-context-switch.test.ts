import { describe, expect, it } from 'vitest'
import { authSwitchUrl } from '@/lib/client/auth-redirect'
import { useSignInPage } from '@/components/ae/auth/sign-in/useSignInPage'
import { useSignUpPage } from '@/components/ae/auth/sign-up/useSignUpPage'

describe('auth mode switch continuity', () => {
  it.each(['/agent-access?resumeTool=operation%3Av1%3Ademo&call=call%3Av1%3Aoriginal#result',
    '/tools/operation:v1:public-tool?input=public-example',
    '/owner/calls/call:v1:original?view=receipt'])('retains the entire original destination: %s', target => {
    const signup = useSignUpPage({ redirect: target })
    const signinUrl = new URL(signup.signInUrl, 'https://app.aecon.ai')
    expect(signinUrl.searchParams.get('redirect')).toBe(target)
    const carriedTarget = signinUrl.searchParams.get('redirect')
    if (carriedTarget === null) throw Error('Original destination missing')
    const signin = useSignInPage({ redirect: carriedTarget })
    expect(new URL(signin.signUpUrl, signinUrl).searchParams.get('redirect')).toBe(target)
    expect(signup.redirectUrl).toBe(target)
    expect(signin.fallbackRedirectUrl).toBe(target)
  })
  it.each(['https://evil.example', '//evil.example', '/sign-up', '/sign-in/verify', '/objects/../../sign-up'])('drops unsafe or looping targets: %s', target => {
    expect(authSwitchUrl('/sign-up', target)).toBe('/sign-up')
    expect(useSignUpPage({ redirect: target }).redirectUrl).toBe('/market')
  })
  it('keeps unqualified exploration on Market for either existing or new accounts', () => {
    expect(useSignUpPage({}).redirectUrl).toBe('/market')
    expect(useSignUpPage({}).signInFallbackRedirectUrl).toBe('/market')
    expect(useSignInPage({}).fallbackRedirectUrl).toBe('/market')
  })
})
