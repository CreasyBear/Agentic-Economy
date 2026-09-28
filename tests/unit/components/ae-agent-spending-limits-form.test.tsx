/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'

vi.mock('@/lib/ui/toast', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }))

import { AeAgentSpendingLimitsForm } from '@/components/ae/console/spending-limits-form/AeAgentSpendingLimitsForm'
import { AeAgentDirectoryTable } from '@/components/ae/console/AeAgentDirectoryTable'
import { ConsentConnectionFieldset } from '@/components/ae/agent-access/authorize-form/components/ConsentConnectionFieldset'
import type { AgentDetail } from '@/modules/agent-access/agent-operator-view-model'
import type { AgentSpendingPolicyState } from '@/modules/agent-access/spending-policy-update'

const known: Extract<AgentSpendingPolicyState, { kind: 'known' }> = {
  kind: 'known', principalRef: 'prin_agent_A', grantRef: 'grant_current', generation: 7,
  spendingPolicyDigest: 'digest_current', paused: false, expiresAt: Date.now() + 86_400_000,
  maximumSpendPerCall: { currency: 'AUD', units: '7123456', exponent: 6 },
  maximumDailySpend: { currency: 'AUD', units: '28000000', exponent: 6 },
  maximumMonthlySpend: { currency: 'AUD', units: '115000000', exponent: 6 },
}
const baseDetail: AgentDetail = {
  agent: {
    principalRef: known.principalRef, principalRevision: 1, displayName: 'Same Agent',
    applicationRef: 'app_A', environment: 'production', status: 'connected',
    currentCredentialGeneration: 99, connectionCount: 0, connectorDisplayNames: [],
    authorityMode: 'spending_policy', monthlySettledSpend: { currency: 'AUD', units: '12500000', exponent: 6 },
    monthlyLimit: { currency: 'AUD', units: '100000000', exponent: 6 }, monthlySpendCoverage: 'complete',
    spendingPolicy: known,
  },
  spendingPolicy: known, connections: [], credentials: [], authorityMode: 'spending_policy', scopes: [],
  grant: {
    principalId: known.principalRef, credentialId: 'stale_credential', applicationRef: 'app_A',
    environment: 'production', authorityMode: 'spending_policy', toolAccess: 'all_admitted', toolRefs: [],
    lifecycle: 'active', expiresAt: known.expiresAt,
    budget: { maximumSpendPerCall: { currency: 'AUD', units: '1000000', exponent: 6 },
      maximumDailySpend: known.maximumDailySpend, maximumMonthlySpend: known.maximumMonthlySpend,
      maximumConcurrentCalls: 1 }, rate: { maximumCallsPerMinute: 60, maximumCallsPerHour: 1000 },
  },
  activity: [], dataState: 'source',
}

function detailWithPolicy(policy: AgentSpendingPolicyState): AgentDetail {
  return { ...baseDetail, agent: { ...baseDetail.agent, spendingPolicy: policy }, spendingPolicy: policy }
}

afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('owner spending authority', () => {
  it('renders exact source grant limits rather than stale grant and opens edit from refreshed values', async () => {
    const read = vi.fn().mockResolvedValue(known)
    render(<AeAgentSpendingLimitsForm detail={baseDetail} onReadSpendingLimits={read} onUpdateSpendingLimits={vi.fn()} />)
    await waitFor(() => expect(screen.getByRole('button', { name: /edit limits/i })).toBeInTheDocument())
    expect(screen.getByText('AUD 7.123456')).toBeInTheDocument()
    expect(screen.queryByText('AUD 1.000000')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /edit limits/i }))
    await waitFor(() => expect(screen.getByLabelText(/max spend per call/i)).toHaveValue('7.123456'))
    expect(read).toHaveBeenCalledWith(known.principalRef)
  })

  it('never exposes edits or money claims when owner read is unavailable; Refresh recovers', async () => {
    const read = vi.fn().mockResolvedValueOnce({ kind: 'unavailable' }).mockResolvedValueOnce(known)
    const update = vi.fn()
    render(<AeAgentSpendingLimitsForm detail={baseDetail} onReadSpendingLimits={read} onUpdateSpendingLimits={update} />)
    await waitFor(() => expect(screen.getByText(/Spending policy unavailable/)).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: /edit limits/i })).not.toBeInTheDocument()
    expect(screen.queryByText('AUD 7.123456')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    await waitFor(() => expect(screen.getByRole('button', { name: /edit limits/i })).toBeInTheDocument())
    expect(update).not.toHaveBeenCalled()
  })

  it('treats source-confirmed expiry as renewal, not editable or Active', async () => {
    const expired = { kind: 'expired' as const, expiresAt: Date.now() - 1_000 }
    render(<AeAgentSpendingLimitsForm detail={detailWithPolicy(expired)} onReadSpendingLimits={vi.fn().mockResolvedValue(expired)} onUpdateSpendingLimits={vi.fn()} />)
    await waitFor(() => expect(screen.getByRole('link', { name: 'Renew connection' })).toHaveAttribute('href', '/agent-access'))
    expect(screen.queryByRole('button', { name: /edit limits/i })).not.toBeInTheDocument()
    expect(screen.queryByText('Active')).not.toBeInTheDocument()
  })

  it('recognizes a known zero triple as Paused, never as unset', async () => {
    const zero = { currency: 'AUD' as const, units: '0', exponent: 6 as const }
    const paused = { ...known, paused: true, maximumSpendPerCall: zero, maximumDailySpend: zero, maximumMonthlySpend: zero }
    render(<AeAgentSpendingLimitsForm detail={detailWithPolicy(paused)} onReadSpendingLimits={vi.fn().mockResolvedValue(paused)} onUpdateSpendingLimits={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('Paused')).toBeInTheDocument())
    expect(screen.queryByText(/No spending policy set/)).not.toBeInTheDocument()
  })

  it('refuses mutation after a previously known policy becomes unavailable before save', async () => {
    const read = vi.fn().mockResolvedValueOnce(known).mockResolvedValueOnce(known).mockResolvedValueOnce({ kind: 'unavailable' })
    const update = vi.fn()
    render(<AeAgentSpendingLimitsForm detail={baseDetail} onReadSpendingLimits={read} onUpdateSpendingLimits={update} />)
    await waitFor(() => expect(screen.getByRole('button', { name: /edit limits/i })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /edit limits/i }))
    await waitFor(() => expect(screen.getByRole('button', { name: /save limits/i })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /save limits/i }))
    await waitFor(() => expect(screen.getByText(/Spending policy unavailable/)).toBeInTheDocument())
    expect(update).not.toHaveBeenCalled()
  })

  it('rejects a stale edited policy instead of silently rebasing onto a new generation', async () => {
    const rotated = { ...known, generation: 8, spendingPolicyDigest: 'digest_rotated' }
    const read = vi.fn().mockResolvedValueOnce(known).mockResolvedValueOnce(known).mockResolvedValueOnce(rotated)
    const update = vi.fn()
    render(<AeAgentSpendingLimitsForm detail={baseDetail} onReadSpendingLimits={read} onUpdateSpendingLimits={update} />)
    await waitFor(() => expect(screen.getByRole('button', { name: /edit limits/i })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /edit limits/i }))
    await waitFor(() => expect(screen.getByRole('button', { name: /save limits/i })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /save limits/i }))
    await waitFor(() => expect(screen.getByText(/policy changed since you opened it/i)).toBeInTheDocument())
    expect(update).not.toHaveBeenCalled()
  })

  it('writes current grant generation, not credential projection generation', async () => {
    const read = vi.fn().mockResolvedValue(known)
    const update = vi.fn().mockResolvedValue({ kind: 'completed', principalRef: known.principalRef, grantRef: known.grantRef, generation: 8, spendingPolicyDigest: 'new_digest', correlationRef: 'corr' })
    render(<AeAgentSpendingLimitsForm detail={baseDetail} onReadSpendingLimits={read} onUpdateSpendingLimits={update} />)
    await waitFor(() => expect(screen.getByRole('button', { name: /edit limits/i })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /edit limits/i }))
    await waitFor(() => expect(screen.getByRole('button', { name: /save limits/i })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /save limits/i }))
    await waitFor(() => expect(update).toHaveBeenCalledWith(expect.objectContaining({ principalRef: known.principalRef, expectedGeneration: 7, maximumSpendPerCall: known.maximumSpendPerCall })))
  })
})

describe('stable Agent identity', () => {
  it('distinguishes same-named directory rows and targets the selected principal', async () => {
    const second = { ...baseDetail.agent, principalRef: 'prin_agent_B', environment: 'sandbox' as const, spendingPolicy: { kind: 'unavailable' as const } }
    const open = vi.fn()
    render(<AeAgentDirectoryTable directoryItems={[baseDetail.agent, second]} loading={false} onOpenAgent={open} />)
    const row = screen.getByText(second.principalRef).closest('tr')!
    expect(within(row).getByText('Sandbox')).toBeInTheDocument()
    fireEvent.click(within(row).getByRole('button', { name: /View Same Agent.*prin_agent_B/ }))
    expect(open).toHaveBeenCalledWith(second)
    expect(open).not.toHaveBeenCalledWith(baseDetail.agent)
  })

  it('selects the intended same-named OAuth replacement by full principal ref', async () => {
    const selectReplacement = vi.fn()
    render(<ConsentConnectionFieldset pending={false} connectionTarget="replace_credential" replacementMode="planned"
      replacementPrincipalRef="prin_agent_B" agentTargets={[{ principalRef: 'prin_agent_A', principalRevision: 1, displayName: 'Same Agent' }, { principalRef: 'prin_agent_B', principalRevision: 1, displayName: 'Same Agent' }]}
      agentTargetsLoading={false} showConnectionFieldset onSelectConnection={vi.fn()} onSelectReplacement={selectReplacement}
      onSelectReplacementMode={vi.fn()} onLoadAgentTargets={vi.fn()} />)
    expect(screen.getByText('Selected Agent: prin_agent_B')).toBeInTheDocument()
    expect(screen.getByText('Same Agent · prin_agent_B')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('combobox', { name: 'Agent' }))
    fireEvent.click(await screen.findByRole('option', { name: /Same Agent · prin_agent_A/ }))
    expect(selectReplacement).toHaveBeenCalledWith('prin_agent_A')
  })
})
