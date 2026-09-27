// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  ensureProviderBusiness: vi.fn(),
  invalidate: vi.fn(async () => undefined),
  navigate: vi.fn(async () => undefined),
  location: { hash: '' },
  capture: vi.fn(),
}))

vi.mock('@tanstack/react-router', () => ({
  useRouter: () => ({ invalidate: mocks.invalidate, navigate: mocks.navigate }),
  useLocation: () => mocks.location,
}))

vi.mock('@tanstack/react-start', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-start')>()),
  useServerFn: () => mocks.ensureProviderBusiness,
}))

vi.mock('@/components/ae/offerings/provider-identity.functions', () => ({
  ensureProviderBusinessServer: Symbol('ensure'),
}))

vi.mock('@/lib/observability/capture-client-exception', () => ({
  captureClientExceptionOnClient: (...args: unknown[]) => mocks.capture(...args),
}))

import { useProviderWorkspaceInventory } from './useProviderWorkspaceInventory'


afterEach(() => {
  mocks.ensureProviderBusiness.mockReset()
  mocks.invalidate.mockReset()
  mocks.capture.mockReset()
  mocks.invalidate.mockResolvedValue(undefined)
  mocks.navigate.mockReset()
  mocks.location.hash = ''
})

describe('useProviderWorkspaceInventory', () => {
  it('ignores overlapping refresh while invalidate is in flight', async () => {
    let resolveInvalidate: (() => void) | undefined
    mocks.invalidate.mockImplementation(
      () => new Promise<undefined>((resolve) => {
        resolveInvalidate = () => resolve(undefined)
      }),
    )
    const { result } = renderHook(() => useProviderWorkspaceInventory())

    act(() => {
      result.current.refresh()
    })
    await waitFor(() => expect(result.current.refreshPending).toBe(true))
    act(() => {
      result.current.refresh()
    })
    expect(mocks.invalidate).toHaveBeenCalledTimes(1)

    await act(async () => {
      resolveInvalidate?.()
      await mocks.invalidate.mock.results[0]?.value
    })
  })

  it('maps refused onboarding codes to the four onboarding messages', async () => {
    const { result } = renderHook(() => useProviderWorkspaceInventory())

    mocks.ensureProviderBusiness.mockResolvedValue({ kind: 'refused', code: 'unauthenticated' })
    await expect(result.current.onSaveProfile({ name: 'A', website: 'https://a.example' })).resolves.toEqual({
      kind: 'error',
      message: 'Sign in required. Sign in as the workspace owner, then save again.',
    })

    mocks.ensureProviderBusiness.mockResolvedValue({ kind: 'refused', code: 'slug_taken' })
    await expect(result.current.onSaveProfile({ name: 'A', website: 'https://a.example' })).resolves.toEqual({
      kind: 'error',
      message: 'That provider name is already taken. Choose a different supplier / brand name.',
    })

    mocks.ensureProviderBusiness.mockResolvedValue({ kind: 'refused', code: 'other' })
    await expect(result.current.onSaveProfile({ name: 'A', website: 'https://a.example' })).resolves.toEqual({
      kind: 'error',
      message: 'Could not save provider profile. Review name and website, then try again.',
    })

    mocks.ensureProviderBusiness.mockResolvedValue({ kind: 'created', businessId: 'biz:one' })
    await expect(result.current.onSaveProfile({ name: 'Brand', website: 'https://shop.example/path' })).resolves.toEqual({ kind: 'ok' })
    expect(mocks.ensureProviderBusiness).toHaveBeenLastCalledWith({
      data: {
        name: 'Brand',
        slug: 'Brand',
        website: 'https://shop.example',
        providerIdentifier: 'shop.example',
      },
    })
  })

  it('resumes Add Tool only after successful profile creation from the scoped continuation', async () => {
    mocks.location.hash = 'add-tool'
    const { result } = renderHook(() => useProviderWorkspaceInventory())
    mocks.ensureProviderBusiness.mockResolvedValueOnce({ kind: 'refused', code: 'slug_taken' })
      .mockResolvedValueOnce({ kind: 'created', businessId: 'biz:one' })
    await act(async () => {
      expect((await result.current.onSaveProfile({ name: 'A', website: 'https://a.example' })).kind).toBe('error')
    })
    expect(mocks.navigate).not.toHaveBeenCalled()
    await act(async () => {
      expect((await result.current.onSaveProfile({ name: 'A', website: 'https://a.example' })).kind).toBe('ok')
    })
    expect(mocks.navigate).toHaveBeenCalledWith({ to: '/owner/operations/new' })
  })
  it('returns the connection error without logging on save failure', async () => {
    mocks.ensureProviderBusiness.mockRejectedValue(new Error('network'))
    const { result } = renderHook(() => useProviderWorkspaceInventory())

    await expect(result.current.onSaveProfile({ name: 'A', website: 'https://a.example' })).resolves.toEqual({
      kind: 'error',
      message: 'Could not save provider profile. Please check connection and try again.',
    })
    expect(mocks.capture).not.toHaveBeenCalled()
  })

})
