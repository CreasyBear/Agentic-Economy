import { beforeAll, describe, expect, it } from 'vitest'

import { findAction } from '@/modules/actions'
import { executeDevelopmentProviderOperationAction } from '../../../tools/dev/fixtures/provider-operation/development-provider-operation.actions'
import { runDevelopmentProviderOperationEvidence } from '../../../tools/dev/fixtures/provider-operation/development-provider-operation-evidence'

describe('provider_operation.executeDevelopmentCancellable', () => {
  let packet: Awaited<ReturnType<typeof runDevelopmentProviderOperationEvidence>>
  beforeAll(async () => {
    packet = await runDevelopmentProviderOperationEvidence()
  })

  it('keeps the consequential development fixture outside the global registry and every reachable surface', () => {
    expect(findAction('provider_operation.executeDevelopmentCancellable')).toBeUndefined()
    expect(executeDevelopmentProviderOperationAction).toMatchObject({
      readOnly: false,
      surfaces: [],
      invocationContract: {
        version: 'v1',
        consequenceClass: 'external_effect',
        authorityRequirement: 'principal',
        retryClass: 'reconcile_before_retry',
      },
    })
  })

  it('binds each disclosed operation principal to the authority-bound principal before release', () => {
    expect(packet.origins.map((origin) => origin.kind)).toEqual(['request_owned', 'standalone'])
    expect(packet.principalRefusal).toMatchObject({
      observedResolution: { state: 'returned', execution: 'pre_release_refused', businessOutcome: 'refused' },
      attempts: [{ release: { state: 'not_released' } }],
    })
  })

  it('derives authority-before-release from ordered emitted events', () => {
    expect(packet.eventOrder.map(({ kind }) => kind)).toEqual([
      'authority_decision',
      'provider_release',
    ])
    expect(packet.executableChecks.authorityBeforeRelease).toBe(true)
  })

  it('rechecks provider availability against trusted release time with zero stale effect', () => {
    expect(packet.expiryRefusal).toMatchObject({
      observedResolution: { state: 'returned', execution: 'pre_release_refused', businessOutcome: 'refused' },
      attempts: [{ release: { state: 'not_released' } }],
    })
  })

  it('derives the exact slot identity and terms from provider-owned availability', () => {
    expect(packet.availability).toMatchObject({
      providerRef: 'mock:provider:calendar',
      bindingRef: 'mock:binding:calendar-create-effect',
      contractRef: 'calendar.create-effect@1',
      actionVersion: 'v1',
      provenance: { source: 'mock_provider_availability' },
    })
  })

  it('deduplicates same operation material and conflicts changed material', () => {
    expect(packet.idempotency.first.invocationRef).not.toBe(packet.idempotency.replay.invocationRef)
    expect(packet.idempotency.first.observedResolution).toEqual(packet.idempotency.replay.observedResolution)
    expect(packet.idempotency.effectsAfterFirst).toBe(packet.idempotency.effectsBeforeDedupe + 1)
    expect(packet.idempotency.effectsAfterReplay).toBe(packet.idempotency.effectsAfterFirst)
    expect(packet.idempotency.conflict).toMatchObject({
      observedResolution: { result: { kind: 'effect_refused', code: 'terms_changed' } },
    })
  })

  it('reconciles possible release through attributable observer evidence', () => {
    expect(packet.reconciliation).toMatchObject({
      before: { control: { state: 'reconciliation_required' }, attempts: [{ release: { state: 'possibly_released' } }] },
      after: { control: { state: 'terminal' } },
    })
  })

  it('executes pre-release stop and separate provider-confirmed cancellation without rewriting effect', () => {
    expect(packet.cancellation).toMatchObject({
      beforeRelease: { control: { state: 'cancelled', effect: 'not_released' } },
      confirmed: {
        observedResolution: { state: 'returned', result: { kind: 'effect_cancellation_confirmed' } },
      },
      originalEffect: {
        state: 'returned',
        result: { kind: 'effect_confirmed' },
      },
    })
    expect(packet.cancellation.replay.observedResolution)
      .toEqual(packet.cancellation.confirmed.observedResolution)
    expect(packet.cancellation.conflict).toMatchObject({
      observedResolution: {
        result: { kind: 'effect_cancellation_refused', code: 'operation_key_conflict' },
      },
    })
    expect(packet.cancellation.principalRefusal).toMatchObject({
      observedResolution: {
        execution: 'pre_release_refused',
        result: { kind: 'effect_cancellation_refused', code: 'principal_mismatch' },
      },
      attempts: [{ release: { state: 'not_released' } }],
    })
    expect(packet.cancellation.cancellationEffects).toBe(1)
    if (packet.cancellation.originalEffect.state !== 'returned') {
      throw new Error('expected original effect result')
    }
    expect(packet.cancellation.providerEffectRecord?.result)
      .toEqual(packet.cancellation.originalEffect.result)
  })

  it('closes Gate 7 only for the labelled development class', () => {
    expect(packet.gate7).toBe('passes_for_declared_development_class')
    expect(packet.claimCeiling).toContain('No customer reachability')
  })
})
