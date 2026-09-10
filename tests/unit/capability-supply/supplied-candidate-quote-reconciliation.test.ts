import { describe, expect, it, vi } from 'vitest'

import { createDevelopmentEvidenceVerifier } from '../../../tools/dev/fixtures/capability-supply/development-evidence-fixture'
import {
  collectSuppliedCandidateQuoteAction,
  prepareSuppliedCandidateQuote,
  type SuppliedCandidateQuoteResult,
} from '@/modules/capability-supply/server'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  type ActionExecutionView,
  type ExecutionDecision,
  createDevelopmentDurablePort,
  createDevelopmentDurableState,
  createDevelopmentReleaseSignal,
  createDurableActionExecutionTracer,
  type PreparedExecution,
  type ReconciliationEvidenceMaterial,
} from '@/modules/action-execution/runtime'
import {
  actor,
  nowIso,
  nowMs,
  origins,
  qualificationPorts,
  quoteInputFor,
} from './supplied-candidate-quote-harness'

const attemptTransitionDigests = {
  request_owned: {
    execute_acquired: {
      priorDigest: 'sha256:5273af0409a63ba24d22b835c814677c43dd565451723eaac6fc032065867bea',
      nextDigest: 'sha256:cfa8d62119c2b46214e6ef914ca539028e16a981c18a9f98546f7d5c96f0f39d',
    },
    released: {
      priorDigest: 'sha256:cfa8d62119c2b46214e6ef914ca539028e16a981c18a9f98546f7d5c96f0f39d',
      nextDigest: 'sha256:c766c108ae4b7f360e832148fbaf4c13a24f4bc906d563d273b87dafdcd5570c',
    },
    not_released: {
      priorDigest: 'sha256:cfa8d62119c2b46214e6ef914ca539028e16a981c18a9f98546f7d5c96f0f39d',
      nextDigest: 'sha256:775b86ce8b70b6c0466b46bd0f235f8f717c007844d8a9a5ac7fcbb5ec7290e9',
    },
  },
  standalone: {
    execute_acquired: {
      priorDigest: 'sha256:35a2d0dfa3edd4bf89b0f7da18a8cdfe26ef88ef3608063b7577335fad3b120b',
      nextDigest: 'sha256:1d297211ccf957ab0c95a7229ef17e6c9d8a67aefab51aa6932ad9f03c9e3863',
    },
    released: {
      priorDigest: 'sha256:1d297211ccf957ab0c95a7229ef17e6c9d8a67aefab51aa6932ad9f03c9e3863',
      nextDigest: 'sha256:9e2bcad120afe8cb0278898cae91c62a20076683862058fc778759e436889e31',
    },
    not_released: {
      priorDigest: 'sha256:1d297211ccf957ab0c95a7229ef17e6c9d8a67aefab51aa6932ad9f03c9e3863',
      nextDigest: 'sha256:a3deda934bad1878992531988f87899ef9f0d37c3a76d8b312f4fe07d16d79f1',
    },
  },
} as const

describe('ADR-009 supplied-candidate development quote collection', () => {
  it.each(origins.flatMap((origin) => [
    { origin, resolution: 'released' as const },
    { origin, resolution: 'not_released' as const },
  ]))('durably reconstructs $resolution reconciliation for $origin.kind without quote data in neutral rows', async ({
    origin,
    resolution,
  }) => {
    const evidenceSource = createDevelopmentEvidenceVerifier()
    const ports = qualificationPorts()
    const quoteInput = await quoteInputFor(ports)
    const durableState = createDevelopmentDurableState<SuppliedCandidateQuoteResult>()
    const releaseSignal = createDevelopmentReleaseSignal()
    const adapter = vi.fn().mockImplementation(() => {
      releaseSignal.markReleased()
      throw new Error('development_response_lost_after_possible_release')
    })
    const source = {
      input: quoteInput,
      context: { developmentOnlySuppliedQuoteAdapter: adapter },
      prepared: undefined as PreparedExecution | undefined,
      observedResolution: { state: 'pending' } as ActionExecutionView<SuppliedCandidateQuoteResult>['observedResolution'],
    }
    const create = () => createDurableActionExecutionTracer({
      action: collectSuppliedCandidateQuoteAction,
      port: createDevelopmentDurablePort(durableState),
      now: nowIso,
      nextExecutionRef: () => `dev:durable-quote:${origin.kind}`,
      nextAuthorityRef: () => `dev:durable-authority:${origin.kind}`,
      nextAttemptRef: () => `dev:durable-attempt:${origin.kind}`,
      developmentReleaseSignal: releaseSignal,
      verifyReconciliationEvidence: evidenceSource.verify,
      resolveSourceState: () => source,
    })
    const firstProcess = create()
    const prepared = await prepareSuppliedCandidateQuote({
      tracer: firstProcess,
      qualificationPorts: ports,
      invocationInput: quoteInput,
      origin,
      actor,
      context: source.context,
      now: () => nowMs,
    })
    if (prepared.kind !== 'prepared') throw new Error(prepared.code)
    source.prepared = prepared.view.prepared!
    const accepted = await firstProcess.decide({
      executionRef: prepared.view.executionRef,
      expectedExecutionVersion: prepared.view.executionVersion,
      authorityRef: prepared.view.authority!.reference,
      actor, origin, accept: true,
    })
    if (accepted.kind !== 'accepted') throw new Error(accepted.code)
    const uncertain = await firstProcess.execute({
      executionRef: prepared.view.executionRef,
      expectedExecutionVersion: accepted.view.executionVersion,
      authorityRef: prepared.view.authority!.reference,
      actor, origin, materialInput: quoteInput,
    })
    expect(adapter).toHaveBeenCalledTimes(1)
    expect(uncertain).toMatchObject({
      kind: 'accepted',
      view: {
        control: { state: 'reconciliation_required' },
        attempts: [{ release: { state: 'possibly_released' } }],
      },
    })
    if (uncertain.kind !== 'accepted') throw new Error(uncertain.code)
    source.observedResolution = uncertain.view.observedResolution

    const freshProcess = await firstProcess.coldResume(uncertain.view.executionRef)
    expect(freshProcess.inspect(uncertain.view.executionRef)).toMatchObject({
      origin,
      control: { state: 'reconciliation_required' },
    })
    const reconciliationEvidence = evidenceSource.issue({
      kind: 'action_invocation_reconciliation',
      version: 1,
      evidenceRef: `mock:quote-evidence:${origin.kind}:${resolution}`,
      source: 'supply.collectDevelopmentQuote:provider-observer:v1',
      invocationRef: uncertain.view.executionRef,
      attemptRef: uncertain.view.attempts[0]!.attemptRef,
      effectGeneration: uncertain.view.attempts[0]!.effectGeneration,
      resolution,
      observedAt: nowIso(),
    })
    const unchangedBeforeMalformedEvidence = freshProcess.inspect(uncertain.view.executionRef)
    const malformedEvidence = { ...reconciliationEvidence }
    Reflect.set(malformedEvidence, 'kind', 'malformed')
    const forgedMaterial: ReconciliationEvidenceMaterial = {
      kind: reconciliationEvidence.kind,
      version: reconciliationEvidence.version,
      evidenceRef: `mock:forged:${origin.kind}:${resolution}`,
      source: reconciliationEvidence.source,
      invocationRef: reconciliationEvidence.invocationRef,
      attemptRef: reconciliationEvidence.attemptRef,
      effectGeneration: reconciliationEvidence.effectGeneration,
      resolution: reconciliationEvidence.resolution,
      observedAt: reconciliationEvidence.observedAt,
    }
    const forgedEvidence = {
      ...forgedMaterial,
      digest: canonicalDigest(forgedMaterial as never),
    }
    const refusedEvidence: ExecutionDecision<SuppliedCandidateQuoteResult>[] = []
    for (const evidence of [
      malformedEvidence,
      {
        ...reconciliationEvidence,
        digest: `sha256:${'0'.repeat(64)}`,
      },
      evidenceSource.issue({
        ...reconciliationEvidence,
        source: 'mock:wrong-provider-observer:v1',
      }),
      evidenceSource.issue({
        ...reconciliationEvidence,
        attemptRef: 'mock:cross-attempt',
      }),
      evidenceSource.issue({
        ...reconciliationEvidence,
        effectGeneration: reconciliationEvidence.effectGeneration + 1,
      }),
      evidenceSource.issue({
        ...reconciliationEvidence,
        observedAt: '2026-07-19T08:00:00.001Z',
      }),
      evidenceSource.issue({
        ...reconciliationEvidence,
        observedAt: '2026-07-19T07:59:59.999Z',
      }),
      forgedEvidence,
    ]) {
      refusedEvidence.push(await freshProcess.reconcile({
        executionRef: uncertain.view.executionRef,
        expectedExecutionVersion: uncertain.view.executionVersion,
        attemptRef: uncertain.view.attempts[0]!.attemptRef,
        actor,
        origin,
        evidence,
      }))
    }
    expect(refusedEvidence.map((decision: ExecutionDecision<SuppliedCandidateQuoteResult>) =>
      decision.kind === 'refused' ? decision.code : 'accepted'))
      .toEqual([
        'evidence_malformed',
        'evidence_digest_mismatch',
        'evidence_source_mismatch',
        'evidence_attempt_mismatch',
        'evidence_generation_stale',
        'evidence_time_invalid',
        'evidence_time_invalid',
        'evidence_source_unverified',
      ])
    expect(freshProcess.inspect(uncertain.view.executionRef)).toEqual(unchangedBeforeMalformedEvidence)

    const reconciled = await freshProcess.reconcile({
      executionRef: uncertain.view.executionRef,
      expectedExecutionVersion: uncertain.view.executionVersion,
      attemptRef: uncertain.view.attempts[0]!.attemptRef,
      actor,
      origin,
      evidence: reconciliationEvidence,
    })
    expect(reconciled).toMatchObject(resolution === 'released'
      ? {
          kind: 'accepted',
          view: {
            control: { state: 'terminal' },
            attempts: [{
              release: { state: 'released' },
              outcome: { state: 'reconciled_released', externalOutcome: 'unknown' },
            }],
          },
        }
      : {
          kind: 'accepted',
          view: {
            control: { state: 'retryable' },
            attempts: [{
              release: { state: 'not_released' },
              outcome: { state: 'reconciled_not_released', retry: 'safe_after_reconciliation' },
            }],
          },
        })
    if (reconciled.kind !== 'accepted') throw new Error(reconciled.code)
    expect(await freshProcess.reconcile({
      executionRef: uncertain.view.executionRef,
      expectedExecutionVersion: uncertain.view.executionVersion,
      attemptRef: uncertain.view.attempts[0]!.attemptRef,
      actor,
      origin,
      evidence: reconciliationEvidence,
    })).toMatchObject({ kind: 'accepted', view: { executionVersion: reconciled.view.executionVersion } })
    expect(await freshProcess.reconcile({
      executionRef: uncertain.view.executionRef,
      expectedExecutionVersion: uncertain.view.executionVersion,
      attemptRef: uncertain.view.attempts[0]!.attemptRef,
      actor,
      origin,
      evidence: evidenceSource.issue({
        ...reconciliationEvidence,
        resolution: resolution === 'released' ? 'not_released' : 'released',
      }),
    })).toMatchObject({ kind: 'refused', code: 'command_identity_conflict' })
    const coldAfterReconciliation = await firstProcess.coldResume(reconciled.view.executionRef)
    const coldView = coldAfterReconciliation.inspect(reconciled.view.executionRef)
    expect(coldView).toMatchObject({
      control: resolution === 'released' ? { state: 'terminal' } : { state: 'retryable' },
      attempts: [resolution === 'released'
        ? {
            release: { state: 'released' },
            outcome: { state: 'reconciled_released' },
          }
        : {
            release: { state: 'not_released' },
            outcome: { state: 'reconciled_not_released' },
          }],
    })
    expect(coldView?.control).toEqual(reconciled.view.control)
    expect(coldView?.attempts).toEqual(reconciled.view.attempts)
    expect(adapter).toHaveBeenCalledTimes(1)

    const port = createDevelopmentDurablePort(durableState)
    const persisted = JSON.stringify({
      control: await port.readControl(uncertain.view.executionRef),
      attempts: await port.readAttempts(uncertain.view.executionRef, 10),
      history: await port.readHistory(uncertain.view.executionRef, 0, 20),
    })
    const reconciliationHistoryRows = await port.readHistory(uncertain.view.executionRef, 0, 20)
    expect(reconciliationHistoryRows.find((row) => row.kind === 'execute_acquired')?.attemptTransition)
      .toMatchObject(attemptTransitionDigests[origin.kind].execute_acquired)
    expect(reconciliationHistoryRows.find((row) => row.kind === 'reconcile')?.attemptTransition)
      .toMatchObject(attemptTransitionDigests[origin.kind][resolution])
    expect(reconciliationHistoryRows).toContainEqual(
      expect.objectContaining({
        kind: 'reconcile',
        current: true,
        sourceEvidenceRef: reconciliationEvidence.evidenceRef,
        observation: expect.objectContaining({
          release: resolution,
          evidenceDigest: reconciliationEvidence.digest,
        }),
        attemptTransition: expect.objectContaining({
          attemptRef: uncertain.view.attempts[0]!.attemptRef,
          effectGeneration: uncertain.view.attempts[0]!.effectGeneration,
          priorReleaseState: 'possibly_released',
          nextReleaseState: resolution,
          priorOutcomeState: 'uncertain',
          nextOutcomeState: resolution === 'released'
            ? 'reconciled_released'
            : 'reconciled_not_released',
        }),
      }),
    )
    expect(persisted).not.toContain(quoteInput.quoteRequest.serviceReference)
    expect(persisted).not.toContain(quoteInput.quoteRequest.constraints.suburb)
    expect(persisted).not.toContain(quoteInput.disclosure.purpose)
    expect(persisted).not.toContain('dev:quote:0001')
    expect(persisted).toContain(quoteInput.operationKey)
    expect((await port.readControl(uncertain.view.executionRef))?.dataLimitSummary)
      .toEqual(quoteInput.disclosure.limits)
  })
})
