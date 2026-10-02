import { describe, expect, it, vi } from 'vitest'

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: Record<string, unknown>) => ({ options }),
  Link: vi.fn(),
}))

vi.mock('@clerk/tanstack-react-start', () => ({
  SignIn: vi.fn(),
  SignUp: vi.fn(),
}))

vi.mock('@/components/ae/layout/AePublicPage', () => ({ AePublicPage: vi.fn() }))
vi.mock('@/components/ae/website', () => ({
  AeSiteAuthPanel: vi.fn(),
  AeSiteAuthStage: vi.fn(),
  AeSiteButton: vi.fn(),
  clerkAuthSurfaceAppearance: {},
  clerkSignInSurfaceAppearance: {},
}))
import { resolveSignInRedirectTarget } from '@/components/ae/auth/sign-in/sign-in.contracts'
import { useSignInPage } from '@/components/ae/auth/sign-in/useSignInPage'
import { sanitizeAuthRedirectTarget, signedInReturnPath } from '@/lib/client/auth-redirect'
import { Route as SignInRoute } from '@/routes/sign-in.$'
import { Route as SignUpRoute } from '@/routes/sign-up.$'

const origin = 'https://ae.example'
const validDeepLink = '/owner/settings/connections?tab=credentials#provider-x402-resource-url'
const redirectCases = [
  [validDeepLink, validDeepLink, `${origin}${validDeepLink}`],
  ['/\t/evil.example', undefined, undefined],
  ['/\n/evil.example', undefined, undefined],
  ['/\r/evil.example', undefined, undefined],
  ['https://evil.example/owner/settings', undefined, undefined],
  ['https://owner:secret@evil.example/owner/settings', undefined, undefined],
  ['//evil.example/owner/settings', undefined, undefined],
  ['//owner:secret@evil.example/owner/settings', undefined, undefined],
  ['/\\evil', undefined, undefined],
  ['/\\/evil', undefined, undefined],
  ['/objects\\..\\evil', undefined, undefined],
  ['/sign-in', undefined, undefined],
  ['/sign-up/', undefined, undefined],
  ['/settings/../sign-in?return=/owner/settings#resume', undefined, undefined],
  ['/settings/%2e%2e/sign-up#resume', undefined, undefined],
  ['/settings/..//evil.example', undefined, undefined],
] as const

type RouteWithSearchValidator = Readonly<{
  options: Readonly<{
    validateSearch: (search: Record<string, unknown>) => unknown
  }>
}>

describe('auth redirect sanitizer', () => {
  it.each(redirectCases)('sanitizes %s before resolving against the AE origin', (input, expected, resolved) => {
    const sanitized = sanitizeAuthRedirectTarget(input)

    expect(sanitized).toBe(expected)
    expect(sanitized === undefined ? undefined : new URL(sanitized, origin).href).toBe(resolved)
  })

  it('keeps a safe deep link through Clerk and escapes auth loops', () => {
    const model = useSignInPage({ redirect: '/owner/operations' })

    expect(resolveSignInRedirectTarget('/owner/operations')).toBe('/owner/operations')
    expect(model.fallbackRedirectUrl).toBe('/owner/operations')
    expect(model.signUpFallbackRedirectUrl).toBe('/owner/operations')
    expect(resolveSignInRedirectTarget('/sign-in')).toBe('/market')
    expect(resolveSignInRedirectTarget('https://evil.example/owner/operations')).toBe('/market')
    expect(resolveSignInRedirectTarget(undefined)).toBe('/market')
  })

  it.each([
    ['sign-in', SignInRoute],
    ['sign-up', SignUpRoute],
  ])('%s search validation retains the deep link and drops unsafe values', (_name, route) => {
    const validateSearch = (route as RouteWithSearchValidator).options.validateSearch

    expect(validateSearch({ redirect: validDeepLink })).toEqual({ redirect: validDeepLink })
    expect(validateSearch({})).toEqual({})
    expect(validateSearch({ redirect: undefined })).toEqual({})
    for (const [unsafe] of redirectCases.slice(1)) {
      expect(validateSearch({ redirect: unsafe })).toEqual({})
    }
  })

  it('keeps a safe path and query from an absolute return href', () => {
    expect(signedInReturnPath('http://127.0.0.1:3024/agent-access?tab=keys', '/market'))
      .toBe('/agent-access?tab=keys')
    expect(signedInReturnPath('/activity?agent=prn_invalid', '/market')).toBe('/activity?agent=prn_invalid')
    expect(signedInReturnPath('https://evil.example/phishing', '/market')).toBe('/phishing')
  })
})
