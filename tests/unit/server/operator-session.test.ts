import { beforeEach, describe, expect, it, vi } from 'vitest'
import { isRedirect } from '@tanstack/react-router'
import { OperatorSurfaceForbiddenError, type OperatorContext } from '@/lib/operator/operator-context'

const boundary = vi.hoisted(() => ({ auth: vi.fn(), readContext: vi.fn() }))
vi.mock('@clerk/tanstack-react-start/server', () => ({ auth: boundary.auth }))
vi.mock('@tanstack/react-start', () => ({
  createServerFn: () => ({ validator: () => ({ handler: (handler: unknown) => handler }) }),
}))
vi.mock('@/lib/server/operator-context.functions', () => ({
  readOperatorContextThroughSource: boundary.readContext,
}))

import { requireOperatorBeforeLoad } from '@/lib/server/require-operator-session'

const owner: OperatorContext = {
  kind: 'authorized', userId: 'user_owner', principalRef: 'prn_owner',
  accountRef: 'acc_owner', allowedSurfaces: ['owner'],
}
const destination = '/owner/settings/connections?tab=credentials#provider-x402-resource-url'
const enter = () => requireOperatorBeforeLoad({ location: { href: destination } })

beforeEach(() => {
  vi.resetAllMocks()
  boundary.auth.mockResolvedValue({ isAuthenticated: true, userId: owner.userId })
  boundary.readContext.mockResolvedValue(owner)
})

describe('interactive server session admission', () => {
  // Requires: a current Clerk session and canonical source ownership.
  // Ensures: anonymous access returns to sign-in with the exact destination;
  // restored sessions read current Account context rather than cached admission.
  // Invariant: no source read or protected admission without a current session.
  // On violation: framework redirect, forbidden surface, or original source error.
  it('preserves the return destination across sign-out and a fresh sign-in', async () => {
    await expect(enter()).resolves.toEqual(owner)
    boundary.auth.mockResolvedValue({ isAuthenticated: false, userId: null })
    let refusal: unknown
    try { await enter() } catch (error) { refusal = error }
    expect(isRedirect(refusal)).toBe(true)
    if (!isRedirect(refusal)) throw new Error('session_redirect_missing')
    expect(refusal.options).toMatchObject({
      to: '/sign-in/$', params: { _splat: '' }, search: { redirect: destination },
    })
    expect(boundary.readContext).toHaveBeenCalledTimes(1)
    boundary.auth.mockResolvedValue({ isAuthenticated: true, userId: owner.userId })
    await expect(enter()).resolves.toEqual(owner)
    expect(boundary.auth).toHaveBeenCalledTimes(3)
    expect(boundary.readContext).toHaveBeenCalledTimes(2)
  })

  it('refuses authenticated access without canonical ownership or the requested surface', async () => {
    boundary.readContext.mockResolvedValueOnce({ kind: 'denied', reason: 'canonical_owner_required' })
    await expect(enter()).rejects.toBeInstanceOf(OperatorSurfaceForbiddenError)
    await expect(requireOperatorBeforeLoad({ location: { href: '/admin/providers' } }))
      .rejects.toBeInstanceOf(OperatorSurfaceForbiddenError)
  })

  it('propagates unavailable auth/source evidence and admits only after a successful retry', async () => {
    const authFailure = new Error('session verification unavailable')
    boundary.auth.mockRejectedValueOnce(authFailure)
    await expect(enter()).rejects.toBe(authFailure)
    expect(boundary.readContext).not.toHaveBeenCalled()
    const sourceFailure = new Error('canonical context unavailable')
    boundary.readContext.mockRejectedValueOnce(sourceFailure)
    await expect(enter()).rejects.toBe(sourceFailure)
    await expect(enter()).resolves.toEqual(owner)
  })
})
