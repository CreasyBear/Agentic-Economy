// Invariant: the displayed JSON is exactly the validated Run input, following the shared Tool form contract.
import type { RJSFSchema, UiSchema } from '@rjsf/utils'
import { chatToolPanel, chatToolPanelComplete, chatToolPanelMatchedBy } from '@/lib/public/chat-ia'
import { bindingToFormData } from '@/modules/common/tool-input-binding'
import { isRecord } from '@/modules/common/is-record'
import { parseChatQuoteInput, toolChoiceReadinessLabel } from '@/modules/chat/tool-card'
import { toolInputValidator, parseToolInputJson, supportsToolInputForm } from '@/components/ae/shared/tool-input-form/tool-input-form'
import type { ToolPanelContract, ToolPanelProps, ToolPanelSubmission, ToolPanelView } from './tool-panel.contracts'

const MAX_INPUT_BYTES = 1_500

type ContractState = ToolPanelContract | Readonly<{ kind: 'unavailable' }> | undefined

function valueAtPath(value: unknown, path: readonly string[]): unknown {
  let current = value
  for (const segment of path) {
    if (!isRecord(current)) return undefined
    current = current[segment]
  }
  return current
}

function setHelpAtPath(uiSchema: Record<string, unknown>, path: readonly string[], label: string): void {
  let current = uiSchema
  for (const segment of path.slice(0, -1)) {
    const child = current[segment]
    if (!isRecord(child)) current[segment] = {}
    current = current[segment] as Record<string, unknown>
  }
  const leaf = path.at(-1)
  if (leaf !== undefined) current[leaf] = { 'ui:help': label }
}

function projectUiSchema(contract: ToolPanelContract, value: unknown): UiSchema | undefined {
  const uiSchema: Record<string, unknown> = {}
  for (const entry of contract.binding.defaults) {
    if (valueAtPath(value, entry.path) === entry.value) setHelpAtPath(uiSchema, entry.path, chatToolPanel.providerDefault)
  }
  for (const entry of contract.binding.bound) {
    if (valueAtPath(value, entry.path) === entry.value) setHelpAtPath(uiSchema, entry.path, chatToolPanel.fromMessage)
  }
  return Object.keys(uiSchema).length === 0 ? undefined : uiSchema as UiSchema
}


function initialInputText(contract: ToolPanelContract | undefined): string {
  if (contract === undefined) return '{}'
  return JSON.stringify(bindingToFormData([...contract.binding.defaults, ...contract.binding.bound]), null, 2)
}

export function projectToolPanel(args: Readonly<{
  props: ToolPanelProps
  contract: ContractState
  inputText: string | undefined
  submission: ToolPanelSubmission
  runFailure?: 'not_sent' | 'outcome_unknown'
}>): ToolPanelView {
  const { props, contract, submission } = args
  const schema = contract?.kind === 'found' && isRecord(contract.schema) ? contract.schema as RJSFSchema : undefined
  const inputText = args.inputText ?? initialInputText(contract?.kind === 'found' ? contract : undefined)
  const value = parseToolInputJson(inputText)
  const validation = value !== undefined && schema !== undefined
    ? toolInputValidator.validateFormData(value, schema)
    : undefined
  const rejectedSchema = validation?.errors.some(error => error.name === 'schema' && (error.property ?? '') === '') ?? false
  const phase: ToolPanelView['phase'] = rejectedSchema ? 'unavailable'
    : contract === undefined ? 'loading'
      : contract.kind !== 'found' || schema === undefined ? 'unavailable'
        : supportsToolInputForm(schema) ? 'form' : 'json'
  const invalidFields = [...new Set((validation?.errors ?? []).map(error => {
    const segments = (error.property ?? '').match(/\[(?:"(?:\\.|[^"])*"|\d+)\]/gu)
    if (segments === null) return (error.property ?? '').replace(/^\./u, '')
    return segments.map(segment => {
      try { return String(JSON.parse(segment.slice(1, -1))) } catch { return '' }
    }).filter(Boolean).join('.')
  }).filter(Boolean))].slice(0, 4)
  const uiSchema = contract?.kind === 'found' && schema !== undefined && value !== undefined
    ? projectUiSchema(contract, value) : undefined
  const serialized = value === undefined ? undefined : JSON.stringify(value)
  const inputTooLong = serialized !== undefined && new TextEncoder().encode(serialized).byteLength > MAX_INPUT_BYTES
  const input = schema === undefined || serialized === undefined
    ? undefined
    : parseChatQuoteInput(props.option.id, serialized)
  const incomplete = inputTooLong ? chatToolPanel.tooLong
    : invalidFields.length > 0 || value === undefined ? chatToolPanelComplete(invalidFields)
      : undefined
  const canRun = props.open && (phase === 'form' || phase === 'json')
    && value !== undefined && validation?.errors.length === 0 && input !== undefined && !inputTooLong
    && submission === 'idle' && !props.generating
  const disabledReason = props.generating && (phase === 'form' || phase === 'json')
    && value !== undefined && validation?.errors.length === 0 && input !== undefined && !inputTooLong
    ? chatToolPanel.waitForResponse : undefined
  const seller = props.option.seller === undefined ? undefined
    : `${props.option.seller.kind === 'provider' ? 'Sold by' : 'Listed on'} ${props.option.seller.name}`

  return {
    heading: props.option.name,
    ...(seller === undefined ? {} : { seller }),
    price: props.option.price,
    ...(props.option.priceValidUntil === undefined ? {} : { priceValidUntil: props.option.priceValidUntil }),
    readiness: toolChoiceReadinessLabel(props.option.readiness),
    bestMatch: props.recommendedBy !== undefined,
    ...(props.recommendedBy === undefined ? {} : { disclosure: chatToolPanelMatchedBy(props.recommendedBy) }),
    phase,
    ...(schema === undefined ? {} : { schema }),
    ...(value === undefined ? {} : { formData: value }),
    ...(uiSchema === undefined ? {} : { uiSchema }),
    inputText,
    ...(incomplete === undefined ? {} : { incomplete }),
    canRun,
    ...(disabledReason === undefined ? {} : { disabledReason }),
    ...(args.runFailure === undefined ? {} : { runFailure: args.runFailure }),
    consequence: props.runMode === 'run' ? chatToolPanel.runNow : chatToolPanel.runAfterCredit,
    priceNote: chatToolPanel.priceNote,
    submission,
  }
}
