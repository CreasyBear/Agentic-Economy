import type { z } from 'zod'
import type { CallResult } from '@/modules/capability-execution/call-contracts'
import type { SuggestedNextAction } from '@/modules/market/suggested-next-action'
import type { toolCatalogSearchInputSchema, RegistryNextAction } from '@/modules/registry/tool-choice-contracts'
import type { ChatToolId } from './tool-ids'

export type CardChrome = Readonly<{
  toolId: ChatToolId
  title: string
}>

export type ToolChoiceRow = Readonly<{
  toolRef: string
  detailHref?: string
  title: string
  summary?: string
  provider?: string
  price?: string
  priceValidUntil?: number
  sourcePrice?: string
  host?: string
  resourcePath?: string
  networkLabel?: string
  readiness?: 'ready' | 'unverified' | 'unavailable'
  access?: string
  callable?: boolean
  belowMatch?: boolean
}>
export type ToolCardRecommendation = Readonly<{ toolRef: string; by: string }>

export type ToolFact = Readonly<{
  label: string
  value: string
}>

export type CallResultState = CallResult['kind']
export type ChatSaveNeed = Readonly<Pick<z.output<typeof toolCatalogSearchInputSchema>, 'query' | 'source' | 'filters'>>

export type ToolCardProjection =
  | (CardChrome & { kind: 'working' })
  | (CardChrome & { kind: 'status'; state: 'refused' | 'error' | 'attention'; summary: string; planRef?: string; recoveryReason?: string; next?: RegistryNextAction; saveNeed?: ChatSaveNeed; funding?: { units: string; exponent: number } })
  | (CardChrome & {
      kind: 'choices'
      state: 'complete'
      choices: readonly ToolChoiceRow[]
      toolRefs: readonly string[]
      count?: number
      contrasts?: readonly ToolFact[]
      surface?: 'compare' | 'describe'
      verdict?: 'match' | 'scoped'
      coverage?: 'complete' | 'partial'
      next?: RegistryNextAction
      recommendation?: ToolCardRecommendation
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
      paid?: string
      receiptRef?: string
      evidenceHash?: string
      summary: string
      nextAction?: string
      retryable?: boolean
      recoveryReason?: string
      suggestedNextAction?: SuggestedNextAction
    })
  | (CardChrome & {
      kind: 'clarify'
      question: string
      choices: readonly string[]
      answer?: string
    })
