import {
  buildAgentJsonUrl,
  buildCompactFollowUpProse,
  type AnswerSnapshot,
  type AnswerSource,
} from '@/modules/answer/public'
import { findAction } from '@/modules/actions'
import type { WebDiscoveryClaim } from '@/modules/storefront/public'
import { webDiscoverAction } from '@/modules/storefront/storefront.actions'
import type { HarnessModelRequestRecord } from '@/modules/harness/public'
import {
  activePlanFromStored,
  authorPlanEnvelope,
  derivePlanMetrics,
  evaluateGoalPredicate,
  MAX_ACTIONS_PER_TURN,
  MAX_MODEL_CALLS_PER_TURN,
  type ProposalModelResponse,
  persistEnginePlanEvent,
  persistEnginePlanRevision,
  readStoredEnginePlan,
  runProposalSegment,
  type PlanContract,
  type PlanEvent,
  type PlanFailureReason,
  type PlanStepStatus,
  type StoredEnginePlanWithEvents,
} from '@/modules/plan-proposal/public'

import type { AnswerToolCallRecord, AnswerToolId } from '../../answer-thread.schema'
import type { AnswerTurnResponsePlan } from '../answer-response-planner'
import { finalizeAnswerTurnSnapshot } from '../answer-turn-safety'
import { runAnswerToolCall } from '../tool-runner'
import { clarificationTurnPath } from './clarification'
import { retrievalFirstTurnPath } from './retrieval-first'
import {
  DEFAULT_TURN_PROVIDER_LIMIT,
  rejectBlockedSnapshot,
  withFollowUpLayout,
  type TurnPath,
  type TurnPathContext,
  type TurnPathResult,
} from './types'

type ActiveRuntimePlan = Readonly<{
  planId: string
  revision: number
  planDigest: string
  expiresAt: number
  contract: PlanContract
  stepStatuses: Record<string, PlanStepStatus>
}>
export const proposalTurnPath: TurnPath<[AnswerTurnResponsePlan, readonly AnswerToolCallRecord[]]> = {
  id: 'proposal',
  async run(ctx, fallbackPlan, seedToolCalls = []) {
    return await streamProposalTurn(ctx, fallbackPlan, seedToolCalls)
  },
}

async function streamProposalTurn(
  ctx: TurnPathContext,
  fallbackPlan: AnswerTurnResponsePlan,
  seedToolCalls: readonly AnswerToolCallRecord[],
): Promise<TurnPathResult | undefined> {
  const stored = await readStoredEnginePlan(ctx.threadId, ctx.sessionId)
  const events: PlanEvent[] = stored === null ? [] : [...stored.events]
  let active = activeRuntimePlan(stored)
  const toolCalls = [...seedToolCalls]
  const evidence: { stepId?: string; actionId: string; resultJson: string }[] = seedToolCalls.map(
    (call) => ({ actionId: call.toolId, resultJson: call.resultJson }),
  )
  const providers: AnswerSource[] = []
  const importedClaims: WebDiscoveryClaim[] = []
  const allowedSlugs = new Set<string>()
  const modelRequests: HarnessModelRequestRecord[] = []
  const consumedProposalIds = new Set<string>()
  let spentUsd = 0
  let actionsUsed = seedToolCalls.length
  let planRevisionUsed = false

  if (active !== undefined && active.expiresAt <= Date.now()) {
    const at = Date.now()
    const metrics = derivePlanMetrics(events)
    await appendEvent(ctx, events, {
      planId: active.planId,
      expectedRevision: active.revision,
      expectedPlanDigest: active.planDigest,
      kind: 'outcome_recorded',
      payloadJson: '{}',
      at,
      outcomeJson: JSON.stringify({ success: false, failureReason: 'expired', metrics, evaluatedAt: at }),
    })
    active = undefined
  }
  for (let segmentIndex = 0; segmentIndex < MAX_MODEL_CALLS_PER_TURN; segmentIndex += 1) {
    const segmentStartedAt = Date.now()
    ctx.workLog.emit({
      id: `plan.segment.${segmentIndex}`,
      phase: segmentIndex === 0 ? 'interpret' : 'compare',
      status: 'running',
      title: segmentIndex === 0 ? 'Understanding your ask' : 'Choosing the next plan step',
      summary: 'Checking the current plan, evidence, and safe registered actions.',
      startedAtMs: segmentStartedAt,
    })
    const result = await runProposalSegment({
      query: ctx.query,
      threadContext: JSON.stringify({
        priorTurns: ctx.priorTurnsCount,
        priorProviders: ctx.priorProviders.map(({ slug, name }) => ({ slug, name })),
      }),
      ...(active === undefined ? {} : {
        activePlan: { contract: active.contract, stepStatuses: active.stepStatuses },
      }),
      evidence,
      allowedSlugs: [...allowedSlugs],
      spentUsd,
      actionsUsed,
      planRevisionUsed,
      segmentIndex,
    })
    if (result.model !== undefined) {
      if (result.model.costUsd !== undefined) spentUsd += result.model.costUsd
      const record = modelRequestRecord(result.model, segmentIndex, result.kind === 'budget_exhausted'
        ? result.reason
        : undefined)
      modelRequests.push(record)
      ctx.harness.recordModelRequest(record)
      if (active !== undefined) {
        await appendEvent(ctx, events, {
          planId: active.planId,
          expectedRevision: active.revision,
          expectedPlanDigest: active.planDigest,
          kind: 'goal_evaluated',
          payloadJson: JSON.stringify({
            modelRequest: true,
            outcome: result.kind,
            ...(result.model.costUsd === undefined ? { costUnavailable: true } : {}),
          }),
          ...(result.model.costUsd === undefined ? {} : { costUsd: result.model.costUsd }),
          at: Date.now(),
        })
      }
    }
    ctx.workLog.emit({
      id: `plan.segment.${segmentIndex}`,
      phase: segmentIndex === 0 ? 'interpret' : 'compare',
      status: result.kind === 'proposal' ? 'complete' : 'error',
      title: segmentIndex === 0 ? 'Understanding your ask' : 'Choosing the next plan step',
      summary: result.kind === 'proposal' ? 'The next bounded proposal is ready.' : 'Using the best available evidence instead.',
      startedAtMs: segmentStartedAt,
      completedAtMs: Date.now(),
    })
    if (result.kind !== 'proposal') {
      return await finishWithDeterministicEvidence(
        ctx, fallbackPlan, active, events, toolCalls, providers, allowedSlugs, modelRequests,
        result.kind === 'budget_exhausted' ? 'limit_exceeded' : 'transport_failed',
      )
    }
    if (consumedProposalIds.has(result.proposal.proposalId)) {
      return await finishWithDeterministicEvidence(
        ctx, fallbackPlan, active, events, toolCalls, providers, allowedSlugs, modelRequests, 'transport_failed',
      )
    }
    consumedProposalIds.add(result.proposal.proposalId)

    if (result.proposal.kind === 'plan_revision') {
      const authoredAt = Date.now()
      const revisionOf = active?.revision
      const envelope = authorPlanEnvelope({
        planId: active?.planId ?? crypto.randomUUID(),
        threadId: ctx.threadId,
        revision: active === undefined ? 1 : active.revision + 1,
        ...(revisionOf === undefined ? {} : { revisionOf }),
        authoredAt,
        contract: result.proposal.plan,
      })
      const recorded = await persistEnginePlanRevision(envelope, {
        authoredAt,
        ...(result.model.costUsd === undefined ? {} : { costUsd: result.model.costUsd }),
        ...(ctx.sourceWriteRequest === undefined ? {} : { sourceWriteRequest: ctx.sourceWriteRequest }),
      })
      const stepStatuses = Object.fromEntries(
        envelope.contract.steps.map(({ id }) => [id, 'pending']),
      ) as Record<string, PlanStepStatus>
      active = {
        planId: envelope.planId,
        revision: envelope.revision,
        planDigest: envelope.planDigest,
        expiresAt: envelope.bounds.expiresAt,
        contract: envelope.contract,
        stepStatuses,
      }
      events.push({
        planId: envelope.planId,
        seq: recorded.seq,
        kind: envelope.revision === 1 ? 'plan_authored' : 'plan_revised',
        payloadJson: JSON.stringify({
          revision: envelope.revision,
          stepsTotal: envelope.contract.steps.length,
          planDigest: envelope.planDigest,
        }),
        ...(result.model.costUsd === undefined ? {} : { costUsd: result.model.costUsd }),
        at: authoredAt,
      })
      planRevisionUsed = true
      emitPlan(ctx, active)
      continue
    }

    if (active === undefined) {
      return await finishWithDeterministicEvidence(
        ctx, fallbackPlan, active, events, toolCalls, providers, allowedSlugs, modelRequests, 'transport_failed',
      )
    }

    if (result.proposal.kind === 'clarifying_question') {
      ctx.send({ type: 'clarifying-question', question: result.proposal.question })
      return await finishSnapshot(ctx, {
        query: ctx.query,
        oneLine: result.proposal.question,
        providers,
        summary: result.proposal.blockedOn.trim().length === 0
          ? 'One detail is needed before the plan can continue.'
          : result.proposal.blockedOn,
        nextStep: 'Reply with that detail and the same plan will continue.',
        agentJsonUrl: buildAgentJsonUrl(ctx.query, DEFAULT_TURN_PROVIDER_LIMIT),
      }, toolCalls, allowedSlugs, modelRequests, 'proposal')
    }

    if (result.proposal.kind === 'recommendation') {
      const evaluatedAt = Date.now()
      await appendEvent(ctx, events, {
        planId: active.planId,
        expectedRevision: active.revision,
        expectedPlanDigest: active.planDigest,
        kind: 'goal_evaluated',
        payloadJson: JSON.stringify({ recommendationDelivered: true }),
        at: evaluatedAt,
      })
      const metrics = derivePlanMetrics(events)
      const success = evaluateGoalPredicate(active.contract.goalPredicate, metrics)
      await appendEvent(ctx, events, {
        planId: active.planId,
        expectedRevision: active.revision,
        expectedPlanDigest: active.planDigest,
        kind: 'outcome_recorded',
        payloadJson: JSON.stringify({ recommendationDelivered: true }),
        at: evaluatedAt,
        outcomeJson: JSON.stringify({
          success,
          ...(success ? {} : { failureReason: 'predicate_unmet' as const }),
          metrics,
          evaluatedAt,
        }),
      })
      ctx.send({
        type: 'recommendation',
        summary: result.proposal.summary,
        ...(result.proposal.recommendedSlug === undefined ? {} : { recommendedSlug: result.proposal.recommendedSlug }),
        nextStep: result.proposal.nextStep,
      })
      return await finishSnapshot(ctx, {
        query: ctx.query,
        oneLine: result.proposal.summary.slice(0, 400),
        ...(importedClaims.length === 0 ? {} : { importedClaims }),
        providers,
        summary: result.proposal.summary,
        nextStep: result.proposal.nextStep,
        agentJsonUrl: buildAgentJsonUrl(ctx.query, DEFAULT_TURN_PROVIDER_LIMIT),
      }, toolCalls, allowedSlugs, modelRequests, 'proposal')
    }

    if (actionsUsed >= MAX_ACTIONS_PER_TURN) {
      return await finishWithDeterministicEvidence(
        ctx, fallbackPlan, active, events, toolCalls, providers, allowedSlugs, modelRequests, 'limit_exceeded',
      )
    }
    const nextAction = result.proposal.kind === 'next_action' ? result.proposal : undefined
    if (nextAction === undefined) {
      return await finishWithDeterministicEvidence(
        ctx, fallbackPlan, active, events, toolCalls, providers, allowedSlugs, modelRequests, 'transport_failed',
      )
    }
    const step = active.contract.steps.find(({ id }) => id === nextAction.stepId)
    if (step === undefined) {
      return await finishWithDeterministicEvidence(
        ctx, fallbackPlan, active, events, toolCalls, providers, allowedSlugs, modelRequests, 'transport_failed',
      )
    }
    if (active.expiresAt <= Date.now()) {
      const at = Date.now()
      const metrics = derivePlanMetrics(events)
      await appendEvent(ctx, events, {
        planId: active.planId,
        expectedRevision: active.revision,
        expectedPlanDigest: active.planDigest,
        kind: 'outcome_recorded',
        payloadJson: JSON.stringify({ expired: true }),
        at,
        outcomeJson: JSON.stringify({ success: false, failureReason: 'expired', metrics, evaluatedAt: at }),
      })
      return await finishWithDeterministicEvidence(
        ctx, fallbackPlan, active, events, toolCalls, providers, allowedSlugs, modelRequests, 'expired',
      )
    }

    const actionStartedAt = Date.now()
    const startedEvent = await appendEvent(ctx, events, {
      planId: active.planId,
      expectedRevision: active.revision,
      expectedPlanDigest: active.planDigest,
      kind: 'step_started',
      stepId: step.id,
      payloadJson: JSON.stringify({ actionId: step.actionId }),
      at: actionStartedAt,
    })
    if (startedEvent.kind === 'outcome_recorded') {
      active = undefined
      return await finishWithDeterministicEvidence(
        ctx, fallbackPlan, active, events, toolCalls, providers, allowedSlugs, modelRequests, 'expired',
      )
    }
    active.stepStatuses[step.id] = 'in_progress'
    emitPlan(ctx, active)
    ctx.workLog.emit({
      id: `plan.step.${step.id}`,
      phase: step.actionId.includes('search') ? 'search' : 'read',
      status: 'running',
      title: `Checking ${findAction(step.actionId)?.name ?? step.title}`,
      summary: step.title,
      startedAtMs: actionStartedAt,
    })

    const actionId = step.actionId as AnswerToolId
    const tool = await runAnswerToolCall({
      toolId: actionId,
      input: step.input,
      turnId: ctx.turnId,
      seq: toolCalls.length,
      harnessLoop: ctx.harness.loop,
    })
    actionsUsed += 1
    toolCalls.push(tool.record)
    evidence.push({ stepId: step.id, actionId, resultJson: tool.resultJson })
    ctx.timings.add(tool.timings, { phase: 'proposal_action', toolId: actionId })
    if (actionId === 'web.discover') {
      importedClaims.push(...readImportedClaims(tool.resultJson))
    }
    for (const provider of tool.providers) {
      if (!providers.some(({ slug }) => slug === provider.slug)) providers.push(provider)
    }
    for (const slug of tool.allowedSlugs) allowedSlugs.add(slug)

    const resultKind = readResultKind(tool.resultJson)
    const completed = stepSucceeded(step.successCriterion, tool.record.status, tool.resultJson, resultKind)
    await appendEvent(ctx, events, {
      planId: active.planId,
      expectedRevision: active.revision,
      expectedPlanDigest: active.planDigest,
      kind: completed ? 'step_completed' : 'step_failed',
      stepId: step.id,
      toolCallId: tool.record.toolCallId,
      payloadJson: JSON.stringify({ actionId: step.actionId, resultKind, resultHash: tool.record.resultHash }),
      at: Date.now(),
    })
    active.stepStatuses[step.id] = completed ? 'completed' : 'failed'
    emitPlan(ctx, active)
    ctx.workLog.emit({
      id: `plan.step.${step.id}`,
      phase: step.actionId.includes('search') ? 'search' : 'read',
      status: completed ? 'complete' : 'error',
      title: `Checking ${findAction(step.actionId)?.name ?? step.title}`,
      summary: completed ? 'The plan criterion was met.' : 'The result did not meet the plan criterion.',
      relatedProviderSlugs: tool.providers.map(({ slug }) => slug),
      startedAtMs: actionStartedAt,
      completedAtMs: Date.now(),
    })
  }

  return await finishWithDeterministicEvidence(
    ctx, fallbackPlan, active, events, toolCalls, providers, allowedSlugs, modelRequests, 'limit_exceeded',
  )
}

function activeRuntimePlan(stored: StoredEnginePlanWithEvents | null): ActiveRuntimePlan | undefined {
  if (stored === null || stored.plan.status !== 'active') return undefined
  const active = activePlanFromStored(stored)
  return {
    planId: stored.plan.planId,
    revision: stored.plan.revision,
    planDigest: stored.plan.planDigest,
    expiresAt: stored.plan.expiresAt,
    contract: active.contract,
    stepStatuses: active.stepStatuses,
  }
}

function emitPlan(ctx: TurnPathContext, active: ActiveRuntimePlan): void {
  ctx.send({
    type: 'plan-contract',
    planId: active.planId,
    revision: active.revision,
    goalText: active.contract.goalText,
    steps: active.contract.steps.map((step) => ({
      id: step.id,
      title: step.title,
      status: active.stepStatuses[step.id] ?? 'pending',
    })),
  })
}

async function appendEvent(
  ctx: TurnPathContext,
  events: PlanEvent[],
  input: Omit<Parameters<typeof persistEnginePlanEvent>[0], 'sourceWriteRequest'>,
): Promise<PlanEvent> {
  const recorded = await persistEnginePlanEvent({
    ...input,
    ...(ctx.sourceWriteRequest === undefined ? {} : { sourceWriteRequest: ctx.sourceWriteRequest }),
  })
  const event: PlanEvent = {
    planId: input.planId,
    ...(input.expectedRevision === undefined ? {} : { revision: input.expectedRevision }),
    seq: recorded.seq,
    kind: recorded.status === 'expired' ? 'outcome_recorded' : input.kind,
    ...(recorded.status === 'expired' || input.stepId === undefined ? {} : { stepId: input.stepId }),
    ...(input.toolCallId === undefined ? {} : { toolCallId: input.toolCallId }),
    payloadJson: recorded.status === 'expired' ? JSON.stringify({ expired: true }) : input.payloadJson,
    ...(input.costUsd === undefined ? {} : { costUsd: input.costUsd }),
    at: input.at,
  }
  events.push(event)
  return event
}

async function finishWithDeterministicEvidence(
  ctx: TurnPathContext,
  fallbackPlan: AnswerTurnResponsePlan,
  active: ActiveRuntimePlan | undefined,
  events: PlanEvent[],
  toolCalls: AnswerToolCallRecord[],
  providers: AnswerSource[],
  allowedSlugs: Set<string>,
  modelRequests: HarnessModelRequestRecord[],
  reason: PlanFailureReason,
): Promise<TurnPathResult | undefined> {
  const completedEmptySearch = toolCalls.some((call) => call.status === 'complete'
    && call.toolId === 'registry.search'
    && readResultCount(call.resultJson) === 0)
  const failureReason: PlanFailureReason = completedEmptySearch ? 'no_supply' : reason
  if (active !== undefined) {
    const evaluatedAt = Date.now()
    const metrics = derivePlanMetrics(events)
    await appendEvent(ctx, events, {
      planId: active.planId,
      expectedRevision: active.revision,
      expectedPlanDigest: active.planDigest,
      kind: 'outcome_recorded',
      payloadJson: '{}',
      at: evaluatedAt,
      outcomeJson: JSON.stringify({ success: false, failureReason, metrics, evaluatedAt }),
    })
  }

  if (toolCalls.length === 0) {
    if (fallbackPlan.mode === 'clarify') {
      return await clarificationTurnPath.run(ctx, fallbackPlan)
    }
    const retrieval = await retrievalFirstTurnPath.run(ctx, fallbackPlan)
    if (retrieval?.snapshot !== undefined || retrieval?.errorCopyId !== undefined) {
      return retrieval
    }
    const retrievalToolCalls = [...(retrieval?.toolCalls ?? [])]
    const emptySearch = retrievalToolCalls.some((call) => call.status === 'complete'
      && call.toolId === 'registry.search'
      && readResultCount(call.resultJson) === 0)
    return await finishSnapshot(ctx, {
      query: ctx.query,
      providers: [],
      oneLine: 'No exact listed match yet — continue nearby or carry this request forward.',
      summary: emptySearch
        ? `No listed businesses match this request yet. Portable brief: “${portableBrief(ctx.query)}”. Search a nearby area or review unlisted providers found online before contacting them.`
        : `The answer stopped safely before it had enough current evidence. Portable brief: “${portableBrief(ctx.query)}”. Search a nearby area or review unlisted providers found online before contacting them.`,
      nextStep: emptySearch
        ? 'Use the nearby-area search below, carry this brief to another provider, or review unlisted providers before contacting them.'
        : 'Use the nearby-area search below or carry this brief to another provider; review any unlisted provider before contacting them.',
      agentJsonUrl: buildAgentJsonUrl(ctx.query, DEFAULT_TURN_PROVIDER_LIMIT),
    }, retrievalToolCalls, retrieval?.allowedSlugs === undefined ? allowedSlugs : new Set(retrieval.allowedSlugs), modelRequests, 'proposal')
  }
  const importedClaims = completedEmptySearch
    ? readImportedClaimsFromToolCalls(toolCalls)
    : []
  const discoveredClaims = completedEmptySearch && importedClaims.length === 0
    ? await discoverImportedClaims(ctx)
    : importedClaims
  const prose = providers.length === 0
    ? {
        oneLine: 'No exact listed match yet — continue nearby or carry this request forward.',
        summary: completedEmptySearch
          ? `No listed businesses match this request yet. Portable brief: “${portableBrief(ctx.query)}”. Search a nearby area or review unlisted providers found online before contacting them.`
          : `The plan stopped safely before it had enough current evidence. Portable brief: “${portableBrief(ctx.query)}”. Search a nearby area or review unlisted providers found online before contacting them.`,
        nextStep: completedEmptySearch
          ? 'Use the nearby-area search below, carry this brief to another provider, or review unlisted providers before contacting them.'
          : 'Use the nearby-area search below or carry this brief to another provider; review any unlisted provider before contacting them.',
      }
    : buildCompactFollowUpProse({ displayQuery: ctx.query, providers })
  return await finishSnapshot(ctx, {
    query: ctx.query,
    providers,
    ...(discoveredClaims.length === 0 ? {} : { importedClaims: discoveredClaims }),
    oneLine: prose.oneLine,
    summary: prose.summary,
    nextStep: prose.nextStep,
    agentJsonUrl: buildAgentJsonUrl(ctx.query, DEFAULT_TURN_PROVIDER_LIMIT),
  }, toolCalls, allowedSlugs, modelRequests, 'proposal')
}

async function finishSnapshot(
  ctx: TurnPathContext,
  snapshot: AnswerSnapshot,
  toolCalls: AnswerToolCallRecord[],
  allowedSlugs: ReadonlySet<string>,
  modelRequests: HarnessModelRequestRecord[],
  path: 'proposal',
): Promise<TurnPathResult> {
  const laidOut = withFollowUpLayout(snapshot, ctx.priorTurnsCount, ctx.intent)
  const finalized = finalizeAnswerTurnSnapshot({ snapshot: laidOut, allowedSlugs })
  if (!finalized.ok) {
    return { ...rejectBlockedSnapshot(ctx, toolCalls, allowedSlugs, finalized), modelRequests }
  }
  const assembly = await ctx.emitOrDeferSnapshot(finalized.snapshot, path)
  return {
    snapshot: finalized.snapshot,
    toolCalls,
    modelRequests,
    allowedSlugs,
    errorCopyId: undefined,
    gate: finalized.gate,
    ...(assembly === undefined ? {} : { assembly }),
  }
}

function modelRequestRecord(
  model: ProposalModelResponse,
  seq: number,
  failureReason?: string,
): HarnessModelRequestRecord {
  const durationMs = Math.max(0, Math.round(model.latencyMs))
  const endedAt = Date.now()
  return {
    seq,
    provider: 'openrouter',
    model: model.modelId,
    status: failureReason === undefined ? 'ok' : 'error',
    startedAt: endedAt - durationMs,
    endedAt,
    durationMs,
    usage: {
      inputTokens: model.usage.inputTokens,
      outputTokens: model.usage.outputTokens,
      totalTokens: model.usage.inputTokens + model.usage.outputTokens,
    },
    ...(model.costUsd === undefined ? { costUnavailableReason: failureReason ?? 'provider_cost_unavailable' } : { costUsd: model.costUsd }),
    ...(failureReason === undefined ? {} : { errorCode: failureReason }),
  }
}

function readResultKind(resultJson: string): string | undefined {
  try {
    const value: unknown = JSON.parse(resultJson)
    return typeof value === 'object' && value !== null && 'kind' in value && typeof value.kind === 'string'
      ? value.kind
      : undefined
  } catch {
    return undefined
  }
}

function readImportedClaimsFromToolCalls(toolCalls: readonly AnswerToolCallRecord[]): WebDiscoveryClaim[] {
  return toolCalls.flatMap((call) => call.toolId === 'web.discover' ? readImportedClaims(call.resultJson) : [])
}

function readImportedClaims(resultJson: string): WebDiscoveryClaim[] {
  try {
    const value = JSON.parse(resultJson) as { kind?: unknown; claims?: unknown }
    if (value.kind !== 'found' || !Array.isArray(value.claims)) return []
    return value.claims as WebDiscoveryClaim[]
  } catch {
    return []
  }
}

function readResultCount(resultJson: string): number | undefined {
  try {
    const value = JSON.parse(resultJson) as { items?: unknown[]; pagination?: { total?: unknown } }
    if (typeof value.pagination?.total === 'number') return value.pagination.total
    return Array.isArray(value.items) ? value.items.length : undefined
  } catch {
    return undefined
  }
}

function stepSucceeded(
  criterion: PlanContract['steps'][number]['successCriterion'],
  status: AnswerToolCallRecord['status'],
  resultJson: string,
  resultKind: string | undefined,
): boolean {
  if (status !== 'complete') return false
  if (criterion.kind === 'action_completed') return true
  if (criterion.kind === 'result_kind') return resultKind === criterion.expected
  const count = readResultCount(resultJson)
  return (count ?? (resultKind === 'found' || resultKind === 'quoted' ? 1 : 0)) > 0
}
async function discoverImportedClaims(ctx: Pick<TurnPathContext, 'query' | 'workLog'>): Promise<readonly WebDiscoveryClaim[]> {
  const startedAt = Date.now()
  ctx.workLog.emit({
    id: 'search.web.discovery',
    phase: 'search',
    status: 'running',
    title: 'Checking the web for unlisted businesses',
    summary: 'AE has no listed match, so it is checking one web source for real local providers.',
    detailRows: [{ label: 'Search words', value: ctx.query }],
    startedAtMs: startedAt,
  })
  let result: Awaited<ReturnType<typeof webDiscoverAction.run>>
  try {
    result = await webDiscoverAction.run({
      data: webDiscoverAction.schema.parse({ query: ctx.query }),
      context: { caller: 'answerThread' },
    })
  } catch {
    ctx.workLog.emit({
      id: 'search.web.discovery',
      phase: 'search',
      status: 'error',
      title: 'Checking the web for unlisted businesses',
      summary: 'The web discovery check did not complete.',
      startedAtMs: startedAt,
      completedAtMs: Date.now(),
    })
    return []
  }
  const claims = result.kind === 'found' ? result.claims : []
  ctx.workLog.emit({
    id: 'search.web.discovery',
    phase: 'search',
    status: 'complete',
    title: 'Checking the web for unlisted businesses',
    summary: claims.length === 0
      ? 'No additional web businesses were found for this request.'
      : `${claims.length} real business${claims.length === 1 ? '' : 'es'} found on the web, separate from AE listings.`,
    detailRows: [{ label: 'Imported claims', value: String(claims.length) }],
    startedAtMs: startedAt,
    completedAtMs: Date.now(),
  })
  return claims
}

function portableBrief(query: string): string {
  const brief = query.trim().replace(/\s+/g, ' ')
  return brief.length <= 200 ? brief : `${brief.slice(0, 197)}…`
}
