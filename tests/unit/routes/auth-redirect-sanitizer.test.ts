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
import { sanitizeAuthRedirectTarget } from '@/lib/client/auth-redirect'
import { Route as SignInRoute } from '@/routes/sign-in.$'
import { Route as SignUpRoute } from '@/routes/sign-up.$'

const origin = 'https://ae.example'
const validDeepLink = '/owner/settings/connections?tab=credentials#provider-x402-resource-url'
const redirectCases = [
  [validDeepLink, validDeepLink, `${origin}${validDeepLink}`],
  ['https://evil.example/owner/settings', undefined, undefined],
  ['https://owner:secret@evil.example/owner/settings', undefined, undefined],
  ['//evil.example/owner/settings', undefined, undefined],
  ['//owner:secret@evil.example/owner/settings', undefined, undefined],
  ['/\\evil', undefined, undefined],
  ['/\\/evil', undefined, undefined],
  ['/objects\\..\\evil', undefined, undefined],
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

  it.each([
    ['sign-in', SignInRoute],
    ['sign-up', SignUpRoute],
  ])('%s search validation retains the deep link and drops unsafe values', (_name, route) => {
    const validateSearch = (route as RouteWithSearchValidator).options.validateSearch

    expect(validateSearch({ redirect: validDeepLink })).toEqual({ redirect: validDeepLink })
    for (const [unsafe] of redirectCases.slice(1)) {
      expect(validateSearch({ redirect: unsafe })).toEqual({})
    }
  })
})
