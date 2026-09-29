/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'

import { AeAgentDirectoryTable } from '@/components/ae/console/AeAgentDirectoryTable'
import type { AgentDirectoryItem } from '@/modules/agent-access/agent-operator-view-model'
import { formatTimestamp, timestampIso } from '@/lib/ui/format-time'

const THREE_HOURS_MS = 3 * 60 * 60 * 1000
const fixedNow = 1758200000000
const fixedLastSeen = fixedNow - THREE_HOURS_MS

const baseItem: AgentDirectoryItem = {
  principalRef: 'prn_test_agent_1',
  principalRevision: 1,
  displayName: 'Research assistant',
  applicationRef: 'app_1',
  environment: 'sandbox',
  status: 'connected',
  connectionCount: 1,
  connectorDisplayNames: ['Codex'],
  authorityMode: 'read_only',
  spendingPolicy: {
    kind: 'known',
    principalRef: 'prn_test_agent_1',
    grantRef: 'grant_test_agent_1',
    generation: 1,
    spendingPolicyDigest: 'digest_test_agent_1',
    maximumSpendPerCall: { currency: 'AUD', exponent: 6, units: '10000000' },
    maximumDailySpend: { currency: 'AUD', exponent: 6, units: '50000000' },
    maximumMonthlySpend: { currency: 'AUD', exponent: 6, units: '100000000' },
    paused: false,
    expiresAt: fixedNow + THREE_HOURS_MS,
  },
  lastSeenAt: fixedLastSeen,
  monthlySettledSpend: { currency: 'AUD', exponent: 6, units: '12500000' },
  monthlyLimit: { currency: 'AUD', exponent: 6, units: '100000000' },
  monthlySpendCoverage: 'complete',
}

afterEach(cleanup)

describe('AeAgentDirectoryTable (W-25)', () => {
  it('T1: renders Monthly spend header and A$12.50 / A$100.00', () => {
    render(
      <AeAgentDirectoryTable
        directoryItems={[baseItem]}
        loading={false}
        onOpenAgent={vi.fn()}
      />,
    )

    expect(screen.getByRole('columnheader', { name: /Monthly spend/i })).toBeInTheDocument()
    expect(screen.getByText('A$12.50 / A$100.00')).toBeInTheDocument()
  })

  it('T2: renders Progress at 13% with accessible label', () => {
    const { container } = render(
      <AeAgentDirectoryTable
        directoryItems={[baseItem]}
        loading={false}
        onOpenAgent={vi.fn()}
      />,
    )

    const progress = container.querySelector('[data-slot="progress"]')
    expect(progress).toBeInTheDocument()
    expect(progress).toHaveAttribute('aria-label', expect.stringContaining('13%'))
    expect(progress).toHaveAttribute('aria-label', expect.stringContaining('A$12.50 / A$100.00'))
  })

  it('T3: renders zero activity with a limit as A$0.00 / A$100.00 and progress 0%', () => {
    const zeroItem: AgentDirectoryItem = {
      ...baseItem,
      monthlySettledSpend: { currency: 'AUD', exponent: 6, units: '0' },
    }
    const { container } = render(
      <AeAgentDirectoryTable
        directoryItems={[zeroItem]}
        loading={false}
        onOpenAgent={vi.fn()}
      />,
    )

    expect(screen.getByText('A$0.00 / A$100.00')).toBeInTheDocument()
    const progress = container.querySelector('[data-slot="progress"]')
    expect(progress).toBeInTheDocument()
    expect(progress).toHaveAttribute('aria-label', expect.stringContaining('0%'))
  })

  it.each([
    ['unavailable', { kind: 'unavailable' } as const, 'Unavailable'],
    ['unset', { kind: 'unset' } as const, 'No spending policy set'],
    ['expired', { kind: 'expired', expiresAt: fixedNow } as const, 'Expired'],
  ])('%s policy never presents an unlimited ceiling or utilization', (_kind, spendingPolicy, label) => {
    const { container } = render(
      <AeAgentDirectoryTable
        directoryItems={[{ ...baseItem, spendingPolicy, monthlyLimit: undefined }]}
        loading={false}
        onOpenAgent={vi.fn()}
      />,
    )

    expect(screen.getByText(label)).toBeInTheDocument()
    expect(screen.queryByText(/No limit|A\$100\.00|Active/)).not.toBeInTheDocument()
    expect(container.querySelector('[data-slot="progress"]')).not.toBeInTheDocument()
  })

  it('T5: incomplete coverage renders Unavailable / A$100.00 with no progress bar', () => {
    const incompleteItem: AgentDirectoryItem = {
      ...baseItem,
      monthlySettledSpend: undefined,
      monthlySpendCoverage: 'incomplete',
    }
    const { container } = render(
      <AeAgentDirectoryTable
        directoryItems={[incompleteItem]}
        loading={false}
        onOpenAgent={vi.fn()}
      />,
    )

    expect(screen.getByText('Unavailable / A$100.00')).toBeInTheDocument()
    expect(container.querySelector('[data-slot="progress"]')).not.toBeInTheDocument()
  })

  it('keeps same-named Agents distinct by principal in view and row actions', () => {
    const open = vi.fn()
    const first: AgentDirectoryItem = { ...baseItem, displayName: 'Shared Agent' }
    const second: AgentDirectoryItem = {
      ...baseItem, principalRef: 'prn_test_agent_2', displayName: 'Shared Agent', environment: 'production',
    }
    render(<AeAgentDirectoryTable directoryItems={[first, second]} loading={false} onOpenAgent={open} />)

    expect(screen.getByText(first.principalRef)).toBeInTheDocument()
    expect(screen.getByText(second.principalRef)).toBeInTheDocument()
    screen.getByRole('button', { name: `View Shared Agent (Production · ${second.principalRef})` }).click()
    expect(open).toHaveBeenCalledExactlyOnceWith(second)
  })

  it('T8: renders last used as relative time with datetime attribute and timestamp title', () => {
    vi.spyOn(Date, 'now').mockReturnValue(fixedNow)

    render(
      <AeAgentDirectoryTable
        directoryItems={[baseItem]}
        loading={false}
        onOpenAgent={vi.fn()}
      />,
    )

    const timeElement = screen.getByText(/3 hours ago/i)
    expect(timeElement.tagName.toLowerCase()).toBe('time')
    expect(timeElement).toHaveAttribute('dateTime', timestampIso(fixedLastSeen))
    expect(timeElement).toHaveAttribute('title', formatTimestamp(fixedLastSeen))

    vi.restoreAllMocks()
  })

  it('T9: empty directory renders empty state without table or status filter', () => {
    render(
      <AeAgentDirectoryTable
        directoryItems={[]}
        loading={false}
        onOpenAgent={vi.fn()}
      />,
    )

    expect(screen.getByText('No agent is connected yet')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/filter by status/i)).not.toBeInTheDocument()
  })

  it('shows Direct key for a fresh key with no client connection', () => {
    render(
      <AeAgentDirectoryTable
        directoryItems={[{ ...baseItem, connectionCount: 0, connectorDisplayNames: [], status: 'connected' }]}
        loading={false}
        onOpenAgent={vi.fn()}
      />,
    )
    expect(screen.getByText('Direct key')).toBeInTheDocument()
    expect(screen.queryByText('Legacy credential')).not.toBeInTheDocument()
    expect(screen.queryByText(/predates durable client connections/)).not.toBeInTheDocument()
  })

  it('shows expired authority as history instead of current spend permission', () => {
    render(
      <AeAgentDirectoryTable
        directoryItems={[{ ...baseItem, status: 'expired', authorityMode: 'spending_policy', connectionCount: 0, connectorDisplayNames: [] }]}
        loading={false}
        onOpenAgent={vi.fn()}
      />,
    )
    expect(screen.getAllByText('Expired').length).toBeGreaterThan(0)
    expect(screen.getByText('Previous authority: Work within limits')).toBeInTheDocument()
    expect(screen.queryByText('Work within limits')).not.toBeInTheDocument()
  })
})
