// @vitest-environment jsdom
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const calls = vi.hoisted(() => ({
  readDirectory: vi.fn(),
  readPage: vi.fn(),
  revoke: vi.fn(),
  connect: vi.fn(),
  issue: vi.fn(),
  setup: vi.fn(),
}))
const clerkMocks = vi.hoisted(() => ({ prompts: 0 }))

vi.mock('@tanstack/react-start', async (importOriginal) => ({
  ...await importOriginal(),
  useServerFn: (reference: string) => reference === 'issue' ? calls.issue : reference === 'revoke' ? calls.revoke : reference === 'page' ? calls.readPage : calls.readDirectory,
}))
vi.mock('@clerk/tanstack-react-start', () => ({
  useReverification: <T>(fetcher: (...args: never[]) => Promise<T>) => async (...args: never[]): Promise<T> => {
    const first = await fetcher(...args)
    if (typeof first === 'object' && first !== null && 'clerk_error' in first) {
      clerkMocks.prompts += 1
      return await fetcher(...args)
    }
    return first
  },
}))
vi.mock('@/lib/server/agent-access-console.functions', () => ({
  readAgentDirectoryServer: 'directory',
  readAgentDirectoryPageServer: 'page',
}))
vi.mock('@/modules/agent-access/agent-access.functions', () => ({
  revokeAgentCredentialServer: 'revoke',
  issueAgentAccessKeyServer: 'issue',
}))
vi.mock('@/lib/observability/capture-client-exception', () => ({ captureClientExceptionOnClient: vi.fn() }))
vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...await importOriginal(),
  Link: ({ children, to, search }: { children: string; to: string; search?: Record<string, string> }) =>
    createElement('a', { href: `${to}${search ? `?${new URLSearchParams(search)}` : ''}` }, children),
}))
vi.mock('@/components/ae/console/connect-agent-wizard/AeConnectAgentWizardDialog', () => ({
  AeConnectAgentWizardDialog: ({ open, onIssue }: { open: boolean; onIssue: (args: { data: Record<string, unknown> }) => Promise<unknown> }) => open
    ? createElement('button', { onClick: () => { void onIssue({ data: {} }) } }, 'Issue dialog open')
    : null,
}))
vi.mock('@/components/ae/console/AeKeyRevealDialog', () => ({ AeKeyRevealDialog: () => null }))
vi.mock('@/components/ae/layout/AeOperatorPage', () => ({
  AeOperatorPage: ({ children }: { children: ReactNode }) => createElement('main', null, children),
}))
vi.mock('@/components/ae/console/agent-operator-console/AeAgentOperatorConsole', () => ({
  AeAgentOperatorConsole: ({ onConnectNewAgent }: { onConnectNewAgent: () => void }) =>
    createElement('button', { onClick: onConnectNewAgent }, 'Connect an Agent'),
}))
vi.mock('@/components/ae/agent-access/home/useAeAgentAccessHome', () => ({
  useAeAgentAccessHome: ({ canonicalBaseUrl, initialDirectory, search }: {
    canonicalBaseUrl: string; initialDirectory: AgentDirectoryProjection; search: object
  }) => ({
    canonicalBaseUrl, directory: initialDirectory, search,
    loading: false, onDirectoryRetry: vi.fn(), onConnectNewAgent: calls.connect,
    onSetupStep: calls.setup,
    showSetup: false,
  }),
}))

import { useAgentKeysSettings } from './useAgentKeysSettings'
import { AeAgentKeysSettings } from './AeAgentKeysSettings'
import { AeAgentAccessHome } from '@/components/ae/agent-access/home/AeAgentAccessHome'
import type { AgentDirectoryProjection } from '@/modules/agent-access/agent-operator-view-model'

const directory = { items: [], details: [] }
const target = {
  credentialRef: 'credential:one', generation: 2, principalRef: 'agent:one',
  name: 'Agent one', environment: 'production' as const, current: true,
}
const twoKeysDirectory = {
  items: [],
  details: [{
    agent: {
      principalRef: 'agent:one', principalRevision: 1, displayName: 'Shared name',
      applicationRef: 'app:one', environment: 'production', status: 'connected',
      connectionCount: 0, connectorDisplayNames: [], authorityMode: 'spending_policy',
      spendingPolicy: { kind: 'unavailable' },
    },
    currentCredentialRef: 'credential:one',
    credentials: [
      { credentialRef: 'credential:one', generation: 2, lifecycle: 'active', issuedAt: 1, expiresAt: 999_999 },
      { credentialRef: 'credential:two', generation: 1, lifecycle: 'active', issuedAt: 1, expiresAt: 999_999 },
    ],
    connections: [], authorityMode: 'spending_policy', scopes: [], spendingPolicy: { kind: 'unavailable' },
    activity: [], dataState: 'source',
  }],
} satisfies AgentDirectoryProjection

describe('Agent keys settings revocation', () => {
  afterEach(() => { vi.clearAllMocks(); clerkMocks.prompts = 0 })
  it('revokes only the selected credential after approval and refreshes its outcome', async () => {
    calls.revoke.mockResolvedValue({ kind: 'completed', principalRef: 'agent:one', correlationRef: 'corr:one' })
    calls.readDirectory.mockResolvedValue(directory)
    const { result } = renderHook(() => useAgentKeysSettings(directory))
    act(() => result.current.requestRevoke(target, document.createElement('button')))
    expect(result.current.revokeTarget).toEqual(target)
    expect(calls.revoke).not.toHaveBeenCalled()
    await act(async () => result.current.confirmRevoke())

    expect(calls.revoke).toHaveBeenCalledExactlyOnceWith({ data: { credentialRef: 'credential:one' } })
    expect(calls.readDirectory).toHaveBeenCalledOnce()
    expect(result.current.revokeTarget).toBeUndefined()
  })

  it('cancel leaves credential authority untouched', async () => {
    const { result } = renderHook(() => useAgentKeysSettings(directory))
    act(() => result.current.requestRevoke(target, document.createElement('button')))
    act(() => result.current.closeRevoke(false))
    await act(async () => result.current.confirmRevoke())
    expect(result.current.revokeTarget).toBeUndefined()
    expect(calls.revoke).not.toHaveBeenCalled()
  })
  it('confirms revocation for the selected key and cancellation sends nothing', async () => {
    calls.revoke.mockResolvedValue({ kind: 'completed', principalRef: 'agent:one', correlationRef: 'corr:one' })
    calls.readDirectory.mockResolvedValue(directory)
    const view = render(createElement(AeAgentKeysSettings, {
      initialDirectory: twoKeysDirectory, canonicalBaseUrl: 'https://example.test', openIssueDialog: true,
    }))
    const selectedKeyButton = screen.getAllByRole('button', { name: 'Revoke key for Shared name' })[1]
    if (selectedKeyButton === undefined) throw new Error('Expected a revoke button for each active key')
    fireEvent.click(selectedKeyButton)
    fireEvent.click(screen.getByRole('button', { name: 'Revoke this key' }))
    await waitFor(() => expect(calls.revoke).toHaveBeenCalledExactlyOnceWith({ data: { credentialRef: 'credential:two' } }))
    view.unmount()

    const cancelledView = render(createElement(AeAgentKeysSettings, {
      initialDirectory: twoKeysDirectory, canonicalBaseUrl: 'https://example.test', openIssueDialog: true,
    }))
    const cancelledKeyButton = screen.getAllByRole('button', { name: 'Revoke key for Shared name' })[1]
    if (cancelledKeyButton === undefined) throw new Error('Expected a revoke button for each active key')
    fireEvent.click(cancelledKeyButton)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(calls.revoke).toHaveBeenCalledOnce()
    cancelledView.unmount()
  })
  it('wraps key issuance in Clerk reverification', async () => {
    calls.issue.mockResolvedValueOnce({ clerk_error: { level: 'strict' } })
    calls.issue.mockResolvedValueOnce({ kind: 'created', keyId: 'key:one', secret: 'secret' })
    render(createElement(AeAgentKeysSettings, {
      initialDirectory: twoKeysDirectory, canonicalBaseUrl: 'https://example.test', openIssueDialog: true,
    }))

    fireEvent.click(screen.getByRole('button', { name: 'Issue dialog open' }))

    await waitFor(() => expect(clerkMocks.prompts).toBe(1))
    expect(calls.issue).toHaveBeenCalledTimes(2)
  })
  it('offers both direct connection paths and focuses existing OAuth steps', () => {
    const view = render(createElement(AeAgentAccessHome, {
      canonicalBaseUrl: 'https://example.test', initialDirectory: directory, search: {},
    }))
    fireEvent.click(screen.getByRole('button', { name: 'Choose how to connect' }))
    const manual = screen.getByRole('link', { name: 'Issue a manual key' })
    expect(manual.getAttribute('href')).toBe('/owner/settings/agent-keys?issue=manual')
    fireEvent.click(screen.getByRole('button', { name: 'Connect with OAuth / MCP' }))
    expect(calls.setup).toHaveBeenCalledWith('oauth')
    expect(document.activeElement?.getAttribute('aria-label')).toBe('OAuth and MCP connection steps')
    view.unmount()
  })
  it('opens OAuth setup for a removed caller with an empty directory', () => {
    const view = render(createElement(AeAgentAccessHome, {
      canonicalBaseUrl: 'https://example.test', initialDirectory: directory, search: { caller: 'agent:removed' },
    }))
    fireEvent.click(screen.getByRole('button', { name: 'Connect an Agent' }))
    fireEvent.click(screen.getByRole('button', { name: 'Connect with OAuth / MCP' }))
    expect(screen.getByRole('list', { name: 'Agent connection steps' })).toBeTruthy()
    expect(document.activeElement?.getAttribute('aria-label')).toBe('OAuth and MCP connection steps')
    view.unmount()
  })

  it('blocks another credential change until refreshing after an unconfirmed outcome', async () => {
    calls.revoke.mockResolvedValue({ kind: 'partial', code: 'provider_cleanup', principalRef: 'agent:one', correlationRef: 'corr:one', retryable: true })
    const { result } = renderHook(() => useAgentKeysSettings(directory))
    act(() => result.current.requestRevoke(target, document.createElement('button')))
    await act(async () => result.current.confirmRevoke())

    expect(result.current.revokeTarget).toBeUndefined()
    expect(result.current.refreshRequired).toBe(true)
    expect(result.current.error).toContain('not confirmed')
    act(() => result.current.requestRevoke({ ...target, credentialRef: 'credential:two' }, document.createElement('button')))
    expect(result.current.revokeTarget).toBeUndefined()
    expect(calls.revoke).toHaveBeenCalledOnce()
    calls.readDirectory.mockResolvedValue(directory)
    await act(async () => result.current.refresh())
    expect(result.current.refreshRequired).toBe(false)
    await waitFor(() => expect(result.current.revoking).toBe(false))
  })
})
