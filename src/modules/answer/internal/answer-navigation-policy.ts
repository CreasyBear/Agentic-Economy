import type { KeylessExecutableToolDescriptor } from '@/modules/capability-execution'
import { operationDetailOutputSchema } from '@/modules/registry/operation-action-contracts'
import { isRecord } from '@/modules/common/is-record'
import {
  isAnswerOperationReadToolId,
  type AnswerToolCallRecord,
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
  return input.requestedIntents
    .slice(1)
    .every((intent) => matchedIntentIds.has(intent.intentId))
}

export function oneNativeBatchCoversRequestedIntents(
  rawInput: unknown,
  descriptor: KeylessExecutableToolDescriptor | undefined,
  requestedIntents: AnswerRequestInterpretation['requestedIntents'] | undefined,
): boolean {
  if (requestedIntents === undefined || requestedIntents.length <= 1) return true
  if (descriptor === undefined) return true
  if (!isRecord(rawInput) || !isRecord(rawInput.input)) {
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
      && continuation.surfaces?.includes('chat') === true,
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

const OPERATION_INSPECT_TOOL_IDS = [
  'registry.operations.search',
  'registry.operations.detail',
  'registry.operations.compare',
  'registry.operations.inspectPlan',
] as const

const OPERATION_REF_PATTERN = /^operation:v1:[0-9a-f]{64}$/

function isOperationInspectToolId(
  toolId: string,
): toolId is (typeof OPERATION_INSPECT_TOOL_IDS)[number] {
  return (OPERATION_INSPECT_TOOL_IDS as readonly string[]).includes(toolId)
}

function pushOperationRef(
  value: unknown,
  refs: string[],
  seen: Set<string>,
): void {
  if (!isRecord(value) || typeof value.operationRef !== 'string') return
  if (!OPERATION_REF_PATTERN.test(value.operationRef) || seen.has(value.operationRef)) {
    return
  }
  seen.add(value.operationRef)
  refs.push(value.operationRef)
}

/**
 * Candidate refs from search/compare/inspect-plan continue inspection.
 * They do not authenticate an executable identity; that requires
 * {@link completedOperationDetailResult} for the selected ordinal.
 */
export function inspectEvidenceHasOperationRef(
  toolCalls: readonly AnswerToolCallRecord[],
): boolean {
  const refs: string[] = []
  const seen = new Set<string>()
  for (const call of toolCalls) {
    if (call.status !== 'complete' || !isOperationInspectToolId(call.toolId)) {
      continue
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(call.resultJson)
    } catch {
      continue
    }
    if (!isRecord(parsed)) continue
    if (parsed.kind === 'found') {
      pushOperationRef(parsed.operation, refs, seen)
    }
    if (parsed.kind === 'ok') {
      if (Array.isArray(parsed.operations)) {
        for (const item of parsed.operations) pushOperationRef(item, refs, seen)
      }
      if (Array.isArray(parsed.items)) {
        for (const item of parsed.items) pushOperationRef(item, refs, seen)
      }
    }
  }
  return refs.length > 0
}

export function selectedOperationRefFromCompletedDetail(
  toolCalls: readonly AnswerToolCallRecord[],
): string | undefined {
  for (const call of toolCalls.toReversed()) {
    if (
      call.toolId !== 'registry.operations.detail'
      || call.status !== 'complete'
    ) {
      continue
    }
    let callInput: unknown
    try {
      callInput = JSON.parse(call.inputJson) as unknown
    } catch {
      continue
    }
    if (!isRecord(callInput) || typeof callInput.operationRef !== 'string') {
      continue
    }
    if (
      completedOperationDetailResult(toolCalls, callInput.operationRef)
      !== undefined
    ) {
      return callInput.operationRef
    }
  }
  return undefined
}

export type AnswerToolLoopStep = Readonly<{
  kind: 'inspect' | 'execute' | 'prose'
  activeToolIds: readonly string[]
  toolChoice: 'required' | 'auto' | 'none'
}>

export function nextToolLoopStep(input: {
  route: EffectiveAnswerAgentRoute | undefined
  toolCalls: readonly AnswerToolCallRecord[]
  navigationState: AnswerOperationNavigationState
  allowedToolIds: readonly string[]
  maxNavigationCalls: number
  maxEffectCalls: number
  unsafeOperationOutput: boolean
  toolExecutionError: boolean
  selectedOperationRef: string | undefined
}): AnswerToolLoopStep {
  const stop = (): AnswerToolLoopStep => ({
    kind: 'prose',
    activeToolIds: [],
    toolChoice: 'none',
  })
  if (
    input.unsafeOperationOutput
    || input.toolExecutionError
    || input.navigationState.effectCallAttempts > 0
    || answerNavigationBudgetExhausted({
      state: input.navigationState,
      maxNavigationCalls: input.maxNavigationCalls,
      maxEffectCalls: input.maxEffectCalls,
    })
  ) {
    return stop()
  }

  const inspectIds = input.allowedToolIds.filter(
    (toolId) => toolId !== 'operation.execute' && toolId !== 'operation.invoke',
  )
  const executeIds = input.allowedToolIds.filter(
    (toolId) => toolId === 'operation.execute' || toolId === 'operation.invoke',
  )
  if (inspectIds.length === 0 && executeIds.length === 0) return stop()

  const hasRef = inspectEvidenceHasOperationRef(input.toolCalls)
  const hasAuthenticatedIdentity =
    input.selectedOperationRef !== undefined
    && completedOperationDetailResult(
      input.toolCalls,
      input.selectedOperationRef,
    ) !== undefined
  const effectsPermitted = input.route?.effectAllowed !== false
  const hasCompletedOperationInspect = input.toolCalls.some(
    (call) =>
      call.status === 'complete' && isOperationInspectToolId(call.toolId),
  )
  const hasCompletedInspect = input.toolCalls.some(
    (call) => call.status === 'complete' && inspectIds.includes(call.toolId),
  )

  if (
    hasAuthenticatedIdentity
    && effectsPermitted
    && executeIds.length > 0
  ) {
    return {
      kind: 'execute',
      activeToolIds: [...inspectIds, ...executeIds],
      toolChoice: 'required',
    }
  }
  if (hasRef) {
    return {
      kind: 'inspect',
      activeToolIds: inspectIds,
      toolChoice:
        effectsPermitted && !hasAuthenticatedIdentity
          ? 'required'
          : hasCompletedInspect ? 'auto' : 'required',
    }
  }
  if (hasCompletedOperationInspect) return stop()
  return {
    kind: 'inspect',
    activeToolIds: [...inspectIds, ...executeIds],
    toolChoice: 'required',
  }
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
