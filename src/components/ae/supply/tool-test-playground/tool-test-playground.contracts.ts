import type { Rule4Diagnostic } from '@/lib/ui/diagnostic'
import type { ToolTestResponse } from '@/modules/capability-supply/tool-test.contracts'

export const SYNTAX_DIAGNOSTIC: Rule4Diagnostic = {
  whatHappened: 'Invalid JSON format.',
  financialImpact: 'A$0.00 affected — dry run probe blocked.',
  nextStep: 'Check syntax and ensure valid JSON before sending.',
}

export const SCHEMA_DIAGNOSTIC: Rule4Diagnostic = {
  whatHappened: 'Payload does not match schema.',
  financialImpact: 'A$0.00 affected — dry run probe blocked.',
  nextStep: 'Adjust arguments to satisfy required schema properties.',
}

export const PROBE_FAILURE_DIAGNOSTIC: Rule4Diagnostic = {
  whatHappened: 'Provider endpoint simulation failed.',
  financialImpact: 'A$0.00 affected — sandbox probe only.',
  nextStep: 'Verify the provider service is running and accessible.',
}

export type AeToolTestPlaygroundProps = Readonly<{
  toolName: string
  inputSchema?: Record<string, unknown>
  onSendTestRequest?: (payload: unknown) => Promise<ToolTestResponse>
}>

export type JsonPayloadEditorProps = Readonly<{
  inputJson: string
  onInputJsonChange: (value: string) => void
  parseError: boolean
  diagnostic?: Rule4Diagnostic
  isRunning: boolean
  onLoadExamples: () => void
  onResetDefaults: () => void
}>

export type PlaygroundResponsePaneProps = Readonly<{
  response?: ToolTestResponse
  hasCopied: boolean
  onCopy: () => void
}>
