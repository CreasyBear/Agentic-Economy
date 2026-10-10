/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'

import { AeAgentDirectoryTable } from '@/components/ae/console/AeAgentDirectoryTable'
import { monthlySpendLabel, monthlyUtilization } from '@/components/ae/console/agent-operator-console-model'
import type { AgentDirectoryItem } from '@/modules/agent-access/agent-operator-view-model'
import { formatTimestamp, timestampIso } from '@/lib/ui/format-time'

const THREE_HOURS_MS = 3 * 60 * 60 * 1000
const fixedNow = 1758200000000
const fixedLastSeen = fixedNow - THREE_HOURS_MS

const baseItem = {
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
} satisfies AgentDirectoryItem

afterEach(cleanup)

describe('AeAgentDirectoryTable (W-25)', () => {
  it('T1: renders UTC month charges and their separate limit', () => {
    render(
      <AeAgentDirectoryTable
        directoryItems={[baseItem]}
        loading={false}
        onOpenAgent={vi.fn()}
      />,
    )

    expect(screen.getByRole('columnheader', { name: /Charges this month/i })).toBeInTheDocument()
    expect(screen.getByText('A$12.50 / A$100.00')).toBeInTheDocument()
  })

  it('normalizes mixed amount exponents before calculating monthly utilization', () => {
    const mixedExponents: AgentDirectoryItem = {
      ...baseItem,
      monthlySettledSpend: { currency: 'AUD', exponent: 2, units: '1250' },
      monthlyLimit: { currency: 'AUD', exponent: 6, units: '100000000' },
    }

    expect(monthlyUtilization(mixedExponents)).toEqual({ percent: 13, limitState: 'under' })
  })

  it('T2: renders the exact monthly utilization summary for mixed amount exponents', () => {
    const mixedExponents: AgentDirectoryItem = {
      ...baseItem,
      monthlySettledSpend: { currency: 'AUD', exponent: 2, units: '1250' },
    }
    render(
      <AeAgentDirectoryTable
        directoryItems={[mixedExponents]}
        loading={false}
        onOpenAgent={vi.fn()}
      />,
    )

    expect(screen.getByText('A$12.50 / A$100.00')).toBeInTheDocument()
    expect(screen.getByRole('img', {
      name: '13% (A$12.50 / A$100.00). Under the limit.',
    })).toBeInTheDocument()
  })

  it('T3: renders zero activity with a limit as A$0.00 / A$100.00 and utilization 0%', () => {
    const zeroItem: AgentDirectoryItem = {
      ...baseItem,
      monthlySettledSpend: { currency: 'AUD', exponent: 6, units: '0' },
    }
    render(
      <AeAgentDirectoryTable
        directoryItems={[zeroItem]}
        loading={false}
        onOpenAgent={vi.fn()}
      />,
    )

    expect(screen.getByText('A$0.00 / A$100.00')).toBeInTheDocument()
    expect(screen.getByRole('img', {
      name: '0% (A$0.00 / A$100.00). Under the limit.',
    })).toBeInTheDocument()
  })

  it.each([
    ['unavailable', { kind: 'unavailable' } as const, 'Unavailable'],
    ['unset', { kind: 'unset' } as const, 'No spending policy set'],
    ['expired', { kind: 'expired', expiresAt: fixedNow } as const, 'Expired'],
  ])('%s policy never presents an unlimited ceiling or utilization', (_kind, spendingPolicy, label) => {
    render(
      <AeAgentDirectoryTable
        directoryItems={[{ ...baseItem, spendingPolicy, monthlyLimit: undefined }]}
        loading={false}
        onOpenAgent={vi.fn()}
      />,
    )

    expect(within(screen.getByRole('table', { name: 'Agents' })).getByText(`A$12.50 / ${label}`)).toBeInTheDocument()
    expect(screen.queryByText(/No limit|A\$100\.00|Active/)).not.toBeInTheDocument()
    expect(within(screen.getByRole('table', { name: 'Agents' })).queryByRole('img')).not.toBeInTheDocument()
  })

  it('T5: incomplete coverage renders Unavailable / A$100.00 with no utilization meter', () => {
    const incompleteItem: AgentDirectoryItem = {
      ...baseItem,
      monthlySpendCoverage: 'incomplete',
    }
    render(
      <AeAgentDirectoryTable
        directoryItems={[incompleteItem]}
        loading={false}
        onOpenAgent={vi.fn()}
      />,
    )

    expect(screen.getByText('Unavailable / A$100.00')).toBeInTheDocument()
    expect(within(screen.getByRole('table', { name: 'Agents' })).queryByRole('img')).not.toBeInTheDocument()
  })

  it('omits utilization for a nonpositive ceiling or absent spend', () => {
    const zeroCeiling: AgentDirectoryItem = {
      ...baseItem,
      spendingPolicy: {
        ...baseItem.spendingPolicy,
        maximumMonthlySpend: { currency: 'AUD', exponent: 6, units: '0' },
      },
    }
    const noSpend: AgentDirectoryItem = {
      ...baseItem,
      monthlySettledSpend: undefined,
    }
    render(
      <AeAgentDirectoryTable
        directoryItems={[zeroCeiling, noSpend]}
        loading={false}
        onOpenAgent={vi.fn()}
      />,
    )

    const table = within(screen.getByRole('table', { name: 'Agents' }))
    expect(table.getByText('A$12.50 / A$0.00')).toBeInTheDocument()
    expect(table.getByText('Unavailable / A$100.00')).toBeInTheDocument()
    expect(table.queryByRole('img')).not.toBeInTheDocument()
  })

  it('keeps exact under, at and over state when adjacent atomic amounts all round to 100%', () => {
    const ceilingUnits = 900719925474099312345678901234567890n
    const ceiling = { currency: 'AUD', exponent: 0, units: ceilingUnits.toString() }
    const itemFor = (displayName: string, spendUnits: bigint): AgentDirectoryItem => ({
      ...baseItem,
      principalRef: `agent:${displayName.toLowerCase()}`,
      displayName,
      spendingPolicy: { ...baseItem.spendingPolicy, maximumMonthlySpend: ceiling },
      monthlySettledSpend: { ...ceiling, units: spendUnits.toString() },
    })
    const cases = [
      { item: itemFor('One below', ceilingUnits - 1n), state: 'under' as const, text: 'Under the limit.' },
      { item: itemFor('At ceiling', ceilingUnits), state: 'at' as const, text: 'At the limit.' },
      { item: itemFor('One above', ceilingUnits + 1n), state: 'over' as const, text: 'Over the limit.' },
    ]
    for (const { item, state } of cases) {
      expect(monthlyUtilization(item)).toEqual({ percent: 100, limitState: state })
    }

    render(<AeAgentDirectoryTable directoryItems={cases.map(({ item }) => item)} loading={false} onOpenAgent={vi.fn()} />)

    for (const { item, text } of cases) {
      expect(screen.getByRole('img', {
        name: `100% (${monthlySpendLabel(item)}). ${text}`,
      })).toBeInTheDocument()
    }
  })

  it('shows complete monthly counts and sorts exact charges rather than budget percentages', () => {
    const usage = { periodStartAt: 0, periodEndAt: 1000, callCount: 51, completedCallCount: 49,
      outcomeUnknownCallCount: 2, amountCoverage: 'complete' as const, updatedAt: 999 }
    const larger: AgentDirectoryItem = { ...baseItem, principalRef: 'agent:large', displayName: 'Larger', usage,
      monthlySettledSpend: { currency: 'AUD', exponent: 6, units: '9007199254740993' } }
    const smaller: AgentDirectoryItem = { ...baseItem, principalRef: 'agent:small', displayName: 'Smaller', usage,
      monthlySettledSpend: { currency: 'AUD', exponent: 6, units: '9007199254740992' } }
    render(<AeAgentDirectoryTable directoryItems={[larger, smaller]} loading={false} onOpenAgent={vi.fn()} />)
    expect(screen.getAllByText('51')).toHaveLength(2)
    expect(screen.getAllByText('49 completed · 2 outcome unknown')).toHaveLength(2)
    const table = within(screen.getByRole('table'))
    let rows = table.getAllByRole('row').slice(1)
    expect(rows[0]?.textContent).toContain('Larger')
    expect(rows[1]?.textContent).toContain('Smaller')
    fireEvent.click(screen.getByRole('button', { name: /Charges this month/u }))
    rows = table.getAllByRole('row').slice(1)
    expect(rows[0]?.textContent).toContain('Smaller')
    expect(rows[1]?.textContent).toContain('Larger')
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

  it('keeps long Agent identity and connection text available while labelling every row cell', () => {
    const displayName = 'Research assistant for detailed long-running customer evidence analysis'
    const principalRef = `prn_${'agent_reference_'.repeat(5)}`
    const connectorDisplayNames = ['Connection from a very long named harness environment']
    const item = { ...baseItem, principalRef, displayName, connectorDisplayNames }
    const onOpenAgent = vi.fn()
    render(
      <AeAgentDirectoryTable
        directoryItems={[item]}
        loading={false}
        onRenameAgent={vi.fn(async () => true)}
        onOpenAgent={onOpenAgent}
      />,
    )

    const table = screen.getByRole('table', { name: 'Agents' })
    const row = within(table).getAllByRole('row')[1]
    if (row === undefined) throw new Error('expected Agent row')
    const identity = row.querySelector('.arc-agent-directory-identity')
    const reference = row.querySelector('.arc-agent-directory-reference')
    const connection = row.querySelector('[data-column="connection"] > span')

    expect(identity).toHaveAttribute('title', displayName)
    expect(reference).toHaveAttribute('title', principalRef)
    expect(connection).toHaveAttribute('title', connectorDisplayNames.join(', '))
    fireEvent.click(within(row).getByRole('button', {
      name: `View ${displayName} (Sandbox · ${principalRef})`,
    }))
    expect(onOpenAgent).toHaveBeenCalledExactlyOnceWith(item)
    expect(within(row).getAllByRole('cell').map((cell) => cell.getAttribute('data-label'))).toEqual([
      'Agent',
      'Connection',
      'Status',
      'Calls this month',
      'Charges this month',
      'Last used',
      'View',
    ])
    expect(row.querySelector('[data-column="monthlyCalls"]')).toHaveAttribute('data-numeric')
    expect(row.querySelector('[data-column="monthlySpend"]')).toHaveAttribute('data-numeric')
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
    expect(screen.getByRole('table').querySelector('[data-column="connection"] > span')).toHaveAttribute('title', 'Direct key')
  })

  it('retains the unavailable connection copy in the full hover title', () => {
    render(
      <AeAgentDirectoryTable
        directoryItems={[{ ...baseItem, connectionsAvailable: false }]}
        loading={false}
        onOpenAgent={vi.fn()}
      />,
    )

    const connection = screen.getByRole('table').querySelector('[data-column="connection"] > span')
    expect(connection).toHaveTextContent('Connection details unavailable')
    expect(connection).toHaveAttribute('title', 'Connection details unavailable')
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
