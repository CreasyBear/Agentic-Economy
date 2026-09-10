import { describe, expect, it } from 'vitest'

import {
  creditContinuationForCli,
  connectionContinuationForCli,
  callNextActionForCli,
  toolNextActionForCli,
  providerNextActionForCli,
} from '../../../tools/ae/lib/suggested-continuation-adapter'
import { suggestNextAction } from '@/modules/market/suggested-next-action'

describe('CLI suggested next-action adapter', () => {
  const toolRef = `operation:v1:${'a'.repeat(64)}`
  const callRef = `invocation:v1:${'b'.repeat(64)}`
  const searchQuery = 'Current weather forecast for a city'

  it('uses the shared safe Tool projection', () => {
    expect(toolNextActionForCli({
      toolRef,
      searchQuery,
      availabilityPosture: 'routeable',
      requiresBuyerCredential: true,
      hasBuyerCredential: false,
    })).toEqual({
      label: 'Connect agent',
      kind: 'navigate',
      command: 'ae connect',
      href: '/for-agents',
    })

    const routeable = toolNextActionForCli({
      toolRef,
      searchQuery,
      availabilityPosture: 'routeable',
      requiresBuyerCredential: true,
      hasBuyerCredential: true,
    })
    expect(routeable).toEqual(suggestNextAction({
      subject: 'tool',
      state: 'ready',
      toolRef,
      searchQuery,
    }))
    expect(routeable).toMatchObject({
      label: 'Call Tool',
      command: `ae call ${toolRef} --input '<json>'`,
    })

    expect(toolNextActionForCli({
      toolRef,
      searchQuery,
      availabilityPosture: 'setup_required',
      requiresBuyerCredential: true,
      hasBuyerCredential: true,
    })).toEqual(suggestNextAction({
      subject: 'tool',
      state: 'read_only',
      toolRef,
      searchQuery,
    }))
  })

  it('uses status and reconciliation before any retry', () => {
    expect(callNextActionForCli({
      kind: 'found',
      callRef,
      state: 'reconciliation_required',
    })).toEqual({
      label: 'Prepare reconciliation',
      kind: 'reconcile',
      command: 'ae help recover',
      warning: 'The external effect may have started. Reconcile before retrying.',
    })
  })

  it.each(['terminal', 'cancelled', 'invalidated'] as const)(
    'does not send a %s invocation back to the same status command',
    (state) => {
      expect(callNextActionForCli({
        kind: 'found',
        callRef,
        state,
      })).toBeUndefined()
    },
  )

  it('uses shared Provider, connection, and credit projections', () => {
    expect(providerNextActionForCli({
      offeringRef: 'offering:one',
      catalogStatus: 'published',
      lifecycleState: 'active',
      liveAvailable: true,
      publicationState: 'current',
      toolRef,
    })).toEqual(suggestNextAction({
      subject: 'provider',
      state: 'current',
      offeringRef: 'offering:one',
      toolRef,
    }))
    expect(connectionContinuationForCli('buyer')).toEqual(suggestNextAction({
      subject: 'connection',
      state: 'missing',
      actor: 'buyer',
    }))
    expect(connectionContinuationForCli('provider')).toEqual(suggestNextAction({
      subject: 'connection',
      state: 'missing',
      actor: 'provider',
    }))
    expect(creditContinuationForCli()).toEqual(suggestNextAction({
      subject: 'credit',
      state: 'insufficient',
    }))
  })
})
