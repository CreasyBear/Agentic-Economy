// Invariant: one Tool contract determines the editable Run input, following the chat's server-validated Tool detail query.
import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from 'convex/react'
import { api } from '../../../../../convex/_generated/api'
import { degrade } from '@/lib/observability/degrade'
import { bindToolInput } from '@/modules/common/tool-input-binding'
import { parseChatQuoteInput } from '@/modules/chat/tool-card'
import { deserializeToolDetailResult } from '@/modules/capability-supply/public'
import { toolInputSchema, supportsToolInputForm, parseToolInputJson } from '@/components/ae/shared/tool-input-form/tool-input-form'
import type { ToolPanelContract, ToolPanelProps, ToolPanelSubmission } from './tool-panel.contracts'
import { projectToolPanel } from './tool-panel.view-model'

export function useToolPanel(props: ToolPanelProps) {
  const result = useQuery(api.capabilitySupplyTools.detail, { toolRef: props.option.id })
  const [editedInput, setEditedInput] = useState<Readonly<{ identity: string; text: string }>>()
  const [submissionState, setSubmissionState] = useState<Readonly<{
    identity: string
    submission: ToolPanelSubmission
  }>>()
  const [runFailureState, setRunFailureState] = useState<Readonly<{
    identity: string
    failure: 'not_sent' | 'outcome_unknown'
  }>>()
  const reportedInvalidContract = useRef(false)
  const reportedUnsupported = useRef(false)
  const activeRequest = useRef<number | null>(null)
  const requestSequence = useRef(0)
  const mounted = useRef(false)

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  const detailState = useMemo(() => {
    if (result === undefined) return { kind: 'loading' as const }
    try {
      const detail = deserializeToolDetailResult(result)
      return detail.kind === 'found'
        ? { kind: 'found' as const, tool: detail.tool }
        : { kind: 'unavailable' as const }
    } catch (cause) {
      return { kind: 'invalid' as const, cause }
    }
  }, [result])
  useEffect(() => {
    if (detailState.kind !== 'invalid' || reportedInvalidContract.current) return
    reportedInvalidContract.current = true
    degrade(detailState.cause, undefined, { site: 'toolPanelContract', reason: 'invalid_response' })
  }, [detailState])
  const tool = detailState.kind === 'loading' ? undefined
    : detailState.kind === 'found' ? detailState.tool : null
  const schema = useMemo(() => tool === undefined || tool === null
    ? undefined
    : toolInputSchema(JSON.stringify(tool.contract.inputJsonSchema)), [tool])
  const supported = schema !== undefined && supportsToolInputForm(schema)
  useEffect(() => {
    if (schema === undefined || supported || reportedUnsupported.current) return
    reportedUnsupported.current = true
    degrade(new Error('Tool input schema needs the JSON editor.'), undefined, { site: 'toolPanelSchema', reason: 'invalid_response' })
  }, [schema, supported])
  const binding = useMemo(() => schema === undefined ? undefined : bindToolInput(props.message, schema), [props.message, schema])
  const contract: ToolPanelContract | Readonly<{ kind: 'unavailable' }> | undefined = result === undefined
    ? undefined
    : schema === undefined || binding === undefined ? { kind: 'unavailable' } : { kind: 'found', schema, binding }
  const inputIdentity = schema === undefined ? undefined : JSON.stringify([props.message, schema])
  const inputText = inputIdentity === undefined || editedInput?.identity !== inputIdentity ? undefined : editedInput.text
  const submission = submissionState !== undefined && submissionState.identity === inputIdentity
    ? submissionState.submission : 'idle'
  const runFailure = runFailureState !== undefined && runFailureState.identity === inputIdentity
    ? runFailureState.failure : undefined
  const view = projectToolPanel({ props, contract, inputText, submission, ...(runFailure === undefined ? {} : { runFailure }) })

  function changeInputText(text: string): void {
    if (inputIdentity === undefined) return
    setEditedInput({ identity: inputIdentity, text })
  }

  async function run(): Promise<void> {
    if (!view.canRun || inputIdentity === undefined || activeRequest.current !== null) return
    const parsed = parseToolInputJson(view.inputText)
    const serialized = parsed === undefined ? undefined : JSON.stringify(parsed)
    const input = serialized === undefined ? undefined : parseChatQuoteInput(props.option.id, serialized)
    if (input === undefined) return
    const intent = { toolRef: props.option.id, title: props.option.name, input }
    if (props.runMode === 'add_credit') {
      props.onAddCredit(intent)
      return
    }

    const requestId = ++requestSequence.current
    activeRequest.current = requestId
    setSubmissionState({ identity: inputIdentity, submission: 'submitting' })
    setRunFailureState(undefined)
    try {
      const outcome = await props.onRun(intent)
      if (!mounted.current || activeRequest.current !== requestId) return
      if (outcome.kind === 'submitted') {
        setSubmissionState({ identity: inputIdentity, submission: 'submitted' })
        setRunFailureState(undefined)
      } else if (outcome.kind === 'outcome_unknown') {
        setSubmissionState({ identity: inputIdentity, submission: 'outcome_unknown' })
        setRunFailureState({ identity: inputIdentity, failure: 'outcome_unknown' })
      } else {
        setSubmissionState({ identity: inputIdentity, submission: 'idle' })
        setRunFailureState({ identity: inputIdentity, failure: 'not_sent' })
      }
    } catch (cause) {
      degrade(cause, undefined, { site: 'toolPanel.run', reason: 'source_unavailable' })
      if (mounted.current && activeRequest.current === requestId) {
        setSubmissionState({ identity: inputIdentity, submission: 'outcome_unknown' })
        setRunFailureState({ identity: inputIdentity, failure: 'outcome_unknown' })
      }
    } finally {
      if (activeRequest.current === requestId) activeRequest.current = null
    }
  }

  function runAgain(): void {
    if (activeRequest.current !== null || inputIdentity === undefined || submission !== 'submitted') return
    setSubmissionState({ identity: inputIdentity, submission: 'idle' })
    setRunFailureState(undefined)
  }

  return { view, setInputText: changeInputText, run, runAgain }
}
