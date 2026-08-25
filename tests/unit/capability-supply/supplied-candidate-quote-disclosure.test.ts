import { describe, expect, it, vi } from 'vitest'

import {
  prepareSuppliedCandidateQuote,
  type SuppliedCandidateQuoteInput,
} from '@/modules/capability-supply/server'
import {
  actor,
  inMemoryTracer,
  nowMs,
  origins,
  qualificationPorts,
  quoteInputFor,
} from './supplied-candidate-quote-harness'

describe('ADR-009 supplied-candidate development quote collection', () => {
  it.each([
    ['undisclosed constraint', (input: SuppliedCandidateQuoteInput) => ({
      ...input,
      quoteRequest: {
        ...input.quoteRequest,
        constraints: { ...input.quoteRequest.constraints, phone: '0400000000' },
      },
    })],
    ['extra disclosure', (input: SuppliedCandidateQuoteInput) => ({
      ...input,
      disclosure: {
        ...input.disclosure,
        fields: [...input.disclosure.fields, 'quoteRequest.constraints.phone'],
        limits: { ...input.disclosure.limits, 'quoteRequest.constraints.phone': 32 },
      },
    })],
    ['missing limit', (input: SuppliedCandidateQuoteInput) => {
      const { ['quoteRequest.constraints.timing']: _missing, ...limits } = input.disclosure.limits
      return { ...input, disclosure: { ...input.disclosure, limits } }
    }],
    ['over-limit value', (input: SuppliedCandidateQuoteInput) => ({
      ...input,
      disclosure: {
        ...input.disclosure,
        limits: { ...input.disclosure.limits, 'quoteRequest.constraints.suburb': 2 },
      },
    })],
  ] as const)('refuses %s before invocation or adapter release', async (_label, change) => {
    const ports = qualificationPorts()
    const quoteInput = change(await quoteInputFor(ports))
    const adapter = vi.fn()
    const tracer = inMemoryTracer(adapter)
    const refused = await prepareSuppliedCandidateQuote({
      tracer, qualificationPorts: ports, invocationInput: quoteInput,
      origin: origins[1]!, actor,
      context: { developmentOnlySuppliedQuoteAdapter: adapter },
      now: () => nowMs,
    })
    expect(refused).toEqual({ kind: 'refused', code: 'disclosure_invalid' })
    expect(tracer.exportSnapshot().records).toEqual([])
    expect(adapter).not.toHaveBeenCalled()
  })

  it('invalidates changed disclosure and refuses inherited cross-principal authority', async () => {
    const ports = qualificationPorts()
    const quoteInput = await quoteInputFor(ports)
    const tracer = inMemoryTracer(vi.fn())
    const prepared = await prepareSuppliedCandidateQuote({
      tracer, qualificationPorts: ports, invocationInput: quoteInput,
      origin: origins[1]!, actor, context: {}, now: () => nowMs,
    })
    if (prepared.kind !== 'prepared') throw new Error(prepared.code)
    expect(await tracer.decide({
      invocationRef: prepared.view.invocationRef,
      expectedInvocationVersion: prepared.view.invocationVersion,
      authorityRef: prepared.view.authority!.reference,
      actor: { ...actor, principalRef: 'dev:other-principal' },
      origin: origins[1]!,
      accept: true,
    })).toMatchObject({ kind: 'refused', code: 'cross_principal_refused' })
    const accepted = await tracer.decide({
      invocationRef: prepared.view.invocationRef,
      expectedInvocationVersion: prepared.view.invocationVersion,
      authorityRef: prepared.view.authority!.reference,
      actor, origin: origins[1]!, accept: true,
    })
    if (accepted.kind !== 'accepted') throw new Error(accepted.code)
    await expect(tracer.execute({
      invocationRef: prepared.view.invocationRef,
      expectedInvocationVersion: accepted.view.invocationVersion,
      authorityRef: prepared.view.authority!.reference,
      actor,
      origin: origins[1]!,
      materialInput: {
        ...quoteInput,
        disclosure: {
          ...quoteInput.disclosure,
          fields: [...quoteInput.disclosure.fields, 'quoteRequest.constraints.phone'],
        },
      },
    })).resolves.toMatchObject({ kind: 'refused', code: 'material_input_changed' })
  })
})
