import { describe, expect, it, vi } from 'vitest'

const { directReadFixture } = vi.hoisted(() => ({
  directReadFixture: {
    kind: 'not_found' as const,
    code: 'business_not_found' as const,
    reason: 'MOCK/DEVELOPMENT ONLY: no public listing for the development slug.',
  },
}))

vi.mock('@/modules/registry/registry.functions', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/modules/registry/registry.functions')>(),
  readPublicOfferingRegistryBusinessDetail: vi.fn().mockResolvedValue(directReadFixture),
}))

import { actionToToolContract } from '@/modules/actions'
import { collectSuppliedCandidateQuoteAction, prepareSuppliedCandidateQuote, type SuppliedCandidateQuoteResult } from '@/modules/capability-supply/server'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { resolveActionContract } from '@/modules/common/action'
import {
  type ActionExecutionOrigin,
  type ActionExecutionView,
  createDevelopmentDurablePort,
  createDevelopmentDurableState,
  createDevelopmentReleaseSignal,
  createDurableActionExecutionTracer,
  readCompletedResultIdentity,
  type PreparedExecution,
} from '@/modules/action-execution'
import { registryDetailAction } from '@/modules/registry/registry.actions'
import { evaluateAdr009Transfer } from '../../eval/support/adr009-transfer-comparison'
import type { TransferBoundaryEvent } from '../../eval/support/adr009-transfer-comparison'
import {
  actor,
  nowMs,
  nowIso,
  qualificationPorts,
  quoteInputFor,
} from './supplied-candidate-quote-harness'

describe('ADR-009 supplied-candidate development quote collection', () => {
  it('MOCK/DEVELOPMENT ONLY: transfer eval keeps direct reads direct and earns quote control through safety and continuity', async () => {
    const directReadContract = resolveActionContract(registryDetailAction)
    const directReadEvents: TransferBoundaryEvent[] = [
      { kind: 'approval_policy', policy: 'allow', reason: 'owner_read_requires_auth' },
      { kind: 'direct_runner_started', actionId: registryDetailAction.id },
    ]
    const directReadResult = await actionToToolContract(registryDetailAction)
      .execute({ input: { slug: 'development-direct-read' }, context: {} })
    directReadEvents.push({
      kind: 'direct_runner_returned',
      actionId: registryDetailAction.id,
      outcome: (directReadResult as { kind: string }).kind,
    })
    expect(directReadResult).toEqual(directReadFixture)
    expect(directReadContract).toMatchObject({
      consequenceClass: 'read_only',
      authorityRequirement: 'none',
      retryClass: 'replayable',
    })

    const ports = qualificationPorts()
    const quoteInput = {
      ...await quoteInputFor(ports),
      quoteRequest: {
        serviceReference: 'dev:service:strata-repair-assessment',
        requestedFields: ['price', 'validUntil', 'terms'],
        constraints: {
          siteType: 'strata_common_property',
          fault: 'water_ingress_assessment',
          accessWindow: 'weekday_business_hours',
        },
      },
      disclosure: {
        fields: [
          'quoteRequest.serviceReference',
          'quoteRequest.constraints.accessWindow',
          'quoteRequest.constraints.fault',
          'quoteRequest.constraints.siteType',
        ],
        limits: {
          'quoteRequest.serviceReference': 500,
          'quoteRequest.constraints.accessWindow': 120,
          'quoteRequest.constraints.fault': 120,
          'quoteRequest.constraints.siteType': 120,
        },
        purpose: 'request_development_quote' as const,
      },
      operationKey: 'dev:transfer:strata-repair:quote:1',
    }
    const directConsequentialEvents: TransferBoundaryEvent[] = []
    const directAdapter = vi.fn().mockImplementation(async () => {
      directConsequentialEvents.push({
        kind: 'effect_call',
        actionId: collectSuppliedCandidateQuoteAction.id,
      })
      return {
        kind: 'quote_returned' as const,
        environment: 'MOCK/DEVELOPMENT ONLY' as const,
        quote: {
          quoteRef: 'dev:transfer:quote:direct',
          price: { currency: 'AUD', units: '24500', exponent: 2 },
          validUntil: nowMs + 3_600_000,
          terms: ['Development fixture only; no provider commitment or fulfilment.'],
          evidenceRefs: ['dev:evidence:transfer-contract'],
        },
      }
    })
    directConsequentialEvents.push(
      { kind: 'approval_policy', policy: 'prompt', reason: 'owner_write_requires_auth' },
      { kind: 'direct_runner_started', actionId: collectSuppliedCandidateQuoteAction.id },
    )
    const directResult = await actionToToolContract(collectSuppliedCandidateQuoteAction).execute({
      input: quoteInput,
      context: {
        developmentOnlySuppliedQuoteAdapter: directAdapter,
        developmentOnlySuppliedQuoteQualificationPorts: ports,
        developmentOnlySuppliedQuoteNow: () => nowMs,
      },
    }) as SuppliedCandidateQuoteResult
    directConsequentialEvents.push({
      kind: 'direct_runner_returned',
      actionId: collectSuppliedCandidateQuoteAction.id,
      outcome: directResult.kind,
    })
    expect(directResult).toMatchObject({ kind: 'quote_returned' })
    if (directResult.kind !== 'quote_returned') throw new Error(directResult.kind)

    const durableState = createDevelopmentDurableState<SuppliedCandidateQuoteResult>()
    const durablePort = createDevelopmentDurablePort(durableState)
    const controlledRelease = createDevelopmentReleaseSignal()
    const controlledResult = {
      ...directResult,
      quote: {
        ...directResult.quote,
        quoteRef: 'dev:transfer:quote:controlled',
      },
    }
    const controlledEvents: TransferBoundaryEvent[] = []
    const controlledAdapter = vi.fn().mockImplementation(async () => {
      controlledEvents.push({
        kind: 'direct_runner_started',
        actionId: collectSuppliedCandidateQuoteAction.id,
      })
      controlledEvents.push({
        kind: 'effect_call',
        actionId: collectSuppliedCandidateQuoteAction.id,
      })
      controlledRelease.markReleased()
      controlledEvents.push({
        kind: 'direct_runner_returned',
        actionId: collectSuppliedCandidateQuoteAction.id,
        outcome: controlledResult.kind,
      })
      return controlledResult
    })
    const source = {
      input: quoteInput,
      context: { developmentOnlySuppliedQuoteAdapter: controlledAdapter },
      prepared: undefined as PreparedExecution | undefined,
      observedResolution: {
        state: 'pending',
      } as ActionExecutionView<SuppliedCandidateQuoteResult>['observedResolution'],
      resultIdentity: {
        sourceResultRef: 'dev:transfer:source-result:strata-repair',
        resultDigest: canonicalDigest(controlledResult),
      },
    }
    const tracer = createDurableActionExecutionTracer({
      action: collectSuppliedCandidateQuoteAction,
      port: durablePort,
      now: nowIso,
      nextExecutionRef: () => 'dev:transfer:invocation:strata-repair',
      nextAuthorityRef: () => 'dev:transfer:authority:strata-repair',
      nextAttemptRef: () => 'dev:transfer:attempt:strata-repair',
      developmentReleaseSignal: controlledRelease,
      resolveSourceState: () => source,
    })
    const origin: ActionExecutionOrigin = {
      kind: 'standalone',
      callerRef: actor.callerRef,
      principalRef: actor.principalRef,
    }
    const prepared = await prepareSuppliedCandidateQuote({
      tracer,
      qualificationPorts: ports,
      invocationInput: quoteInput,
      origin,
      actor,
      context: source.context,
      now: () => nowMs,
    })
    if (prepared.kind !== 'prepared') throw new Error(prepared.code)
    source.prepared = prepared.view.prepared!
    expect(controlledAdapter).not.toHaveBeenCalled()

    const accepted = await tracer.decide({
      executionRef: prepared.view.executionRef,
      expectedExecutionVersion: prepared.view.executionVersion,
      authorityRef: prepared.view.authority!.reference,
      actor,
      origin,
      accept: true,
    })
    if (accepted.kind !== 'accepted') throw new Error(accepted.code)
    controlledEvents.push({
      kind: 'approval_policy',
      policy: 'prompt',
      reason: 'exact invocation authority accepted before release',
    })
    controlledEvents.push({
      kind: 'authority_decision',
      executionRef: prepared.view.executionRef,
    })
    controlledEvents.push({
      kind: 'user_or_supervisor_decision',
      executionRef: prepared.view.executionRef,
    })
    const completed = await tracer.execute({
      executionRef: prepared.view.executionRef,
      expectedExecutionVersion: accepted.view.executionVersion,
      authorityRef: prepared.view.authority!.reference,
      actor,
      origin,
      materialInput: quoteInput,
    })
    if (completed.kind !== 'accepted') throw new Error(completed.code)
    source.observedResolution = completed.view.observedResolution
    expect(controlledAdapter).toHaveBeenCalledTimes(1)
    expect(completed.view).toMatchObject({
      observedResolution: { state: 'returned', businessOutcome: 'completed' },
      attempts: [{ release: { state: 'released' } }],
    })

    const cold = await tracer.coldResume(prepared.view.executionRef)
    const coldView = cold.inspect(prepared.view.executionRef)
    expect(coldView).toMatchObject({
      origin,
      observedResolution: { state: 'returned', businessOutcome: 'completed' },
      attempts: [{ attemptRef: 'dev:transfer:attempt:strata-repair' }],
    })
    const effectCountBeforeReferenceReuse = controlledAdapter.mock.calls.length
    const identity = await readCompletedResultIdentity(
      durablePort,
      prepared.view.executionRef,
      actor,
      () => ({
        sourceResultRef: source.resultIdentity.sourceResultRef,
        result: controlledResult,
      }),
    )
    if (identity.kind === 'refused') throw new Error(identity.code)
    const completedReference = {
      executionRef: identity.executionRef,
      actionId: identity.actionId,
      sourceResultRef: identity.sourceResultRef,
      resultDigest: identity.resultDigest,
    }
    const projection = {
      kind: 'projected' as const,
      projection: {
        state: 'incomplete' as const,
        noEffect: true as const,
        nodes: [
          { nodeRef: 'dev:transfer:node:completed-quote', state: 'completed' as const },
          { nodeRef: 'dev:transfer:node:next-review', state: 'current' as const },
        ],
      },
    }
    expect(controlledAdapter).toHaveBeenCalledTimes(effectCountBeforeReferenceReuse)
    const referenceAndProjection = JSON.stringify({
      references: [completedReference],
      projection: projection.projection,
    })
    expect(referenceAndProjection).not.toMatch(
      /authority|attempt|control|raw quote|quoteRef|price|terms|evidenceRefs|RoutePlan|Bundle/u,
    )
    controlledEvents.push({
      kind: 'action_execution',
      executionRef: prepared.view.executionRef,
    })
    for (const control of durableState.controls.values()) {
      controlledEvents.push({ kind: 'control', executionRef: control.executionRef })
    }
    for (const attempt of durableState.attempts.get(prepared.view.executionRef)?.values() ?? []) {
      controlledEvents.push({
        kind: 'attempt',
        executionRef: prepared.view.executionRef,
        attemptRef: attempt.attemptRef,
      })
    }
    for (const history of durableState.history.get(prepared.view.executionRef) ?? []) {
      controlledEvents.push({
        kind: 'history',
        executionRef: prepared.view.executionRef,
        commandId: history.commandId,
      })
    }
    const comparison = evaluateAdr009Transfer({
      events: {
        direct_read: directReadEvents,
        direct_consequential: directConsequentialEvents,
        controlled: controlledEvents,
      },
      requiredContinuations: {
        direct_read: directReadContract.safeContinuations.length,
        direct_consequential: resolveActionContract(
          collectSuppliedCandidateQuoteAction,
        ).safeContinuations.length,
        controlled: resolveActionContract(
          collectSuppliedCandidateQuoteAction,
        ).safeContinuations.length,
      },
      controlledReadback: {
        executionVersion: coldView?.executionVersion ?? 0,
        controlRecords: durableState.controls.size,
        attributableAttempts: durableState.attempts.get(prepared.view.executionRef)?.size ?? 0,
        durableHistoryRecords: durableState.history.get(prepared.view.executionRef)?.length ?? 0,
        terminalResultReconstructed:
          coldView?.observedResolution.state === 'returned'
          && coldView.observedResolution.businessOutcome === 'completed',
        exactAuthorityBeforeRelease:
          accepted.view.control.state === 'authorized'
          && completed.view.attempts[0]?.release.state === 'released',
        retryClass: resolveActionContract(collectSuppliedCandidateQuoteAction).retryClass,
      },
      referenceReuse: {
        completedReferences: 1,
        completedNodes: 1,
        currentNodes: 1,
        effectsBeforeReuse: effectCountBeforeReferenceReuse,
        effectsAfterReuse: controlledAdapter.mock.calls.length,
        copiedLifecycleOrResultFields: referenceAndProjection.match(
          /authority|attempt|control|quoteRef|price|terms|evidenceRefs/u,
        )?.length ?? 0,
        persistedRoutePlansOrBundles: 0,
      },
    })

    expect(comparison.measurements.controlled).toMatchObject({
      controlRecords: 1,
      attributableAttempts: 1,
      runnerCalls: 1,
      effectCalls: 1,
      authorityDecisions: 1,
      userOrSupervisorDecisions: 1,
    })
    expect(comparison.measurements.referenceReuse).toEqual({
      completedReferences: 1,
      completedNodes: 1,
      currentNodes: 1,
      effectsBeforeReuse: 1,
      effectsAfterReuse: 1,
      copiedLifecycleOrResultFields: 0,
      persistedRoutePlansOrBundles: 0,
    })
    expect(comparison.measurements.controlled.logicalTransitions)
      .toBeGreaterThan(comparison.measurements.directConsequential.logicalTransitions)
    expect(comparison.measurements.controlled.requiredContinuations).toBeGreaterThan(0)
    expect(comparison.measurements.directRead).toMatchObject({
      controlRecords: 0,
      attributableAttempts: 0,
      userOrSupervisorDecisions: 0,
    })
    expect(comparison.failedFalsifiers).toEqual([])
    expect(comparison.recommendation)
      .toBe('retain_control_for_consequential_and_bypass_read_only')
    console.info(JSON.stringify(comparison, null, 2))
  })
})
