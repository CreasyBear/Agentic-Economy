/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'

import { AeAgentOperatorConsole } from '@/components/ae/console/AeAgentOperatorConsole'
import type { AgentOperatorKeyReadback } from '@/modules/agent-access/agent-operator-view-model'
import { AeAssistantInstallFunnel } from '@/components/ae/console/AeAssistantInstallFunnel'
import { AeCreditTopUpPanel, type CreditTopupPort } from '@/components/ae/console/AeCreditTopUpPanel'
import type { CreditPaymentSession } from '@/modules/money/public'
import type { CreditTopupBeginInput } from '@/modules/money/server'

const stripeTestState = vi.hoisted(() => ({ confirm: vi.fn() }))

vi.mock('@stripe/stripe-js', () => ({
  loadStripe: vi.fn(() => Promise.resolve({})),
}))

vi.mock('@stripe/react-stripe-js/checkout', () => ({
  CheckoutElementsProvider: ({ children }: { children: ReactNode }) => <div data-testid="checkout-elements-provider">{children}</div>,
  PaymentElement: () => <div data-testid="payment-element" />,
  useCheckoutElements: () => ({ type: 'success', checkout: { confirm: stripeTestState.confirm } }),
}))

const keyReadback: AgentOperatorKeyReadback = {
  key: {
    keyId: 'key_ui_1',
    name: 'UI assistant',
    applicationRef: 'agentic-economy',
    environment: 'sandbox',
    authorityMode: 'inspect_only',
    scopes: ['market_operations:invoke', 'customer_requests:inspect_only'],
    revoked: false,
    expired: false,
  },
  grant: {
    credentialId: 'key_ui_1',
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
  principalId: 'clerk_api_key:key_ui_1',
  account: {
    principalId: 'clerk_api_key:key_ui_1',
    accountId: 'owner:key_ui_1',
    balance: { currency: 'USD', units: '1250', exponent: 2 },
    autoRecharge: {
      enabled: false,
      threshold: { currency: 'USD', units: '0', exponent: 2 },
      rechargeAmount: { currency: 'USD', units: '0', exponent: 2 },
    },
    evidence: 'labelled_local_dev',
  },
  activity: [],
  usage: {
    credentialId: 'key_ui_1',
    callCount: 2,
    paidCallCount: 1,
    freeCallCount: 1,
    grossSpend: { currency: 'USD', units: '5005', exponent: 3 },
    states: ['paid', 'free_tier'],
  },
  dataState: 'source',
}


afterEach(() => {
  cleanup()
  window.sessionStorage.clear()
  stripeTestState.confirm.mockReset()
})

describe('assistant access components', () => {
  it('shows the one-command activation and call path', async () => {
    const writeText = vi.fn(async () => undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    render(<AeAssistantInstallFunnel canonicalBaseUrl="https://ae.example/" />)

    expect(screen.getByRole('heading', { name: 'Connect once. Call any listed capability.' })).toBeTruthy()
    expect(screen.getByText(/npx @agentic-economy\/cli connect --base-url "https:\/\/ae\.example" --mcp/u)).toBeTruthy()
    expect(screen.getByText(/ae search "weather forecast"/u)).toBeTruthy()
    expect(screen.getByText(/ae inspect "\$AE_OPERATION_REF"/u)).toBeTruthy()
    expect(screen.getByText(/ae call "\$AE_OPERATION_REF" --input "\$AE_INPUT_JSON"/u)).toBeTruthy()
    expect(screen.getByText(/AE creates and retains the retry identity/iu)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Create agent access key' })).toBeNull()
    expect(screen.queryByText(/AE_API_KEY=/u)).toBeNull()

    const copyButton = screen.getByRole('button', { name: 'Copy Call command' })
    fireEvent.click(copyButton)

    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('--input "$AE_INPUT_JSON"'))
    const status = await screen.findByText('Call command copied.')
    expect(status.getAttribute('role')).toBe('status')
  })

  it('copies setup without exposing or asking users to manage the key', async () => {
    const writeText = vi.fn(async () => undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    render(<AeAssistantInstallFunnel canonicalBaseUrl="https://AE.Example:443/" />)

    fireEvent.click(screen.getByRole('button', { name: 'Copy Connect command' }))
    expect(writeText).toHaveBeenCalledWith('npx @agentic-economy/cli connect --base-url "https://AE.Example:443" --mcp')
    expect(screen.queryByText(/ae_secret/u)).toBeNull()
    expect(screen.queryByRole('link', { name: /agent-access\.json/u })).toBeNull()
  })

  it('starts a bound Checkout Session and keeps the transient secret out of persistence and copy', async () => {
    stripeTestState.confirm.mockResolvedValue({ type: 'success', session: {} })
    const session: CreditPaymentSession = {
      evidence: {
        provider: 'stripe',
        externalRef: 'cs_test_bound',
        amount: { currency: 'USD', units: '1050', exponent: 2 },
        status: 'pending',
        requestDigest: 'digest:request',
        metadataDigest: 'digest:metadata',
        checkoutSessionDigest: 'digest:checkout-session',
        evidenceDigest: 'digest:evidence',
        evidenceRef: 'stripe:checkout:cs_test_bound',
        observedAt: 1,
      },
      clientSecret: 'cs_secret_transient_only',
    }
    const begin = vi.fn(async (_input: CreditTopupBeginInput) => ({ kind: 'ok' as const, commandRef: 'topup:one', session }))
    const read = vi.fn(async () => ({
      ...session,
      evidence: { ...session.evidence, status: 'pending' as const },
    }))
    const port: CreditTopupPort = { begin, read }
    const onRefresh = vi.fn()
    render(
      <AeCreditTopUpPanel
        target={{ principalId: 'clerk_api_key:key_ui_1', currency: 'USD', exponent: 2 }}
        port={port}
        publishableKey="pk_test_ui"
        onRefresh={onRefresh}
      />
    )

    fireEvent.change(screen.getByLabelText(/credit amount/i), { target: { value: '10.00' } })
    fireEvent.click(screen.getByRole('button', { name: /add credit/i }))

    expect(await screen.findByTestId('payment-element')).toBeTruthy()
    expect(begin).toHaveBeenCalledWith({
      principalId: 'clerk_api_key:key_ui_1',
      amount: { currency: 'USD', units: '1000', exponent: 2 },
      idempotencyKey: expect.any(String),
    })
    expect(begin.mock.calls[0]?.[0]).not.toHaveProperty('accountRef')
    expect(screen.queryByText('cs_secret_transient_only')).toBeNull()
    expect(window.sessionStorage.getItem('ae.credit-topup.recovery.v1:clerk_api_key%3Akey_ui_1')).not.toContain('cs_secret_transient_only')

    fireEvent.click(screen.getByRole('button', { name: 'Pay securely' }))
    await waitFor(() => expect(read).toHaveBeenCalledWith(expect.objectContaining({ externalRef: 'cs_test_bound' })))
    expect(screen.queryByText('Payment verified')).toBeNull()
    expect(screen.getByText(/still being verified|canonical server readback/i)).toBeTruthy()
    expect(onRefresh).toHaveBeenCalled()
  })
  it('persists and reuses an outcome-unknown command locator without offering a retry', async () => {
    const begin = vi.fn(async (_input: { idempotencyKey: string }) => ({
      kind: 'outcome_unknown' as const,
      code: 'credit_topup_outcome_unknown' as const,
      retryable: false as const,
      commandRef: 'sha256:topup-command-unknown',
      status: 'outcome_unknown' as const,
    }))
    const read = vi.fn(async () => ({ kind: 'refused' as const, code: 'credit_topup_outcome_unknown' as const, retryable: true }))
    const target = { principalId: 'clerk_api_key:key_ui_1', currency: 'USD', exponent: 2 }
    const port: CreditTopupPort = { begin, read }
    render(<AeCreditTopUpPanel target={target} port={port} publishableKey="pk_test_ui" />)

    fireEvent.change(screen.getByLabelText(/credit amount/i), { target: { value: '10.00' } })
    fireEvent.click(screen.getByRole('button', { name: /add credit/i }))

    expect(await screen.findByText(/do not retry with a new payment/i)).toBeTruthy()
    const raw = window.sessionStorage.getItem('ae.credit-topup.recovery.v1:clerk_api_key%3Akey_ui_1')
    const locator = raw === null ? undefined : JSON.parse(raw) as { commandRef: string; idempotencyKey: string }
    expect(locator).toMatchObject({ commandRef: 'sha256:topup-command-unknown' })
    expect(locator?.idempotencyKey).toBe(begin.mock.calls[0]?.[0]?.idempotencyKey)
    expect(screen.queryByRole('button', { name: /add credit/i })).toBeNull()

    cleanup()
    render(<AeCreditTopUpPanel target={target} port={port} publishableKey="pk_test_ui" />)
    await waitFor(() => expect(read).toHaveBeenCalledWith(locator))
  })

  it('keeps unavailable top-up from starting payment or changing credit', async () => {
    const begin = vi.fn(async () => ({ kind: 'refused' as const, code: 'stripe_setup_required' as const, retryable: false }))
    const read = vi.fn(async () => ({ kind: 'refused' as const, code: 'stripe_setup_required' as const, retryable: false }))
    render(
      <AeCreditTopUpPanel
        target={{ principalId: 'clerk_api_key:key_ui_1', currency: 'USD', exponent: 2 }}
        port={{ begin, read }}
        publishableKey="pk_test_ui"
      />
    )
    fireEvent.change(screen.getByLabelText(/credit amount/i), { target: { value: '10.00' } })
    fireEvent.click(screen.getByRole('button', { name: /add credit/i }))

    expect(begin).toHaveBeenCalledOnce()
    expect(await screen.findByText(/adding credit is unavailable/i)).toBeTruthy()
    expect(screen.getByText(/no payment started.*balance did not change/i)).toBeTruthy()
    expect(screen.queryByText(/payment succeeded|credit added/i)).toBeNull()
  })

  it('renders per-assistant balance, spend, and permission without internal identifiers', () => {
    render(
      <AeAgentOperatorConsole
        items={[keyReadback]}
        loading={false}
        onRevoke={() => undefined}
        approvals={[]}
        approvalsLoading={false}
        onRetryApprovals={() => undefined}
        onDecideApproval={() => undefined}
      />,
    )
    expect(screen.getAllByText(/USD 12\.5/u).length).toBeGreaterThan(0)
    expect(screen.getByRole('heading', { name: 'Credit' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Open Credit' })).toBeTruthy()
    expect(screen.getByRole('list')).toBeTruthy()
    expect(screen.getByText('Lost, expired, or revoked agent key')).toBeTruthy()
    expect(screen.getByText('Provider reauthorization required')).toBeTruthy()
    expect(screen.getByText('Outcome uncertain')).toBeTruthy()
    expect(screen.getByText(/USD 5\.005/u)).toBeTruthy()
    expect(screen.getByText('Browse only')).toBeTruthy()
    fireEvent.click(screen.getByText('UI assistant'))
    expect(screen.getByText('Development')).toBeTruthy()
    expect(screen.getByText('30/min · 300/hour')).toBeTruthy()
    expect(screen.getByText('USD 25.00')).toBeTruthy()
    expect(screen.queryByText(/scope:|data:|principal|clerk_api_key/u)).toBeNull()
  })

  it('shows only safe approval facts and guards concurrent decisions', () => {
    const onDecideApproval = vi.fn()
    render(
      <AeAgentOperatorConsole
        items={[]}
        loading={false}
        onRevoke={() => undefined}
        approvals={[{
          invocationRef: 'invocation:approval:one',
          operationRef: 'market.email.send:v1',
          authorityRequest: {
            kind: 'approve_each',
            operationRef: 'market.email.send:v1',
            consequence: 'communication',
            retryClass: 'reconcile_before_retry',
            maximumSpend: { currency: 'USD', units: '125', exponent: 2 },
            dataFields: ['recipient.email', 'message.subject'],
          },
          createdAt: 1,
        }]}
        approvalsLoading={false}
        approvalDecision={{ invocationRef: 'invocation:approval:one', decision: 'approve' }}
        approvalStatus="market.email.send:v1 approved once."
        onRetryApprovals={() => undefined}
        onDecideApproval={onDecideApproval}
        accessUnavailable
      />,
    )

    expect(screen.getByRole('heading', { name: 'Waiting for approval' })).toBeTruthy()
    expect(screen.getByText('market.email.send:v1')).toBeTruthy()
    expect(screen.getByText('Sends a communication')).toBeTruthy()
    expect(screen.getByText('USD 1.25')).toBeTruthy()
    expect(screen.getByText('recipient.email, message.subject')).toBeTruthy()
    expect(screen.getByRole('status').textContent).toBe('market.email.send:v1 approved once.')
    const approveButton = screen.getByRole('button', { name: 'Approving once…' })
    const declineButton = screen.getByRole('button', { name: 'Decline' })
    expect(approveButton.hasAttribute('disabled')).toBe(true)
    expect(declineButton.hasAttribute('disabled')).toBe(true)
    fireEvent.click(declineButton)
    expect(onDecideApproval).not.toHaveBeenCalled()
    expect(screen.queryByText(/invocation:approval:one|credential|transport|input/iu)).toBeNull()
  })
})
