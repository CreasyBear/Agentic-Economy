/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
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
      tool: {
        label: 'Web Search Tool',
        provider: 'Brave Software',
      },
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
      tool: {
        label: 'Code Execution Sandbox',
        provider: 'E2B Systems',
      },
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

  it('T2: renders table with tool name, provider, amount, status, and time', () => {
    render(<AeAgentCallHistoryTable activity={sampleActivity} />)

    expect(screen.getByText('Web Search Tool')).toBeInTheDocument()
    expect(screen.getByText('Brave Software')).toBeInTheDocument()
    expect(screen.getByText('A$0.25')).toBeInTheDocument()

    expect(screen.getByText('Code Execution Sandbox')).toBeInTheDocument()
    expect(screen.getByText('E2B Systems')).toBeInTheDocument()
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
})
