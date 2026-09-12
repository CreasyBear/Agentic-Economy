import { providerSafeActionToolName } from '@/modules/actions/tool-contract'
import { isRecord } from '@/modules/common/is-record'
import { publicToolDisplayPriceSchema } from '@/modules/capability-supply/tool-schemas'
import { isPublicToolRef } from '@/modules/capability-supply/public'
import type {
  PublicToolAuthentication,
  PublicToolAvailability,
  PublicToolPrice,
} from '@/modules/capability-supply/public'
import {
  formatToolAuthentication,
  formatToolPrice,
  formatToolReadiness,
} from '@/modules/market/tool-view-model'
import {
  callResultKindValues,
  callResultSchema,
  type CallResult,
} from '@/modules/capability-execution/call-contracts'
import {
  toolQuoteResultSchema,
  type ToolQuoteResult,
} from '@/modules/capability-execution/quote'
import {
  suggestNextAction,
  type SuggestedNextAction,
} from '@/modules/market/suggested-next-action'
import { formatCurrencyAmount, readExactAmount, formatDisplayPrice } from '@/modules/money/public'

export const CHAT_TOOL_IDS = [
  'registry.tools.list',
  'registry.tools.search',
  'registry.tools.describe',
  'registry.tools.compare',
  'tool.quote',
  'tool.call',
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
  'registry.tools.list': 'Browse Tools',
  'registry.tools.search': 'Search tools',
  'registry.tools.describe': 'Tool details',
  'registry.tools.compare': 'Compare tools',
  'tool.quote': 'Confirm purchase terms',
  'tool.call': 'Call',
}

export type ToolChoiceRow = Readonly<{
  toolRef: string
  title: string
  provider?: string
  price?: string
  priceValidUntil?: number
  readiness?: string
  access?: string
}>

export type ToolFact = Readonly<{
  label: string
  value: string
}>

export type CallResultState = CallResult['kind']

type CardChrome = Readonly<{
  toolId: ChatToolId
  title: string
}>

export type ToolCardProjection =
  | (CardChrome & { kind: 'working' })
  | (CardChrome & { kind: 'status'; state: 'refused' | 'error'; summary: string })
  | (CardChrome & {
      kind: 'choices'
      state: 'complete'
      choices: readonly ToolChoiceRow[]
      toolRefs: readonly string[]
      count?: number
      contrasts?: readonly ToolFact[]
    })
  | (CardChrome & {
      kind: 'inspect'
      state: 'complete'
      facts: readonly ToolFact[]
      toolRefs: readonly string[]
    })
  | (CardChrome & {
      kind: 'execute'
      state: CallResultState
      toolRefs: readonly string[]
      name?: string
      callRef?: string
      outputPreview?: string
      outputTruncated?: boolean
      facts: readonly ToolFact[]
      receiptRef?: string
      evidenceHash?: string
      summary: string
      nextAction?: string
      retryable?: boolean
      suggestedNextAction?: SuggestedNextAction
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
  tool_not_found: 'Not found',
  tool_unavailable: 'Unavailable',
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

function boundedString(value: unknown, maximum: number): string | undefined {
  if (typeof value !== 'string' || value.trim().length === 0) return undefined
  return Array.from(value.trim()).slice(0, maximum).join('')
}

function addRef(refs: string[], value: unknown): void {
  if (refs.length >= 4 || !isPublicToolRef(value) || refs.includes(value)) return
  refs.push(value)
}

function readPrice(value: unknown): PublicToolPrice | undefined {
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

function readAuthentication(value: unknown): PublicToolAuthentication | undefined {
  if (!isRecord(value) || typeof value.kind !== 'string') return undefined
  if (value.kind === 'ae_api_key') return { kind: 'ae_api_key' }
  if (value.kind === 'x402') return { kind: 'x402' }
  if (value.kind === 'unknown') return { kind: 'unknown' }
  if (value.kind !== 'platform_credential') return undefined
  if (value.scheme === 'bearer') return { kind: 'platform_credential', scheme: 'bearer' }
  if (value.scheme === 'api_key' && (value.in === 'query' || value.in === 'header') && typeof value.name === 'string') {
    return { kind: 'platform_credential', scheme: 'api_key', in: value.in, name: value.name }
  }
  return undefined
}

function readPosture(value: unknown): PublicToolAvailability['posture'] | undefined {
  if (!isRecord(value) || typeof value.posture !== 'string') return undefined
  if (value.posture === 'routeable' || value.posture === 'setup_required' || value.posture === 'unavailable') {
    return value.posture
  }
  return undefined
}

function rowFromChoiceFields(value: unknown): ToolChoiceRow | null {
  if (!isRecord(value)) return null
  const refs: string[] = []
  addRef(refs, value.toolRef)
  const toolRef = refs[0]
  const title = stringField(value.title)
  if (toolRef === undefined || title === undefined) return null
  const provider = isRecord(value.provider) ? stringField(value.provider.name) : undefined
  const display = publicToolDisplayPriceSchema.safeParse(value.displayPrice)
  const price = (display.success ? formatDisplayPrice(display.data) : undefined) ?? stringField(value.priceLabel)
  const healthStatus = stringField(value.healthStatus)
  const readiness = healthStatus === 'operational'
    ? 'Operational'
    : healthStatus === 'degraded'
      ? 'Degraded'
      : healthStatus === 'unverified'
        ? 'Unverified'
        : undefined
  const authentication = readAuthentication(value.authentication)
  return {
    toolRef,
    title,
    ...(provider === undefined ? {} : { provider }),
    ...(price === undefined ? {} : { price }),
    ...(display.success && display.data.kind === 'indicative' ? { priceValidUntil: display.data.validUntil } : {}),
    ...(readiness === undefined ? {} : { readiness }),
    ...(authentication === undefined ? {} : { access: formatToolAuthentication(authentication) }),
  }
}

function rowFromDescriptorFields(value: unknown): ToolChoiceRow | null {
  if (!isRecord(value)) return null
  const refs: string[] = []
  addRef(refs, value.toolRef)
  const toolRef = refs[0]
  const title = isRecord(value.listing) ? stringField(value.listing.label) : undefined
  if (toolRef === undefined || title === undefined) return null
  const provider = isRecord(value.provider)
    ? stringField(value.provider.name)
    : isRecord(value.business)
      ? stringField(value.business.name)
      : undefined
  const price = isRecord(value.commercial) ? readPrice(value.commercial.price) : undefined
  const display = publicToolDisplayPriceSchema.safeParse(isRecord(value.commercial) ? value.commercial.displayPrice : undefined)
  const priceLabel = (display.success ? formatDisplayPrice(display.data) : undefined) ?? (price === undefined ? undefined : formatToolPrice(price))
  const posture = readPosture(value.availability)
  const authentication = readAuthentication(value.authentication)
  return {
    toolRef,
    title,
    ...(provider === undefined ? {} : { provider }),
    ...(priceLabel === undefined ? {} : { price: priceLabel }),
    ...(display.success && display.data.kind === 'indicative' ? { priceValidUntil: display.data.validUntil } : {}),
    ...(posture === undefined ? {} : { readiness: isRecord(value.availability) && value.availability.reason === 'inspection_required' ? 'Checked when quoting' : formatToolReadiness(posture) }),
    ...(authentication === undefined ? {} : { access: formatToolAuthentication(authentication) }),
  }
}

function projectLiveChoice(value: unknown): ToolChoiceRow | null {
  return rowFromChoiceFields(value) ?? rowFromDescriptorFields(value)
}

function projectLiveChoices(values: unknown): ToolChoiceRow[] {
  if (!Array.isArray(values)) return []
  const choices: ToolChoiceRow[] = []
  for (const value of values) {
    const choice = projectLiveChoice(value)
    if (choice === null) continue
    if (choices.some((existing) => existing.toolRef === choice.toolRef)) continue
    choices.push(choice)
    if (choices.length >= 4) break
  }
  return choices
}

function projectStoredChoice(value: unknown): ToolChoiceRow | null {
  if (!isRecord(value)) return null
  const refs: string[] = []
  addRef(refs, value.toolRef)
  const toolRef = refs[0]
  const title = stringField(value.title)
  if (toolRef === undefined || title === undefined) return null
  const provider = stringField(value.provider)
  const price = stringField(value.price)
  const readiness = stringField(value.readiness)
  const access = stringField(value.access)
  return {
    toolRef,
    title,
    ...(provider === undefined ? {} : { provider }),
    ...(price === undefined ? {} : { price }),
    ...(readiness === undefined ? {} : { readiness }),
    ...(access === undefined ? {} : { access }),
  }
}

function projectStoredChoices(values: unknown): ToolChoiceRow[] {
  if (!Array.isArray(values)) return []
  const choices: ToolChoiceRow[] = []
  for (const value of values) {
    const choice = projectStoredChoice(value)
    if (choice === null) continue
    if (choices.some((existing) => existing.toolRef === choice.toolRef)) continue
    choices.push(choice)
    if (choices.length >= 4) break
  }
  return choices
}

function projectStoredFacts(values: unknown): ToolFact[] {
  if (!Array.isArray(values)) return []
  const facts: ToolFact[] = []
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

function collectToolRefs(output: Record<string, unknown>, choices: readonly ToolChoiceRow[]): string[] {
  const toolRefs: string[] = []
  addRef(toolRefs, output.toolRef)
  if (isRecord(output.tool)) addRef(toolRefs, output.tool.toolRef)
  for (const field of ['toolRefs', 'items', 'tools'] as const) {
    const values = output[field]
    if (!Array.isArray(values)) continue
    for (const value of values) addRef(toolRefs, isRecord(value) ? value.toolRef : value)
  }
  for (const choice of choices) addRef(toolRefs, choice.toolRef)
  return toolRefs
}

function matchedCount(output: Record<string, unknown>): number | undefined {
  if (typeof output.count === 'number' && Number.isSafeInteger(output.count)) {
    return Math.max(0, output.count)
  }
  if (typeof output.matchedCount === 'number' && Number.isSafeInteger(output.matchedCount)) {
    return Math.max(0, output.matchedCount)
  }
  if (Array.isArray(output.items)) return output.items.length
  if (Array.isArray(output.tools)) return output.tools.length
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
      return price === undefined ? undefined : formatToolPrice(price)
    }
    case 'effects':
      return labelsFromPolicy(value, effectLabel)
    case 'dataUse':
      return labelsFromPolicy(value, dataUseLabel)
    case 'availability': {
      const posture = readPosture(value)
      return posture === undefined ? undefined : formatToolReadiness(posture)
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
  choices: readonly ToolChoiceRow[],
): ToolFact[] {
  if (!Array.isArray(output.facts)) return []
  const facts: ToolFact[] = []
  for (const entry of output.facts) {
    if (!isRecord(entry) || typeof entry.field !== 'string' || !isCompareField(entry.field)) continue
    if (!Array.isArray(entry.values)) continue
    const parts: string[] = []
    for (const cell of entry.values) {
      if (!isRecord(cell)) continue
      const merchandised = merchandiseCompareValue(entry.field, cell.value)
      if (merchandised === undefined) continue
      const title = typeof cell.toolRef === 'string'
        ? choices.find((choice) => choice.toolRef === cell.toolRef)?.title
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

const MAX_EXECUTE_OUTPUT_PREVIEW_CHARS = 8_000

const CHARGE_STATE_LABELS = {
  free_tier: 'Free tier',
  paid: 'Paid',
  insufficient_credit: 'Insufficient credit',
  outcome_unknown: 'Outcome unknown',
  refunded: 'Refunded',
} as const

function callNextAction(
  state: Exclude<CallResultState, 'refused'>,
  callRef: string,
): SuggestedNextAction {
  return suggestNextAction({
    subject: 'call',
    state: state === 'completed'
      ? 'completed'
      : state === 'reconciliation_required'
        ? 'reconciliation_required'
        : 'pending',
    callRef,
  })
}

function outputPreview(value: CallResult & { kind: 'completed' }): Readonly<{
  text: string
  truncated: boolean
}> {
  const serialized = JSON.stringify(value.output, null, 2)
  const characters = Array.from(serialized)
  return {
    text: characters.slice(0, MAX_EXECUTE_OUTPUT_PREVIEW_CHARS).join(''),
    truncated: characters.length > MAX_EXECUTE_OUTPUT_PREVIEW_CHARS,
  }
}

function receiptFacts(result: Extract<CallResult, { receipt?: unknown }>): ToolFact[] {
  return result.receipt === undefined
    ? []
    : [{ label: 'Receipt', value: result.receipt.state.replaceAll('_', ' ') }]
}

function projectCallResult(result: CallResult): ToolCardProjection {
  const toolRefs = result.toolRef === undefined ? [] : [result.toolRef]
  if (result.kind === 'completed') {
    const preview = outputPreview(result)
    const facts: ToolFact[] = [
      {
        label: 'Charge',
        value: `${formatCurrencyAmount(result.usage.amount)} · ${CHARGE_STATE_LABELS[result.usage.chargeState]}`,
      },
      ...(result.usage.durationMs === undefined
        ? []
        : [{ label: 'Duration', value: `${result.usage.durationMs} ms` }]),
      ...receiptFacts(result),
    ]
    return {
      ...chrome('tool.call'),
      kind: 'execute',
      state: result.kind,
      toolRefs,
      callRef: result.callRef,
      outputPreview: preview.text,
      ...(preview.truncated ? { outputTruncated: true } : {}),
      facts,
      ...(result.receipt === undefined ? {} : { receiptRef: result.receipt.receiptRef }),
      evidenceHash: result.evidenceHash,
      summary: 'The Tool returned a result the calling agent can use now.',
      suggestedNextAction: callNextAction(result.kind, result.callRef),
    }
  }
  if (result.kind === 'pending') {
    return {
      ...chrome('tool.call'),
      kind: 'execute',
      state: result.kind,
      toolRefs,
      callRef: result.callRef,
      facts: [{ label: 'Check after', value: `${result.retryAfterMs} ms` }],
      summary: 'The call was accepted, but no terminal result is recorded yet.',
      suggestedNextAction: callNextAction(result.kind, result.callRef),
    }
  }
  if (result.kind === 'needs_authority') {
    const maximumSpend = result.authorityRequest.maximumSpend
    return {
      ...chrome('tool.call'),
      kind: 'execute',
      state: result.kind,
      toolRefs,
      callRef: result.callRef,
      facts: [
        { label: 'Consequence', value: result.authorityRequest.consequence.replaceAll('_', ' ') },
        ...(maximumSpend === undefined
          ? []
          : [{ label: 'Maximum spend', value: formatCurrencyAmount(maximumSpend) }]),
      ],
      summary: 'The call is paused until the required authority is granted.',
      nextAction: 'Review the pending approval in the agent console.',
      suggestedNextAction: callNextAction(result.kind, result.callRef),
    }
  }
  if (result.kind === 'reconciliation_required') {
    return {
      ...chrome('tool.call'),
      kind: 'execute',
      state: result.kind,
      toolRefs,
      callRef: result.callRef,
      facts: [
        { label: 'Attempt', value: result.evidence.attemptRef },
        { label: 'Effect generation', value: String(result.evidence.effectGeneration) },
        ...receiptFacts(result),
      ],
      ...(result.receipt === undefined ? {} : { receiptRef: result.receipt.receiptRef }),
      summary: 'The external effect is uncertain. Do not retry this call until it is reconciled.',
      suggestedNextAction: callNextAction(result.kind, result.callRef),
    }
  }
  return {
    ...chrome('tool.call'),
    kind: 'execute',
    state: result.kind,
    toolRefs,
    facts: receiptFacts(result),
    ...(result.receipt === undefined ? {} : { receiptRef: result.receipt.receiptRef }),
    summary: REFUSAL_SUMMARIES[result.code] ?? result.code.replaceAll('_', ' '),
    ...(result.nextAction === undefined ? {} : { nextAction: result.nextAction }),
    retryable: result.retryable,
  }
}

function projectInspectResult(
  result: Extract<ToolQuoteResult, { kind: 'committed' }>,
): ToolCardProjection {
  return {
    ...chrome('tool.quote'),
    kind: 'inspect',
    state: 'complete',
    toolRefs: [result.toolRef],
    facts: [
      { label: 'Decision price', value: formatCurrencyAmount(result.price) },
      { label: 'Account available', value: formatCurrencyAmount(result.account.available) },
      { label: 'Agent maximum', value: formatCurrencyAmount(result.budget.maximumPerCall) },
      ...(result.sourceRequirement === undefined
        ? []
        : [{ label: 'Provider requirement', value: formatCurrencyAmount(result.sourceRequirement) }]),
      { label: 'Expires', value: new Date(result.expiresAt).toISOString() },
      { label: 'Quote', value: result.quoteRef },
    ],
  }
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

function statusCard(toolId: ChatToolId, state: 'refused' | 'error', summary: string): ToolCardProjection {
  return { ...chrome(toolId), kind: 'status', state, summary }
}

function projectLiveBody(toolId: ChatToolId, output: Record<string, unknown>): ToolCardProjection {
  switch (toolId) {
    case 'registry.tools.list':
    case 'registry.tools.search': {
      const choices = projectLiveChoices(output.items)
      const count = matchedCount(output)
      return {
        ...chrome(toolId),
        kind: 'choices',
        state: 'complete',
        choices,
        toolRefs: collectToolRefs(output, choices),
        ...(count === undefined ? {} : { count }),
      }
    }
    case 'registry.tools.compare': {
      const choices = projectLiveChoices(output.tools)
      const count = matchedCount(output)
      const contrasts = projectCompareContrasts(output, choices)
      return {
        ...chrome(toolId),
        kind: 'choices',
        state: 'complete',
        choices,
        toolRefs: collectToolRefs(output, choices),
        ...(count === undefined ? {} : { count }),
        ...(contrasts.length === 0 ? {} : { contrasts }),
      }
    }
    case 'registry.tools.describe': {
      const choice = projectLiveChoice(output.tool ?? output)
      const choices = choice === null ? [] : [choice]
      return {
        ...chrome(toolId),
        kind: 'choices',
        state: 'complete',
        choices,
        toolRefs: collectToolRefs(output, choices),
      }
    }
    case 'tool.quote':
    case 'tool.call':
      return statusCard(toolId, 'error', 'Tool unavailable')
    default: {
      const exhaustive: never = toolId
      return exhaustive
    }
  }
}

function isChatToolId(value: unknown): value is ChatToolId {
  return typeof value === 'string' && (CHAT_TOOL_IDS as readonly string[]).includes(value)
}

function projectStoredCard(part: Record<string, unknown>): ToolCardProjection | null {
  if (!isChatToolId(part.toolId)) return null
  const toolId = part.toolId
  if (part.kind === 'working' || part.state === 'working') return { ...chrome(toolId), kind: 'working' }
  if (part.kind === 'status' || part.state === 'refused' || part.state === 'error') {
    const state = part.state === 'refused' || part.state === 'error' ? part.state : 'error'
    return statusCard(toolId, state, stringField(part.summary) ?? (state === 'refused' ? 'Request refused' : 'Tool unavailable'))
  }
  const refs: string[] = []
  if (Array.isArray(part.toolRefs)) for (const value of part.toolRefs) addRef(refs, value)
  if (part.kind === 'inspect' || toolId === 'tool.quote') {
    return {
      ...chrome(toolId),
      kind: 'inspect',
      state: 'complete',
      facts: projectStoredFacts(part.facts),
      toolRefs: refs,
    }
  }
  if (part.kind === 'execute' || toolId === 'tool.call') {
    const name = stringField(part.name)
    const state = part.state === 'complete'
      ? 'completed'
      : callResultKindValues.find((value) => value === part.state)
    if (state === undefined) return statusCard(toolId, 'error', 'Tool unavailable')
    const callRef = boundedString(part.callRef, 400)
    const outputPreview = boundedString(part.outputPreview, MAX_EXECUTE_OUTPUT_PREVIEW_CHARS)
    const receiptRef = boundedString(part.receiptRef, 400)
    const evidenceHash = boundedString(part.evidenceHash, 400)
    const summary = boundedString(part.summary, 320) ?? 'Call result recorded.'
    const nextAction = boundedString(part.nextAction, 320)
    return {
      ...chrome(toolId),
      kind: 'execute',
      state,
      toolRefs: refs,
      ...(name === undefined ? {} : { name }),
      ...(callRef === undefined ? {} : { callRef }),
      ...(outputPreview === undefined ? {} : { outputPreview }),
      ...(part.outputTruncated === true ? { outputTruncated: true } : {}),
      facts: projectStoredFacts(part.facts),
      ...(receiptRef === undefined ? {} : { receiptRef }),
      ...(evidenceHash === undefined ? {} : { evidenceHash }),
      summary,
      ...(nextAction === undefined ? {} : { nextAction }),
      ...(typeof part.retryable === 'boolean' ? { retryable: part.retryable } : {}),
      ...(state === 'refused' || callRef === undefined
        ? {}
        : { suggestedNextAction: callNextAction(state, callRef) }),
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
    toolRefs: refs,
    ...(count === undefined ? {} : { count }),
    ...(contrasts.length === 0 ? {} : { contrasts }),
  }
}

export function projectToolCard(part: unknown): ToolCardProjection | null {
  if (!isRecord(part)) return null
  if (part.type === 'tool-card') return projectStoredCard(part)

  const providerName = providerToolName(part)
  const toolId = providerName === undefined ? undefined : providerToCanonical[providerName]
  if (toolId === undefined) return null
  if (part.state === 'output-error') return statusCard(toolId, 'error', 'Tool unavailable')
  if (part.state === 'output-denied') return statusCard(toolId, 'refused', 'Request refused')
  if (part.state !== 'output-available') return { ...chrome(toolId), kind: 'working' }

  const output = outputRecord(part)
  const kind = output?.kind
  if (kind === 'error') return statusCard(toolId, 'error', 'Tool unavailable')
  if (toolId === 'tool.call') {
    if (kind === 'chat_tool_refused') {
      const reason = typeof output?.reason === 'string' ? REFUSAL_SUMMARIES[output.reason] : undefined
      return statusCard(toolId, 'refused', reason ?? 'Request refused')
    }
    if (output === undefined) return statusCard(toolId, 'error', 'Tool unavailable')
    const result = callResultSchema.safeParse(output)
    return result.success
      ? projectCallResult(result.data)
      : statusCard(toolId, 'error', 'Tool unavailable')
  }
  if (toolId === 'tool.quote') {
    if (kind === 'chat_tool_refused') {
      const reason = typeof output?.reason === 'string' ? REFUSAL_SUMMARIES[output.reason] : undefined
      return statusCard(toolId, 'refused', reason ?? 'Request refused')
    }
    if (output === undefined) return statusCard(toolId, 'error', 'Tool unavailable')
    const result = toolQuoteResultSchema.safeParse(output)
    if (!result.success) return statusCard(toolId, 'error', 'Tool unavailable')
    return result.data.kind === 'committed'
      ? projectInspectResult(result.data)
      : statusCard(
          toolId,
          'refused',
          REFUSAL_SUMMARIES[result.data.code] ?? result.data.code.replaceAll('_', ' '),
        )
  }
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

export function serializeToolCard(card: ToolCardProjection): Record<string, unknown> | null {
  switch (card.kind) {
    case 'working':
      return null
    case 'status':
      return {
        type: 'tool-card',
        kind: 'status',
        toolId: card.toolId,
        title: card.title,
        state: card.state,
        summary: card.summary,
      }
    case 'choices':
      return {
        type: 'tool-card',
        kind: 'choices',
        toolId: card.toolId,
        title: card.title,
        state: 'complete',
        toolRefs: [...card.toolRefs],
        choices: card.choices.map((choice) => ({ ...choice })),
        ...(card.count === undefined ? {} : { count: card.count }),
        ...(card.contrasts === undefined || card.contrasts.length === 0
          ? {}
          : { contrasts: card.contrasts.map((fact) => ({ ...fact })) }),
      }
    case 'inspect':
      return {
        type: 'tool-card',
        kind: 'inspect',
        toolId: card.toolId,
        title: card.title,
        state: 'complete',
        toolRefs: [...card.toolRefs],
        facts: card.facts.map((fact) => ({ ...fact })),
      }
    case 'execute':
      return {
        type: 'tool-card',
        kind: 'execute',
        toolId: card.toolId,
        title: card.title,
        state: card.state,
        toolRefs: [...card.toolRefs],
        ...(card.name === undefined ? {} : { name: card.name }),
        ...(card.callRef === undefined ? {} : { callRef: card.callRef }),
        ...(card.outputPreview === undefined ? {} : { outputPreview: card.outputPreview }),
        ...(card.outputTruncated === true ? { outputTruncated: true } : {}),
        facts: card.facts.map((fact) => ({ ...fact })),
        ...(card.receiptRef === undefined ? {} : { receiptRef: card.receiptRef }),
        ...(card.evidenceHash === undefined ? {} : { evidenceHash: card.evidenceHash }),
        summary: card.summary,
        ...(card.nextAction === undefined ? {} : { nextAction: card.nextAction }),
        ...(card.retryable === undefined ? {} : { retryable: card.retryable }),
      }
    default: {
      const exhaustive: never = card
      return exhaustive
    }
  }
}

export function toolCardState(
  card: ToolCardProjection,
): 'working' | 'pending' | 'complete' | 'attention' | 'refused' | 'error' {
  switch (card.kind) {
    case 'working':
      return 'working'
    case 'status':
      return card.state
    case 'choices':
    case 'inspect':
      return 'complete'
    case 'execute':
      if (card.state === 'completed') return 'complete'
      if (card.state === 'pending') return 'pending'
      if (card.state === 'refused') return 'refused'
      return 'attention'
    default: {
      const exhaustive: never = card
      return exhaustive
    }
  }
}
