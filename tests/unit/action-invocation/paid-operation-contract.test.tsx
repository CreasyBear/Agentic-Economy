/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { AePaidOperationCard } from '@/components/ae/action-invocation/AePaidOperationCard'
import {
  createPaidOperationSemantics,
  type PaidOperationSemantics,
} from '@/modules/capability-execution/legacy-dynamic/paid-operation-semantics'
import type { ExactAmount } from '@/modules/money/public'

afterEach(cleanup)

describe('paid operation exact-money contract', () => {
  it('renders a settled sub-cent payment as 0.007', () => {
    render(<AePaidOperationCard semantics={settledSemantics()} />)

    expect(document.body.textContent).toContain('0.007')
    expect(screen.getByText(/Payment of .*0\.007/)).toBeTruthy()
  })
})

function settledSemantics(): PaidOperationSemantics {
  const settledAmount = amount('USDC', '7000', 6)
  return createPaidOperationSemantics({
    identity: {
      invocationRef: 'invocation:exact-money-ui',
      expectedInvocationVersion: 1,
    },
    operation: {
      operationKey: 'crypto.quote',
      providerId: 'provider:exact-money',
      providerName: 'Exact Money Provider',
      operationRevision: 'crypto.quote:v1',
      materialInputs: { base: 'BTC', quote: 'USD' },
    },
    presentation: {
      title: 'Get the latest BTC price',
      summary: 'Exact Money Provider returns the latest BTC price.',
      blocks: [
        { kind: 'money', label: 'Payment', amount: settledAmount },
        { kind: 'text', label: 'Pair', value: 'BTC / USD' },
      ],
    },
    maximumAuthorizedCharge: settledAmount,
    queryRelease: {
      state: 'released',
      recipient: 'Exact Money Provider',
      evidenceRefs: ['evidence:query'],
    },
    paymentAuthorization: {
      state: 'created',
      paymentIdentifier: 'payment:exact-money-ui',
      custodyReference: {
        kind: 'opaque_digest_reference',
        algorithm: 'sha256',
        digest: `sha256:${'a'.repeat(64)}`,
      },
      evidenceRefs: ['evidence:authorization'],
    },
    paymentSubmission: {
      state: 'observed',
      evidenceRefs: ['evidence:submission'],
    },
    settlement: {
      state: 'settled',
      amount: settledAmount,
      evidenceRefs: ['evidence:settlement'],
    },
    resultDelivery: {
      state: 'valid',
      blocks: [{ kind: 'text', label: 'Result', value: 'BTC price available' }],
      evidenceRefs: ['evidence:result'],
    },
    environment: {
      name: 'Local exact-money fixture',
      evidenceClass: 'local_fixture',
      claimCeiling: 'fixture_contract_only',
    },
    error: null,
    continuations: [],
  })
}

function amount(currency: string, units: string, exponent: number): ExactAmount {
  return { currency, units, exponent }
}
