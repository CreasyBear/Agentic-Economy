/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  AePaidOperationDevelopmentSurface,
  createStructuredPaidOperationDevelopmentHost,
} from '../../../tools/dev/paid-operation-surface-host'
import {
  createPaidOperationSemantics,
  projectRichPaidOperation,
  projectStructuredPaidOperation,
  type PaidOperationApplicationService,
  type PaidOperationProjection,
  type ReconciliationEvidence,
  type X402PaymentReconciliationEvidence,
} from '@/modules/action-invocation'

afterEach(cleanup)

describe('paid operation development surfaces', () => {
  it('renders the shared human semantics and dispatches its typed continuation', async () => {
    const { service, command } = serviceFixture()
    render(<AePaidOperationDevelopmentSurface
      service={service}
      initialRef={{ invocationRef: 'invocation:development', expectedInvocationVersion: 4 }}
    />)

    expect(screen.getByRole('heading', { name: 'Local development paid operation' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Translate the supplied document' })).toBeTruthy()
    expect(screen.getByText(/No provider fulfilment, deployment, or customer-value claim/)).toBeTruthy()
    expect(screen.getByText(/automated accessibility checks do not prove/i)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Authorize up to A$2.50' }))

    await waitFor(() => expect(command).toHaveBeenCalledWith({
      invocationRef: 'invocation:development',
      expectedInvocationVersion: 4,
      command: { kind: 'authorize', accept: true },
    }))
  })

  it('returns the exact service projection, digest, and command contract to a structured agent', async () => {
    const { service, projection, command } = serviceFixture()
    const host = createStructuredPaidOperationDevelopmentHost(service)

    const read = host.inspect({
      invocationRef: 'invocation:development',
      expectedInvocationVersion: 4,
    })
    expect(read).toEqual({
      kind: 'accepted',
      projection: projection.agent,
      semanticDigest: projection.agent.semanticDigest,
      commands: [{
        command: 'authorize',
        requiredInput: ['accept'],
        expectedInvocationVersion: 4,
      }],
      claimBoundary: expect.objectContaining({
        evidenceClass: 'local_labelled_sandbox_fixture',
        claimCeiling: 'Local browser mechanics and projection parity only.',
      }),
    })

    await host.command({
      invocationRef: 'invocation:development',
      expectedInvocationVersion: 4,
      command: { kind: 'authorize', accept: true },
    })
    expect(command).toHaveBeenCalledTimes(1)
  })

  it('keeps public reconciliation intent-only and injects exact evidence inside the local host', async () => {
    const { service, command } = serviceFixture([{
      kind: 'reconcile',
      command: 'reconcile_paid_operation',
      requiredInput: ['reconciliationEvidence', 'paymentReconciliationEvidence'],
      expectedInvocationVersion: 4,
      authorityRequired: false,
    }])
    const evidence: Readonly<{
      reconciliationEvidence: ReconciliationEvidence
      paymentReconciliationEvidence: X402PaymentReconciliationEvidence
    }> = {
      reconciliationEvidence: {
        kind: 'action_invocation_reconciliation',
        version: 1,
        evidenceRef: 'evidence:provider-observer',
        invocationRef: 'invocation:development',
        attemptRef: 'attempt:development',
        effectGeneration: 1,
        observedAt: '2026-07-20T00:00:00.000Z',
        source: 'provider_api',
        resolution: 'not_released',
        digest: `sha256:${'2'.repeat(64)}`,
      },
      paymentReconciliationEvidence: {
        kind: 'x402_payment_reconciliation',
        version: 1,
        evidenceRef: 'evidence:payment-observer',
        evidenceRefs: ['evidence:payment-observer'],
        invocationRef: 'invocation:development',
        attemptRef: 'attempt:development',
        effectGeneration: 1,
        observedAt: '2026-07-20T00:00:00.000Z',
        source: 'payment_facilitator',
        paymentIdentifier: 'payment:development',
        challengeDigest: `sha256:${'1'.repeat(64)}`,
        providerEndpoint: 'https://fixture.invalid/pay',
        scheme: 'exact',
        network: 'local',
        asset: 'fixture-credit',
        payTo: 'fixture-recipient',
        amount: '2.50',
        resolution: 'not_settled',
        digest: `sha256:${'3'.repeat(64)}`,
      },
    }
    const resolveReconciliationEvidence = vi.fn(() => evidence)
    const host = createStructuredPaidOperationDevelopmentHost(
      service,
      resolveReconciliationEvidence,
    )
    const ref = {
      invocationRef: 'invocation:development',
      expectedInvocationVersion: 4,
    }
    const read = host.inspect(ref)
    expect(read.kind === 'accepted' && read.commands).toEqual([{
      command: 'reconcile',
      requiredInput: [],
      expectedInvocationVersion: 4,
    }])
    await host.command({ ...ref, command: { kind: 'reconcile' } })
    expect(resolveReconciliationEvidence).toHaveBeenCalledWith(expect.objectContaining(ref))
    expect(command).toHaveBeenCalledWith({
      ...ref,
      command: { kind: 'reconcile', ...evidence },
    })
  })

  it('keeps keyboard, focus, non-colour, touch-target, reflow, and motion semantics explicit', async () => {
    const { service } = serviceFixture()
    const { container } = render(<AePaidOperationDevelopmentSurface
      service={service}
      initialRef={{ invocationRef: 'invocation:development', expectedInvocationVersion: 4 }}
    />)

    const action = screen.getByRole('button', { name: 'Authorize up to A$2.50' })
    action.focus()
    expect(document.activeElement).toBe(action)
    expect(action.className).toContain('min-h-11')
    expect(container.querySelectorAll('[aria-live]')).toHaveLength(1)
    expect(container.querySelector('[role="status"]')?.textContent).toMatch(/projection ready/i)
    expect(screen.getByText('Ready for permission')).toBeTruthy()
    expect(screen.getByText(/Nothing has been sent or paid/i)).toBeTruthy()
    expect(container.querySelector('main')?.className).toContain('w-full')
    expect(container.innerHTML).not.toMatch(/animate-|transition-|motion-/)

    fireEvent.keyDown(action, { key: 'Enter' })
    fireEvent.click(action)
    await waitFor(() =>
      expect(screen.getAllByRole('status').some((status) =>
        /projection ready/i.test(status.textContent ?? ''))).toBe(true),
    )
  })
})

function serviceFixture(
  continuations: Parameters<typeof createPaidOperationSemantics>[0]['continuations'] = [{
    kind: 'authorize',
    command: 'authorize_paid_operation',
    requiredInput: ['authorityDecision'],
    expectedInvocationVersion: 4,
    authorityRequired: true,
  }],
) {
  const semantics = createPaidOperationSemantics({
    identity: {
      invocationRef: 'invocation:development',
      expectedInvocationVersion: 4,
    },
    operation: {
      operationKey: 'documents.translate',
      providerId: 'provider:development',
      providerName: 'Development Translation Provider',
      operationRevision: 'development:v1',
      materialInputs: { documentRef: 'document:development' },
    },
    presentation: {
      title: 'Translate the supplied document',
      summary: 'A labelled local provider will translate the supplied document.',
      blocks: [{ kind: 'text', label: 'Target language', value: 'French' }],
    },
    maximumAuthorizedCharge: { currency: 'AUD', amountMinor: 250 },
    queryRelease: { state: 'not_released' },
    paymentAuthorization: { state: 'not_created' },
    paymentSubmission: { state: 'not_submitted' },
    settlement: { state: 'no_evidence' },
    resultDelivery: { state: 'not_delivered' },
    environment: {
      name: 'Local labelled sandbox',
      evidenceClass: 'local_labelled_sandbox_fixture',
      claimCeiling: 'Local browser mechanics and projection parity only.',
    },
    error: null,
    continuations,
  })
  const projection: PaidOperationProjection = {
    semantics,
    human: projectRichPaidOperation(semantics),
    agent: projectStructuredPaidOperation(semantics),
  }
  const command = vi.fn(async (
    _input: Parameters<PaidOperationApplicationService['command']>[0],
  ): Promise<Awaited<ReturnType<PaidOperationApplicationService['command']>>> => ({
    kind: 'accepted',
    value: projection,
  }))
  const service: PaidOperationApplicationService = {
    inspect: vi.fn(() => ({ kind: 'accepted', value: projection }) as const),
    command,
  }
  return { service, projection, command }
}
