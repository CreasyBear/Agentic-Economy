/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'

import { AeAgentCallHistoryTable } from '@/components/ae/console/AeAgentCallHistoryTable'
import type { AgentActivityView, AgentUsageSummary } from '@/modules/agent-access/agent-operator-view-model'

describe('AeAgentCallHistoryTable (W-29)', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  const sampleActivity: readonly AgentActivityView[] = [
    {
      callRef: 'call_test_123',
      credentialRef: 'cred_test_1',
      toolRef: 'tool_search_web',
      toolLabel: 'Web Search Tool',
      providerRef: 'prov_brave',
      state: 'completed',
      deliveryState: 'delivered',
      paymentState: 'settled',
      audAmountUnits: '250000', // A$ 0.25
      receiptRef: 'rec_test_123',
      createdAt: 1700000000000,
      updatedAt: 1700000001000,
    },
    {
      callRef: 'call_test_456',
      credentialRef: 'cred_test_1',
      toolRef: 'tool_code_exec',
      toolLabel: 'Code Execution',
      providerRef: 'prov_e2b',
      state: 'refused',
      deliveryState: 'not_delivered',
      paymentState: 'not_applicable',
      createdAt: 1700003600000,
      updatedAt: 1700003601000,
    },
  ]

  const sampleUsage: AgentUsageSummary = {
    periodStartAt: 1700000000000,
    periodEndAt: 1702592000000,
    callCount: 15,
    completedCallCount: 14,
    outcomeUnknownCallCount: 1,
    settledSpend: { currency: 'AUD', units: '3750000', exponent: 6 }, // A$ 3.75
    amountCoverage: 'complete',
    updatedAt: 1700003601000,
  }

  it('T1: renders empty state when activity is empty', () => {
    render(<AeAgentCallHistoryTable activity={[]} />)

    expect(screen.getByText(/no calls recorded/i)).toBeInTheDocument()
    expect(screen.getByText(/when this agent executes tools/i)).toBeInTheDocument()
  })

  it('T2: renders canonical tool and provider refs, amount, status, and time', () => {
    render(<AeAgentCallHistoryTable activity={sampleActivity} />)

    expect(screen.getByText('Web Search Tool')).toBeInTheDocument()
    expect(screen.getByText('prov_brave')).toBeInTheDocument()
    expect(screen.getByText('A$0.25')).toBeInTheDocument()

    expect(screen.getByText('Code Execution')).toBeInTheDocument()
    expect(screen.getByText('prov_e2b')).toBeInTheDocument()
  })

  it('T3: links each row or action to /calls/$callRef', () => {
    render(<AeAgentCallHistoryTable activity={sampleActivity} />)

    const links = screen.getAllByRole('link')
    const call1Link = links.find((link) => link.getAttribute('href') === '/calls/call_test_123')
    const call2Link = links.find((link) => link.getAttribute('href') === '/calls/call_test_456')

    expect(call1Link).toBeDefined()
    expect(call2Link).toBeDefined()
  })

  it('T4: displays economic summary metrics when usage is provided', () => {
    render(
      <AeAgentCallHistoryTable
        activity={sampleActivity}
        usage={sampleUsage}
        showStats
      />,
    )

    expect(screen.getByText('15')).toBeInTheDocument() // Call count
    expect(screen.getByText('A$3.75')).toBeInTheDocument() // Settled spend
  })

  it('sorts exact charge units and keeps unconfirmed payment amounts unconfirmed', () => {
    const first = sampleActivity[0]!
    render(<AeAgentCallHistoryTable activity={[
      { ...first, callRef: 'call:large', toolLabel: 'Larger', audAmountUnits: '9007199254740993' },
      { ...first, callRef: 'call:small', toolLabel: 'Smaller', audAmountUnits: '9007199254740992' },
      { ...first, callRef: 'call:unknown', toolLabel: 'Unknown', paymentState: 'unknown', audAmountUnits: '1' },
    ]} />)
    expect(screen.getByText('Not confirmed')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Amount/u }))
    const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1)
    expect(rows[0]?.textContent).toContain('Smaller')
    expect(rows[1]?.textContent).toContain('Larger')
    expect(rows[2]?.textContent).toContain('Unknown')
  })

  it('keeps full identity values and the encoded native receipt link available', () => {
    const callRef = 'call:encoded /?'
    const toolLabel = `Research tool ${'with a very long display name '.repeat(4).trimEnd()}`
    const toolRef = `tool_${'canonical_reference_'.repeat(5)}`
    const providerRef = `provider_${'canonical_reference_'.repeat(5)}`

    render(<AeAgentCallHistoryTable activity={[
      {
        ...sampleActivity[0]!,
        callRef,
        toolLabel,
        toolRef,
        providerRef,
      },
      sampleActivity[1]!,
    ]} />)

    expect(screen.getByText(toolLabel)).toHaveAttribute('title', toolLabel)
    expect(screen.getByText(toolRef)).toHaveAttribute('title', toolRef)
    expect(screen.getByText(providerRef)).toHaveAttribute('title', providerRef)

    const receipt = screen.getByRole('link', { name: `View call receipt ${callRef}` })
    expect(receipt).toHaveAttribute('href', `/calls/${encodeURIComponent(callRef)}`)
    expect(receipt).toHaveAttribute('aria-label', `View call receipt ${callRef}`)

    const table = screen.getByRole('table')
    const receiptHeader = within(table).getAllByRole('columnheader').at(-1)
    expect(receiptHeader).toHaveAttribute('data-key', 'receipt')
    expect(receiptHeader).not.toHaveAttribute('data-sortable')
    const firstDataRow = within(table).getAllByRole('row')[1]!
    const cells = within(firstDataRow).getAllByRole('cell')
    expect(cells.map((cell) => cell.getAttribute('data-label'))).toEqual([
      'Tool / Task',
      'Provider',
      'Amount',
      'Status',
      'When',
      'Receipt',
    ])
    expect(cells[2]).toHaveAttribute('data-numeric')

    const filter = screen.getByRole('searchbox', { name: 'Filter rows…' })
    fireEvent.change(filter, { target: { value: toolLabel } })
    expect(screen.getByText(toolLabel)).toBeInTheDocument()
    expect(screen.queryByText('Code Execution')).not.toBeInTheDocument()
    fireEvent.change(filter, { target: { value: providerRef } })
    expect(screen.getByText(toolLabel)).toBeInTheDocument()
    expect(screen.queryByText('Code Execution')).not.toBeInTheDocument()
  })
})
