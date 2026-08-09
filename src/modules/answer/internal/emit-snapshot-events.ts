import type { AnswerArtifact } from '../answer-schema'
import {
  resolveLayoutProfile,
  type AnswerLayoutProfile,
} from './answer-layout-profile'
import { buildArtifactsFromSnapshot, getArtifactBudgetForSnapshot } from './snapshot-artifacts'
import type {
  AnswerEvent,
  AnswerPlanEvent,
  AnswerResponseMode,
  AnswerSnapshot,
} from '../answer-synthesizer'

type EmitSnapshotPlan = Pick<AnswerPlanEvent, 'mode' | 'providerBudget' | 'artifactBudget'>

type EmitSnapshotEventsOptions = {
  emitThinking?: boolean
  emitComplete?: boolean
  pauseMs?: number
  plan?: EmitSnapshotPlan
  responseMode?: AnswerResponseMode
}

const DEFAULT_PLAN_SEARCH_LIMIT = 3

const PROVIDER_CARD_LIMIT = 3

export async function* emitSnapshotEvents(
  snapshot: AnswerSnapshot,
  options: EmitSnapshotEventsOptions = {},
): AsyncIterable<AnswerEvent> {
  const emitThinking = options.emitThinking !== false
  const emitComplete = options.emitComplete !== false
  const pauseMs = options.pauseMs ?? 140
  const providerCount = snapshot.providers.length
  const layoutProfile = resolveLayoutProfile({
    ...(snapshot.layoutProfile === undefined ? {} : { layoutProfile: snapshot.layoutProfile }),
    ...(snapshot.compactLayout === true ? { compactLayout: true } : {}),
    providerCount,
  })
  const needsClarification = layoutProfile === 'clarification'
  const artifacts = buildArtifactsFromSnapshot(snapshot)

  yield buildPlanEventFromSnapshot(snapshot, {
    layoutProfile,
    ...(options.plan === undefined ? {} : { plan: options.plan }),
    ...(options.responseMode === undefined ? {} : { responseMode: options.responseMode }),
  })

  if (emitThinking) {
    yield { type: 'thinking', step: 'write', label: 'Putting together the answer…' }
  }

  yield { type: 'one-line', oneLine: snapshot.oneLine }
  await progressivePause(pauseMs)

  if (emitThinking) {
    yield {
      type: 'thinking',
      step: 'read',
      label: providerCount > 0 ? 'Reading the details…' : 'Checking whether we need more detail…',
    }
  }
  yield { type: 'sources', providers: snapshot.providers }
  await progressivePause(pauseMs)

  for (const artifact of artifacts) {
    if (artifact.kind !== 'selected-provider') {
      continue
    }
    yield { type: 'artifact', artifact }
    await progressivePause(pauseMs)
  }

  if (emitThinking) {
    yield {
      type: 'thinking',
      step: 'write',
      label: needsClarification ? 'Choosing what to ask next…' : 'Choosing the next step…',
    }
  }
  yield { type: 'next-step', nextStep: snapshot.nextStep }
  await progressivePause(pauseMs)
  for (const delta of snapshot.summary
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0)) {
    yield { type: 'summary-delta', delta }
    await progressivePause(pauseMs)
  }

  for (const artifact of artifacts) {
    if (isBaseStreamArtifact(artifact)) {
      continue
    }
    yield { type: 'artifact', artifact }
    await progressivePause(pauseMs)
  }

  if (emitComplete) {
    yield { type: 'complete', answer: snapshot }
  }
}

function isBaseStreamArtifact(artifact: AnswerArtifact): boolean {
  return (
    artifact.kind === 'one-line' ||
    artifact.kind === 'selected-provider' ||
    artifact.kind === 'provider-cards' ||
    artifact.kind === 'prose' ||
    artifact.kind === 'what-to-do-now'
  )
}

function buildPlanEventFromSnapshot(
  snapshot: AnswerSnapshot,
  input: {
    layoutProfile: AnswerLayoutProfile
    plan?: EmitSnapshotPlan
    responseMode?: AnswerResponseMode
  },
): AnswerPlanEvent {
  const mode = input.layoutProfile === 'data_answer'
    ? 'answer'
    : input.plan?.mode ?? input.responseMode ?? deriveResponseMode(input.layoutProfile, snapshot.providers.length)
  const artifactBudget = input.plan?.artifactBudget === undefined
    ? getArtifactBudgetForSnapshot({ ...snapshot, layoutProfile: input.layoutProfile })
    : getArtifactBudgetForSnapshot(
        { ...snapshot, layoutProfile: input.layoutProfile },
        { ...input.plan.artifactBudget, layoutProfile: input.layoutProfile },
      )
  return {
    type: 'plan',
    mode,
    layoutProfile: input.layoutProfile,
    providerBudget: input.plan?.providerBudget ?? buildProviderBudget(mode, snapshot.providers.length),
    artifactBudget,
  }
}

function deriveResponseMode(layoutProfile: AnswerLayoutProfile, providerCount: number): AnswerResponseMode {
  if (layoutProfile === 'clarification') {
    return 'clarify'
  }
  if (layoutProfile === 'boundary_explain' || layoutProfile === 'safety_refusal') {
    return 'boundary'
  }
  if (layoutProfile === 'compare_pair') {
    return 'compare'
  }
  if (layoutProfile === 'data_answer') {
    return 'answer'
  }
  if (layoutProfile === 'empty_state' || providerCount === 0) {
    return 'empty'
  }
  return 'answer'
}

function buildProviderBudget(
  mode: AnswerResponseMode,
  providerCount: number,
): AnswerPlanEvent['providerBudget'] {
  switch (mode) {
    case 'clarify':
    case 'boundary':
    case 'unsupported':
    case 'error':
      return { searchLimit: 0, visibleLimit: 0 }
    case 'empty':
      return { searchLimit: DEFAULT_PLAN_SEARCH_LIMIT, visibleLimit: 0 }
    case 'compare':
      return { searchLimit: 0, visibleLimit: Math.min(providerCount, 2) }
    case 'filter':
      return { searchLimit: 0, visibleLimit: Math.min(providerCount, PROVIDER_CARD_LIMIT) }
    case 'answer':
      return {
        searchLimit: Math.max(providerCount, DEFAULT_PLAN_SEARCH_LIMIT),
        visibleLimit: Math.min(providerCount, PROVIDER_CARD_LIMIT),
      }
  }
}

function progressivePause(pauseMs: number): Promise<void> {
  if (pauseMs <= 0 || process.env.NODE_ENV === 'test') {
    return Promise.resolve()
  }

  const { promise, resolve } = Promise.withResolvers<void>()
  setTimeout(resolve, pauseMs)
  return promise
}

export type { AnswerArtifact }
