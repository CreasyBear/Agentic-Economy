import { useState } from 'react'

import { useClipboardCopy } from '@/hooks/use-clipboard-copy'
import { toast } from '@/lib/ui/toast'
import type { Rule4Diagnostic } from '@/lib/ui/diagnostic'
import { validateJsonSchema } from '@/modules/capability-contract/public'
import type { ToolTestResponse } from '@/modules/capability-supply/tool-test.contracts'

import {
  PROBE_FAILURE_DIAGNOSTIC,
  SCHEMA_DIAGNOSTIC,
  SYNTAX_DIAGNOSTIC,
} from './tool-test-playground.contracts'
import { extractDefaultPayload, extractExamplePayload } from './tool-test-payload'

export type UseToolTestPlaygroundArgs = Readonly<{
  inputSchema?: Record<string, unknown>
  onSendTestRequest?: (payload: unknown) => Promise<ToolTestResponse>
}>

export function useToolTestPlayground({
  inputSchema,
  onSendTestRequest,
}: UseToolTestPlaygroundArgs) {
  const defaultPayload = extractDefaultPayload(inputSchema)
  const [inputJson, setInputJson] = useState(() => JSON.stringify(defaultPayload, null, 2))
  const [diagnostic, setDiagnostic] = useState<Rule4Diagnostic>()
  const [isRunning, setIsRunning] = useState(false)
  const [response, setResponse] = useState<ToolTestResponse>()

  const responseCopyText =
    response?.data !== undefined ? JSON.stringify(response.data, null, 2) : ''
  const { isCopied: hasCopied, copy: handleCopy } = useClipboardCopy(responseCopyText, {
    ignoreWhileCopied: true,
  })

  function handleLoadExamples() {
    setDiagnostic(undefined)
    setInputJson(JSON.stringify(extractExamplePayload(inputSchema), null, 2))
    toast.success('Example arguments loaded')
  }

  function handleResetDefaults() {
    setDiagnostic(undefined)
    setInputJson(JSON.stringify(extractDefaultPayload(inputSchema), null, 2))
  }

  async function handleSend() {
    setDiagnostic(undefined)
    let parsed: unknown
    try {
      parsed = JSON.parse(inputJson)
    } catch (cause) {
      void cause
      setDiagnostic(SYNTAX_DIAGNOSTIC)
      return
    }

    if (inputSchema !== undefined && !validateJsonSchema(inputSchema, parsed)) {
      setDiagnostic(SCHEMA_DIAGNOSTIC)
      return
    }

    if (!onSendTestRequest) return
    setIsRunning(true)
    try {
      const res = await onSendTestRequest(parsed)
      setResponse(res)
      if (res.status >= 400) {
        setDiagnostic(PROBE_FAILURE_DIAGNOSTIC)
      }
    } catch (err) {
      setResponse({
        status: 500,
        latencyMs: 0,
        error: err instanceof Error ? err.message : 'Unknown error during test execution',
      })
      setDiagnostic(PROBE_FAILURE_DIAGNOSTIC)
    } finally {
      setIsRunning(false)
    }
  }

  const parseError = diagnostic === SYNTAX_DIAGNOSTIC

  return {
    inputJson,
    setInputJson,
    diagnostic,
    parseError,
    isRunning,
    response,
    hasCopied,
    handleCopy,
    handleLoadExamples,
    handleResetDefaults,
    handleSend,
  }
}
