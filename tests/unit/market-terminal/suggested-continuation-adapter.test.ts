import { describe, expect, it } from 'vitest'

import {
  invocationContinuationForCli,
  operationContinuationForCli,
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
})
