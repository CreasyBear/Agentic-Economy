// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { toast } from '@/lib/ui/toast'
import type { WorkspaceDecommissionEligibilityView } from '@/modules/principal-account/workspace-decommission.view-model'

import { useWorkspaceDangerZone } from './useWorkspaceDangerZone'

const convexMocks = vi.hoisted(() => {
  const useQuery = vi.fn()
  const closeWorkspace = vi.fn()
  const transferWorkspaceOwnership = vi.fn()
  function convexRefName(ref: unknown): string {
    if (typeof ref === 'object' && ref !== null) {
      const symbols = Object.getOwnPropertySymbols(ref)
      const symbol = symbols[0]
      if (symbol !== undefined) {
        const name = (ref as Record<symbol, string>)[symbol]
        if (typeof name === 'string') return name
      }
    }
    return String(ref)
  }
  return { useQuery, closeWorkspace, transferWorkspaceOwnership, convexRefName }
})

const clerkMocks = vi.hoisted(() => ({
  prompts: 0,
}))

vi.mock('@clerk/tanstack-react-start', () => ({
  useReverification: <T>(
    fetcher: (...args: never[]) => Promise<T>,
  ) => async (...args: never[]): Promise<T> => {
    const first = await fetcher(...args)
    if (
      typeof first === 'object'
      && first !== null
      && 'clerk_error' in first
    ) {
      clerkMocks.prompts += 1
      return await fetcher(...args)
    }
    return first
  },
}))

vi.mock('@clerk/shared/authorization-errors', () => ({
  reverificationError: (level: string) => ({ clerk_error: { level } }),
}))

const { useQuery, closeWorkspace, transferWorkspaceOwnership } = convexMocks

vi.mock('convex/react', () => ({
  useQuery: (...args: unknown[]) => convexMocks.useQuery(...args),
  useMutation: (ref: unknown) => {
    const refName = convexMocks.convexRefName(ref)
    if (refName.includes('closeWorkspace')) return convexMocks.closeWorkspace
    if (refName.includes('transferWorkspaceOwnership')) return convexMocks.transferWorkspaceOwnership
    return vi.fn()
  },
}))

vi.mock('@/lib/ui/toast', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

const ownerEligible: WorkspaceDecommissionEligibilityView = {
  accountRef: `acc_${'2'.repeat(32)}`,
  displayName: 'Acme Corp',
  accountRevision: 4,
  ownershipRevision: 3,
  callerIsOwner: true,
  canClose: true,
  canTransfer: false,
  fences: [],
  transferCandidates: [],
}

const ownerWithMember: WorkspaceDecommissionEligibilityView = {
  ...ownerEligible,
  canTransfer: true,
  transferCandidates: [{
    principalRef: `prn_${'a'.repeat(32)}`,
    displayName: 'Sarah Connor',
    membershipRef: `mem_${'a'.repeat(32)}`,
  }],
}

const fencedOwner: WorkspaceDecommissionEligibilityView = {
  ...ownerEligible,
  canClose: false,
  fences: ['unsettled_provider_obligations'],
  canTransfer: true,
  transferCandidates: ownerWithMember.transferCandidates,
}

afterEach(() => {
  vi.clearAllMocks()
  clerkMocks.prompts = 0
  useQuery.mockReturnValue(ownerEligible)
})

describe('useWorkspaceDangerZone', () => {
  it('reports loading when eligibility is undefined', () => {
    useQuery.mockReturnValue(undefined)
    const { result } = renderHook(() => useWorkspaceDangerZone())
    expect(result.current.loading).toBe(true)
    expect(result.current.closePanel).toBeNull()
  })

  it('keeps close disabled for trailing-space and wrong-case names', () => {
    const { result } = renderHook(() => useWorkspaceDangerZone())
    act(() => {
      result.current.closePanel?.onConfirmationNameChange('Acme ')
    })
    expect(result.current.closePanel?.closeDisabled).toBe(true)
    act(() => {
      result.current.closePanel?.onConfirmationNameChange('acme corp')
    })
    expect(result.current.closePanel?.closeDisabled).toBe(true)
  })

  it('enables close when name matches even if canClose is false without fences', () => {
    useQuery.mockReturnValue({ ...ownerEligible, canClose: false, fences: [] })
    const { result } = renderHook(() => useWorkspaceDangerZone())
    act(() => {
      result.current.closePanel?.onConfirmationNameChange('Acme Corp')
    })
    expect(result.current.closePanel?.closeDisabled).toBe(false)
  })

  it('keeps transfer enabled when close fences are present', () => {
    useQuery.mockReturnValue(fencedOwner)
    const { result } = renderHook(() => useWorkspaceDangerZone())
    expect(result.current.closePanel?.closeDisabled).toBe(true)
    expect(result.current.transferPanel?.transferDisabled).toBe(false)
  })

  it('sends close mutation payload with static correlation and live revisions', async () => {
    const uuid = '11111111-1111-4111-8111-111111111111'
    vi.spyOn(crypto, 'randomUUID').mockReturnValue(uuid)
    closeWorkspace.mockResolvedValue({ kind: 'closed', accountRef: ownerEligible.accountRef })
    const { result } = renderHook(() => useWorkspaceDangerZone())
    act(() => {
      result.current.closePanel?.onConfirmationNameChange('Acme Corp')
      result.current.closePanel?.onRequestClose()
    })
    const expectedIdempotency = `idem:workspace-danger:close:${uuid}`
    await act(async () => {
      await result.current.closePanel?.onConfirmClose()
    })
    expect(closeWorkspace).toHaveBeenCalledWith({
      confirmationName: 'Acme Corp',
      expectedAccountRevision: 4,
      expectedOwnershipRevision: 3,
      correlationRef: 'ui:workspace-danger:close',
      idempotencyRef: expectedIdempotency,
    })
    expect(toast.success).toHaveBeenCalledWith('Workspace closed')
    vi.mocked(crypto.randomUUID).mockRestore()
  })

  it('reuses idempotency ref minted at dialog open on confirm', async () => {
    const openUuid = '22222222-2222-4222-8222-222222222222'
    const confirmUuid = '33333333-3333-4333-8333-333333333333'
    const randomSpy = vi.spyOn(crypto, 'randomUUID')
    randomSpy.mockReturnValueOnce(openUuid).mockReturnValueOnce(confirmUuid)
    closeWorkspace.mockResolvedValue({ kind: 'closed', accountRef: ownerEligible.accountRef })
    const { result } = renderHook(() => useWorkspaceDangerZone())
    act(() => {
      result.current.closePanel?.onConfirmationNameChange('Acme Corp')
      result.current.closePanel?.onRequestClose()
    })
    const openIdempotency = `idem:workspace-danger:close:${openUuid}`
    await act(async () => {
      await result.current.closePanel?.onConfirmClose()
    })
    expect(closeWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyRef: openIdempotency }),
    )
    randomSpy.mockRestore()
  })

  it('sends transfer mutation payload with first candidate when selection unset', async () => {
    const uuid = '44444444-4444-4444-8444-444444444444'
    vi.spyOn(crypto, 'randomUUID').mockReturnValue(uuid)
    useQuery.mockReturnValue(ownerWithMember)
    transferWorkspaceOwnership.mockResolvedValue({
      kind: 'transferred',
      accountRef: ownerEligible.accountRef,
    })
    const { result } = renderHook(() => useWorkspaceDangerZone())
    act(() => {
      result.current.transferPanel?.onRequestTransfer()
    })
    await act(async () => {
      await result.current.transferPanel?.onConfirmTransfer()
    })
    const successor = ownerWithMember.transferCandidates[0]
    expect(successor).toBeDefined()
    expect(transferWorkspaceOwnership).toHaveBeenCalledWith({
      successorPrincipalRef: successor!.principalRef,
      expectedAccountRevision: 4,
      expectedOwnershipRevision: 3,
      correlationRef: 'ui:workspace-danger:transfer',
      idempotencyRef: `idem:workspace-danger:transfer:${uuid}`,
    })
    expect(toast.success).toHaveBeenCalledWith('Workspace ownership transferred')
    vi.mocked(crypto.randomUUID).mockRestore()
  })

  it('does not navigate on successful close or transfer', async () => {
    const assign = vi.fn()
    const reload = vi.fn()
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, assign, reload },
    })
    closeWorkspace.mockResolvedValue({ kind: 'closed', accountRef: ownerEligible.accountRef })
    transferWorkspaceOwnership.mockResolvedValue({
      kind: 'transferred',
      accountRef: ownerEligible.accountRef,
    })
    useQuery.mockReturnValue(ownerWithMember)
    const { result } = renderHook(() => useWorkspaceDangerZone())
    act(() => {
      result.current.closePanel?.onConfirmationNameChange('Acme Corp')
      result.current.closePanel?.onRequestClose()
    })
    await act(async () => {
      await result.current.closePanel?.onConfirmClose()
    })
    act(() => {
      result.current.transferPanel?.onRequestTransfer()
    })
    await act(async () => {
      await result.current.transferPanel?.onConfirmTransfer()
    })
    expect(assign).not.toHaveBeenCalled()
    expect(reload).not.toHaveBeenCalled()
  })

  it('prompts once and retries close with the same command after MFA reverification', async () => {
    closeWorkspace
      .mockResolvedValueOnce({ kind: 'refused', code: 'mfa_reverification_required' })
      .mockResolvedValueOnce({ kind: 'closed', accountRef: ownerEligible.accountRef })
    const { result } = renderHook(() => useWorkspaceDangerZone())
    act(() => {
      result.current.closePanel?.onConfirmationNameChange('Acme Corp')
      result.current.closePanel?.onRequestClose()
    })

    await act(async () => {
      await result.current.closePanel?.onConfirmClose()
    })

    expect(clerkMocks.prompts).toBe(1)
    expect(closeWorkspace).toHaveBeenCalledTimes(2)
    expect(closeWorkspace.mock.calls[1]).toEqual(closeWorkspace.mock.calls[0])
    expect(toast.success).toHaveBeenCalledWith('Workspace closed')
  })

  it('prompts once and retries transfer with the same command after MFA reverification', async () => {
    useQuery.mockReturnValue(ownerWithMember)
    transferWorkspaceOwnership
      .mockResolvedValueOnce({ kind: 'refused', code: 'mfa_reverification_required' })
      .mockResolvedValueOnce({ kind: 'transferred', accountRef: ownerEligible.accountRef })
    const { result } = renderHook(() => useWorkspaceDangerZone())
    act(() => {
      result.current.transferPanel?.onRequestTransfer()
    })

    await act(async () => {
      await result.current.transferPanel?.onConfirmTransfer()
    })

    expect(clerkMocks.prompts).toBe(1)
    expect(transferWorkspaceOwnership).toHaveBeenCalledTimes(2)
    expect(transferWorkspaceOwnership.mock.calls[1]).toEqual(
      transferWorkspaceOwnership.mock.calls[0],
    )
    expect(toast.success).toHaveBeenCalledWith('Workspace ownership transferred')
  })

  it('keeps a second MFA refusal visible with the required recovery copy', async () => {
    closeWorkspace.mockResolvedValue({
      kind: 'refused',
      code: 'mfa_reverification_required',
    })
    const { result } = renderHook(() => useWorkspaceDangerZone())
    act(() => {
      result.current.closePanel?.onConfirmationNameChange('Acme Corp')
      result.current.closePanel?.onRequestClose()
    })

    await act(async () => {
      await result.current.closePanel?.onConfirmClose()
    })

    expect(clerkMocks.prompts).toBe(1)
    expect(closeWorkspace).toHaveBeenCalledTimes(2)
    expect(result.current.closePanel?.closeDiagnostic?.nextStep).toBe(
      'Confirm with a fresh sign-in verification to continue.',
    )
    expect(toast.error).toHaveBeenCalledWith('Workspace was not closed')
  })

  it('sets static diagnostic and error toast on close failure', async () => {
    closeWorkspace.mockRejectedValue(new Error('fail'))
    const { result } = renderHook(() => useWorkspaceDangerZone())
    act(() => {
      result.current.closePanel?.onConfirmationNameChange('Acme Corp')
      result.current.closePanel?.onRequestClose()
    })
    await act(async () => {
      await result.current.closePanel?.onConfirmClose()
    })
    await waitFor(() => {
      expect(result.current.closePanel?.closeDiagnostic).not.toBeNull()
    })
    expect(toast.error).toHaveBeenCalledWith('Workspace was not closed')
  })
})
