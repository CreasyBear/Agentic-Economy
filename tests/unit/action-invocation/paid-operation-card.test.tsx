/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { AePaidOperationCard } from '@/components/ae/action-invocation/AePaidOperationCard'
import {
  createPaidOperationSemantics,
  type PaidOperationSemantics,
} from '@/modules/action-invocation/paid-operation-semantics'

afterEach(cleanup)

describe('AePaidOperationCard', () => {
  it('makes the prepared operation understandable without exposing protocol jargon', () => {
    render(<AePaidOperationCard semantics={fixture({
      paymentAuthorization: {
        state: 'created',
        paymentIdentifier: 'payment:prepared',
        custodyReference: custodyReference('1'),
        evidenceRefs: ['evidence:prepared'],
      },
    })} />)

    expect(screen.getByRole('heading', { name: 'Get the latest BTC price in USD' })).toBeTruthy()
    expect(screen.getByText('Development Quote Provider')).toBeTruthy()
    expect(screen.getByText('USD 0.01')).toBeTruthy()
    expect(screen.getByText('BTC / USD')).toBeTruthy()
    expect(screen.getByText(/no payment request has been submitted/)).toBeTruthy()
    expect(screen.getAllByText('Local mock demonstration')).toHaveLength(2)
    expect(document.body.textContent).not.toContain('x402')
  })

  it('offers reconciliation but never retry while payment may have been submitted', () => {
    const onContinue = vi.fn()
    const reconcile = {
      kind: 'reconcile',
      command: 'reconcile_paid_operation',
      requiredInput: ['paymentIdentifier'],
      expectedInvocationVersion: 3,
      authorityRequired: false,
    } as const

    render(<AePaidOperationCard
      semantics={fixture({
        paymentAuthorization: {
          state: 'created',
          paymentIdentifier: 'payment:uncertain',
          custodyReference: custodyReference('2'),
          evidenceRefs: ['evidence:authorization'],
        },
        paymentSubmission: {
          state: 'possibly_submitted',
          evidenceRefs: ['evidence:submission'],
        },
        settlement: {
          state: 'unknown',
          evidenceRefs: ['evidence:unknown'],
        },
        continuations: [reconcile],
      })}
      onContinue={onContinue}
    />)

    expect(screen.getByText('Needs checking')).toBeTruthy()
    expect(screen.getByText(/will not try again/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /try/i })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Check existing payment' }))
    expect(onContinue).toHaveBeenCalledWith(reconcile)
  })

  it('keeps quote delivery and settlement evidence visibly separate on success', () => {
    render(<AePaidOperationCard semantics={fixture({
      queryRelease: {
        state: 'released',
        recipient: 'Development Quote Provider',
        evidenceRefs: ['evidence:query'],
      },
      paymentAuthorization: {
        state: 'created',
        paymentIdentifier: 'payment:complete',
        custodyReference: custodyReference('3'),
        evidenceRefs: ['evidence:authorization'],
      },
      paymentSubmission: {
        state: 'observed',
        evidenceRefs: ['evidence:submission'],
      },
      settlement: {
        state: 'settled',
        amount: { currency: 'USD', units: '1', exponent: 2 },
        evidenceRefs: ['evidence:settlement'],
      },
      resultDelivery: {
        state: 'valid',
        blocks: [
          {
            kind: 'measurement',
            label: 'Latest price',
            value: 67_432.12,
            unit: 'USD per BTC',
          },
          {
            kind: 'source',
            label: 'Source',
            providerId: 'provider:development-quote',
            providerName: 'Development Quote Provider',
            operationRevision: 'operation-revision:v1',
          },
          {
            kind: 'timestamp',
            label: 'Received',
            value: '2026-07-20T02:00:00.000Z',
          },
        ],
        evidenceRefs: ['evidence:quote'],
      },
    })} />)

    expect(screen.getByText('67,432.12 USD per BTC')).toBeTruthy()
    expect(screen.getByText(/Payment of USD 0\.01/)).toBeTruthy()

    fireEvent.click(screen.getByText('Technical details'))
    expect(screen.getByText('Result validated')).toBeTruthy()
    expect(screen.getByText('USD 0.01 settled')).toBeTruthy()
    expect(screen.getByText('fixture_contract_only')).toBeTruthy()
  })

  it('states a truthful pre-release refusal and exposes retry only when supplied', () => {
    const retry = {
      kind: 'retry',
      command: 'retry_paid_operation',
      requiredInput: [],
      expectedInvocationVersion: 3,
      authorityRequired: true,
    } as const

    render(<AePaidOperationCard
      semantics={fixture({
        error: {
          code: 'authority_refused',
          phase: 'authority',
          queryReleaseStatus: 'not_released',
          paymentSubmissionStatus: 'not_submitted',
          settlementStatus: 'no_evidence',
          resultStatus: 'not_delivered',
          retryability: 'retryable',
          safeNextAction: 'retry',
          evidenceRefs: ['evidence:refusal'],
        },
        continuations: [retry],
      })}
      onContinue={() => undefined}
    />)

    expect(screen.getByText('Not sent')).toBeTruthy()
    expect(screen.getByText(/before anything was sent/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy()
  })

  it('renders running and reconciled-not-paid as distinct non-colour states', () => {
    const { rerender } = render(<AePaidOperationCard semantics={fixture({
      paymentAuthorization: {
        state: 'created',
        paymentIdentifier: 'payment:running',
        custodyReference: custodyReference('4'),
        evidenceRefs: ['evidence:authorization'],
      },
      paymentSubmission: {
        state: 'observed',
        evidenceRefs: ['evidence:provider-receipt'],
      },
    })} />)

    expect(screen.getByText('Waiting for result')).toBeTruthy()
    expect(screen.getByText(/Do not send another/)).toBeTruthy()

    rerender(<AePaidOperationCard semantics={fixture({
      paymentAuthorization: {
        state: 'created',
        paymentIdentifier: 'payment:reconciled',
        custodyReference: custodyReference('5'),
        evidenceRefs: ['evidence:authorization'],
      },
      settlement: {
        state: 'not_settled',
        evidenceRefs: ['evidence:reconciliation'],
      },
    })} />)

    expect(screen.getByText('Checked — not paid')).toBeTruthy()
    expect(screen.getByText('The earlier payment was checked and was not settled.')).toBeTruthy()
  })

  it('does not hide a settled payment behind an invalid quote result', () => {
    render(<AePaidOperationCard semantics={fixture({
      queryRelease: {
        state: 'released',
        recipient: 'Development Quote Provider',
        evidenceRefs: ['evidence:query'],
      },
      paymentAuthorization: {
        state: 'created',
        paymentIdentifier: 'payment:invalid-quote',
        custodyReference: custodyReference('6'),
        evidenceRefs: ['evidence:authorization'],
      },
      paymentSubmission: {
        state: 'observed',
        evidenceRefs: ['evidence:provider-receipt'],
      },
      settlement: {
        state: 'settled',
        amount: { currency: 'USD', units: '1', exponent: 2 },
        evidenceRefs: ['evidence:settlement'],
      },
      resultDelivery: {
        state: 'invalid',
        code: 'result_invalid',
        evidenceRefs: ['evidence:invalid-quote'],
      },
    })} />)

    expect(screen.getByText('Paid — result unusable')).toBeTruthy()
    expect(screen.getByText(/Payment of USD 0\.01/)).toBeTruthy()
    expect(screen.getByText(/Do not assume another result is free/)).toBeTruthy()
  })

  it('renders a non-crypto paid operation through the same typed blocks', () => {
    render(<AePaidOperationCard semantics={fixture({
      operation: {
        operationKey: 'documents.translate',
        providerId: 'provider:translation',
        providerName: 'Plain Language Translations',
        operationRevision: 'translation:v2',
        materialInputs: {
          sourceLanguage: 'English',
          targetLanguage: 'French',
          documentRef: 'document:menu',
        },
      },
      presentation: {
        title: 'Translate a menu into French',
        summary: 'Plain Language Translations will translate the supplied menu.',
        blocks: [
          { kind: 'text', label: 'From', value: 'English' },
          { kind: 'text', label: 'To', value: 'French' },
          { kind: 'measurement', label: 'Length', value: 840, unit: 'words' },
          {
            kind: 'source',
            label: 'Provider',
            providerId: 'provider:translation',
            providerName: 'Plain Language Translations',
            operationRevision: 'translation:v2',
          },
        ],
      },
      maximumAuthorizedCharge: { currency: 'AUD', units: '250', exponent: 2 },
      settlement: {
        state: 'settled',
        amount: { currency: 'AUD', units: '250', exponent: 2 },
        evidenceRefs: ['evidence:translation-payment'],
      },
      resultDelivery: {
        state: 'valid',
        blocks: [
          { kind: 'text', label: 'Delivery', value: 'French menu ready' },
          { kind: 'reference', label: 'Document', value: 'document:menu:fr' },
          { kind: 'status', label: 'Review', value: 'Passed terminology check', tone: 'positive' },
        ],
        evidenceRefs: ['evidence:translation-result'],
      },
    })} />)

    expect(screen.getByRole('heading', { name: 'Translate a menu into French' })).toBeTruthy()
    expect(screen.getByText('Plain Language Translations will translate the supplied menu.')).toBeTruthy()
    expect(screen.getByText('AUD 2.50')).toBeTruthy()
    expect(screen.getByText('840 words')).toBeTruthy()
    expect(screen.getByText('French menu ready')).toBeTruthy()
    expect(screen.getByText('document:menu:fr')).toBeTruthy()
    expect(document.body.textContent).not.toContain('BTC')
    expect(document.body.textContent).not.toContain('quote')
  })

  it('uses ISO minor-unit exponents for JPY and KWD', () => {
    const { rerender } = render(<AePaidOperationCard semantics={fixture({
      maximumAuthorizedCharge: { currency: 'JPY', units: '250', exponent: 0 },
    })} />)
    expect(screen.getByText('JPY 250')).toBeTruthy()

    rerender(<AePaidOperationCard semantics={fixture({
      maximumAuthorizedCharge: { currency: 'KWD', units: '250', exponent: 3 },
    })} />)
    expect(screen.getByText(/KWD\s*0\.25/)).toBeTruthy()
  })

  it('emits prepared authorize and execute continuations through the generic callback', () => {
    const onContinue = vi.fn()
    const authorize = {
      kind: 'authorize',
      command: 'authorize_paid_operation',
      requiredInput: ['authorityDecision'],
      expectedInvocationVersion: 3,
      authorityRequired: true,
    } as const
    const { rerender } = render(<AePaidOperationCard
      semantics={fixture({ continuations: [authorize] })}
      onContinue={onContinue}
    />)
    fireEvent.click(screen.getByRole('button', { name: 'Authorize payment' }))
    expect(onContinue).toHaveBeenCalledWith(authorize)

    const execute = {
      kind: 'execute',
      command: 'execute_paid_operation',
      requiredInput: [],
      expectedInvocationVersion: 3,
      authorityRequired: true,
    } as const
    rerender(<AePaidOperationCard
      semantics={fixture({ continuations: [execute] })}
      onContinue={onContinue}
    />)
    fireEvent.click(screen.getByRole('button', { name: 'Continue operation' }))
    expect(onContinue).toHaveBeenCalledWith(execute)
  })
})

function custodyReference(seed: string) {
  return {
    kind: 'opaque_digest_reference',
    algorithm: 'sha256',
    digest: `sha256:${seed.repeat(64)}`,
  } as const
}

function fixture(
  overrides: Partial<Omit<PaidOperationSemantics, 'schema'>> = {},
): PaidOperationSemantics {
  return createPaidOperationSemantics({
    identity: {
      invocationRef: 'invocation:paid-operation-card',
      expectedInvocationVersion: 3,
    },
    operation: {
      operationKey: 'supply.collectDevelopmentQuote',
      providerId: 'provider:development-quote',
      providerName: 'Development Quote Provider',
      operationRevision: 'operation-revision:v1',
      materialInputs: { base: 'BTC', quote: 'USD' },
    },
    presentation: {
      title: 'Get the latest BTC price in USD',
      summary: 'Development Quote Provider will return its latest published price.',
      blocks: [
        { kind: 'text', label: 'Pair', value: 'BTC / USD' },
        {
          kind: 'source',
          label: 'Provider',
          providerId: 'provider:development-quote',
          providerName: 'Development Quote Provider',
          operationRevision: 'operation-revision:v1',
        },
      ],
    },
    maximumAuthorizedCharge: { currency: 'USD', units: '1', exponent: 2 },
    queryRelease: { state: 'not_released' },
    paymentAuthorization: { state: 'not_created' },
    paymentSubmission: { state: 'not_submitted' },
    settlement: { state: 'no_evidence' },
    resultDelivery: { state: 'not_delivered' },
    environment: {
      name: 'Local mock demonstration',
      evidenceClass: 'local_fixture',
      claimCeiling: 'fixture_contract_only',
    },
    error: null,
    continuations: [],
    ...overrides,
  })
}
