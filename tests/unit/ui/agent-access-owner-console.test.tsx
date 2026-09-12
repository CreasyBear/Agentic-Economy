// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import '../../setup/jsdom-platform'

import { AeOwnerCredit } from '@/components/ae/console/AeOwnerCredit'
import { AeAgentOperatorConsole } from '@/components/ae/console/AeAgentOperatorConsole'
import type { AgentConnectionReadback } from '@/modules/agent-access/public'
import type { AgentCredentialSource, AgentDirectoryProjection } from '@/modules/agent-access/agent-operator-view-model'
import { projectAgentDirectory } from '@/modules/agent-access/agent-access-console'
import { canonicalAgentRecord } from '../../helpers/agent-directory-fixture'

const routerNavigate = vi.hoisted(() => vi.fn())

vi.mock('@tanstack/react-router', () => ({
  useRouter: () => ({ navigate: routerNavigate }),
  Link: ({ to, params, children, ...props }: { to: string; params?: Record<string, string>; children: ReactNode }) => (
    <a href={params?.toolRef === undefined ? to : to.replace('$toolRef', encodeURIComponent(params.toolRef))} {...props}>{children}</a>
  ),
}))

const PRINCIPAL_ID = `prn_${'a'.repeat(32)}`
const FOREIGN_PRINCIPAL_ID = `prn_${'b'.repeat(32)}`
const KEY_ID_CANARY = 'key_private_canary_12345678'

const caller: AgentCredentialSource = {
  key: {
    keyId: KEY_ID_CANARY,
    name: 'Route assistant',
    applicationRef: 'agentic-economy',
    environment: 'sandbox',
    authorityMode: 'read_only',
    scopes: ['market_tools:call'],
    revoked: false,
    expired: false,
  },
  grant: {
    principalId: PRINCIPAL_ID,
    credentialId: KEY_ID_CANARY,
    applicationRef: 'agentic-economy',
    environment: 'sandbox',
    authorityMode: 'read_only',
    toolAccess: 'all_admitted',
    toolRefs: [],
    lifecycle: 'active',
    expiresAt: 604_800_000,
    budget: {
      maximumSpendPerCall: { currency: 'USD', units: '500', exponent: 2 },
      maximumDailySpend: { currency: 'USD', units: '2500', exponent: 2 },
      maximumMonthlySpend: { currency: 'USD', units: '10000', exponent: 2 },
      maximumConcurrentCalls: 2,
    },
    rate: { maximumCallsPerMinute: 30, maximumCallsPerHour: 300 },
  },
  principalId: PRINCIPAL_ID,
  activity: [],
  dataState: 'source',
}
const directory = projectAgentDirectory([caller], [canonicalAgentRecord([caller])])
const emptyDirectory: AgentDirectoryProjection = { items: [], details: [] }
const connection: AgentConnectionReadback = {
  connectionRef: 'connection_safe_reference',
  revision: 2,
  principalRef: PRINCIPAL_ID,
  agentDisplayName: 'Route assistant',
  connectorDisplayName: 'Codex',
  environment: 'sandbox' as const,
  state: 'active' as const,
  authorityMode: 'read_only' as const,
  toolAccess: 'all_admitted' as const,
  toolRefs: [],
  spendingPolicy: {
    format: 'ae.agent-access-policy:v2' as const,
    toolAccess: 'all_admitted' as const,
    toolRefs: [],
    environment: 'sandbox' as const,
    budget: {
      budgetPolicyRef: 'budget:test', generation: 1, currency: 'USD', exponent: 2,
      maximumSpendPerCall: { currency: 'USD', units: '500', exponent: 2 },
      maximumDailySpend: { currency: 'USD', units: '2500', exponent: 2 },
      maximumMonthlySpend: { currency: 'USD', units: '10000', exponent: 2 },
      maximumConcurrentCalls: 2,
    },
    rate: { ratePolicyRef: 'rate:test', generation: 1, maximumCallsPerMinute: 30, maximumCallsPerHour: 300 },
  },
  commercialScopes: ['market_tools:call'],
  connectedAt: 1_000,
  lastRotatedAt: 2_000,
  accessExpiresAt: 604_800_000,
  connectionExpiresAt: 2_592_000_000,
  credentialGeneration: 1,
}

function directoryWithLastAuthentication(timestamp: number): AgentDirectoryProjection {
  const canonical = canonicalAgentRecord([caller])
  const current = canonical.credentials[0]
  if (current === undefined) throw new Error('expected canonical credential')
  return projectAgentDirectory([caller], [{
    ...canonical,
    credentials: [{ ...current, lastAuthenticatedAt: timestamp }],
  }])
}

function consoleProps() {
  return {
    directory,
    loading: false,
    onRevokeCredential: vi.fn(),
    onDisconnectAgent: vi.fn(),
    approvals: [],
    approvalsLoading: false,
    onRetryApprovals: vi.fn(),
    onDecideApproval: vi.fn(),
  } as const
}

afterEach(() => {
  cleanup()
  routerNavigate.mockReset()
})

describe('assistant access owner continuation anchors', () => {
  it('shows a factual connection receipt and disconnects only that binding', async () => {
    const onDisconnectConnection = vi.fn()
    render(
      <AeAgentOperatorConsole
        {...consoleProps()}
        directory={projectAgentDirectory([caller], [canonicalAgentRecord([caller])], [connection])}
        selectedPrincipalId={PRINCIPAL_ID}
        getAgentHref={(principalRef) => `/agent-access?caller=${principalRef}`}
        onDisconnectConnection={onDisconnectConnection}
      />,
    )

    expect(screen.getByRole('columnheader', { name: /Connection/u, hidden: true })).toBeDefined()
    const dialog = screen.getByRole('dialog', { name: 'Route assistant' })
    expect(dialog.textContent).toContain('Codex')
    expect(dialog.textContent).toContain('Connection expires')
    expect(dialog.textContent).not.toContain('connection_safe_reference')
    const trigger = within(dialog).getByRole('button', { name: 'Disconnect' })
    fireEvent.click(trigger)
    const confirmation = screen.getByRole('alertdialog', { name: 'Disconnect Codex from Route assistant?' })
    expect(confirmation.textContent).toContain('Other connections for Route assistant remain usable')
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Disconnect' }))
    await waitFor(() => expect(onDisconnectConnection).toHaveBeenCalledWith('connection_safe_reference', 2))
  })

  it('keeps funding on Credit and revocation on Keys', () => {
    const { container: credit } = render(
      <AeOwnerCredit
        directory={emptyDirectory}
        accountBalance={{
          kind: 'available',
          accountRef: 'account:test-owner',
          balance: { currency: 'AUD', units: '0', exponent: 6 },
          locked: false,
          version: 0,
        }}
        loading={false}
      />,
    )
    const { container: keys } = render(
      <AeAgentOperatorConsole
        directory={emptyDirectory}
        loading={false}
        onRevokeCredential={() => undefined}
        onDisconnectAgent={() => undefined}
        approvals={[]}
        approvalsLoading={false}
        onRetryApprovals={() => undefined}
        onDecideApproval={() => undefined}
      />,
    )

    expect(credit.querySelector('#fund')).not.toBeNull()
    expect(credit.querySelector('a[href="/market"]')?.textContent).toBe('Search Tools')
    expect(keys.querySelector('#revoke')).not.toBeNull()
    expect(keys.querySelector('#fund')).toBeNull()
    expect(keys.querySelector('a[href="/for-agents"]')?.textContent).toBe('Connect agent')
  })

  it('confirms only the exact route-selected caller without exposing locator or key canaries', async () => {
    const onDisconnect = vi.fn()
    const onClearSelectedPrincipal = vi.fn()
    render(
      <AeAgentOperatorConsole
        {...consoleProps()}
        onDisconnectAgent={onDisconnect}
        selectedPrincipalId={PRINCIPAL_ID}
        getAgentHref={(principalId) => `/agent-access?caller=${principalId}`}
        onClearSelectedPrincipal={onClearSelectedPrincipal}
        agentHistory={<div>Agent renamed · AE recorded · rename:corr-safe</div>}
      />,
    )

    const dialog = screen.getByRole('dialog', { name: 'Route assistant' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Technical details' }))
    expect(dialog.textContent).toContain('•••• 12345678')
    expect(dialog.textContent).not.toContain(KEY_ID_CANARY)
    expect(dialog.textContent).not.toContain(PRINCIPAL_ID)
    expect(dialog.textContent).toContain('Credential history')
    expect(dialog.textContent).toContain('All admitted Tools')
    expect(dialog.textContent).toContain('Issued')
    expect(dialog.textContent).toContain('expires')
    expect(dialog.textContent).toContain('Last authenticated')
    expect(dialog.textContent).toContain('Not recorded')
    expect(within(dialog).getByText('Last authenticated', { selector: 'dt' }).getAttribute('aria-description'))
      .toBe('Recorded at most once every 15 minutes for the current credential.')
    expect(dialog.textContent).toContain('Agent renamed')
    expect(dialog.textContent).toContain('rename:corr-safe')

    const trigger = within(dialog).getByRole('button', { name: 'Remove agent everywhere' })
    fireEvent.click(trigger)
    const confirmation = screen.getByRole('alertdialog', {
      name: 'Remove Route assistant everywhere?',
    })
    expect(onDisconnect).not.toHaveBeenCalled()
    expect(within(confirmation).getByText(
      'Every active credential, grant, delegation, and provider key for Route assistant will be revoked. Historical activity remains readable.',
    )).toBeDefined()
    expect(confirmation.textContent).not.toContain(KEY_ID_CANARY)
    expect(confirmation.textContent).not.toContain(PRINCIPAL_ID)
    expect(confirmation.textContent).not.toContain('grantRef')
    const cancel = within(confirmation).getByRole('button', { name: 'Cancel' })
    await waitFor(() => expect(document.activeElement).toBe(cancel))

    fireEvent.click(cancel)
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(onDisconnect).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(trigger)

    fireEvent.click(trigger)
    await waitFor(() => expect(document.activeElement).toBe(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Cancel' }),
    ))
    fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(onDisconnect).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(trigger)

    const closeButton = screen
      .getAllByRole('button', { name: 'Close' })
      .find((button) => button.textContent === 'Close')
    if (closeButton === undefined) throw new Error('sheet_close_button_missing')
    fireEvent.click(closeButton)
    expect(onClearSelectedPrincipal).toHaveBeenCalledOnce()
  })

  it('renames the exact current Principal revision', async () => {
    const onRenameAgent = vi.fn(async () => true)
    render(
      <AeAgentOperatorConsole
        {...consoleProps()}
        onRenameAgent={onRenameAgent}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Rename Route assistant' }))
    const input = screen.getByRole('textbox', { name: 'Rename Route assistant' })
    fireEvent.change(input, { target: { value: 'Research assistant' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(onRenameAgent).toHaveBeenCalledWith(
      PRINCIPAL_ID,
      directory.items[0]?.principalRevision,
      'Research assistant',
    ))
    expect(document.body.textContent).not.toContain(PRINCIPAL_ID)
    expect(document.body.textContent).not.toContain(KEY_ID_CANARY)
  })

  it('shows canonical authentication separately from broader last-seen activity', () => {
    const authenticatedAt = 60_000
    render(
      <AeAgentOperatorConsole
        {...consoleProps()}
        directory={directoryWithLastAuthentication(authenticatedAt)}
        selectedPrincipalId={PRINCIPAL_ID}
        getAgentHref={(principalRef) => `/agent-access?caller=${principalRef}`}
      />,
    )

    const expected = new Intl.DateTimeFormat('en-AU', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(authenticatedAt))
    expect(screen.getByRole('columnheader', { name: /Last used/u, hidden: true })).toBeDefined()
    const dialog = screen.getByRole('dialog', { name: 'Route assistant' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Technical details' }))
    expect(screen.getAllByText(expected).length).toBeGreaterThanOrEqual(1)
    expect(dialog.textContent).toContain(expected)
    expect(dialog.textContent).toContain('Last used')
  })

  it('shows the exact selected Tool authority', () => {
    const toolRefs = [
      `operation:v1:${'1'.repeat(64)}`,
      `operation:v1:${'2'.repeat(64)}`,
    ]
    if (caller.grant === undefined) throw new Error('expected Agent grant')
    const selectedCaller: AgentCredentialSource = {
      ...caller,
      grant: { ...caller.grant, toolAccess: 'selected_tools', toolRefs },
    }
    render(
      <AeAgentOperatorConsole
        {...consoleProps()}
        directory={projectAgentDirectory([selectedCaller], [canonicalAgentRecord([selectedCaller])])}
        selectedPrincipalId={PRINCIPAL_ID}
        getAgentHref={(principalRef) => `/agent-access?caller=${principalRef}`}
      />,
    )

    const dialog = screen.getByRole('dialog', { name: 'Route assistant' })
    for (const toolRef of toolRefs) {
      const link = within(dialog).getByRole('link', { name: toolRef })
      expect(link.getAttribute('href')).toBe(`/tools/${encodeURIComponent(toolRef)}`)
    }
    expect(dialog.textContent).not.toContain('All admitted Tools')
  })

  it('restores the authoritative Agent name when rename is refused', async () => {
    const onRenameAgent = vi.fn(async () => false)
    render(<AeAgentOperatorConsole {...consoleProps()} onRenameAgent={onRenameAgent} />)

    fireEvent.click(screen.getByRole('button', { name: 'Rename Route assistant' }))
    const input = screen.getByRole('textbox', { name: 'Rename Route assistant' })
    fireEvent.change(input, { target: { value: 'Unconfirmed name' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect((await screen.findByRole('alert')).textContent).toContain('Current saved name has been restored')
    expect(screen.getByRole<HTMLInputElement>('textbox', { name: 'Rename Route assistant' }).value).toBe('Route assistant')
    expect(document.body.textContent).not.toContain(PRINCIPAL_ID)
  })

  it('revokes once after confirmation and locks dismissal while the exact callback is pending', async () => {
    let resolveRevoke: (() => void) | undefined
    const onRevoke = vi.fn(() => new Promise<void>((resolve) => {
      resolveRevoke = resolve
    }))
    render(
      <AeAgentOperatorConsole
        {...consoleProps()}
        onRevokeCredential={onRevoke}
        selectedPrincipalId={PRINCIPAL_ID}
        getAgentHref={(principalId) => `/agent-access?caller=${principalId}`}
        onClearSelectedPrincipal={() => undefined}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Technical details' }))
    const trigger = screen.getByRole('button', { name: 'Revoke' })
    fireEvent.click(trigger)
    const confirm = within(screen.getByRole('alertdialog')).getByRole('button', {
      name: 'Revoke credential',
    })
    fireEvent.click(confirm)
    await waitFor(() => expect(onRevoke).toHaveBeenCalledOnce())
    expect(onRevoke).toHaveBeenCalledWith(`credential:${KEY_ID_CANARY}`)
    expect(onRevoke).not.toHaveBeenCalledWith(PRINCIPAL_ID)

    const pendingDialog = screen.getByRole('alertdialog')
    const working = within(pendingDialog).getByRole<HTMLButtonElement>('button', {
      name: 'Working…',
    })
    expect(working.disabled).toBe(true)
    fireEvent.click(working)
    fireEvent.click(within(pendingDialog).getByRole('button', { name: 'Cancel' }))
    fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' })
    expect(screen.getByRole('alertdialog')).toBeDefined()
    expect(onRevoke).toHaveBeenCalledOnce()

    const finishRevoke = resolveRevoke
    if (finishRevoke === undefined) throw new Error('revoke_not_started')
    finishRevoke()
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(onRevoke).toHaveBeenCalledOnce()
    expect(document.activeElement).toBe(trigger)
  })

  it('renders a clearable not-found state when the route locator is stale', () => {
    const onClearSelectedPrincipal = vi.fn()
    render(
      <AeAgentOperatorConsole
        {...consoleProps()}
        selectedPrincipalId={FOREIGN_PRINCIPAL_ID}
        getAgentHref={(principalId) => `/agent-access?caller=${principalId}`}
        onClearSelectedPrincipal={onClearSelectedPrincipal}
      />,
    )

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByText('Agent not found')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Return to Agents' }))
    expect(onClearSelectedPrincipal).toHaveBeenCalledOnce()
    expect(document.body.textContent).not.toContain(FOREIGN_PRINCIPAL_ID)
    expect(document.body.textContent).not.toContain(KEY_ID_CANARY)
  })

  it('uses one native link action for route-backed selection', () => {
    render(
      <AeAgentOperatorConsole
        {...consoleProps()}
        getAgentHref={(principalId) => `/agent-access?caller=${principalId}`}
        onClearSelectedPrincipal={() => undefined}
      />,
    )

    const row = screen.getByText('Route assistant').closest('tr')
    if (row === null) throw new Error('caller_row_missing')
    expect(row.getAttribute('tabindex')).toBeNull()
    const open = within(row).getByRole('link', { name: 'Open Route assistant' })
    expect(open.getAttribute('href')).toBe(`/agent-access?caller=${PRINCIPAL_ID}`)
    expect(within(row).getAllByRole('link')).toHaveLength(1)
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
