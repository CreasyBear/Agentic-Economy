import { providerSafeActionToolName } from '@/modules/actions/tool-contract'
import { isRecord } from '@/modules/common/is-record'
import { isPublicOperationRef } from '@/modules/capability-supply/public'
import type {
  PublicOperationAuthentication,
  PublicOperationAvailability,
  PublicOperationPrice,
} from '@/modules/capability-supply/public'
import {
  formatOperationAuthentication,
  formatOperationPrice,
  formatOperationReadiness,
} from '@/modules/market/operation-view-model'
import { readExactAmount } from '@/modules/money/public'

export const CHAT_TOOL_IDS = [
  'registry.operations.search',
  'registry.operations.detail',
  'registry.operations.compare',
  'registry.operations.inspectPlan',
  'operation.execute',
] as const

export type ChatToolId = (typeof CHAT_TOOL_IDS)[number]

const canonicalToProvider = Object.freeze(Object.fromEntries(
  CHAT_TOOL_IDS.map((toolId) => [toolId, providerSafeActionToolName(toolId)]),
)) as Readonly<Record<ChatToolId, string>>

const providerToCanonical = Object.freeze(Object.fromEntries(
  CHAT_TOOL_IDS.map((toolId) => [canonicalToProvider[toolId], toolId]),
)) as Readonly<Record<string, ChatToolId>>

export const CHAT_TOOL_NAME_MAP = Object.freeze({
  canonicalToProvider,
  providerToCanonical,
})

export const CHAT_TOOL_TITLES: Readonly<Record<ChatToolId, string>> = {
  'registry.operations.search': 'Search tools',
  'registry.operations.detail': 'Tool details',
  'registry.operations.compare': 'Compare tools',
  'registry.operations.inspectPlan': 'Inspect before a call',
  'operation.execute': 'Call',
}

export type OperationChoiceRow = Readonly<{
  operationRef: string
  title: string
  supplier?: string
  price?: string
  readiness?: string
  access?: string
}>

export type OperationFact = Readonly<{
  label: string
  value: string
}>

type CardChrome = Readonly<{
  toolId: ChatToolId
  title: string
}>

export type OperationCardProjection =
  | (CardChrome & { kind: 'working' })
  | (CardChrome & { kind: 'status'; state: 'refused' | 'error'; summary: string })
  | (CardChrome & {
      kind: 'choices'
      state: 'complete'
      choices: readonly OperationChoiceRow[]
      operationRefs: readonly string[]
      count?: number
      contrasts?: readonly OperationFact[]
    })
  | (CardChrome & {
      kind: 'inspect'
      state: 'complete'
      facts: readonly OperationFact[]
      operationRefs: readonly string[]
    })
  | (CardChrome & {
      kind: 'execute'
      state: 'complete'
      operationRefs: readonly string[]
      name?: string
    })

const REFUSAL_SUMMARIES: Readonly<Record<string, string>> = {
  source_unavailable: 'Source unavailable',
  source_capacity_exceeded: 'Source capacity exceeded',
  setup_required: 'Setup required',
  temporarily_unavailable: 'Temporarily unavailable',
  readiness_expired: 'Readiness expired',
  publisher_withdrew: 'Publisher withdrew the listing',
  under_review: 'Under review',
  updated_terms_require_review: 'Updated terms require review',
  not_supported_by_ae: 'Not supported',
  operation_not_found: 'Not found',
  operation_unavailable: 'Unavailable',
  mapping_unavailable: 'Mapping unavailable',
  mapping_incompatible: 'Mapping incompatible',
  mapping_cycle: 'Mapping cycle detected',
  operation_not_keyless: 'Requires credentials',
  operation_not_executable: 'Cannot run here',
  input_invalid: 'Input was refused',
  endpoint_invalid: 'Endpoint was refused',
  source_output_invalid: 'Source response was refused',
  result_too_large: 'Result was too large',
  tool_limit: 'Tool limit reached',
  execute_limit: 'Execution limit reached',
}

const FACT = {
  maxCost: 'Maximum cost',
  effects: 'Effects',
  dataUse: 'Data use',
  requiresPreparation: 'Requires preparation',
  price: 'Price',
  readiness: 'Readiness',
} as const

const EFFECT_LABEL = {
  data_release: 'Data release',
  financial_exposure: 'Financial exposure',
  external_state_change: 'External state change',
} as const

const DATA_USE_LABEL = {
  public: 'Public',
  personal: 'Personal',
  sensitive: 'Sensitive',
  credential: 'Credential',
} as const

const COMPARE_FIELDS = ['price', 'effects', 'dataUse', 'availability'] as const

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0
    ? Array.from(value.trim()).slice(0, 120).join('')
    : undefined
}

function addRef(refs: string[], value: unknown): void {
  if (refs.length >= 4 || !isPublicOperationRef(value) || refs.includes(value)) return
  refs.push(value)
}

function readPrice(value: unknown): PublicOperationPrice | undefined {
  if (!isRecord(value) || typeof value.kind !== 'string') return undefined
  if (value.kind === 'on_request') return { kind: 'on_request' }
  if (value.kind === 'fixed') {
    const amount = readExactAmount(value.amount)
    return amount === undefined ? undefined : { kind: 'fixed', amount }
  }
  if (value.kind === 'range') {
    const minimum = readExactAmount(value.minimum)
    const maximum = readExactAmount(value.maximum)
    return minimum === undefined || maximum === undefined
      ? undefined
      : { kind: 'range', minimum, maximum }
  }
  return undefined
}

function readAuthentication(value: unknown): PublicOperationAuthentication | undefined {
  if (!isRecord(value) || typeof value.kind !== 'string') return undefined
  if (value.kind === 'keyless') return { kind: 'keyless' }
  if (value.kind === 'x402') return { kind: 'x402' }
  if (value.kind === 'unknown') return { kind: 'unknown' }
  if (value.kind !== 'platform_credential') return undefined
  if (value.scheme === 'bearer') return { kind: 'platform_credential', scheme: 'bearer' }
  if (value.scheme === 'api_key' && (value.in === 'query' || value.in === 'header') && typeof value.name === 'string') {
    return { kind: 'platform_credential', scheme: 'api_key', in: value.in, name: value.name }
  }
  return undefined
}

function readPosture(value: unknown): PublicOperationAvailability['posture'] | undefined {
  if (!isRecord(value) || typeof value.posture !== 'string') return undefined
  if (value.posture === 'routeable' || value.posture === 'integrated' || value.posture === 'unavailable') {
    return value.posture
  }
  return undefined
}

function rowFromChoiceFields(value: unknown): OperationChoiceRow | null {
  if (!isRecord(value)) return null
  const refs: string[] = []
  addRef(refs, value.operationRef)
  const operationRef = refs[0]
  const title = stringField(value.title)
  if (operationRef === undefined || title === undefined) return null
  const supplier = isRecord(value.supplier) ? stringField(value.supplier.name) : undefined
  const price = readPrice(value.price)
  const posture = readPosture(value.availability)
  const authentication = readAuthentication(value.authentication)
  return {
    operationRef,
    title,
    ...(supplier === undefined ? {} : { supplier }),
    ...(price === undefined ? {} : { price: formatOperationPrice(price) }),
    ...(posture === undefined ? {} : { readiness: formatOperationReadiness(posture) }),
    ...(authentication === undefined ? {} : { access: formatOperationAuthentication(authentication) }),
  }
}

function rowFromDescriptorFields(value: unknown): OperationChoiceRow | null {
  if (!isRecord(value)) return null
  const refs: string[] = []
  addRef(refs, value.operationRef)
  const operationRef = refs[0]
  const title = isRecord(value.offering) ? stringField(value.offering.label) : undefined
  if (operationRef === undefined || title === undefined) return null
  const supplier = isRecord(value.business) ? stringField(value.business.name) : undefined
  const price = isRecord(value.commercial) ? readPrice(value.commercial.price) : undefined
  const posture = readPosture(value.availability)
  const authentication = readAuthentication(value.authentication)
  return {
    operationRef,
    title,
    ...(supplier === undefined ? {} : { supplier }),
    ...(price === undefined ? {} : { price: formatOperationPrice(price) }),
    ...(posture === undefined ? {} : { readiness: formatOperationReadiness(posture) }),
    ...(authentication === undefined ? {} : { access: formatOperationAuthentication(authentication) }),
  }
}

function projectLiveChoice(value: unknown): OperationChoiceRow | null {
  return rowFromChoiceFields(value) ?? rowFromDescriptorFields(value)
}

function projectLiveChoices(values: unknown): OperationChoiceRow[] {
  if (!Array.isArray(values)) return []
  const choices: OperationChoiceRow[] = []
  for (const value of values) {
    const choice = projectLiveChoice(value)
    if (choice === null) continue
    if (choices.some((existing) => existing.operationRef === choice.operationRef)) continue
    choices.push(choice)
    if (choices.length >= 4) break
  }
  return choices
}

function projectStoredChoice(value: unknown): OperationChoiceRow | null {
  if (!isRecord(value)) return null
  const refs: string[] = []
  addRef(refs, value.operationRef)
  const operationRef = refs[0]
  const title = stringField(value.title)
  if (operationRef === undefined || title === undefined) return null
  const supplier = stringField(value.supplier)
  const price = stringField(value.price)
  const readiness = stringField(value.readiness)
  const access = stringField(value.access)
  return {
    operationRef,
    title,
    ...(supplier === undefined ? {} : { supplier }),
    ...(price === undefined ? {} : { price }),
    ...(readiness === undefined ? {} : { readiness }),
    ...(access === undefined ? {} : { access }),
  }
}

function projectStoredChoices(values: unknown): OperationChoiceRow[] {
  if (!Array.isArray(values)) return []
  const choices: OperationChoiceRow[] = []
  for (const value of values) {
    const choice = projectStoredChoice(value)
    if (choice === null) continue
    if (choices.some((existing) => existing.operationRef === choice.operationRef)) continue
    choices.push(choice)
    if (choices.length >= 4) break
  }
  return choices
}

function projectStoredFacts(values: unknown): OperationFact[] {
  if (!Array.isArray(values)) return []
  const facts: OperationFact[] = []
  for (const value of values) {
    if (!isRecord(value)) continue
    const label = stringField(value.label)
    const factValue = stringField(value.value)
    if (label === undefined || factValue === undefined) continue
    facts.push({ label, value: factValue })
    if (facts.length >= 6) break
  }
  return facts
}

function collectOperationRefs(output: Record<string, unknown>, choices: readonly OperationChoiceRow[]): string[] {
  const operationRefs: string[] = []
  addRef(operationRefs, output.operationRef)
  if (isRecord(output.operation)) addRef(operationRefs, output.operation.operationRef)
  for (const field of ['operationRefs', 'items', 'operations'] as const) {
    const values = output[field]
    if (!Array.isArray(values)) continue
    for (const value of values) addRef(operationRefs, isRecord(value) ? value.operationRef : value)
  }
  for (const choice of choices) addRef(operationRefs, choice.operationRef)
  return operationRefs
}

function matchedCount(output: Record<string, unknown>): number | undefined {
  if (typeof output.matchedCount === 'number' && Number.isSafeInteger(output.matchedCount)) {
    return Math.max(0, output.matchedCount)
  }
  if (Array.isArray(output.items)) return output.items.length
  if (Array.isArray(output.operations)) return output.operations.length
  return undefined
}

function uniqueLabels(values: readonly string[]): string | undefined {
  const labels: string[] = []
  for (const value of values) {
    if (labels.includes(value)) continue
    labels.push(value)
  }
  return labels.length === 0 ? undefined : labels.join(', ')
}

function effectLabel(value: unknown): string | undefined {
  if (!isRecord(value) || typeof value.class !== 'string') return undefined
  if (value.class === 'data_release') return EFFECT_LABEL.data_release
  if (value.class === 'financial_exposure') return EFFECT_LABEL.financial_exposure
  if (value.class === 'external_state_change') return EFFECT_LABEL.external_state_change
  return undefined
}

function dataUseLabel(value: unknown): string | undefined {
  if (!isRecord(value) || typeof value.classification !== 'string') return undefined
  if (value.classification === 'public') return DATA_USE_LABEL.public
  if (value.classification === 'personal') return DATA_USE_LABEL.personal
  if (value.classification === 'sensitive') return DATA_USE_LABEL.sensitive
  if (value.classification === 'credential') return DATA_USE_LABEL.credential
  return undefined
}

function labelsFromPolicy(
  values: unknown,
  labelOf: (value: unknown) => string | undefined,
): string | undefined {
  if (!Array.isArray(values)) return undefined
  return uniqueLabels(values.flatMap((value) => {
    const label = labelOf(value)
    return label === undefined ? [] : [label]
  }))
}

function merchandiseCompareValue(field: (typeof COMPARE_FIELDS)[number], value: unknown): string | undefined {
  switch (field) {
    case 'price': {
      const price = readPrice(value)
      return price === undefined ? undefined : formatOperationPrice(price)
    }
    case 'effects':
      return labelsFromPolicy(value, effectLabel)
    case 'dataUse':
      return labelsFromPolicy(value, dataUseLabel)
    case 'availability': {
      const posture = readPosture(value)
      return posture === undefined ? undefined : formatOperationReadiness(posture)
    }
    default: {
      const exhaustive: never = field
      return exhaustive
    }
  }
}

function compareFieldLabel(field: (typeof COMPARE_FIELDS)[number]): string {
  switch (field) {
    case 'price':
      return FACT.price
    case 'effects':
      return FACT.effects
    case 'dataUse':
      return FACT.dataUse
    case 'availability':
      return FACT.readiness
    default: {
      const exhaustive: never = field
      return exhaustive
    }
  }
}

function isCompareField(value: string): value is (typeof COMPARE_FIELDS)[number] {
  return (COMPARE_FIELDS as readonly string[]).includes(value)
}

function projectCompareContrasts(
  output: Record<string, unknown>,
  choices: readonly OperationChoiceRow[],
): OperationFact[] {
  if (!Array.isArray(output.facts)) return []
  const facts: OperationFact[] = []
  for (const entry of output.facts) {
    if (!isRecord(entry) || typeof entry.field !== 'string' || !isCompareField(entry.field)) continue
    if (!Array.isArray(entry.values)) continue
    const parts: string[] = []
    for (const cell of entry.values) {
      if (!isRecord(cell)) continue
      const merchandised = merchandiseCompareValue(entry.field, cell.value)
      if (merchandised === undefined) continue
      const title = typeof cell.operationRef === 'string'
        ? choices.find((choice) => choice.operationRef === cell.operationRef)?.title
        : undefined
      parts.push(title === undefined ? merchandised : `${title}: ${merchandised}`)
      if (parts.length >= 4) break
    }
    if (parts.length === 0) continue
    facts.push({ label: compareFieldLabel(entry.field), value: parts.join('; ') })
    if (facts.length >= 4) break
  }
  return facts
}

function inspectPlanFacts(output: Record<string, unknown>): OperationFact[] {
  const summary = isRecord(output.summary) ? output.summary : undefined
  if (summary === undefined) return []
  const facts: OperationFact[] = []
  if (isRecord(summary.maximumCost)) {
    if (summary.maximumCost.kind === 'requires_preparation') {
      facts.push({ label: FACT.maxCost, value: FACT.requiresPreparation })
    } else if (summary.maximumCost.kind === 'known') {
      const amount = readExactAmount(summary.maximumCost.amount)
      if (amount !== undefined) {
        facts.push({ label: FACT.maxCost, value: formatOperationPrice({ kind: 'fixed', amount }) })
      }
    }
  }
  const effects = labelsFromPolicy(summary.effects, effectLabel)
  if (effects !== undefined) facts.push({ label: FACT.effects, value: effects })
  const dataUse = labelsFromPolicy(summary.dataUse, dataUseLabel)
  if (dataUse !== undefined) facts.push({ label: FACT.dataUse, value: dataUse })
  return facts
}

function chrome(toolId: ChatToolId): CardChrome {
  return { toolId, title: CHAT_TOOL_TITLES[toolId] }
}

function providerToolName(part: Record<string, unknown>): string | undefined {
  if (part.type === 'dynamic-tool') return typeof part.toolName === 'string' ? part.toolName : undefined
  if (typeof part.toolName === 'string') return part.toolName
  return typeof part.type === 'string' && part.type.startsWith('tool-')
    ? part.type.slice('tool-'.length)
    : undefined
}

function outputRecord(part: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!isRecord(part.output)) return undefined
  return part.output.type === 'json' && isRecord(part.output.value)
    ? part.output.value
    : part.output
}

function statusCard(toolId: ChatToolId, state: 'refused' | 'error', summary: string): OperationCardProjection {
  return { ...chrome(toolId), kind: 'status', state, summary }
}

function projectLiveBody(toolId: ChatToolId, output: Record<string, unknown>): OperationCardProjection {
  switch (toolId) {
    case 'registry.operations.search': {
      const choices = projectLiveChoices(output.items)
      const count = matchedCount(output)
      return {
        ...chrome(toolId),
        kind: 'choices',
        state: 'complete',
        choices,
        operationRefs: collectOperationRefs(output, choices),
        ...(count === undefined ? {} : { count }),
      }
    }
    case 'registry.operations.compare': {
      const choices = projectLiveChoices(output.operations)
      const count = matchedCount(output)
      const contrasts = projectCompareContrasts(output, choices)
      return {
        ...chrome(toolId),
        kind: 'choices',
        state: 'complete',
        choices,
        operationRefs: collectOperationRefs(output, choices),
        ...(count === undefined ? {} : { count }),
        ...(contrasts.length === 0 ? {} : { contrasts }),
      }
    }
    case 'registry.operations.detail': {
      const choice = projectLiveChoice(output.operation ?? output)
      const choices = choice === null ? [] : [choice]
      return {
        ...chrome(toolId),
        kind: 'choices',
        state: 'complete',
        choices,
        operationRefs: collectOperationRefs(output, choices),
      }
    }
    case 'registry.operations.inspectPlan':
      return {
        ...chrome(toolId),
        kind: 'inspect',
        state: 'complete',
        facts: inspectPlanFacts(output),
        operationRefs: collectOperationRefs(output, []),
      }
    case 'operation.execute': {
      const name = stringField(output.name)
      return {
        ...chrome(toolId),
        kind: 'execute',
        state: 'complete',
        operationRefs: collectOperationRefs(output, []),
        ...(name === undefined ? {} : { name }),
      }
    }
    default: {
      const exhaustive: never = toolId
      return exhaustive
    }
  }
}

function isChatToolId(value: unknown): value is ChatToolId {
  return typeof value === 'string' && (CHAT_TOOL_IDS as readonly string[]).includes(value)
}

function projectStoredCard(part: Record<string, unknown>): OperationCardProjection | null {
  if (!isChatToolId(part.toolId)) return null
  const toolId = part.toolId
  if (part.kind === 'working' || part.state === 'working') return { ...chrome(toolId), kind: 'working' }
  if (part.kind === 'status' || part.state === 'refused' || part.state === 'error') {
    const state = part.state === 'refused' || part.state === 'error' ? part.state : 'error'
    return statusCard(toolId, state, stringField(part.summary) ?? (state === 'refused' ? 'Request refused' : 'Tool unavailable'))
  }
  const refs: string[] = []
  if (Array.isArray(part.operationRefs)) for (const value of part.operationRefs) addRef(refs, value)
  if (part.kind === 'inspect' || toolId === 'registry.operations.inspectPlan') {
    return {
      ...chrome(toolId),
      kind: 'inspect',
      state: 'complete',
      facts: projectStoredFacts(part.facts),
      operationRefs: refs,
    }
  }
  if (part.kind === 'execute' || toolId === 'operation.execute') {
    const name = stringField(part.name)
    return {
      ...chrome(toolId),
      kind: 'execute',
      state: 'complete',
      operationRefs: refs,
      ...(name === undefined ? {} : { name }),
    }
  }
  const count = typeof part.count === 'number' && Number.isSafeInteger(part.count) && part.count >= 0
    ? part.count
    : undefined
  const contrasts = projectStoredFacts(part.contrasts)
  return {
    ...chrome(toolId),
    kind: 'choices',
    state: 'complete',
    choices: projectStoredChoices(part.choices),
    operationRefs: refs,
    ...(count === undefined ? {} : { count }),
    ...(contrasts.length === 0 ? {} : { contrasts }),
  }
}

export function projectOperationCard(part: unknown): OperationCardProjection | null {
  if (!isRecord(part)) return null
  if (part.type === 'operation-card') return projectStoredCard(part)

  const providerName = providerToolName(part)
  const toolId = providerName === undefined ? undefined : providerToCanonical[providerName]
  if (toolId === undefined) return null
  if (part.state === 'output-error') return statusCard(toolId, 'error', 'Tool unavailable')
  if (part.state === 'output-denied') return statusCard(toolId, 'refused', 'Request refused')
  if (part.state !== 'output-available') return { ...chrome(toolId), kind: 'working' }

  const output = outputRecord(part)
  const kind = output?.kind
  if (kind === 'error') return statusCard(toolId, 'error', 'Tool unavailable')
  const refused = kind === 'refused'
    || kind === 'unavailable'
    || kind === 'chat_tool_refused'
    || kind === 'no_candidates'
    || kind === 'not_found'
  if (refused) {
    const reason = typeof output?.reason === 'string' ? REFUSAL_SUMMARIES[output.reason] : undefined
    const summary = reason
      ?? (kind === 'no_candidates' ? 'No tools found' : kind === 'not_found' ? 'Not found' : 'Request refused')
    return statusCard(toolId, 'refused', summary)
  }
  if (output === undefined) return statusCard(toolId, 'error', 'Tool unavailable')
  if (kind !== 'ok' && kind !== 'found') return statusCard(toolId, 'error', 'Tool unavailable')
  return projectLiveBody(toolId, output)
}

export function serializeOperationCard(card: OperationCardProjection): Record<string, unknown> | null {
  switch (card.kind) {
    case 'working':
      return null
    case 'status':
      return {
        type: 'operation-card',
        kind: 'status',
        toolId: card.toolId,
        title: card.title,
        state: card.state,
        summary: card.summary,
      }
    case 'choices':
      return {
        type: 'operation-card',
        kind: 'choices',
        toolId: card.toolId,
        title: card.title,
        state: 'complete',
        operationRefs: [...card.operationRefs],
        choices: card.choices.map((choice) => ({ ...choice })),
        ...(card.count === undefined ? {} : { count: card.count }),
        ...(card.contrasts === undefined || card.contrasts.length === 0
          ? {}
          : { contrasts: card.contrasts.map((fact) => ({ ...fact })) }),
      }
    case 'inspect':
      return {
        type: 'operation-card',
        kind: 'inspect',
        toolId: card.toolId,
        title: card.title,
        state: 'complete',
        operationRefs: [...card.operationRefs],
        facts: card.facts.map((fact) => ({ ...fact })),
      }
    case 'execute':
      return {
        type: 'operation-card',
        kind: 'execute',
        toolId: card.toolId,
        title: card.title,
        state: 'complete',
        operationRefs: [...card.operationRefs],
        ...(card.name === undefined ? {} : { name: card.name }),
      }
    default: {
      const exhaustive: never = card
      return exhaustive
    }
  }
}

export function operationCardState(
  card: OperationCardProjection,
): 'working' | 'complete' | 'refused' | 'error' {
  switch (card.kind) {
    case 'working':
      return 'working'
    case 'status':
      return card.state
    case 'choices':
    case 'inspect':
    case 'execute':
      return 'complete'
    default: {
      const exhaustive: never = card
      return exhaustive
    }
  }
}
