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

    fireEvent.click(screen.getByRole('button', { name: 'Authorize payment' }))

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
        requiredInput: ['authorityDecision'],
        expectedInvocationVersion: 4,
      }],
      claimBoundary: expect.objectContaining({
        evidenceClass: 'labelled_local_development',
        claimCeiling: 'mechanism_and_projection_parity_only',
      }),
    })

    await host.command({
      invocationRef: 'invocation:development',
      expectedInvocationVersion: 4,
      command: { kind: 'authorize', accept: true },
    })
    expect(command).toHaveBeenCalledTimes(1)
  })

  it('advertises complete reconciliation input without inventing either evidence envelope', () => {
    const { service } = serviceFixture([{
      kind: 'reconcile',
      command: 'reconcile_paid_operation',
      requiredInput: ['reconciliationEvidence', 'paymentReconciliationEvidence'],
      expectedInvocationVersion: 4,
      authorityRequired: false,
    }])
    const read = createStructuredPaidOperationDevelopmentHost(service).inspect({
      invocationRef: 'invocation:development',
      expectedInvocationVersion: 4,
    })
    expect(read.kind === 'accepted' && read.commands).toEqual([{
      command: 'reconcile',
      requiredInput: ['reconciliationEvidence', 'paymentReconciliationEvidence'],
      inputTemplate: {
        kind: 'reconcile',
        reconciliationEvidence: null,
        paymentReconciliationEvidence: null,
      },
      expectedInvocationVersion: 4,
    }])
  })

  it('keeps keyboard, focus, non-colour, touch-target, reflow, and motion semantics explicit', async () => {
    const { service } = serviceFixture()
    const { container } = render(<AePaidOperationDevelopmentSurface
      service={service}
      initialRef={{ invocationRef: 'invocation:development', expectedInvocationVersion: 4 }}
    />)

    const action = screen.getByRole('button', { name: 'Authorize payment' })
    action.focus()
    expect(document.activeElement).toBe(action)
    expect(action.className).toContain('min-h-11')
    expect(container.querySelector('[role="status"]')?.textContent).toMatch(/projection ready/i)
    expect(screen.getByText('Ready to inspect')).toBeTruthy()
    expect(screen.getByText(/Nothing has been sent to the provider/i)).toBeTruthy()
    expect(container.querySelector('main')?.className).toContain('w-full')
    // Motion must stay explicit: no keyframe animation, no blanket
    // `transition-all`, no unconditional `motion-*` staging. A discrete colour
    // or shadow transition on a control is not motion under WCAG 2.3.3, so the
    // vendored primitives' hover feedback is allowed through.
    expect(container.innerHTML).not.toMatch(/animate-|transition-all|motion-/)

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
    maximumAuthorizedCharge: { currency: 'AUD', units: '250', exponent: 2 },
    queryRelease: { state: 'not_released' },
    paymentAuthorization: { state: 'not_created' },
    paymentSubmission: { state: 'not_submitted' },
    settlement: { state: 'no_evidence' },
    resultDelivery: { state: 'not_delivered' },
    environment: {
      name: 'Local development fixture',
      evidenceClass: 'labelled_local_mock',
      claimCeiling: 'mechanism_only_not_provider_fulfilment',
    },
    error: null,
    continuations,
  })
  const projection: PaidOperationProjection = {
    semantics,
    human: projectRichPaidOperation(semantics),
    agent: projectStructuredPaidOperation(semantics),
  }
  const command = vi.fn(async () => ({ kind: 'accepted', value: projection }) as const)
  const service: PaidOperationApplicationService = {
    inspect: vi.fn(() => ({ kind: 'accepted', value: projection }) as const),
    command,
  }
  return { service, projection, command }
}
