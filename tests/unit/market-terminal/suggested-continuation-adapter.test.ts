import { describe, expect, it } from 'vitest'

import {
  creditContinuationForCli,
  connectionContinuationForCli,
  invocationContinuationForCli,
  operationContinuationForCli,
  supplierContinuationForCli,
} from '../../../tools/ae/lib/suggested-continuation-adapter'
import { suggestContinuation } from '@/modules/market/suggested-continuation'

describe('CLI suggested-continuation adapter', () => {
  const operationRef = `operation:v1:${'a'.repeat(64)}`
  const invocationRef = `invocation:v1:${'b'.repeat(64)}`

  it('uses the shared safe Operation projection', () => {
    expect(operationContinuationForCli({
      operationRef,
      availabilityPosture: 'routeable',
      requiresBuyerCredential: true,
      hasBuyerCredential: false,
    })).toEqual({
      label: 'Connect agent',
      kind: 'navigate',
      command: 'ae connect',
      href: '/agent-access',
    })

    const routeable = operationContinuationForCli({
      operationRef,
      availabilityPosture: 'routeable',
      requiresBuyerCredential: true,
      hasBuyerCredential: true,
    })
    expect(routeable).toEqual(suggestContinuation({
      subject: 'operation',
      state: 'ready',
      operationRef,
    }))
    expect(routeable).toMatchObject({
      label: 'Call Operation',
      command: `ae call ${operationRef} --input '<json>'`,
    })

    expect(operationContinuationForCli({
      operationRef,
      availabilityPosture: 'integrated',
      requiresBuyerCredential: true,
      hasBuyerCredential: true,
    })).toEqual(suggestContinuation({
      subject: 'operation',
      state: 'inspect_only',
      operationRef,
    }))
  })

  it('uses status and reconciliation before any retry', () => {
    expect(invocationContinuationForCli({
      kind: 'found',
      invocationRef,
      state: 'reconciliation_required',
    })).toEqual({
      label: 'Review reconciliation',
      kind: 'reconcile',
      command: `ae status ${invocationRef}`,
      warning: 'The external effect may have started. Reconcile before retrying.',
    })
  })

  it.each(['terminal', 'cancelled', 'invalidated'] as const)(
    'does not send a %s invocation back to the same status command',
    (state) => {
      expect(invocationContinuationForCli({
        kind: 'found',
        invocationRef,
        state,
      })).toBeUndefined()
    },
  )

  it('uses shared supplier, connection, and credit projections', () => {
    expect(supplierContinuationForCli({
      offeringRef: 'offering:one',
      catalogStatus: 'published',
      lifecycleState: 'active',
      liveAvailable: true,
      publicationState: 'current',
      operationRef,
    })).toEqual(suggestContinuation({
      subject: 'supplier',
      state: 'current',
      offeringRef: 'offering:one',
      operationRef,
    }))
    expect(connectionContinuationForCli('buyer')).toEqual(suggestContinuation({
      subject: 'connection',
      state: 'missing',
      actor: 'buyer',
    }))
    expect(connectionContinuationForCli('supplier')).toEqual(suggestContinuation({
      subject: 'connection',
      state: 'missing',
      actor: 'supplier',
    }))
    expect(creditContinuationForCli()).toEqual(suggestContinuation({
      subject: 'credit',
      state: 'insufficient',
    }))
  })
})
