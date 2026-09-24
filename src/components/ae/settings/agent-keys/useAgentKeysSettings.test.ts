// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const calls = vi.hoisted(() => ({
  readDirectory: vi.fn(),
  readPage: vi.fn(),
  revoke: vi.fn(),
}))

vi.mock('@tanstack/react-start', () => ({
  useServerFn: (reference: string) => reference === 'revoke' ? calls.revoke : reference === 'page' ? calls.readPage : calls.readDirectory,
}))
vi.mock('@/lib/server/agent-access-console.functions', () => ({
  readAgentDirectoryServer: 'directory',
  readAgentDirectoryPageServer: 'page',
}))
vi.mock('@/modules/agent-access/agent-access.functions', () => ({ revokeAgentCredentialServer: 'revoke' }))
vi.mock('@/lib/observability/capture-client-exception', () => ({ captureClientExceptionOnClient: vi.fn() }))

import { useAgentKeysSettings } from './useAgentKeysSettings'

const directory = { items: [], details: [] }

describe('Agent keys settings revocation', () => {
  afterEach(() => vi.clearAllMocks())

  it('revokes only the selected credential and refreshes after a confirmed outcome', async () => {
    calls.revoke.mockResolvedValue({ kind: 'completed', principalRef: 'agent:one', correlationRef: 'corr:one' })
    calls.readDirectory.mockResolvedValue(directory)
    const { result } = renderHook(() => useAgentKeysSettings(directory))
    act(() => result.current.requestRevoke('credential:one', 'Agent one', document.createElement('button')))
    await act(async () => result.current.confirmRevoke())

    expect(calls.revoke).toHaveBeenCalledExactlyOnceWith({ data: { credentialRef: 'credential:one' } })
    expect(calls.readDirectory).toHaveBeenCalledOnce()
    expect(result.current.revokeTarget).toBeUndefined()
  })

  it('blocks another credential change until refreshing after an unconfirmed outcome', async () => {
    calls.revoke.mockResolvedValue({ kind: 'partial', code: 'provider_cleanup', principalRef: 'agent:one', correlationRef: 'corr:one', retryable: true })
    const { result } = renderHook(() => useAgentKeysSettings(directory))
    act(() => result.current.requestRevoke('credential:one', 'Agent one', document.createElement('button')))
    await act(async () => result.current.confirmRevoke())

    expect(result.current.revokeTarget).toBeUndefined()
    expect(result.current.refreshRequired).toBe(true)
    expect(result.current.error).toContain('not confirmed')
    act(() => result.current.requestRevoke('credential:two', 'Agent two', document.createElement('button')))
    expect(result.current.revokeTarget).toBeUndefined()
    expect(calls.revoke).toHaveBeenCalledOnce()
    calls.readDirectory.mockResolvedValue(directory)
    await act(async () => result.current.refresh())
    expect(result.current.refreshRequired).toBe(false)
    await waitFor(() => expect(result.current.revoking).toBe(false))
  })
})
