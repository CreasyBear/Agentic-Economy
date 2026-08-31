// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import '../../setup/jsdom-platform'

import { AeOwnerCredit } from '@/components/ae/console/AeOwnerCredit'
import { AeAgentOperatorConsole } from '@/components/ae/console/AeAgentOperatorConsole'
import type { AgentCredentialSource, AgentDirectoryProjection } from '@/modules/agent-access/agent-operator-view-model'
import { projectAgentDirectory } from '@/modules/agent-access/agent-access-console'
import { canonicalAgentRecord } from '../../helpers/agent-directory-fixture'

const routerNavigate = vi.hoisted(() => vi.fn())

vi.mock('@tanstack/react-router', () => ({
  useRouter: () => ({ navigate: routerNavigate }),
  Link: ({ to, children, ...props }: { to: string; children: ReactNode }) => (
    <a href={to} {...props}>{children}</a>
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
    authorityMode: 'inspect_only',
    scopes: ['market_operations:invoke'],
    revoked: false,
    expired: false,
  },
  grant: {
    principalId: PRINCIPAL_ID,
    credentialId: KEY_ID_CANARY,
    applicationRef: 'agentic-economy',
    environment: 'sandbox',
    authorityMode: 'inspect_only',
    lifecycle: 'active',
    expiresAt: 604_800_000,
    budget: {
      maximumSpendPerInvocation: { currency: 'USD', units: '500', exponent: 2 },
      maximumDailySpend: { currency: 'USD', units: '2500', exponent: 2 },
      maximumMonthlySpend: { currency: 'USD', units: '10000', exponent: 2 },
      maximumConcurrentInvocations: 2,
    },
    rate: { maximumCallsPerMinute: 30, maximumCallsPerHour: 300 },
  },
  principalId: PRINCIPAL_ID,
  activity: [],
  dataState: 'source',
}
const directory = projectAgentDirectory([caller], [canonicalAgentRecord([caller])])
const emptyDirectory: AgentDirectoryProjection = { items: [], details: [] }

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
  it('keeps funding on Credit and revocation on Keys', () => {
    const { container: credit } = render(
      <AeOwnerCredit directory={emptyDirectory} loading={false} />,
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
    expect(credit.querySelector('a[href="/market?window=30d"]')?.textContent).toBe('Search Operations')
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
      />,
    )

    const dialog = screen.getByRole('dialog', { name: 'Route assistant' })
    expect(dialog.textContent).toContain('•••• 12345678')
    expect(dialog.textContent).not.toContain(KEY_ID_CANARY)
    expect(dialog.textContent).not.toContain(PRINCIPAL_ID)
    expect(dialog.textContent).toContain('Credential history')

    const trigger = screen.getByRole('button', { name: 'Disconnect agent' })
    fireEvent.click(trigger)
    const confirmation = screen.getByRole('alertdialog', {
      name: 'Disconnect Route assistant?',
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
