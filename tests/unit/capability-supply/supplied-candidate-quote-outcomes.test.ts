import { describe, expect, it, vi } from 'vitest'

import { prepareSuppliedCandidateQuote } from '@/modules/capability-supply/server'
import { createDevelopmentReleaseSignal } from '@/modules/action-invocation'
import {
  actor,
  inMemoryTracer,
  nowMs,
  origins,
  qualificationPorts,
  quoteInputFor,
} from './supplied-candidate-quote-harness'

describe('ADR-009 supplied-candidate development quote collection', () => {
  it('returns a structured provider refusal without converting it into a thrown failure', async () => {
    const ports = qualificationPorts()
    const quoteInput = await quoteInputFor(ports)
    const adapter = vi.fn().mockResolvedValue({
      kind: 'refused',
      environment: 'MOCK/DEVELOPMENT ONLY',
      code: 'development_provider_declined',
      reason: 'The labelled development provider declined this quote request.',
    })
    const tracer = inMemoryTracer(adapter)
    const prepared = await prepareSuppliedCandidateQuote({
      tracer, qualificationPorts: ports, invocationInput: quoteInput,
      origin: origins[1]!, actor,
      context: { developmentOnlySuppliedQuoteAdapter: adapter },
      now: () => nowMs,
    })
    if (prepared.kind !== 'prepared') throw new Error(prepared.code)
    const accepted = await tracer.decide({
      invocationRef: prepared.view.invocationRef,
      expectedInvocationVersion: prepared.view.invocationVersion,
      authorityRef: prepared.view.authority!.reference,
      actor, origin: origins[1]!, accept: true,
    })
    if (accepted.kind !== 'accepted') throw new Error(accepted.code)
    const refused = await tracer.execute({
      invocationRef: prepared.view.invocationRef,
      expectedInvocationVersion: accepted.view.invocationVersion,
      authorityRef: prepared.view.authority!.reference,
      actor, origin: origins[1]!, materialInput: quoteInput,
    })
    expect(adapter).toHaveBeenCalledTimes(1)
    expect(refused).toMatchObject({
      kind: 'accepted',
      view: {
        control: { state: 'terminal' },
        attempts: [{ outcome: { state: 'returned', businessOutcome: 'refused' } }],
        observedResolution: {
          state: 'returned',
          businessOutcome: 'refused',
          result: { kind: 'refused', code: 'development_provider_declined' },
        },
      },
    })
  })

  it('makes a demonstrably pre-release adapter failure safely retryable with one attributable attempt', async () => {
    const ports = qualificationPorts()
    const quoteInput = await quoteInputFor(ports)
    const releaseSignal = createDevelopmentReleaseSignal()
    const adapter = vi.fn().mockRejectedValue(new Error('development_transport_failed_before_release'))
    const tracer = inMemoryTracer(adapter, releaseSignal)
    const prepared = await prepareSuppliedCandidateQuote({
      tracer, qualificationPorts: ports, invocationInput: quoteInput,
      origin: origins[1]!, actor,
      context: { developmentOnlySuppliedQuoteAdapter: adapter },
      now: () => nowMs,
    })
    if (prepared.kind !== 'prepared') throw new Error(prepared.code)
    const accepted = await tracer.decide({
      invocationRef: prepared.view.invocationRef,
      expectedInvocationVersion: prepared.view.invocationVersion,
      authorityRef: prepared.view.authority!.reference,
      actor, origin: origins[1]!, accept: true,
    })
    if (accepted.kind !== 'accepted') throw new Error(accepted.code)
    const failed = await tracer.execute({
      invocationRef: prepared.view.invocationRef,
      expectedInvocationVersion: accepted.view.invocationVersion,
      authorityRef: prepared.view.authority!.reference,
      actor, origin: origins[1]!, materialInput: quoteInput,
    })
    expect(adapter).toHaveBeenCalledTimes(1)
    expect(releaseSignal.wasReleased()).toBe(false)
    expect(failed).toMatchObject({
      kind: 'accepted',
      view: {
        control: { state: 'retryable', reason: 'pre_release_failure' },
        attempts: [{
          attemptNumber: 1,
          actor,
          release: { state: 'not_released' },
          outcome: { state: 'failed', retry: 'safe_before_release' },
        }],
      },
    })
  })
})
