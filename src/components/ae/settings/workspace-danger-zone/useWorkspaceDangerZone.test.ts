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

vi.mock('@clerk/tanstack-react-start/errors', () => ({ isReverificationCancelledError: (cause: unknown) => cause instanceof Error && cause.message === 'reverification_cancelled' }))

vi.mock('convex/react', () => ({
  useQuery: (...args: unknown[]) => convexMocks.useQuery(...args),

}))

vi.mock('@/lib/server/workspace-profile.functions', () => ({
  closeWorkspaceServer: ({ data }: { data: unknown }) => convexMocks.closeWorkspace(data),
  transferWorkspaceOwnershipServer: ({ data }: { data: unknown }) => convexMocks.transferWorkspaceOwnership(data),
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
      expectedAccountRef: ownerEligible.accountRef,
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
      expectedAccountRef: ownerWithMember.accountRef,
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
      'Verify with two-factor authentication to continue.',
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
    expect(toast.error).toHaveBeenCalledWith('Workspace close could not be confirmed')
  })
})


it('retains confirmed closure and disables further account eligibility reads after completion', async () => {
  closeWorkspace.mockResolvedValue({ kind: 'closed', accountRef: ownerEligible.accountRef })
  useQuery.mockReturnValue(ownerEligible)
  const { result, rerender } = renderHook(() => useWorkspaceDangerZone())
  act(() => {
    result.current.closePanel?.onConfirmationNameChange('Acme Corp')
    result.current.closePanel?.onRequestClose()
  })
  await act(async () => { await result.current.closePanel?.onConfirmClose() })
  useQuery.mockReturnValue(undefined)
  rerender()
  expect(result.current.completion).toMatchObject({ kind: 'closed', accountRef: ownerEligible.accountRef, displayName: 'Acme Corp' })
  expect(result.current.loading).toBe(false)
  expect(result.current.closePanel).toBeNull()
  expect(result.current.transferPanel).toBeNull()
  expect(useQuery).toHaveBeenLastCalledWith(expect.anything(), 'skip')
})


it('pauses ancestor reads before close can end access and freezes an uncertain attempt for exact recovery', async () => {
  const paused = vi.fn()
  const completed = vi.fn()
  closeWorkspace.mockImplementationOnce(async () => {
    expect(paused).toHaveBeenLastCalledWith(true)
    throw new Error('response lost after closure may have applied')
  }).mockResolvedValueOnce({ kind: 'replayed', accountRef: ownerEligible.accountRef })
  useQuery.mockReturnValue(ownerEligible)
  const { result, rerender } = renderHook(() => useWorkspaceDangerZone({ onReadPausedChange: paused, onCompletion: completed }))
  act(() => {
    result.current.closePanel?.onConfirmationNameChange('Acme Corp')
    result.current.closePanel?.onRequestClose()
  })
  await act(async () => { await result.current.closePanel?.onConfirmClose() })
  useQuery.mockReturnValue(undefined)
  rerender()
  expect(result.current.closePanel?.closeAttemptUnconfirmed).toBe(true)
  expect(result.current.loading).toBe(false)
  expect(result.current.transferPanel?.transferDisabled).toBe(true)
  act(() => result.current.closePanel?.onRequestClose())
  await act(async () => { await result.current.closePanel?.onConfirmClose() })
  expect(closeWorkspace.mock.calls[1]).toEqual(closeWorkspace.mock.calls[0])
  expect(completed).toHaveBeenCalledWith(expect.objectContaining({ kind: 'closed', accountRef: ownerEligible.accountRef }))
  expect(paused).not.toHaveBeenCalledWith(false)
})


it('freezes the named transfer recipient after an unknown outcome and confirms only that original recipient', async () => {
  transferWorkspaceOwnership.mockRejectedValueOnce(new Error('response lost')).mockResolvedValueOnce({ kind: 'replayed', accountRef: ownerEligible.accountRef })
  useQuery.mockReturnValue({ ...ownerWithMember, transferCandidates: [...ownerWithMember.transferCandidates, { principalRef: 'other', displayName: 'Other member', membershipRef: 'other-member' }] })
  const { result } = renderHook(() => useWorkspaceDangerZone())
  const original = result.current.transferPanel?.successorName
  act(() => result.current.transferPanel?.onRequestTransfer())
  await act(async () => { await result.current.transferPanel?.onConfirmTransfer() })
  expect(result.current.transferPanel?.transferDiagnostic?.whatHappened).toContain('may already have completed')
  act(() => { result.current.transferPanel?.onSuccessorChange('other'); result.current.transferPanel?.onRequestTransfer() })
  expect(result.current.transferPanel?.successorName).toBe(original)
  await act(async () => { await result.current.transferPanel?.onConfirmTransfer() })
  expect(transferWorkspaceOwnership.mock.calls[1]).toEqual(transferWorkspaceOwnership.mock.calls[0])
  expect(result.current.completion?.successorName).toBe(original)
})


it.each(['cancelled', 'refused'] as const)('keeps an original unknown close frozen and ancestor reads skipped after a %s MFA recheck', async outcome => {
  useQuery.mockReturnValue(ownerEligible)
  const paused = vi.fn()
  closeWorkspace.mockRejectedValueOnce(new Error('lost original response'))
  const { result } = renderHook(() => useWorkspaceDangerZone({ onReadPausedChange: paused }))
  act(() => { result.current.closePanel?.onConfirmationNameChange('Acme Corp'); result.current.closePanel?.onRequestClose() })
  await act(async () => { await result.current.closePanel?.onConfirmClose() })
  if (outcome === 'cancelled') closeWorkspace.mockRejectedValueOnce(new Error('reverification_cancelled'))
  else closeWorkspace.mockResolvedValue({ kind: 'refused', code: 'mfa_reverification_required' })
  act(() => result.current.closePanel?.onRequestClose())
  await act(async () => { await result.current.closePanel?.onConfirmClose() })
  expect(result.current.closePanel?.closeAttemptUnconfirmed).toBe(true)
  expect(paused).not.toHaveBeenCalledWith(false)
  expect(useQuery).toHaveBeenLastCalledWith(expect.anything(), 'skip')
  expect(closeWorkspace.mock.calls[1]).toEqual(closeWorkspace.mock.calls[0])
})
