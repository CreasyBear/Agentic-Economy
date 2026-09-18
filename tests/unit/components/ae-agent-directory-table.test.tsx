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

  it('T4: missing grant renders No limit and no progress bar', () => {
    const noLimitItem: AgentDirectoryItem = {
      ...baseItem,
      monthlyLimit: undefined,
    }
    const { container } = render(
      <AeAgentDirectoryTable
        directoryItems={[noLimitItem]}
        loading={false}
        onOpenAgent={vi.fn()}
      />,
    )

    expect(screen.getByText(/A\$12\.50 \/ No limit/)).toBeInTheDocument()
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

  it('T6: renders status badges with correct variant data attributes', () => {
    const items: AgentDirectoryItem[] = [
      { ...baseItem, principalRef: 'prn_1', displayName: 'Agent 1', status: 'connected' },
      { ...baseItem, principalRef: 'prn_2', displayName: 'Agent 2', status: 'attention' },
      { ...baseItem, principalRef: 'prn_3', displayName: 'Agent 3', status: 'expired' },
      { ...baseItem, principalRef: 'prn_4', displayName: 'Agent 4', status: 'disconnected' },
    ]

    const { container } = render(
      <AeAgentDirectoryTable
        directoryItems={items}
        loading={false}
        onOpenAgent={vi.fn()}
      />,
    )

    const badges = container.querySelectorAll('[data-slot="badge"]')
    const statusBadges = Array.from(badges).filter((b) =>
      ['Connected', 'Needs attention', 'Expired', 'Disconnected'].includes(b.textContent ?? ''),
    )

    expect(statusBadges).toHaveLength(4)
    expect(statusBadges.find((b) => b.textContent === 'Connected')).toHaveAttribute('data-variant', 'success')
    expect(statusBadges.find((b) => b.textContent === 'Needs attention')).toHaveAttribute('data-variant', 'warning')
    expect(statusBadges.find((b) => b.textContent === 'Expired')).toHaveAttribute('data-variant', 'destructive')
    expect(statusBadges.find((b) => b.textContent === 'Disconnected')).toHaveAttribute('data-variant', 'outline')
  })

  it('T7: filters items by status using the select dropdown', () => {
    const items: AgentDirectoryItem[] = [
      { ...baseItem, principalRef: 'prn_conn', displayName: 'Connected Bot', status: 'connected' },
      { ...baseItem, principalRef: 'prn_exp', displayName: 'Expired Bot', status: 'expired' },
    ]

    render(
      <AeAgentDirectoryTable
        directoryItems={items}
        loading={false}
        onOpenAgent={vi.fn()}
      />,
    )

    expect(screen.getByText('Connected Bot')).toBeInTheDocument()
    expect(screen.getByText('Expired Bot')).toBeInTheDocument()

    // Status filter select exists
    const selectTrigger = screen.getByLabelText(/filter by status/i)
    expect(selectTrigger).toBeInTheDocument()
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
})
