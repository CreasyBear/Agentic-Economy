// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import '../../setup/jsdom-platform'

import { AeOwnerCredit } from '@/components/ae/console/owner-credit/AeOwnerCredit'
import { AeAgentOperatorConsole } from '@/components/ae/console/agent-operator-console/AeAgentOperatorConsole'
import { AeAgentDirectoryTable } from '@/components/ae/console/AeAgentDirectoryTable'
import { AeAgentCallHistoryTable } from '@/components/ae/console/AeAgentCallHistoryTable'
import { toast } from '@/lib/ui/toast'
import type { AgentConnectionReadback } from '@/modules/agent-access/public'
import type { AgentCredentialSource, AgentDirectoryProjection, AgentUsageSummary } from '@/modules/agent-access/agent-operator-view-model'
import { projectAgentDirectory } from '@/modules/agent-access/agent-access-console'
import { canonicalAgentRecord } from '../../helpers/agent-directory-fixture'

const routerNavigate = vi.hoisted(() => vi.fn())

vi.mock('@/lib/ui/toast', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

vi.mock('@clerk/tanstack-react-start', () => ({
  useAuth: () => ({ userId: 'user_test-owner' }),
}))

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
  vi.mocked(toast.success).mockReset()
  vi.mocked(toast.error).mockReset()
})

describe('assistant access owner continuation anchors', () => {
  it.each([
    ['complete', '0', 'A$0.00'],
    ['complete', '1500000', 'A$1.50'],
    ['complete', undefined, 'Amount coverage incomplete'],
    ['incomplete', '1500000', 'Amount coverage incomplete'],
    ['incomplete', undefined, 'Amount coverage incomplete'],
  ] as const)('shows an Agent spend total only for complete supplied amounts (%s, %s)', (amountCoverage, units, expected) => {
    const usage: AgentUsageSummary = {
      periodStartAt: 0, periodEndAt: 1000, callCount: 1, completedCallCount: 1, outcomeUnknownCallCount: 0,
      amountCoverage, updatedAt: 1000,
      ...(units === undefined ? {} : { settledSpend: { currency: 'AUD', exponent: 6, units } }),
    }
    render(<AeAgentCallHistoryTable activity={[]} usage={usage} showStats />)
    const metric = screen.getByText('Settled spend').parentElement
    expect(metric?.textContent).toBe(`Settled spend${expected}`)
  })

  it('changes the local Agent status scope with Arc controls while preserving row destinations', () => {
    const connected = directory.items[0]
    if (connected === undefined) throw new Error('expected projected Agent')
    const expired = { ...connected, principalRef: FOREIGN_PRINCIPAL_ID, displayName: 'Expired assistant', status: 'expired' as const }
    const onOpenAgent = vi.fn()
    render(<AeAgentDirectoryTable directoryItems={[connected, expired]} loading={false} onOpenAgent={onOpenAgent} getAgentHref={(ref) => `/agent-access?caller=${ref}`} />)
    const scopes = screen.getByRole('group', { name: 'Filter by status' })
    const all = within(scopes).getByRole('button', { name: 'All statuses' })
    const expiredScope = within(scopes).getByRole('button', { name: 'Expired' })
    fireEvent.click(expiredScope)
    expect(expiredScope.getAttribute('aria-pressed')).toBe('true')
    expect(screen.queryByRole('link', { name: /^Open Route assistant/u })).toBeNull()
    expect(screen.getByRole('link', { name: /^Open Expired assistant/u }).getAttribute('href')).toBe(`/agent-access?caller=${FOREIGN_PRINCIPAL_ID}`)
    fireEvent.keyDown(expiredScope, { key: 'Home' })
    expect(all.getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('link', { name: /^Open Route assistant/u }).getAttribute('href')).toBe(`/agent-access?caller=${PRINCIPAL_ID}`)
    expect(document.activeElement).toBe(all)
    expect(onOpenAgent).not.toHaveBeenCalled()
  })

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
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Disconnect connection' }))
    await waitFor(() => expect(onDisconnectConnection).toHaveBeenCalledWith('connection_safe_reference', 2))
  })

  it('keeps funding on Credit and revocation on Keys', () => {
    const { container: credit } = render(
      <AeOwnerCredit
        accountBalance={{
          kind: 'available',
          accountRef: 'account:test-owner',
          balance: { currency: 'AUD', units: '0', exponent: 6 },
          locked: false,
          version: 0,
        }}
        accountHistory={{
          kind: 'available', entries: [], snapshotAt: 1, continueCursor: '', isDone: true,
          coverage: 'complete', sourceLinkCoverage: 'unavailable', source: 'formance_transaction_cursor',
          ordering: 'recorded_transaction_sequence_desc',
        }}
      />,
    )
    const { container: keys } = render(
      <AeAgentOperatorConsole
        directory={emptyDirectory}
        loading={false}
        onDisconnectAgent={() => undefined}
        approvals={[]}
        approvalsLoading={false}
        onRetryApprovals={() => undefined}
        onDecideApproval={() => undefined}
      />,
    )

    expect(credit.querySelector('#fund')).not.toBeNull()
    expect(credit.textContent).toContain('Add funds')
    expect(keys.querySelector('#revoke')).not.toBeNull()
    expect(keys.querySelector('#fund')).toBeNull()
    expect(keys.querySelector('a[href="/for-agents"]')?.textContent).toBe('Connect an Agent')
    expect(keys.querySelector('a[href="/owner/credit"]')).toBeNull()
    expect(within(keys).queryByRole('heading', { name: 'Credit' })).toBeNull()
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
    fireEvent.click(within(dialog).getByRole('button', { name: 'Tool access' }))
    expect(dialog.textContent).toContain('•••• 12345678')
    expect(dialog.textContent).not.toContain(KEY_ID_CANARY)
    expect(dialog.textContent).not.toContain(PRINCIPAL_ID)
    expect(dialog.textContent).toContain('Manage Agent keys and credential history')
    expect(dialog.textContent).toContain('All admitted Tools')
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

    fireEvent.click(cancel)
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(onDisconnect).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(trigger)

    fireEvent.click(trigger)
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

    fireEvent.click(screen.getByRole('button', { name: `Rename Route assistant (Sandbox · ${PRINCIPAL_ID})` }))
    const input = screen.getByRole('textbox', { name: `Rename Route assistant (Sandbox · ${PRINCIPAL_ID})` })
    fireEvent.change(input, { target: { value: 'Research assistant' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(onRenameAgent).toHaveBeenCalledWith(
      PRINCIPAL_ID,
      directory.items[0]?.principalRevision,
      'Research assistant',
    ))
    expect(screen.getByText(PRINCIPAL_ID)).toBeTruthy()
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

  it('keeps the Agent decision summary compact and discloses supporting facts by task', () => {
    render(
      <AeAgentOperatorConsole
        {...consoleProps()}
        selectedPrincipalId={PRINCIPAL_ID}
        getAgentHref={(principalRef) => `/agent-access?caller=${principalRef}`}
      />,
    )

    const dialog = screen.getByRole('dialog', { name: 'Route assistant' })
    expect(within(dialog).getByText('Authority', { selector: 'dt' })).toBeTruthy()
    expect(within(dialog).getByText('Monthly limit', { selector: 'dt' })).toBeTruthy()
    expect(within(dialog).getByText('Recent Calls', { selector: 'dt' })).toBeTruthy()
    expect(within(dialog).getByText('Last used', { selector: 'dt' })).toBeTruthy()
    expect(within(dialog).queryByText('Daily budget', { selector: 'dt' })).toBeNull()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Spending policy' }))
    expect(within(dialog).getByText('Spending policy', { selector: 'dt' }).nextElementSibling?.textContent).toBe('Unavailable')
    expect(within(dialog).queryByText('Concurrency', { selector: 'dt' })).toBeNull()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Activity' }))
    expect(within(dialog).getByText('Settled charges', { selector: 'dt' })).toBeTruthy()
    expect(within(dialog).getByText('Usage data', { selector: 'dt' })).toBeTruthy()
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
    fireEvent.click(within(dialog).getByRole('button', { name: 'Tool access' }))
    for (const toolRef of toolRefs) {
      const link = within(dialog).getByRole('link', { name: toolRef })
      expect(link.getAttribute('href')).toBe(`/tools/${encodeURIComponent(toolRef)}`)
    }
    expect(dialog.textContent).not.toContain('All admitted Tools')
  })

  it('restores the authoritative Agent name when rename is refused', async () => {
    const onRenameAgent = vi.fn(async () => false)
    render(<AeAgentOperatorConsole {...consoleProps()} onRenameAgent={onRenameAgent} />)

    fireEvent.click(screen.getByRole('button', { name: `Rename Route assistant (Sandbox · ${PRINCIPAL_ID})` }))
    const input = screen.getByRole('textbox', { name: `Rename Route assistant (Sandbox · ${PRINCIPAL_ID})` })
    fireEvent.change(input, { target: { value: 'Unconfirmed name' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect((await screen.findByRole('alert')).textContent).toContain('Current saved name has been restored')
    expect(screen.getByRole<HTMLInputElement>('textbox', { name: `Rename Route assistant (Sandbox · ${PRINCIPAL_ID})` }).value).toBe('Route assistant')
    expect(screen.getByText(PRINCIPAL_ID)).toBeTruthy()
  })

  it('links credential history to Agent keys settings without another revoke control', () => {
    render(
      <AeAgentOperatorConsole
        {...consoleProps()}
        selectedPrincipalId={PRINCIPAL_ID}
        getAgentHref={(principalId) => `/agent-access?caller=${principalId}`}
        onClearSelectedPrincipal={() => undefined}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Technical details' }))
    expect(screen.getByRole('link', { name: 'Manage Agent keys and credential history' }).getAttribute('href'))
      .toBe('/owner/settings/agent-keys')
    expect(screen.queryByRole('button', { name: 'Revoke' })).toBeNull()
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
    const open = within(row).getByRole('link', { name: `Open Route assistant (Sandbox · ${PRINCIPAL_ID})` })
    expect(open.getAttribute('href')).toBe(`/agent-access?caller=${PRINCIPAL_ID}`)
    expect(within(row).getAllByRole('link')).toHaveLength(1)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('keeps financial disclosure beside an explicit confirmation action', () => {
    render(
      <AeAgentOperatorConsole
        {...consoleProps()}
        selectedPrincipalId={PRINCIPAL_ID}
        getAgentHref={(principalId) => `/agent-access?caller=${principalId}`}
      />,
    )

    const dialog = screen.getByRole('dialog', { name: 'Route assistant' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Technical details' }))
    const trigger = within(dialog).getByRole('button', { name: 'Remove agent everywhere' })
    expect((trigger as HTMLButtonElement).type).toBe('button')
    expect((trigger as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(trigger)

    const confirmation = screen.getByRole('alertdialog', { name: 'Remove Route assistant everywhere?' })
    expect(confirmation.textContent).toContain(
      'A$0.00 unreleased holds remain protected — in-flight calls finish or release immediately',
    )

    const confirm = within(confirmation).getByRole('button', { name: 'Remove agent' })
    expect((confirm as HTMLButtonElement).type).toBe('button')
    expect((confirm as HTMLButtonElement).disabled).toBe(false)
  })

  it('W-28: successful agent disconnect toasts and closes dialog', async () => {
    const onDisconnect = vi.fn(async () => undefined)
    render(
      <AeAgentOperatorConsole
        {...consoleProps()}
        onDisconnectAgent={onDisconnect}
        selectedPrincipalId={PRINCIPAL_ID}
        getAgentHref={(principalId) => `/agent-access?caller=${principalId}`}
      />,
    )

    const dialog = screen.getByRole('dialog', { name: 'Route assistant' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Technical details' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove agent everywhere' }))
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Remove agent' }))
    await waitFor(() => expect(onDisconnect).toHaveBeenCalledWith(PRINCIPAL_ID))
    expect(toast.success).toHaveBeenCalledWith('Agent access revoked')
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
  })

  it('W-28: failed revoke keeps dialog open with Rule 4 triplet and error toast', async () => {
    const onDisconnect = vi.fn(async () => {
      throw new Error('revoke_failed')
    })
    render(
      <AeAgentOperatorConsole
        {...consoleProps()}
        onDisconnectAgent={onDisconnect}
        selectedPrincipalId={PRINCIPAL_ID}
        getAgentHref={(principalId) => `/agent-access?caller=${principalId}`}
      />,
    )

    const dialog = screen.getByRole('dialog', { name: 'Route assistant' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Technical details' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove agent everywhere' }))
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Remove agent' }))
    await waitFor(() => expect(onDisconnect).toHaveBeenCalled())
    expect(toast.error).toHaveBeenCalledWith('Could not revoke agent access.')
    const confirmation = screen.getByRole('alertdialog')
    expect(confirmation.textContent).toContain('A$0.00 affected — agent remains active')
    expect(confirmation.textContent).toContain('Try again. If this persists, refresh the directory and retry.')
  })
})
