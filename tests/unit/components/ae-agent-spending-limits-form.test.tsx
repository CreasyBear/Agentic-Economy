/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'

import { AeAgentSpendingLimitsForm } from '@/components/ae/console/AeAgentSpendingLimitsForm'
import type { AgentDetail } from '@/modules/agent-access/agent-operator-view-model'
import type {
  AgentSpendingLimitsReadResult,
  AgentSpendingLimitsResult,
} from '@/modules/agent-access/spending-policy-update'

describe('AeAgentSpendingLimitsForm (W-28)', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  const baseDetail: AgentDetail = {
    agent: {
      principalRef: 'prin_test_agent_123',
      principalRevision: 1,
      displayName: 'Autonomous Data Miner',
      applicationRef: 'app_test_123',
      environment: 'production',
      status: 'connected',
      currentCredentialGeneration: 1,
      connectionCount: 1,
      connectorDisplayNames: ['Cursor Client'],
      authorityMode: 'spending_policy',
      monthlySettledSpend: { currency: 'AUD', units: '12500000', exponent: 6 }, // A$ 12.50
      monthlyLimit: { currency: 'AUD', units: '100000000', exponent: 6 }, // A$ 100.00
      monthlySpendCoverage: 'complete',
    },
    connections: [],
    credentials: [
      {
        credentialRef: 'cred_test_1',
        generation: 1,
        lifecycle: 'active',
        issuedAt: 1700000000000,
        expiresAt: 1705000000000,
      },
    ],
    authorityMode: 'spending_policy',
    scopes: ['market:tools:call'],
    grant: {
      principalId: 'prin_test_agent_123',
      credentialId: 'cred_test_1',
      applicationRef: 'app_test_123',
      environment: 'production',
      authorityMode: 'spending_policy',
      toolAccess: 'all_admitted',
      toolRefs: [],
      lifecycle: 'active',
      expiresAt: 1705000000000,
      budget: {
        maximumSpendPerCall: { currency: 'AUD', units: '5000000', exponent: 6 }, // $5.00
        maximumDailySpend: { currency: 'AUD', units: '25000000', exponent: 6 }, // $25.00
        maximumMonthlySpend: { currency: 'AUD', units: '100000000', exponent: 6 }, // $100.00
        maximumConcurrentCalls: 4,
      },
      rate: {
        maximumCallsPerMinute: 60,
        maximumCallsPerHour: 1000,
      },
    },
    activity: [],
    dataState: 'source',
  }

  const currentSpendingLimitsRead = (
    detail: AgentDetail = baseDetail,
  ): AgentSpendingLimitsReadResult => ({
    kind: 'current',
    principalRef: detail.agent.principalRef,
    grantRef: 'grant_123',
    generation: detail.agent.currentCredentialGeneration ?? 1,
    spendingPolicyDigest: 'digest_123',
    maximumSpendPerCall: detail.grant!.budget.maximumSpendPerCall,
    maximumDailySpend: detail.grant!.budget.maximumDailySpend,
    maximumMonthlySpend: detail.grant!.budget.maximumMonthlySpend,
  })

  it('T1: renders current spending limits in read view with Edit Limits button', () => {
    render(
      <AeAgentSpendingLimitsForm
        detail={baseDetail}
        onUpdateSpendingLimits={vi.fn()}
      />,
    )

    expect(screen.getByText(/per call max/i)).toBeInTheDocument()
    expect(screen.getByText(/daily budget/i)).toBeInTheDocument()
    expect(screen.getByText(/monthly budget/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /edit limits/i })).toBeInTheDocument()
  })

  it('T2: clicking Edit Limits switches to editable form pre-filled with current values', () => {
    render(
      <AeAgentSpendingLimitsForm
        detail={baseDetail}
        onUpdateSpendingLimits={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /edit limits/i }))

    const perCallInput = screen.getByLabelText(/max spend per call/i) as HTMLInputElement
    const dailyInput = screen.getByLabelText(/daily spend limit/i) as HTMLInputElement
    const monthlyInput = screen.getByLabelText(/monthly spend limit/i) as HTMLInputElement

    expect(perCallInput.value).toBe('5')
    expect(dailyInput.value).toBe('25')
    expect(monthlyInput.value).toBe('100')
    expect(screen.getByRole('button', { name: /save limits/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument()
  })

  it('T3: validates that per-call <= daily <= monthly and shows validation error', async () => {
    render(
      <AeAgentSpendingLimitsForm
        detail={baseDetail}
        onUpdateSpendingLimits={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /edit limits/i }))

    const perCallInput = screen.getByLabelText(/max spend per call/i)
    const dailyInput = screen.getByLabelText(/daily spend limit/i)

    // Make per-call greater than daily
    fireEvent.change(perCallInput, { target: { value: '50' } })
    fireEvent.change(dailyInput, { target: { value: '25' } })

    fireEvent.click(screen.getByRole('button', { name: /save limits/i }))

    await waitFor(() => {
      expect(screen.getByText(/daily limit cannot be less than per-call limit/i)).toBeInTheDocument()
    })
  })

  it('T4: submitting valid values calls onUpdateSpendingLimits with parsed ExactAmounts', async () => {
    const onUpdateMock = vi.fn().mockResolvedValue({
      kind: 'completed',
      principalRef: baseDetail.agent.principalRef,
      grantRef: 'grant_123',
      generation: 2,
      spendingPolicyDigest: 'digest_123',
      correlationRef: 'corr_123',
    } satisfies AgentSpendingLimitsResult)

    const onReadMock = vi.fn().mockResolvedValue(currentSpendingLimitsRead())

    render(
      <AeAgentSpendingLimitsForm
        detail={baseDetail}
        onUpdateSpendingLimits={onUpdateMock}
        onReadSpendingLimits={onReadMock}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /edit limits/i }))

    const perCallInput = screen.getByLabelText(/max spend per call/i)
    const dailyInput = screen.getByLabelText(/daily spend limit/i)
    const monthlyInput = screen.getByLabelText(/monthly spend limit/i)

    fireEvent.change(perCallInput, { target: { value: '10' } })
    fireEvent.change(dailyInput, { target: { value: '50' } })
    fireEvent.change(monthlyInput, { target: { value: '200' } })

    fireEvent.click(screen.getByRole('button', { name: /save limits/i }))

    await waitFor(() => {
      expect(onUpdateMock).toHaveBeenCalledWith({
        principalRef: baseDetail.agent.principalRef,
        expectedGeneration: 1,
        maximumSpendPerCall: { currency: 'AUD', units: '10000000', exponent: 6 },
        maximumDailySpend: { currency: 'AUD', units: '50000000', exponent: 6 },
        maximumMonthlySpend: { currency: 'AUD', units: '200000000', exponent: 6 },
      })
    })
  })

  it('T5: Pause button updates limits to zero and shows paused status', async () => {
    const onUpdateMock = vi.fn().mockResolvedValue({
      kind: 'completed',
      principalRef: baseDetail.agent.principalRef,
      grantRef: 'grant_123',
      generation: 2,
      spendingPolicyDigest: 'digest_123',
      correlationRef: 'corr_123',
    } satisfies AgentSpendingLimitsResult)

    const onReadMock = vi.fn().mockResolvedValue(currentSpendingLimitsRead())

    render(
      <AeAgentSpendingLimitsForm
        detail={baseDetail}
        onUpdateSpendingLimits={onUpdateMock}
        onReadSpendingLimits={onReadMock}
      />,
    )

    const pauseButton = screen.getByRole('button', { name: /pause agent/i })
    expect(pauseButton).toBeInTheDocument()
    fireEvent.click(pauseButton)

    await waitFor(() => {
      expect(onUpdateMock).toHaveBeenCalledWith({
        principalRef: baseDetail.agent.principalRef,
        expectedGeneration: 1,
        maximumSpendPerCall: { currency: 'AUD', units: '0', exponent: 6 },
        maximumDailySpend: { currency: 'AUD', units: '0', exponent: 6 },
        maximumMonthlySpend: { currency: 'AUD', units: '0', exponent: 6 },
      })
    })
  })

  it('T6: when agent limits are zero, shows Paused badge and Resume button', async () => {
    const pausedDetail: AgentDetail = {
      ...baseDetail,
      grant: {
        ...baseDetail.grant!,
        budget: {
          ...baseDetail.grant!.budget,
          maximumSpendPerCall: { currency: 'AUD', units: '0', exponent: 6 },
          maximumDailySpend: { currency: 'AUD', units: '0', exponent: 6 },
          maximumMonthlySpend: { currency: 'AUD', units: '0', exponent: 6 },
        },
      },
    }

    const onUpdateMock = vi.fn().mockResolvedValue({
      kind: 'completed',
      principalRef: pausedDetail.agent.principalRef,
      grantRef: 'grant_123',
      generation: 2,
      spendingPolicyDigest: 'digest_123',
      correlationRef: 'corr_123',
    } satisfies AgentSpendingLimitsResult)

    const onReadMock = vi.fn().mockResolvedValue(currentSpendingLimitsRead(pausedDetail))

    render(
      <AeAgentSpendingLimitsForm
        detail={pausedDetail}
        onUpdateSpendingLimits={onUpdateMock}
        onReadSpendingLimits={onReadMock}
      />,
    )

    expect(screen.getByText('Paused')).toBeInTheDocument()
    const resumeButton = screen.getByRole('button', { name: /resume agent/i })
    expect(resumeButton).toBeInTheDocument()

    fireEvent.click(resumeButton)

    await waitFor(() => {
      expect(onUpdateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          principalRef: pausedDetail.agent.principalRef,
          expectedGeneration: 1,
          maximumSpendPerCall: expect.objectContaining({ units: expect.stringMatching(/^[1-9]\d*$/) }),
        }),
      )
    })
  })

  it('T7: blocks save when spending limits read is refused as source_unavailable', async () => {
    const onUpdateMock = vi.fn()
    const onReadMock = vi.fn().mockResolvedValue({
      kind: 'refused',
      code: 'source_unavailable',
    } satisfies AgentSpendingLimitsReadResult)

    render(
      <AeAgentSpendingLimitsForm
        detail={baseDetail}
        onUpdateSpendingLimits={onUpdateMock}
        onReadSpendingLimits={onReadMock}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /edit limits/i }))
    fireEvent.click(screen.getByRole('button', { name: /save limits/i }))

    await waitFor(() => {
      expect(onReadMock).toHaveBeenCalledWith(baseDetail.agent.principalRef)
      expect(onUpdateMock).not.toHaveBeenCalled()
      expect(
        screen.getByText(/spending limits are temporarily unavailable/i),
      ).toBeInTheDocument()
    })
  })
})
