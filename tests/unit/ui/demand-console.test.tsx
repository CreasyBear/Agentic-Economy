/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AeAgentOperatorConsole, type AgentOperatorKeyReadback } from '@/components/ae/console/AeAgentOperatorConsole'
import { AeAssistantInstallFunnel } from '@/components/ae/console/AeAssistantInstallFunnel'
import { AeCreditTopUpPanel } from '@/components/ae/console/AeCreditTopUpPanel'

const keyReadback: AgentOperatorKeyReadback = {
  key: {
    keyId: 'key_ui_1',
    name: 'UI assistant',
    authorityMode: 'inspect_only',
    scopes: ['customer_requests:create', 'customer_requests:inspect_only'],
    revoked: false,
    expired: false,
  },
  principalId: 'clerk_api_key:key_ui_1',
  account: {
    principalId: 'clerk_api_key:key_ui_1',
    currency: 'USD',
    balanceMinor: 1_250,
    autoRecharge: { enabled: false, thresholdMinor: 0, rechargeAmountMinor: 0 },
    evidence: 'labelled_local_dev',
  },
  activity: [],
  usage: {
    credentialId: 'key_ui_1',
    callCount: 2,
    paidCallCount: 1,
    freeCallCount: 1,
    grossSpendMinor: 500,
    currency: 'USD',
    states: ['paid', 'free_tier'],
  },
  dataState: 'source',
}

beforeEach(() => {
  window.matchMedia = (() => ({
    matches: false,
    media: '',
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  })) as typeof window.matchMedia
})

afterEach(() => {
  cleanup()
})

describe('assistant access components', () => {
  it('shows one-command setup controls for each supported assistant', async () => {
    const writeText = vi.fn(async () => undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    render(<AeAssistantInstallFunnel canonicalBaseUrl="https://ae.example/" />)

    expect(screen.getByRole('heading', { name: 'Connect your assistant' })).toBeTruthy()
    expect(screen.getByText(/claude mcp add --transport http agentic-economy https:\/\/ae\.example\/mcp/u)).toBeTruthy()
    expect(screen.getByText(/codex mcp add agentic-economy --url https:\/\/ae\.example\/mcp/u)).toBeTruthy()
    expect(screen.getByText(/compare (?:real )?options from your own assistant/u)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Copy Claude command' }))
    expect(writeText).toHaveBeenCalledWith('claude mcp add --transport http agentic-economy https://ae.example/mcp')
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeTruthy()
  })

  it('keeps unavailable top-up from starting payment or changing credit', async () => {
    const begin = vi.fn(async () => ({ kind: 'refused' as const, code: 'stripe_setup_required' as const }))
    render(<AeCreditTopUpPanel port={{ begin }} />)
    fireEvent.click(screen.getByRole('button', { name: /add credit/i }))

    expect(begin).toHaveBeenCalledOnce()
    expect(await screen.findByText(/adding credit is unavailable/i)).toBeTruthy()
    expect(screen.getByText(/no payment started.*balance did not change/i)).toBeTruthy()
    expect(screen.queryByText(/payment succeeded|credit added/i)).toBeNull()
  })

  it('renders per-assistant balance, spend, and permission without internal identifiers', () => {
    render(<AeAgentOperatorConsole items={[keyReadback]} loading={false} onRevoke={() => undefined} />)
    expect(screen.getByText(/12\.50/u)).toBeTruthy()
    expect(screen.getByRole('heading', { name: /balance/i })).toBeTruthy()
    expect(screen.queryByRole('list')).toBeNull()
    expect(screen.getByText(/5\.00/u)).toBeTruthy()
    expect(screen.getByText(/browse and compare businesses/iu)).toBeTruthy()
    expect(screen.queryByText(/scope:|data:|principal|clerk_api_key/u)).toBeNull()
  })
})
