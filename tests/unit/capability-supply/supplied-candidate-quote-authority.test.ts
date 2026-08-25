import { describe, expect, it, vi } from 'vitest'

import {
  collectSuppliedCandidateQuoteAction,
  prepareSuppliedCandidateQuote,
  type SuppliedCandidateQuoteInput,
} from '@/modules/capability-supply/server'
import {
  type ActionInvocationOrigin,
  createInMemoryActionInvocationTracer,
} from '@/modules/action-invocation'
import {
  actor,
  candidate,
  inMemoryTracer,
  nowIso,
  nowMs,
  origins,
  qualificationPorts,
  quoteInputFor,
} from './supplied-candidate-quote-harness'

describe('ADR-009 supplied-candidate development quote collection', () => {
  it('keeps exact authority isolated across two independently qualified quote invocations', async () => {
    const ports = qualificationPorts()
    const inputA = await quoteInputFor(ports)
    const inputB = {
      ...inputA,
      quoteRequest: {
        ...inputA.quoteRequest,
        serviceReference: 'dev:service:independent-quote-b',
      },
      operationKey: 'dev:quote-operation:independent-b',
    }
    let invocationSequence = 0
    const tracer = createInMemoryActionInvocationTracer({
      action: collectSuppliedCandidateQuoteAction,
      now: nowIso,
      nextInvocationRef: () => `dev:invocation:authority-isolation:${++invocationSequence}`,
      nextAuthorityRef: () => `dev:authority:quote:${invocationSequence}`,
      nextAttemptRef: () => `dev:attempt:quote:${invocationSequence}`,
    })
    const prepare = (
      invocationInput: SuppliedCandidateQuoteInput,
      origin: ActionInvocationOrigin,
    ) =>
      prepareSuppliedCandidateQuote({
        tracer,
        qualificationPorts: ports,
        invocationInput,
        origin,
        actor,
        context: {},
        now: () => nowMs,
      })
    const preparedA = await prepare(inputA, origins[0]!)
    const preparedB = await prepare(inputB, origins[1]!)
    if (preparedA.kind !== 'prepared') throw new Error(preparedA.code)
    if (preparedB.kind !== 'prepared') throw new Error(preparedB.code)

    const acceptedA = await tracer.decide({
      invocationRef: preparedA.view.invocationRef,
      expectedInvocationVersion: preparedA.view.invocationVersion,
      authorityRef: preparedA.view.authority!.reference,
      actor,
      origin: origins[0]!,
      accept: true,
    })
    expect(acceptedA).toMatchObject({ kind: 'accepted', view: { control: { state: 'authorized' } } })
    expect(await tracer.decide({
      invocationRef: preparedB.view.invocationRef,
      expectedInvocationVersion: preparedB.view.invocationVersion,
      authorityRef: preparedA.view.authority!.reference,
      actor,
      origin: origins[1]!,
      accept: true,
    })).toMatchObject({ kind: 'refused' })
    await expect(tracer.execute({
      invocationRef: preparedA.view.invocationRef,
      expectedInvocationVersion: acceptedA.kind === 'accepted'
        ? acceptedA.view.invocationVersion
        : preparedA.view.invocationVersion,
      authorityRef: preparedA.view.authority!.reference,
      actor,
      origin: origins[0]!,
      materialInput: inputB,
    })).resolves.toMatchObject({ kind: 'refused', code: 'material_input_changed' })
    expect(tracer.inspect(preparedB.view.invocationRef)).toMatchObject({
      authority: { reference: preparedB.view.authority!.reference },
      control: { state: 'awaiting_authority' },
      attempts: [],
    })
  })

  it.each(origins)('runs the real P1-H qualifier before exact authority for $kind', async (origin) => {
    const ports = qualificationPorts()
    const quoteInput = await quoteInputFor(ports)
    const adapter = vi.fn().mockResolvedValue({
      kind: 'quote_returned',
      environment: 'MOCK/DEVELOPMENT ONLY',
      quote: {
        quoteRef: 'dev:quote:0001',
        price: { currency: 'AUD', units: '18500', exponent: 2 },
        validUntil: nowMs + 3_600_000,
        terms: ['Development fixture; no provider commitment.'],
        evidenceRefs: ['dev:evidence:quote-contract'],
      },
    })
    const tracer = inMemoryTracer(adapter)
    const prepared = await prepareSuppliedCandidateQuote({
      tracer,
      qualificationPorts: ports,
      invocationInput: quoteInput,
      origin,
      actor,
      context: { developmentOnlySuppliedQuoteAdapter: adapter },
      now: () => nowMs,
    })
    expect(prepared.kind).toBe('prepared')
    if (prepared.kind !== 'prepared') throw new Error(prepared.code)
    expect(prepared.view.prepared).toMatchObject({
      target: candidate,
      freshUntil: new Date(quoteInput.qualificationValidUntil).toISOString(),
      dataUse: { fields: quoteInput.disclosure.fields, limits: quoteInput.disclosure.limits },
    })
    const accepted = await tracer.decide({
      invocationRef: prepared.view.invocationRef,
      expectedInvocationVersion: prepared.view.invocationVersion,
      authorityRef: prepared.view.authority!.reference,
      actor,
      origin,
      accept: true,
    })
    if (accepted.kind !== 'accepted') throw new Error(accepted.code)
    const executed = await tracer.execute({
      invocationRef: prepared.view.invocationRef,
      expectedInvocationVersion: accepted.view.invocationVersion,
      authorityRef: prepared.view.authority!.reference,
      actor,
      origin,
      materialInput: quoteInput,
    })
    expect(adapter).toHaveBeenCalledTimes(1)
    expect(adapter).toHaveBeenCalledWith({
      target: candidate,
      operationKey: quoteInput.operationKey,
      request: {
        serviceReference: quoteInput.quoteRequest.serviceReference,
        constraints: quoteInput.quoteRequest.constraints,
      },
    })
    expect(adapter.mock.calls[0]![0]).not.toHaveProperty('request.requestedFields')
    expect(executed).toMatchObject({
      kind: 'accepted',
      view: {
        control: { state: 'terminal' },
        observedResolution: {
          state: 'returned',
          businessOutcome: 'completed',
          result: { kind: 'quote_returned', environment: 'MOCK/DEVELOPMENT ONLY' },
        },
      },
    })
  })
})
