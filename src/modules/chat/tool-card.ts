import { parseStoredToolQuoteOutput } from './tool-card-quote'
import { projectChatPlan, storedPlanReference } from './tool-card-plan'
import { boundaryCauseKind, captureBackendException, degradeBackend } from '@/lib/observability/degrade-backend'
import { isBoundedJsonValue, type JsonValue } from '@/modules/common/bounded-json'
import { getStatusPresentation } from '@/lib/ui/status-presentation'
import { chatClarifyInputSchema, storedClarifyAnswer } from '@/modules/chat/agent-turn.contracts'
import { addRef, boundedString, collectToolRefs, directoryChoiceFields, isExternalChatLookupRef, matchedCount } from '@/modules/chat/tool-card-search'
import { isRecord } from '@/modules/common/is-record'
import { isPublicToolRef, parseCallableRef } from '@/modules/common/tool-ref'
import { publicToolDisplayPriceSchema } from '@/modules/capability-supply/tool-schemas'
import type { PublicToolAuthentication } from '@/modules/capability-supply/public'
import { readPosture, readPrice } from './internal/tool-card-compare'
import { buyerCompareContrasts, buyerPrice, choicePriceFields, stringField } from './tool-card-price'
import { formatToolAuthentication } from '@/modules/market/tool-view-model'
import {
  callResultKindValues,
  callResultSchema,
  callMachineResultSchema,
} from '@/modules/capability-execution/call-contracts'
import {
  toolQuoteInputSchema,
  type ToolQuoteResult,
} from '@/modules/capability-execution/quote'
import { exactAmountSchema, formatCurrencyAmount, formatDisplayAmount, formatDisplayPrice } from '@/modules/money/public'
import {
  callNextAction,
  chrome,
  fundingShortfall,
  MAX_EXECUTE_OUTPUT_PREVIEW_CHARS,
  projectCallResult,
  REFUSAL_SUMMARIES,
} from './tool-card-call-result'
import type { ChatSaveNeed, ToolCardProjection, ToolChoiceRow, ToolFact, ToolCardRecommendation } from './tool-card-types'
export type { CallResultState, ChatSaveNeed, ToolCardProjection, ToolChoiceRow, ToolFact, ToolCardRecommendation } from './tool-card-types'
import { toolCatalogSearchInputSchema, toolChoiceSearchOutputSchema, registryNextActionSchema, type RegistryNextAction } from '@/modules/registry/tool-choice-contracts'
import type {
  OwnerMarketDemandFindResult,
  OwnerMarketDemandRecordResult,
  OwnerMarketDemandStatusResult,
  OwnerMarketDemandWithdrawResult,
} from '@/modules/market-demand/market-demand.functions'

import { CHAT_TOOL_IDS, CHAT_TOOL_NAME_MAP, type ChatToolId } from './tool-ids'
export { CHAT_TOOL_IDS, CHAT_TOOL_NAME_MAP, CHAT_TOOL_TITLES, type ChatToolId } from './tool-ids'
const { providerToCanonical } = CHAT_TOOL_NAME_MAP



export function toolChoiceReadinessLabel(readiness: NonNullable<ToolChoiceRow['readiness']>): string {
  return readiness === 'ready' ? 'Ready to use'
    : readiness === 'unavailable' ? getStatusPresentation('unavailable').label : 'Unverified'
}



export const INSPECT_ACCOUNT_AVAILABLE_LABEL = 'Account available'
export const INSPECT_AGENT_MAXIMUM_LABEL = 'Agent maximum'
const INSPECT_OWNER_FUNDING_FACT_LABELS = new Set<string>([
  INSPECT_ACCOUNT_AVAILABLE_LABEL,
  INSPECT_AGENT_MAXIMUM_LABEL,
])


const storedSaveNeedSchema = toolCatalogSearchInputSchema.pick({ query: true, source: true, filters: true })
export type ChatNeedActions = Readonly<{
  authenticated: boolean
  onFind(input: ChatSaveNeed): Promise<OwnerMarketDemandFindResult>
  onSave(input: ChatSaveNeed & { idempotencyKey: string }): Promise<OwnerMarketDemandRecordResult>
  onStatus(requestRef: string): Promise<OwnerMarketDemandStatusResult>
  onWithdraw(requestRef: string): Promise<OwnerMarketDemandWithdrawResult>
}>

/** A Quote takes only an explicit, bounded JSON object; `{}` must also be typed by the buyer. */
export function parseChatQuoteInput(toolRef: string, draft: string): Record<string, JsonValue> | undefined {
  if (draft.length === 0 || new TextEncoder().encode(draft).byteLength > 1_500) return undefined
  let input: unknown
  try {
    input = JSON.parse(draft)
  } catch (cause) {
    captureBackendException(boundaryCauseKind(cause), { site: 'parseChatQuoteInput', reason: 'invalid_input' })
    return undefined
  }
  if (input === null || typeof input !== 'object' || Array.isArray(input) || !isBoundedJsonValue(input)) return undefined
  const parsed = toolQuoteInputSchema.safeParse({ toolRef, input })
  return parsed.success ? parsed.data.input : undefined
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

function firstSearchNext(output: Record<string, unknown>): RegistryNextAction | undefined {
  const actions = Array.isArray(output.next) ? output.next : output.next === undefined ? [] : [output.next]
  for (const action of actions) {
    const retained = isRecord(action) && isRecord(action.args)
      ? action.action === 'describe' ? { ...action, action: 'registry.tools.describe' }
        : action.action === 'next-page' || action.action === 'retry' ? { ...action, action: 'registry.tools.search' }
          : action
      : action
    const parsed = registryNextActionSchema.safeParse(retained)
    if (parsed.success) return parsed.data
  }
  return undefined
}

function rowFromChoiceFields(value: unknown): ToolChoiceRow | null {
  if (!isRecord(value)) return null
  if (value.source === 'coinbase' && isExternalChatLookupRef(value.id) && typeof value.title === 'string') {
    const provider = stringField(value.provider)
    const access = stringField(value.access)
    return {
      toolRef: value.id,
      detailHref: `/api/v1/registry/detail?id=${encodeURIComponent(value.id)}`,
      title: stringField(value.title) ?? value.id,
      ...(provider === undefined ? {} : { provider }),
      ...choicePriceFields(value),
      ...directoryChoiceFields(value),
      ...(value.readiness === 'ready' || value.readiness === 'unverified' || value.readiness === 'unavailable'
        ? { readiness: value.readiness } : {}),
      ...(access === undefined ? {} : { access }),
    }
  }
  const refs: string[] = []
  addRef(refs, value.toolRef)
  const toolRef = refs[0]
  const title = stringField(value.title)
  if (toolRef === undefined || title === undefined) return null
  const provider = typeof value.provider === 'string'
    ? stringField(value.provider)
    : isRecord(value.provider)
      ? stringField(value.provider.name)
      : isRecord(value.details) && isRecord(value.details.provider)
        ? stringField(value.details.provider.name)
        : undefined
  const healthStatus = stringField(value.healthStatus)
  const readiness = value.readiness === 'ready' || value.readiness === 'unverified' || value.readiness === 'unavailable'
    ? value.readiness
    : healthStatus === 'operational' ? 'ready'
      : healthStatus === 'degraded' ? 'unavailable'
        : healthStatus === 'unverified' ? 'unverified' : undefined
  const authentication = readAuthentication(value.authentication)
  return {
    toolRef,
    title,
    ...(provider === undefined ? {} : { provider }),
    ...choicePriceFields(value),
    ...directoryChoiceFields(value),
    // This legacy flag opens detail/input review; fresh detail and Quote guards establish submission eligibility.
    ...(value.access === 'ae_callable' && value.readiness === 'ready'
      || value.source === 'current' && value.access === 'setup_required' && value.readiness === 'unverified'
      ? { callable: true } : {}),
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
  const formatted = display.success && display.data.kind === 'indicative'
    && display.data.validUntil > Date.now() ? formatDisplayPrice(display.data) : undefined
  const priceLabel = formatted?.startsWith('A$') ? formatted : price === undefined ? undefined : buyerPrice(price)
  const posture = readPosture(value.availability)
  const authentication = readAuthentication(value.authentication)
  return {
    toolRef,
    title,
    ...(provider === undefined ? {} : { provider }),
    ...(priceLabel === undefined ? {} : { price: priceLabel }),
    ...directoryChoiceFields(value),
    ...(priceLabel?.startsWith('A$') === true && display.success && display.data.kind === 'indicative' ? { priceValidUntil: display.data.validUntil } : {}),
    ...(posture === undefined ? {} : { readiness: posture === 'routeable' ? 'ready' : posture === 'unavailable' ? 'unavailable' : 'unverified' }),
    ...(posture === 'routeable' && Array.isArray(value.navigation)
      && value.navigation.some((item) => isRecord(item) && item.relation === 'call')
      ? { callable: true } : {}),
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
  // A directory row keeps its listing ref and registry detail link through stored history.
  const listing = refs[0] === undefined && isExternalChatLookupRef(value.toolRef)
    && (parseCallableRef(value.toolRef)?.kind === 'listing'
      || typeof value.detailHref === 'string' && value.detailHref.startsWith('/api/v1/registry/detail?'))
  const toolRef = refs[0] ?? (listing ? value.toolRef as string : undefined)
  const title = stringField(value.title)
  if (toolRef === undefined || title === undefined) return null
  const provider = stringField(value.provider)
  const storedPrice = stringField(value.price)
  const priceValidUntil = typeof value.priceValidUntil === 'number'
    && Number.isSafeInteger(value.priceValidUntil) && value.priceValidUntil >= 0
    ? value.priceValidUntil : undefined
  const price = storedPrice?.startsWith('A$') && (priceValidUntil === undefined || priceValidUntil <= Date.now())
    ? undefined : storedPrice
  const readiness = value.readiness === 'ready' || value.readiness === 'unverified' || value.readiness === 'unavailable'
    ? value.readiness : undefined
  const access = stringField(value.access)
  return {
    toolRef,
    ...(listing ? { detailHref: `/api/v1/registry/detail?id=${encodeURIComponent(toolRef)}` } : {}),
    title,
    ...(provider === undefined ? {} : { provider }),
    ...directoryChoiceFields(value),
    ...(price === undefined ? {} : { price }),
    ...(price === undefined || priceValidUntil === undefined ? {} : { priceValidUntil }),
    ...(readiness === undefined ? {} : { readiness }),
    ...(access === undefined ? {} : { access }),
    ...(value.callable === true && !listing ? { callable: true } : {}),
    ...(value.belowMatch === true ? { belowMatch: true } : {}),
  }
}

function readRecommendation(value: unknown): ToolCardRecommendation | undefined {
  if (!isRecord(value) || !isPublicToolRef(value.toolRef) || typeof value.by !== 'string' || value.by.length > 80) return undefined
  const by = stringField(value.by)
  return by === undefined ? undefined : { toolRef: value.toolRef, by }
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

export function projectInspectResult(
  result: Extract<ToolQuoteResult, { kind: 'committed' }>,
): ToolCardProjection {
  return {
    ...chrome('tool.quote'),
    kind: 'inspect',
    state: 'complete',
    toolRefs: [result.toolRef],
    facts: [
      { label: 'Decision price', value: formatDisplayAmount(result.price) },
      { label: INSPECT_ACCOUNT_AVAILABLE_LABEL, value: formatDisplayAmount(result.account.available) },
      { label: INSPECT_AGENT_MAXIMUM_LABEL, value: formatDisplayAmount(result.budget.maximumPerCall) },
      ...(result.sourceRequirement === undefined
        ? []
        : [{ label: 'Provider requirement', value: formatCurrencyAmount(result.sourceRequirement) }]),
      { label: 'Expires', value: new Date(result.expiresAt).toISOString() },
      { label: 'Quote', value: result.quoteRef },
    ],
  }
}


function providerToolName(part: Record<string, unknown>): string | undefined {
  if (part.type === 'dynamic-tool') return typeof part.toolName === 'string' ? part.toolName : undefined
  if (typeof part.toolName === 'string') return part.toolName
  return typeof part.type === 'string' && part.type.startsWith('tool-')
    ? part.type.slice('tool-'.length)
    : undefined
}

function outputRecord(part: Record<string, unknown>): Record<string, unknown> | undefined {
  let output: unknown = part.output
  if (isRecord(output) && (output.type === 'json' || output.type === 'text')) output = output.value
  if (typeof output === 'string') {
    if (new TextEncoder().encode(output).byteLength > 64 * 1024) return undefined
    try { output = JSON.parse(output) } catch (cause) {
      return degradeBackend(cause, undefined, { site: 'toolCard.outputRecord', reason: 'invalid_response' })
    }
  }
  return isRecord(output) ? output : undefined
}

function statusCard(toolId: ChatToolId, state: 'refused' | 'error' | 'attention', summary: string, recoveryReason?: string): Extract<ToolCardProjection, { kind: 'status' }> {
  return { ...chrome(toolId), kind: 'status', state, summary, ...(recoveryReason === undefined ? {} : { recoveryReason }) }
}

function liveChoices(
  toolId: ChatToolId,
  output: Record<string, unknown>,
  choices: readonly ToolChoiceRow[],
  contrasts?: readonly ToolFact[],
  recommendation?: ToolCardRecommendation,
): Extract<ToolCardProjection, { kind: 'choices' }> {
  const count = toolId === 'registry.tools.describe' ? undefined : matchedCount(output)
  const next = toolId === 'registry.tools.search' ? firstSearchNext(output) : undefined
  return {
    ...chrome(toolId),
    kind: 'choices',
    state: 'complete',
    choices,
    toolRefs: collectToolRefs(output, choices),
    ...(count === undefined ? {} : { count }),
    ...(contrasts === undefined || contrasts.length === 0 ? {} : { contrasts }),
    ...(toolId === 'registry.tools.search' && (output.kind === 'match' || output.kind === 'scoped')
      ? { verdict: output.kind, ...(next === undefined ? {} : { next }),
        ...(isRecord(output.assessed) && (output.assessed.coverage === 'complete' || output.assessed.coverage === 'partial')
          ? { coverage: output.assessed.coverage } : {}) }
      : {}),
    ...(recommendation === undefined ? {} : { recommendation }),
  }
}

function eligibleChatSaveNeed(input: unknown, output: Record<string, unknown>): ChatSaveNeed | undefined {
  const assessed = toolChoiceSearchOutputSchema.safeParse(output)
  if (!assessed.success || assessed.data.kind !== 'noMatch'
    || assessed.data.assessed.scope !== 'complete' || assessed.data.assessed.coverage !== 'complete'
    || assessed.data.partialResults || assessed.data.pagination.hasMore) return undefined
  const searched = toolCatalogSearchInputSchema.safeParse(input)
  if (!searched.success || searched.data.query !== assessed.data.query) return undefined
  const { query, source, filters } = searched.data
  return { query, ...(source === undefined ? {} : { source }), ...(filters === undefined ? {} : { filters }) }
}

function projectLiveBody(toolId: ChatToolId, output: Record<string, unknown>, input?: unknown): ToolCardProjection {
  switch (toolId) {
    case 'registry.tools.list':
    case 'registry.tools.search': {
      if (toolId === 'registry.tools.search') {
        if (output.kind === 'unavailable' || output.kind === 'noMatch') {
          const next = firstSearchNext(output)
          const saveNeed = output.kind === 'noMatch' ? eligibleChatSaveNeed(input, output) : undefined
          return {
            ...statusCard(toolId, output.kind === 'unavailable' ? 'error' : 'attention',
              output.kind === 'unavailable' ? 'Search is temporarily unavailable.' : 'No suitable Tool in the assessed catalogue.'),
            ...(next === undefined ? {} : { next }),
            ...(saveNeed === undefined ? {} : { saveNeed }),
          }
        }
        return liveChoices(toolId, output, projectLiveChoices(output.results), undefined, readRecommendation(output.recommendation))
      }
      return liveChoices(toolId, output, projectLiveChoices(output.items))
    }
    case 'registry.tools.compare': {
      const choices = projectLiveChoices(output.tools)
      return liveChoices(toolId, output, choices, buyerCompareContrasts(output, choices))
    }
    case 'registry.tools.describe': {
      const choice = projectLiveChoice(output.tool ?? output)
      return liveChoices(toolId, output, choice === null ? [] : [choice])
    }
    case 'tool.quote':
    case 'tool.call':
    case 'tool.plan.suggest':
    case 'tool.plan.import':
    case 'tool.plan.quote':
    case 'tool.plan.run':
    case 'tool.plan.get':
    case 'chat.clarify':
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
  if (part.kind === 'clarify' && toolId === 'chat.clarify') return projectStoredClarify(part)
  if (part.kind === 'status' || part.state === 'refused' || part.state === 'error') {
    const state = part.state === 'refused' || part.state === 'error' || part.state === 'attention' ? part.state : 'error'
    const next = firstSearchNext(part)
    const saveNeed = toolId === 'registry.tools.search' && state === 'attention'
      ? storedSaveNeedSchema.safeParse(part.saveNeed)
      : undefined
    const funding = toolId === 'tool.quote' && state === 'refused' && isRecord(part.funding)
      ? exactAmountSchema.safeParse({ ...part.funding, currency: 'AUD' })
      : undefined
    const planRef = storedPlanReference(toolId, part.planRef)
    return {
      ...(planRef === undefined ? {} : { planRef }),
      ...statusCard(toolId, state, stringField(part.summary) ?? (state === 'refused' ? 'Request refused' : 'Tool unavailable'), stringField(part.recoveryReason)),
      ...(funding?.success && funding.data.currency === 'AUD'
        ? { funding: { units: funding.data.units, exponent: funding.data.exponent } }
        : {}),
      ...(next === undefined ? {} : { next }),
      ...(saveNeed?.success ? { saveNeed: saveNeed.data } : {}),
    }
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
    const paid = state === 'completed' ? boundedString(part.paid, 80) : undefined
    const summary = boundedString(part.summary, 320) ?? 'Call result recorded.'
    const nextAction = boundedString(part.nextAction, 320)
    const recoveryReason = stringField(part.recoveryReason)
    return {
      ...chrome(toolId),
      kind: 'execute',
      state,
      toolRefs: refs,
      ...(name === undefined ? {} : { name }),
      ...(callRef === undefined ? {} : { callRef }),
      ...(recoveryReason === undefined ? {} : { recoveryReason }),
      ...(outputPreview === undefined ? {} : { outputPreview }),
      ...(part.outputTruncated === true ? { outputTruncated: true } : {}),
      ...(paid === undefined ? {} : { paid }),
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
  const title = stringField(part.title)
  const surface = part.surface === 'compare' || part.surface === 'describe' ? part.surface : undefined
  const next = firstSearchNext(part)
  const recommendation = toolId === 'registry.tools.search' ? readRecommendation(part.recommendation) : undefined
  return {
    ...chrome(toolId),
    ...(title === undefined ? {} : { title }),
    kind: 'choices',
    state: 'complete',
    choices: projectStoredChoices(part.choices),
    toolRefs: refs,
    ...(count === undefined ? {} : { count }),
    ...(surface === undefined ? {} : { surface }),
    ...(contrasts.length === 0 ? {} : { contrasts }),
    ...(part.verdict === 'match' || part.verdict === 'scoped' ? { verdict: part.verdict } : {}),
    ...(part.coverage === 'complete' || part.coverage === 'partial' ? { coverage: part.coverage } : {}),
    ...(next === undefined ? {} : { next }),
    ...(recommendation === undefined ? {} : { recommendation }),
  }
}

function projectClarifyPart(part: Record<string, unknown>): ToolCardProjection {
  if (isRecord(part.output) && part.output.kind === 'chat_tool_refused') {
    const reason = typeof part.output.reason === 'string' ? REFUSAL_SUMMARIES[part.output.reason] : undefined
    return statusCard('chat.clarify', 'refused', reason ?? 'Request refused', typeof part.output.reason === 'string' ? part.output.reason : undefined)
  }
  const parsed = chatClarifyInputSchema.safeParse(part.input)
  if (!parsed.success) {
    return part.state === 'output-available'
      ? statusCard('chat.clarify', 'error', 'Tool unavailable', 'tool_unavailable')
      : { ...chrome('chat.clarify'), kind: 'working' }
  }
  return {
    ...chrome('chat.clarify'),
    kind: 'clarify',
    question: parsed.data.question,
    choices: parsed.data.choices,
  }
}

function projectStoredClarify(part: Record<string, unknown>): ToolCardProjection {
  const parsed = chatClarifyInputSchema.safeParse({
    question: part.question,
    choices: part.choices,
  })
  if (!parsed.success) return statusCard('chat.clarify', 'error', 'Tool unavailable')
  const answer = storedClarifyAnswer(part.answer)
  return {
    ...chrome('chat.clarify'),
    kind: 'clarify',
    question: parsed.data.question,
    choices: parsed.data.choices,
    ...(answer === undefined ? {} : { answer }),
  }
}

export function projectToolCard(part: unknown): ToolCardProjection | null {
  if (!isRecord(part)) return null
  if (part.type === 'tool-card') return projectStoredCard(part)

  const providerName = providerToolName(part)
  const toolId = providerName === undefined ? undefined : providerToCanonical[providerName]
  if (toolId === undefined) return null
  if (part.state === 'output-error') return statusCard(toolId, 'error', 'Tool unavailable', 'tool_unavailable')
  if (part.state === 'output-denied') return statusCard(toolId, 'refused', 'Request refused', 'authority_denied')
  if (toolId === 'chat.clarify') return projectClarifyPart(part)
  if (part.state !== 'output-available') return { ...chrome(toolId), kind: 'working' }

  const output = outputRecord(part)
  const kind = output?.kind
  if (kind === 'error') return statusCard(toolId, 'error', 'Tool unavailable', 'tool_unavailable')
  if (kind === 'unavailable' && toolId !== 'registry.tools.search') return statusCard(toolId, 'error', 'Tool unavailable', 'tool_unavailable')
  if (toolId === 'tool.plan.suggest' || toolId === 'tool.plan.import' || toolId === 'tool.plan.quote' || toolId === 'tool.plan.run' || toolId === 'tool.plan.get') {
    if (kind === 'chat_tool_refused') return statusCard(toolId, 'refused', 'Plan request refused', stringField(output?.reason))
    return { ...chrome(toolId), ...projectChatPlan(toolId, output) }
  }
  if (toolId === 'tool.call') {
    if (kind === 'chat_tool_refused') {
      const reason = typeof output?.reason === 'string' ? REFUSAL_SUMMARIES[output.reason] : undefined
      return statusCard(toolId, 'refused', reason ?? 'Request refused', typeof output?.reason === 'string' ? output.reason : undefined)
    }
    if (output === undefined) return statusCard(toolId, 'error', 'Tool unavailable')
    const machine = callMachineResultSchema.safeParse(output)
    const result = machine.success
      ? (() => {
        const value = machine.data
        if (value.kind === 'completed') return callResultSchema.safeParse(value)
        const { next: _next, ...facts } = value
        if (value.kind === 'outcome_unknown') return callResultSchema.safeParse({ ...facts, kind: 'reconciliation_required' })
        if (value.kind === 'refused') {
          const { detail, ownerHandoff: _handoff, callRef: _callRef, ...refusal } = facts as Extract<typeof value, { kind: 'refused' }>
          return callResultSchema.safeParse({ ...refusal, ...(detail === undefined ? {} : { nextAction: detail }) })
        }
        return callResultSchema.safeParse(facts)
      })()
      : callResultSchema.safeParse(output)
    return result.success
      ? projectCallResult(result.data)
      : statusCard(toolId, 'error', 'Tool unavailable')
  }
  if (toolId === 'tool.quote') {
    if (kind === 'chat_tool_refused') {
      const reason = typeof output?.reason === 'string' ? REFUSAL_SUMMARIES[output.reason] : undefined
      const funding = output?.reason === 'insufficient_balance'
        ? fundingShortfall(output.funding)
        : undefined
      return {
        ...statusCard(toolId, 'refused', reason ?? 'Request refused', typeof output?.reason === 'string' ? output.reason : undefined),
        ...(funding === undefined ? {} : { funding }),
      }
    }
    if (output === undefined) return statusCard(toolId, 'error', 'Tool unavailable')
    const result = parseStoredToolQuoteOutput(output)
    if (!result.success) return statusCard(toolId, 'error', 'Tool unavailable')
    if (result.data.kind === 'committed') return projectInspectResult(result.data)
    const funding = result.data.code === 'insufficient_balance'
      && result.data.continuation?.action === 'funding.handoff.create'
      ? {
          units: result.data.continuation.args.principalAmount.units,
          exponent: result.data.continuation.args.principalAmount.exponent,
        }
      : undefined
    return {
      ...statusCard(
        toolId,
        'refused',
        result.data.ownerHandoff?.reason
          ?? REFUSAL_SUMMARIES[result.data.code] ?? result.data.code.replaceAll('_', ' '),
        result.data.code,
      ),
      ...(funding === undefined ? {} : { funding }),
    }
  }
  const refused = kind === 'refused'
    || kind === 'chat_tool_refused'
    || kind === 'not_found'
  if (refused) {
    const reason = typeof output?.reason === 'string' ? REFUSAL_SUMMARIES[output.reason] : undefined
    const summary = reason
      ?? (kind === 'not_found' ? 'Not found' : 'Request refused')
    return statusCard(toolId, 'refused', summary, typeof output?.reason === 'string' ? output.reason : kind === 'not_found' ? 'tool_not_found' : undefined)
  }
  if (output === undefined) return statusCard(toolId, 'error', 'Tool unavailable')
  if (kind !== 'ok' && kind !== 'found' && !(toolId === 'registry.tools.describe' && kind === 'external') && !(toolId === 'registry.tools.search'
    && (kind === 'match' || kind === 'scoped' || kind === 'noMatch' || kind === 'unavailable'))) {
    return statusCard(toolId, 'error', 'Tool unavailable')
  }
  return projectLiveBody(toolId, output, part.input)
}

function shareableInspectFacts(facts: readonly ToolFact[]): readonly ToolFact[] {
  return facts.filter((fact) => !INSPECT_OWNER_FUNDING_FACT_LABELS.has(fact.label))
}

export function serializeToolCard(card: ToolCardProjection): Record<string, unknown> | null {
  switch (card.kind) {
    case 'working':
      return null
    case 'clarify':
      return {
        type: 'tool-card',
        kind: 'clarify',
        toolId: card.toolId,
        title: card.title,
        question: card.question,
        choices: [...card.choices],
        ...(card.answer === undefined ? {} : { answer: card.answer }),
      }
    case 'status':
      return {
        type: 'tool-card',
        kind: 'status',
        toolId: card.toolId,
        title: card.title,
        state: card.state,
        summary: card.summary,
        ...(card.planRef === undefined ? {} : { planRef: card.planRef }),
        ...(card.recoveryReason === undefined ? {} : { recoveryReason: card.recoveryReason }),
        ...(card.next === undefined ? {} : { next: card.next }),
        ...(card.saveNeed === undefined ? {} : { saveNeed: card.saveNeed }),
        ...(card.funding === undefined ? {} : { funding: card.funding }),
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
        ...(card.surface === undefined ? {} : { surface: card.surface }),
        ...(card.verdict === undefined ? {} : { verdict: card.verdict }),
        ...(card.coverage === undefined ? {} : { coverage: card.coverage }),
        ...(card.next === undefined ? {} : { next: card.next }),
        ...(card.recommendation === undefined ? {} : { recommendation: { ...card.recommendation } }),
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
        facts: shareableInspectFacts(card.facts).map((fact) => ({ ...fact })),
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
        ...(card.paid === undefined ? {} : { paid: card.paid }),
        facts: card.facts.map((fact) => ({ ...fact })),
        ...(card.receiptRef === undefined ? {} : { receiptRef: card.receiptRef }),
        ...(card.evidenceHash === undefined ? {} : { evidenceHash: card.evidenceHash }),
        summary: card.summary,
        ...(card.recoveryReason === undefined ? {} : { recoveryReason: card.recoveryReason }),
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
    case 'clarify':
      return card.answer === undefined ? 'working' : 'complete'
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
