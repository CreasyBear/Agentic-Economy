import type { KeylessExecutableToolDescriptor } from '@/modules/capability-execution'
import { operationDetailOutputSchema } from '@/modules/registry/operation-action-contracts'
import { isRecord } from '@/modules/common/is-record'
import {
  isAnswerOperationReadToolId,
  type AnswerToolCallRecord,
  type AnswerToolId,
} from '@/modules/answer-thread/tooling'

import type {
  AnswerOperationCandidate,
  AnswerRequestInterpretation,
  EffectiveAnswerAgentRoute,
} from '../answer-schema'

export type AnswerOperationEffectToolId =
  | 'operation.execute'
  | 'operation.invoke'

function normalizedRequestedResult(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const normalized = value.trim().toLocaleLowerCase('en-US')
    return normalized.length === 0 ? undefined : normalized
  }
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (typeof value === 'boolean') return String(value)
  return undefined
}

const NATIVE_MODIFIER_STOP_WORDS = new Set([
  'and',
  'current',
  'for',
  'from',
  'include',
  'including',
  'into',
  'the',
  'this',
  'that',
  'whether',
  'with',
])

function nativeModifierTerms(value: string): Set<string> {
  return new Set(
    value
      .toLocaleLowerCase('en-US')
      .replace(/[_-]/gu, ' ')
      .match(/[\p{L}\p{N}]+/gu)
      ?.filter(
        (term) =>
          (term.length >= 3 || /^\d+$/u.test(term))
          && !NATIVE_MODIFIER_STOP_WORDS.has(term),
      ) ?? [],
  )
}

function activeOptionalModifierCoversIntents(input: {
  operationInput: Readonly<Record<string, unknown>>
  properties: Readonly<Record<string, unknown>>
  required: ReadonlySet<string>
  requestedIntents: NonNullable<AnswerRequestInterpretation['requestedIntents']>
}): boolean {
  const matchedIntentIds = new Set<string>()
  for (const [name, property] of Object.entries(input.properties)) {
    if (input.required.has(name) || !isRecord(property)) continue
    const value = input.operationInput[name]
    if (
      value === undefined
      || value === null
      || value === false
      || value === ''
    ) {
      continue
    }
    const description =
      typeof property.description === 'string' ? property.description : ''
    const modifierTerms = nativeModifierTerms(`${name} ${description}`)
    if (modifierTerms.size === 0) continue
    for (const intent of input.requestedIntents) {
      const intentTerms = nativeModifierTerms(
        `${intent.phrase} ${intent.requestedResult}`,
      )
      const overlap = [...intentTerms].filter((term) =>
        modifierTerms.has(term))
      if (overlap.length >= 2) matchedIntentIds.add(intent.intentId)
    }
  }
  // One intent names the operation's primary result. Every additional intent
  // must be covered by an explicitly supplied optional schema field.
  return matchedIntentIds.size >= input.requestedIntents.length - 1
}

export function oneNativeBatchCoversRequestedIntents(
  rawInput: unknown,
  descriptor: KeylessExecutableToolDescriptor | undefined,
  requestedIntents: AnswerRequestInterpretation['requestedIntents'] | undefined,
): boolean {
  if (requestedIntents === undefined || requestedIntents.length <= 1) return true
  if (descriptor === undefined || !isRecord(rawInput) || !isRecord(rawInput.input)) {
    return false
  }
  const operationInput = rawInput.input
  const properties = isRecord(descriptor.inputSchema.properties)
    ? descriptor.inputSchema.properties
    : {}
  const requested = requestedIntents.map((intent) =>
    normalizedRequestedResult(intent.requestedResult))
  if (requested.some((value) => value === undefined)) return false

  const nativeArrayCoversEveryIntent = Object.entries(properties).some(([name, property]) => {
    if (!isRecord(property)) return false
    const declaredType = property.type
    const isArray =
      declaredType === 'array'
      || Array.isArray(declaredType) && declaredType.includes('array')
    const values = operationInput[name]
    if (!isArray || !Array.isArray(values)) return false
    const available = new Set(
      values.flatMap((value) => {
        if (isRecord(value)) {
          return Object.values(value)
            .map(normalizedRequestedResult)
            .filter((item): item is string => item !== undefined)
        }
        const normalized = normalizedRequestedResult(value)
        return normalized === undefined ? [] : [normalized]
      }),
    )
    return requested.every(
      (value) => value !== undefined && available.has(value),
    )
  })
  if (nativeArrayCoversEveryIntent) return true

  const required = new Set(
    Array.isArray(descriptor.inputSchema.required)
      ? descriptor.inputSchema.required.filter(
          (name): name is string => typeof name === 'string',
        )
      : [],
  )
  return activeOptionalModifierCoversIntents({
    operationInput,
    properties,
    required,
    requestedIntents,
  })
}

export function selectedCandidateAdvertisesAnswerThreadEffect(
  candidate: AnswerOperationCandidate | undefined,
  operationRef: string | undefined,
  effectToolId: AnswerOperationEffectToolId,
): boolean {
  if (
    candidate === undefined
    || operationRef === undefined
    || candidate.operationRef !== operationRef
  ) {
    return false
  }
  const relation =
    effectToolId === 'operation.execute' ? 'execute' : 'invoke'
  return candidate.navigation.some(
    (continuation) =>
      continuation.relation === relation
      && continuation.actionId === effectToolId
      && continuation.surfaces?.includes('answerThread') === true,
  )
}

export function answerRouteForbidsTool(
  route: EffectiveAnswerAgentRoute | undefined,
  toolId: string,
): boolean {
  const isEffectTool =
    toolId === 'operation.execute' || toolId === 'operation.invoke'
  return (
    route?.allowedReadToolFamily === 'operation'
    && (toolId === 'registry.search' || toolId === 'registry.detail')
  ) || (
    route?.allowedReadToolFamily === 'business'
    && isAnswerOperationReadToolId(toolId)
  ) || (
    route?.effectAllowed === false
    && isEffectTool
  )
}

export function shouldRunStagedAnswerNavigation(input: {
  route: EffectiveAnswerAgentRoute | undefined
  hasSelectedOperation: boolean
  hasKeylessDataAsk: boolean
  resumeNavigation: boolean
  hasExplicitSelection: boolean
  resumedHasEffectSelection: boolean
}): boolean {
  return (
    (
      (input.route?.lane === 'operation' && !input.hasSelectedOperation)
      || !input.hasKeylessDataAsk
      || input.resumeNavigation
    )
    && !input.hasExplicitSelection
    && !input.resumedHasEffectSelection
  )
}

export type AnswerOperationNavigationState = Readonly<{
  navigationReadCallAttempts: number
  effectCallAttempts: number
  effectUnlocked: boolean
}>

export function initialAnswerOperationNavigationState(input: {
  toolCalls: readonly AnswerToolCallRecord[]
  effectUnlocked: boolean
}): AnswerOperationNavigationState {
  const navigationReadCallAttempts = input.toolCalls.filter(
    (call) =>
      call.toolId !== 'operation.execute'
      && call.toolId !== 'operation.invoke',
  ).length
  return {
    navigationReadCallAttempts,
    effectCallAttempts:
      input.toolCalls.length - navigationReadCallAttempts,
    effectUnlocked: input.effectUnlocked,
  }
}

export type AnswerOperationNavigationEvent =
  | Readonly<{ kind: 'tool_attempted'; effect: boolean }>
  | Readonly<{ kind: 'effect_unlocked' }>

export function reduceAnswerOperationNavigation(
  state: AnswerOperationNavigationState,
  event: AnswerOperationNavigationEvent,
): AnswerOperationNavigationState {
  switch (event.kind) {
    case 'tool_attempted':
      return event.effect
        ? { ...state, effectCallAttempts: state.effectCallAttempts + 1 }
        : {
            ...state,
            navigationReadCallAttempts:
              state.navigationReadCallAttempts + 1,
          }
    case 'effect_unlocked':
      return state.effectUnlocked ? state : { ...state, effectUnlocked: true }
    default: {
      const _exhaustive: never = event
      return _exhaustive
    }
  }
}

export function answerNavigationBudgetExceeded(input: {
  state: AnswerOperationNavigationState
  effect: boolean
  maxNavigationCalls: number
  maxEffectCalls: number
}): boolean {
  return input.effect
    ? input.state.effectCallAttempts >= input.maxEffectCalls
    : input.state.navigationReadCallAttempts >= input.maxNavigationCalls
}

export function answerNavigationBudgetExhausted(input: {
  state: AnswerOperationNavigationState
  maxNavigationCalls: number
  maxEffectCalls: number
}): boolean {
  return (
    input.state.navigationReadCallAttempts >= input.maxNavigationCalls
    || input.state.effectCallAttempts >= input.maxEffectCalls
  )
}

export function completedOperationDetailResult(
  toolCalls: readonly AnswerToolCallRecord[],
  operationRef: string,
): unknown | undefined {
  for (const call of toolCalls.toReversed()) {
    if (
      call.toolId !== 'registry.operations.detail'
      || call.status !== 'complete'
    ) {
      continue
    }
    try {
      const callInput = JSON.parse(call.inputJson) as unknown
      const result = operationDetailOutputSchema.safeParse(
        JSON.parse(call.resultJson) as unknown,
      )
      if (
        isRecord(callInput)
        && callInput.operationRef === operationRef
        && result.success
        && result.data.kind === 'found'
        && result.data.operation.operationRef === operationRef
      ) {
        return result.data
      }
    } catch {
      continue
    }
  }
  return undefined
}

export type AnswerNavigationStepPolicy = Readonly<{
  readBudgetAvailable: boolean
  forcedToolId?: Extract<
    AnswerToolId,
    'registry.operations.search' | 'registry.operations.detail'
  >
  requireAnyRead: boolean
  detailedCandidate?: AnswerOperationCandidate
}>

export function answerNavigationStepPolicy(input: {
  route: EffectiveAnswerAgentRoute | undefined
  toolCalls: readonly AnswerToolCallRecord[]
  candidates: readonly AnswerOperationCandidate[]
  navigationReadCallAttempts: number
  maxToolCalls: number
}): AnswerNavigationStepPolicy {
  const operationSearchCompleted = input.toolCalls.some(
    (call) =>
      call.toolId === 'registry.operations.search'
      && call.status === 'complete',
  )
  const detailedCandidate = input.candidates.find(
    ({ operationRef }) =>
      completedOperationDetailResult(input.toolCalls, operationRef) !==
      undefined,
  )
  const readBudgetAvailable =
    input.navigationReadCallAttempts < input.maxToolCalls
  const forcedToolId =
    readBudgetAvailable
    && input.route?.allowedReadToolFamily === 'operation'
    && !operationSearchCompleted
      ? 'registry.operations.search'
      : readBudgetAvailable
          && input.candidates.length > 0
          && detailedCandidate === undefined
        ? 'registry.operations.detail'
        : undefined

  return {
    readBudgetAvailable,
    ...(forcedToolId === undefined ? {} : { forcedToolId }),
    requireAnyRead:
      readBudgetAvailable
      && input.route?.allowedReadToolFamily !== 'operation'
      && input.candidates.length === 0,
    ...(detailedCandidate === undefined ? {} : { detailedCandidate }),
  }
}
