/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { Outlet, RouterProvider, createMemoryHistory, createRootRoute, createRoute, createRouter } from '@tanstack/react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { AgentDirectoryItem, AgentDirectoryProjection } from '@/modules/agent-access/agent-operator-view-model'
import { formatTimestamp } from '@/lib/ui/format-time'

const transport = vi.hoisted(() => ({
  readDirectory: vi.fn(), readPage: vi.fn(), issue: vi.fn(), revoke: vi.fn(), capture: vi.fn(),
}))

vi.mock('@tanstack/react-start', async importOriginal => ({
  ...await importOriginal(),
  useServerFn: (serverFn: unknown) => serverFn,
}))
vi.mock('@clerk/tanstack-react-start', () => ({
  useReverification: (request: (...args: unknown[]) => Promise<unknown>) => request,
}))
vi.mock('@/lib/server/agent-access-console.functions', () => ({
  readAgentDirectoryServer: transport.readDirectory,
  readAgentDirectoryPageServer: transport.readPage,
}))
vi.mock('@/modules/agent-access/agent-access.functions', () => ({
  issueAgentAccessKeyServer: transport.issue,
  revokeAgentCredentialServer: transport.revoke,
}))
vi.mock('@/lib/observability/capture-client-exception', () => ({ captureClientExceptionOnClient: transport.capture }))

import { AeAgentKeysSettings } from '@/components/ae/settings/agent-keys/AeAgentKeysSettings'

const principalRef = `prn_${'a'.repeat(32)}`
const issuedAt = 1_700_000_000_000
const agent: AgentDirectoryItem = {
  principalRef, principalRevision: 1, displayName: 'Route assistant', applicationRef: 'agentic-economy',
  environment: 'sandbox', status: 'connected', spendingPolicy: { kind: 'unset' },
  currentCredentialGeneration: 4, connectionCount: 0, connectorDisplayNames: [], authorityMode: 'read_only',
}

function directory(revokedGeneration?: number): AgentDirectoryProjection {
  return {
    items: [agent],
    details: [{
      agent, connections: [], currentCredentialRef: 'credential:four', authorityMode: 'read_only', scopes: [],
      spendingPolicy: { kind: 'unset' }, activity: [], dataState: 'empty',
      credentials: [
        { credentialRef: 'credential:one', generation: 1, lifecycle: 'stale', issuedAt, expiresAt: issuedAt + 86_400_000 },
        { credentialRef: 'credential:two', generation: 2, lifecycle: 'revoked', issuedAt: issuedAt + 60_000, expiresAt: issuedAt + 86_460_000 },
        { credentialRef: 'credential:three', generation: 3, lifecycle: revokedGeneration === 3 ? 'revoked' : 'active', issuedAt: issuedAt + 120_000, expiresAt: issuedAt + 86_520_000 },
        { credentialRef: 'credential:four', generation: 4, lifecycle: revokedGeneration === 4 ? 'revoked' : 'active', issuedAt: issuedAt + 180_000, expiresAt: issuedAt + 86_580_000 },
      ],
    }],
  }
}

async function renderKeys(initialDirectory = directory()) {
  const root = createRootRoute({ component: Outlet })
  const routeTree = root.addChildren([
    createRoute({ getParentRoute: () => root, path: '/owner/settings/agent-keys', component: () => <AeAgentKeysSettings deploymentEnvironment="sandbox" initialDirectory={initialDirectory} canonicalBaseUrl="https://app.aecon.ai" /> }),
    createRoute({ getParentRoute: () => root, path: '/agent-access', component: () => <h1>Agent access</h1> }),
  ])
  const router = createRouter({ routeTree, history: createMemoryHistory({ initialEntries: ['/owner/settings/agent-keys'] }) })
  await router.load()
  return render(<RouterProvider router={router} />)
}

function openKey(generation: number) {
  const summary = screen.getByLabelText(`Key details for Route assistant, Sandbox, generation ${generation}`)
  fireEvent.click(summary)
  expect(summary.closest('details')).toHaveAttribute('open')
  return screen.getByRole('region', { name: `Key details for Route assistant, Sandbox, generation ${generation}` })
}

function revokeButton(generation: number) {
  return within(openKey(generation)).getByRole('button', {
    name: `Revoke key created ${formatTimestamp(issuedAt + (generation - 1) * 60_000)} for Route assistant`,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  transport.readDirectory.mockResolvedValue(directory())
  transport.revoke.mockResolvedValue({ kind: 'completed' })
})
afterEach(cleanup)

describe('Arc Agent key composition', () => {
  it('shows each credential once with current, other active and historical status', async () => {
    await renderKeys()
    const list = screen.getByRole('list', { name: 'Issued Agent keys' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(4)
    expect(within(list).getAllByText('Route assistant')).toHaveLength(4)
    expect(within(list).getByText('Current')).toBeVisible()
    expect(within(list).getByText('Other active')).toBeVisible()
    expect(within(list).getByText('Stale')).toBeVisible()
    expect(within(list).getByText('Revoked')).toBeVisible()
    expect(screen.queryByRole('list', { name: 'Active Agent keys that can be revoked' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Issue Agent key' })).toBeEnabled()
    expect(transport.readDirectory).not.toHaveBeenCalled()
  })

  it('opens read-only facts and the exact Agent destination without fetching or mutating', async () => {
    await renderKeys()
    const region = openKey(3)
    expect(within(region).getByText('credential:three')).toBeVisible()
    expect(within(region).getByText('Generation').nextElementSibling).toHaveTextContent('3')
    expect(within(region).getByText('Issued').nextElementSibling).toHaveTextContent(formatTimestamp(issuedAt + 120_000))
    expect(within(region).getByText('Expires').nextElementSibling).toHaveTextContent(formatTimestamp(issuedAt + 86_520_000))
    expect(within(region).getByRole('link', { name: 'View Agent' })).toHaveAttribute('href', `/agent-access?caller=${principalRef}`)
    expect(transport.readDirectory).not.toHaveBeenCalled()
    expect(transport.readPage).not.toHaveBeenCalled()
    expect(transport.issue).not.toHaveBeenCalled()
    expect(transport.revoke).not.toHaveBeenCalled()
  })

  it('places revocation only on active keys, preserves the current-key consequence and returns focus on cancel', async () => {
    await renderKeys()
    expect(within(openKey(1)).queryByRole('button', { name: /Revoke key created/u })).toBeNull()
    expect(within(openKey(2)).queryByRole('button', { name: /Revoke key created/u })).toBeNull()
    const trigger = revokeButton(4)
    expect(screen.getByRole('region', { name: /generation 4/u })).toHaveTextContent('If no other key is active the Agent must reconnect.')
    trigger.focus()
    fireEvent.click(trigger)
    const dialog = screen.getByRole('alertdialog', { name: 'Revoke this key?' })
    expect(dialog).toHaveTextContent('If no other key is active the Agent must reconnect.')
    expect(dialog).toHaveTextContent('The Agent and its history remain.')
    expect(transport.revoke).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(trigger).toHaveFocus())
  })

  it('revokes the selected older active credential, then keeps its history in the same row', async () => {
    transport.readDirectory.mockResolvedValue(directory(3))
    await renderKeys()
    fireEvent.click(revokeButton(3))
    const dialog = screen.getByRole('alertdialog', { name: 'Revoke this key?' })
    expect(dialog).toHaveTextContent(formatTimestamp(issuedAt + 120_000))
    expect(dialog).not.toHaveTextContent('If no other key is active')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Revoke this key' }))
    await waitFor(() => expect(transport.revoke).toHaveBeenCalledWith({ data: { credentialRef: 'credential:three' } }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    const region = screen.getByRole('region', { name: /generation 3/u })
    expect(region).toHaveTextContent('credential:three')
    expect(region).toHaveTextContent('This key is revoked.')
    expect(within(region).queryByRole('button', { name: /Revoke key created/u })).toBeNull()
    expect(screen.getByRole('list', { name: 'Issued Agent keys' })).toHaveTextContent('Current')
    expect(transport.readDirectory).toHaveBeenCalledTimes(1)
  })

  it('blocks duplicate confirmation and further changes after uncertain revocation until a successful refresh', async () => {
    let resolveRevoke: ((result: unknown) => void) | undefined
    const pending = new Promise(resolve => { resolveRevoke = resolve })
    transport.revoke.mockReturnValueOnce(pending)
    await renderKeys()
    fireEvent.click(revokeButton(3))
    const dialog = screen.getByRole('alertdialog', { name: 'Revoke this key?' })
    const confirm = within(dialog).getByRole('button', { name: 'Revoke this key' })
    fireEvent.click(confirm)
    fireEvent.click(confirm)
    expect(transport.revoke).toHaveBeenCalledTimes(1)
    expect(within(dialog).getByRole('button', { name: 'Working…' })).toBeDisabled()
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeDisabled()
    await act(async () => { resolveRevoke?.({ kind: 'refused', code: 'source_unavailable' }); await pending })
    expect(screen.getByRole('alert')).toHaveTextContent('Refresh before trying again.')
    expect(screen.getByRole('button', { name: 'Issue Agent key' })).toBeDisabled()
    for (const button of screen.getAllByRole('button', { name: /Revoke key created/u })) expect(button).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Refresh keys' }))
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
    expect(screen.getByRole('button', { name: 'Issue Agent key' })).toBeEnabled()
    for (const button of screen.getAllByRole('button', { name: /Revoke key created/u })) expect(button).toBeEnabled()
  })

  it('keeps known keys and blocks changes if revocation succeeds but authoritative readback fails', async () => {
    transport.readDirectory.mockRejectedValueOnce(new Error('readback unavailable'))
    await renderKeys()
    fireEvent.click(revokeButton(4))
    fireEvent.click(screen.getByRole('button', { name: 'Revoke this key' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Agent keys could not be refreshed.'))
    expect(screen.getByRole('list', { name: 'Issued Agent keys' })).toHaveTextContent('Current')
    expect(screen.getByRole('button', { name: 'Issue Agent key' })).toBeDisabled()
    for (const button of screen.getAllByRole('button', { name: /Revoke key created/u })) expect(button).toBeDisabled()
    expect(transport.capture).toHaveBeenCalledTimes(1)
  })
})
