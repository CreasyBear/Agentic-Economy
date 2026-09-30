// Invariant: Tool panels carry review state separately from pure form presentation, following the chat session contracts.
import type { RefObject } from 'react'
import type { RJSFSchema, UiSchema } from '@rjsf/utils'
import type { OptionView } from '../generative/generative.contracts'
import type { ChatRunResult } from '../chat-session/chat-session.contracts'
import type { ToolInputBinding } from '@/modules/common/tool-input-binding'
import type { RunIntent } from '@/modules/chat/run-request'

export type ToolPanelRunMode = 'run' | 'add_credit'
export type ToolPanelPhase = 'loading' | 'unavailable' | 'form' | 'json'
export type ToolPanelSubmission = 'idle' | 'submitting' | 'submitted' | 'outcome_unknown'

export type ToolPanelProps = Readonly<{
  option: OptionView
  message: string
  recommendedBy?: string
  panelId?: string
  open: boolean
  runMode: ToolPanelRunMode
  generating: boolean
  focusOnOpen: boolean
  onRun: (intent: RunIntent) => Promise<ChatRunResult>
  onAddCredit: (intent: RunIntent) => void
  onClose: () => void
}>

export type ToolPanelContract = Readonly<{
  kind: 'found'
  schema: RJSFSchema
  binding: ToolInputBinding
}>

export type ToolPanelView = Readonly<{
  heading: string
  seller?: string
  price: string
  priceValidUntil?: number
  readiness: string
  bestMatch: boolean
  disclosure?: string
  phase: ToolPanelPhase
  schema?: RJSFSchema
  formData?: unknown
  uiSchema?: UiSchema
  inputText: string
  incomplete?: string
  canRun: boolean
  disabledReason?: string
  runFailure?: 'not_sent' | 'outcome_unknown'
  consequence: string
  priceNote: string
  submission: ToolPanelSubmission
}>

export type ToolPanelHeaderProps = Readonly<{
  view: ToolPanelView
  headingId: string
  headingRef: RefObject<HTMLHeadingElement | null>
  onClose: () => void
}>
export type ToolPanelFormProps = Readonly<{
  view: ToolPanelView
  idPrefix: string
  onInputTextChange: (value: string) => void
}>
export type ToolPanelActionsProps = Readonly<{
  view: ToolPanelView
  statusId: string
  onRun: () => void
  onRunAgain: () => void
}>
