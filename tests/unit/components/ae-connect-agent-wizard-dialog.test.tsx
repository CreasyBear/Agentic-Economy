/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'

import { AeConnectAgentWizardDialog } from '@/components/ae/console/connect-agent-wizard/AeConnectAgentWizardDialog'

afterEach(cleanup)

describe('AeConnectAgentWizardDialog (W-26)', () => {
  it('T1: renders dialog chrome with deployment environment and authority options', () => {
    render(
      <AeConnectAgentWizardDialog
        deploymentEnvironment="sandbox"
        open={true}
        onOpenChange={vi.fn()}
        onIssue={vi.fn()}
      />,
    )

    expect(screen.getByRole('dialog', { name: /connect an agent/i })).toBeInTheDocument()
    expect(screen.getByText(/step 1 of 2 · set policy/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/agent name/i)).toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: /sandbox/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: /production/i })).not.toBeInTheDocument()
    expect(screen.getByRole('radiogroup', { name: 'Authority mode' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /browse only/i })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /ask each time/i })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /work within limits/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /connect an agent/i })).toBeInTheDocument()
  })

  it('restores an unissued draft without storing a secret', () => {
    const onDraftChange = vi.fn()
    render(
      <AeConnectAgentWizardDialog
        deploymentEnvironment="sandbox"
        open={true}
        onOpenChange={vi.fn()}
        onIssue={vi.fn()}
        initialDraft={{
          name: 'Research bot',
          environment: 'production',
          authorityMode: 'approval_required',
          perCallAmount: '1.50',
          dailyAmount: '25.00',
          monthlyAmount: '100.00',
        }}
        onDraftChange={onDraftChange}
      />,
    )
    expect(screen.getByLabelText(/agent name/i)).toHaveValue('Research bot')
    fireEvent.change(screen.getByLabelText(/agent name/i), { target: { value: 'Research bot 2' } })
    expect(onDraftChange).toHaveBeenCalledWith(expect.objectContaining({ name: 'Research bot 2' }))
    expect(onDraftChange).toHaveBeenCalledWith(expect.objectContaining({ environment: 'sandbox' }))
    expect(JSON.stringify(onDraftChange.mock.calls)).not.toContain('sek_')
  })

  it('T2: marks an empty agent name on submit and enforces max length of 80 characters', () => {
    const onIssue = vi.fn()
    render(
      <AeConnectAgentWizardDialog
        deploymentEnvironment="sandbox"
        open={true}
        onOpenChange={vi.fn()}
        onIssue={onIssue}
      />,
    )

    const submitBtn = screen.getByRole('button', { name: /connect an agent/i })
    expect(submitBtn).toBeEnabled()
    fireEvent.click(submitBtn)
    expect(screen.getByLabelText(/agent name/i)).toHaveAttribute('aria-invalid', 'true')
    expect(onIssue).not.toHaveBeenCalled()

    const nameInput = screen.getByLabelText(/agent name/i)
    fireEvent.change(nameInput, { target: { value: '   ' } })
    expect(submitBtn).toBeEnabled()

    fireEvent.change(nameInput, { target: { value: 'Valid Agent Name' } })
    expect(submitBtn).toBeEnabled()

    expect(nameInput).toHaveAttribute('maxLength', '80')
    expect(screen.getByText('16/80')).toBeInTheDocument()
  })

  it('T3: sandbox default shows informational spend limits and omits budget args on submit', async () => {
    const onIssue = vi.fn().mockResolvedValue({
      kind: 'created',
      keyId: 'key_sb_1',
      secret: 'sek_test_123',
    })
    const onSuccess = vi.fn()

    render(
      <AeConnectAgentWizardDialog
        deploymentEnvironment="sandbox"
        open={true}
        onOpenChange={vi.fn()}
        onIssue={onIssue}
        onSuccess={onSuccess}
      />,
    )

    expect(screen.getByText(/A\$1\.00 \/ call/i)).toBeInTheDocument()
    expect(screen.getByText(/A\$5\.00 \/ day/i)).toBeInTheDocument()
    expect(screen.getByText(/A\$20\.00 \/ month/i)).toBeInTheDocument()
    expect(screen.getByText(/per-call ≤ daily ≤ monthly/i)).toBeInTheDocument()

    const nameInput = screen.getByLabelText(/agent name/i)
    fireEvent.change(nameInput, { target: { value: 'Test Assistant' } })

    const submitBtn = screen.getByRole('button', { name: /connect an agent/i })
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(onIssue).toHaveBeenCalledTimes(1)
    })

    const payload = onIssue.mock.calls[0]![0].data
    expect(payload).toMatchObject({
      name: 'Test Assistant',
      environment: 'sandbox',
      authorityMode: 'spending_policy',
    })
    expect(payload.idempotencyKey).toMatch(/^agent-issue-[A-Za-z0-9_-]+$/)
    expect(payload).not.toHaveProperty('maximumSpendPerCall')
    expect(payload).not.toHaveProperty('maximumDailySpend')
    expect(payload).not.toHaveProperty('maximumMonthlySpend')
  })

  it('T4: production environment requires and submits all three ExactAmounts at exponent 6', async () => {
    const onIssue = vi.fn().mockResolvedValue({
      kind: 'created',
      keyId: 'key_prod_1',
      secret: 'sek_live_456',
    })

    render(
      <AeConnectAgentWizardDialog
        deploymentEnvironment="production"
        open={true}
        onOpenChange={vi.fn()}
        onIssue={onIssue}
      />,
    )

    const nameInput = screen.getByLabelText(/agent name/i)
    fireEvent.change(nameInput, { target: { value: 'Prod Worker' } })


    const perCallInput = screen.getByLabelText(/max spend per call/i)
    const dailyInput = screen.getByLabelText(/daily spend limit/i)
    const monthlyInput = screen.getByLabelText(/monthly spend limit/i)

    fireEvent.change(perCallInput, { target: { value: '5.00' } })
    fireEvent.change(dailyInput, { target: { value: '25.00' } })
    fireEvent.change(monthlyInput, { target: { value: '100.00' } })

    const submitBtn = screen.getByRole('button', { name: /connect an agent/i })
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(onIssue).toHaveBeenCalledTimes(1)
    })

    const payload = onIssue.mock.calls[0]![0].data
    expect(payload).toMatchObject({
      name: 'Prod Worker',
      environment: 'production',
      authorityMode: 'spending_policy',
      maximumSpendPerCall: { currency: 'AUD', exponent: 6, units: '5000000' },
      maximumDailySpend: { currency: 'AUD', exponent: 6, units: '25000000' },
      maximumMonthlySpend: { currency: 'AUD', exponent: 6, units: '100000000' },
    })
  })

  it('T5: production environment blocks submission if budget ordering is invalid', async () => {
    const onIssue = vi.fn()

    render(
      <AeConnectAgentWizardDialog
        deploymentEnvironment="production"
        open={true}
        onOpenChange={vi.fn()}
        onIssue={onIssue}
      />,
    )

    fireEvent.change(screen.getByLabelText(/agent name/i), { target: { value: 'Prod Worker' } })

    const perCallInput = screen.getByLabelText(/max spend per call/i)
    const dailyInput = screen.getByLabelText(/daily spend limit/i)
    const monthlyInput = screen.getByLabelText(/monthly spend limit/i)

    // per-call exceeds daily
    fireEvent.change(perCallInput, { target: { value: '50.00' } })
    fireEvent.change(dailyInput, { target: { value: '20.00' } })
    fireEvent.change(monthlyInput, { target: { value: '100.00' } })

    const submitBtn = screen.getByRole('button', { name: /connect an agent/i })
    fireEvent.click(submitBtn)

    expect(screen.getByText(/per-call limit cannot exceed daily limit/i)).toBeInTheDocument()
    expect(onIssue).not.toHaveBeenCalled()
  })

  it('T6: submits read_only and approval_required authority modes correctly', async () => {
    const onIssue = vi.fn().mockResolvedValue({ kind: 'created', keyId: 'k1', secret: 's1' })

    render(
      <AeConnectAgentWizardDialog
        deploymentEnvironment="sandbox"
        open={true}
        onOpenChange={vi.fn()}
        onIssue={onIssue}
      />,
    )

    fireEvent.change(screen.getByLabelText(/agent name/i), { target: { value: 'Observer' } })
    fireEvent.click(screen.getByRole('radio', { name: /browse only/i }))

    fireEvent.click(screen.getByRole('button', { name: /connect an agent/i }))

    await waitFor(() => {
      expect(onIssue).toHaveBeenCalledTimes(1)
    })

    expect(onIssue.mock.calls[0]![0].data.authorityMode).toBe('read_only')
  })

  it('T7: successful creation triggers onSuccess with reveal payload and calls onOpenChange(false)', async () => {
    const onIssue = vi.fn().mockResolvedValue({
      kind: 'created',
      keyId: 'key_test_created',
      secret: 'sek_live_supersecret',
    })
    const onSuccess = vi.fn()
    const onOpenChange = vi.fn()

    render(
      <AeConnectAgentWizardDialog
        deploymentEnvironment="sandbox"
        open={true}
        onOpenChange={onOpenChange}
        onIssue={onIssue}
        onSuccess={onSuccess}
      />,
    )

    fireEvent.change(screen.getByLabelText(/agent name/i), { target: { value: 'My Agent' } })
    fireEvent.click(screen.getByRole('button', { name: /connect an agent/i }))

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledTimes(1)
    })

    expect(onSuccess).toHaveBeenCalledWith({
      keyId: 'key_test_created',
      secret: 'sek_live_supersecret',
      displayName: 'My Agent',
      environment: 'sandbox',
    })
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('T8: server error remains open and displays inline alert without exposing secret', async () => {
    const onIssue = vi.fn().mockResolvedValue({
      kind: 'error',
      code: 'invalid_input',
      retryable: false,
    })
    const onSuccess = vi.fn()
    const onOpenChange = vi.fn()

    render(
      <AeConnectAgentWizardDialog
        deploymentEnvironment="sandbox"
        open={true}
        onOpenChange={onOpenChange}
        onIssue={onIssue}
        onSuccess={onSuccess}
      />,
    )

    fireEvent.change(screen.getByLabelText(/agent name/i), { target: { value: 'Faulty Agent' } })
    fireEvent.click(screen.getByRole('button', { name: /connect an agent/i }))

    await waitFor(() => {
      expect(screen.getByText(/could not connect agent/i)).toBeInTheDocument()
    })

    expect(screen.getByText(/A\$0\.00 deducted — your balance is safe/i)).toBeInTheDocument()
    expect(screen.queryByText(/invalid_input/i)).not.toBeInTheDocument()

    expect(onSuccess).not.toHaveBeenCalled()
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
  })

  it('T9: reuses idempotency key on retryable failure and rotates on conflict', async () => {
    const onIssue = vi.fn()
      .mockResolvedValueOnce({ kind: 'error', code: 'issuance_unavailable', retryable: true })
      .mockResolvedValueOnce({ kind: 'error', code: 'idempotency_conflict', retryable: false })
      .mockResolvedValueOnce({ kind: 'created', keyId: 'k_ok', secret: 's_ok' })

    render(
      <AeConnectAgentWizardDialog
        deploymentEnvironment="sandbox"
        open={true}
        onOpenChange={vi.fn()}
        onIssue={onIssue}
        onSuccess={vi.fn()}
      />,
    )

    fireEvent.change(screen.getByLabelText(/agent name/i), { target: { value: 'Retry Agent' } })

    const submitBtn = screen.getByRole('button', { name: /connect an agent/i })

    // First attempt -> retryable failure
    fireEvent.click(submitBtn)
    await waitFor(() => expect(onIssue).toHaveBeenCalledTimes(1))
    const firstKey = onIssue.mock.calls[0]![0].data.idempotencyKey

    // Second attempt -> should REUSE firstKey because previous was retryable
    fireEvent.click(submitBtn)
    await waitFor(() => expect(onIssue).toHaveBeenCalledTimes(2))
    const secondKey = onIssue.mock.calls[1]![0].data.idempotencyKey
    expect(secondKey).toBe(firstKey)

    // Third attempt -> should ROTATE to new key because previous was idempotency_conflict
    fireEvent.click(submitBtn)
    await waitFor(() => expect(onIssue).toHaveBeenCalledTimes(3))
    const thirdKey = onIssue.mock.calls[2]![0].data.idempotencyKey
    expect(thirdKey).not.toBe(firstKey)
  })

  it('T10: disables submit button while issuance is in flight', async () => {
    let resolvePromise!: (val: unknown) => void
    const pendingPromise = new Promise((resolve) => {
      resolvePromise = resolve
    })
    const onIssue = vi.fn().mockReturnValue(pendingPromise)

    render(
      <AeConnectAgentWizardDialog
        deploymentEnvironment="sandbox"
        open={true}
        onOpenChange={vi.fn()}
        onIssue={onIssue}
      />,
    )

    fireEvent.change(screen.getByLabelText(/agent name/i), { target: { value: 'In Flight Agent' } })

    const submitBtn = screen.getByRole('button', { name: /connect an agent/i })
    fireEvent.click(submitBtn)

    expect(screen.getByRole('button', { name: /connecting/i })).toBeDisabled()

    resolvePromise({ kind: 'created', keyId: 'k1', secret: 's1' })
    await waitFor(() => {
      expect(onIssue).toHaveBeenCalledTimes(1)
    })
  })

  it('T11: unexpected issuance failures state that the Agent was not connected or charged', async () => {
    const onIssue = vi.fn().mockResolvedValue(undefined)
    render(
      <AeConnectAgentWizardDialog
        deploymentEnvironment="sandbox"
        open={true}
        onOpenChange={vi.fn()}
        onIssue={onIssue}
      />,
    )

    fireEvent.change(screen.getByLabelText(/agent name/i), { target: { value: 'Unexpected Agent' } })
    fireEvent.click(screen.getByRole('button', { name: /connect an agent/i }))

    expect(await screen.findByText('The Agent could not be connected. Nothing was charged.')).toBeInTheDocument()
  })

  it('T12: adheres to zero-handroll directive without local secret generation or hashing', async () => {
    const fs = await import('node:fs')
    const path = await import('node:path')
    const wizardDir = path.resolve(__dirname, '../../../src/components/ae/console/connect-agent-wizard')
    const sourceCode = [
      'AeConnectAgentWizardDialog.tsx',
      'useConnectAgentWizard.ts',
    ]
      .map((file) => fs.readFileSync(path.join(wizardDir, file), 'utf8'))
      .join('\n')
    expect(sourceCode).not.toContain('randomBytes')
    expect(sourceCode).not.toContain('ae_live_')
    expect(sourceCode).not.toContain('createHash')
    expect(sourceCode).not.toContain('sha256')
  })
})
