import { describe, expect, it, vi } from 'vitest'

import {
  prepareSuppliedCandidateQuote,
  suppliedCandidateQuoteInputSchema,
} from '@/modules/capability-supply/server'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  actor,
  inMemoryTracer,
  nowMs,
  origins,
  publication,
  qualificationPorts,
  quoteInputFor,
} from './supplied-candidate-quote-harness'

describe('ADR-009 supplied-candidate development quote collection', () => {
  it('does not allow caller assertions to create eligibility', async () => {
    const currentPorts = qualificationPorts()
    const quoteInput = await quoteInputFor(currentPorts)
    const tracer = inMemoryTracer(vi.fn())

    const forgedEnvelope = {
      ...quoteInput,
      qualification: {
        status: 'eligible',
        sources: [],
        qualificationDigest: quoteInput.qualificationDigest,
      },
    }
    expect(suppliedCandidateQuoteInputSchema.safeParse(forgedEnvelope).success).toBe(false)

    const blocked = await prepareSuppliedCandidateQuote({
      tracer,
      qualificationPorts: qualificationPorts({
        loadPublicationAtRevision: async () => publication({
          disposition: 'superseded',
          sourceDigest: canonicalDigest({ changed: true }),
        }),
      }),
      invocationInput: quoteInput,
      origin: origins[1]!,
      actor,
      context: {},
      now: () => nowMs,
    })
    expect(blocked).toEqual({ kind: 'refused', code: 'qualification_blocked' })
    expect(tracer.exportSnapshot().records).toEqual([])
  })

  it('refuses tampered digest and source changes after the client read', async () => {
    const originalPorts = qualificationPorts()
    const quoteInput = await quoteInputFor(originalPorts)
    const tracer = inMemoryTracer(vi.fn())
    const tamperedDigest = await prepareSuppliedCandidateQuote({
      tracer,
      qualificationPorts: originalPorts,
      invocationInput: { ...quoteInput, qualificationDigest: `sha256:${'f'.repeat(64)}` },
      origin: origins[1]!,
      actor,
      context: {},
      now: () => nowMs,
    })
    expect(tamperedDigest).toEqual({ kind: 'refused', code: 'qualification_digest_mismatch' })

    const changedSources = await prepareSuppliedCandidateQuote({
      tracer,
      qualificationPorts: qualificationPorts({
        loadPublicationAtRevision: async () => publication({
          readinessObservedAt: nowMs - 500,
          readinessEvidenceRefs: ['dev:readiness:replacement'],
        }),
      }),
      invocationInput: quoteInput,
      origin: origins[1]!,
      actor,
      context: {},
      now: () => nowMs,
    })
    expect(changedSources).toEqual({ kind: 'refused', code: 'qualification_digest_mismatch' })
    expect(tracer.exportSnapshot().records).toEqual([])
  })

  it('requalifies immediately before release and refuses changed readiness without calling the adapter', async () => {
    let currentPublication = publication()
    const ports = qualificationPorts({
      loadPublicationAtRevision: async () => currentPublication,
    })
    const quoteInput = await quoteInputFor(ports)
    const adapter = vi.fn()
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
    currentPublication = publication({
      readinessObservedAt: nowMs - 250,
      readinessEvidenceRefs: ['dev:readiness:changed-after-authority'],
    })
    const refused = await tracer.execute({
      invocationRef: prepared.view.invocationRef,
      expectedInvocationVersion: accepted.view.invocationVersion,
      authorityRef: prepared.view.authority!.reference,
      actor, origin: origins[1]!, materialInput: quoteInput,
    })
    expect(adapter).not.toHaveBeenCalled()
    expect(refused).toMatchObject({
      kind: 'accepted',
      view: {
        control: { state: 'terminal' },
        attempts: [{
          release: { state: 'not_released' },
          outcome: { state: 'returned', businessOutcome: 'refused' },
        }],
        observedResolution: {
          state: 'returned',
          execution: 'pre_release_refused',
          businessOutcome: 'refused',
          result: { kind: 'refused', code: 'qualification_changed_before_release' },
        },
      },
    })
    expect(JSON.stringify(refused)).not.toContain('"execution":"runner_returned"')
  })
})
