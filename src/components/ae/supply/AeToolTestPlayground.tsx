import { useState } from 'react'
import { CheckIcon, CopyIcon } from 'lucide-react'

import { AeSection } from '@/components/ae/layout/AeSection'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useClipboardCopy } from '@/hooks/use-clipboard-copy'
import { cn } from '@/lib/utils'
import { toast } from '@/lib/ui/toast'
import { validateJsonSchema } from '@/modules/capability-contract/public'

export const TACTILE =
  'enabled:active:scale-[0.98] transition-transform duration-100 ease-out motion-reduce:transition-none motion-reduce:active:scale-100'

export type ToolTestResponse = Readonly<{
  status: number
  latencyMs: number
  data?: unknown
  error?: string
}>

type PlaygroundDiagnostic = Readonly<{
  whatHappened: string
  financialImpact: string
  nextStep: string
}>

const SYNTAX_DIAGNOSTIC: PlaygroundDiagnostic = {
  whatHappened: 'Invalid JSON format.',
  financialImpact: 'A$0.00 affected — dry run probe blocked.',
  nextStep: 'Check syntax and ensure valid JSON before sending.',
}

const SCHEMA_DIAGNOSTIC: PlaygroundDiagnostic = {
  whatHappened: 'Payload does not match schema.',
  financialImpact: 'A$0.00 affected — dry run probe blocked.',
  nextStep: 'Adjust arguments to satisfy required schema properties.',
}

const PROBE_FAILURE_DIAGNOSTIC: PlaygroundDiagnostic = {
  whatHappened: 'Provider endpoint simulation failed.',
  financialImpact: 'A$0.00 affected — sandbox probe only.',
  nextStep: 'Verify the provider service is running and accessible.',
}

export function AeToolTestPlayground({
  toolName,
  inputSchema,
  onSendTestRequest,
}: Readonly<{
  toolName: string
  inputSchema?: Record<string, unknown>
  onSendTestRequest?: (payload: unknown) => Promise<ToolTestResponse>
}>) {
  const defaultPayload = extractDefaultPayload(inputSchema)
  const [inputJson, setInputJson] = useState(() => JSON.stringify(defaultPayload, null, 2))
  const [diagnostic, setDiagnostic] = useState<PlaygroundDiagnostic>()
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
    } catch {
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

  return (
    <AeSection
      title="Interactive Test Playground"
      description={`Zero-cost sandbox probe for ${toolName}. Validates input against the declared schema, calls the provider endpoint in simulation mode, and never creates Quotes, Charges, or buyer balance movements.`}
    >
      <div className="grid gap-4 rounded-xl border border-border bg-card p-4">
        <div
          role="status"
          className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-foreground"
        >
          Simulation Mode: Zero credit deducted. Sandbox dry-run probes never create Quotes, Charges,
          or debits.
        </div>

        <div className="grid gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Label htmlFor="test-input-json" className="text-sm font-semibold">
              Input Parameters (JSON)
            </Label>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={cn('h-7 text-xs', TACTILE)}
                onClick={handleLoadExamples}
                disabled={isRunning}
              >
                Load Example Arguments
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className={cn('h-7 text-xs', TACTILE)}
                onClick={handleResetDefaults}
                disabled={isRunning}
              >
                Reset to defaults
              </Button>
            </div>
          </div>
          <Textarea
            id="test-input-json"
            value={inputJson}
            onChange={(e) => setInputJson(e.target.value)}
            rows={5}
            className="font-mono text-xs leading-relaxed"
            placeholder="{}"
            aria-label="Input Parameters (JSON)"
          />
          <div className="min-h-[2.5rem]" aria-live="polite" role="status">
            {diagnostic ? (
              <Alert variant="destructive" className="py-2">
                <AlertTitle className="text-xs font-semibold">{diagnostic.whatHappened}</AlertTitle>
                <AlertDescription className="grid gap-0.5 text-xs">
                  <span className="font-mono tabular-nums">{diagnostic.financialImpact}</span>
                  <span>{diagnostic.nextStep}</span>
                </AlertDescription>
              </Alert>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            onClick={handleSend}
            disabled={isRunning}
            className={cn('min-h-touch', TACTILE)}
          >
            {isRunning ? 'Sending invocation…' : 'Send Test Invocation'}
          </Button>
          <div className="min-h-[1.75rem] flex items-center gap-2 text-xs">
            {response ? (
              <>
                {response.status >= 200 && response.status < 300 ? (
                  <Badge variant="success">{response.status} OK</Badge>
                ) : (
                  <Badge variant="destructive">{mapHttpStatus(response.status)}</Badge>
                )}
                <Badge variant="outline" className="font-mono tabular-nums">
                  ⚡ {response.latencyMs}ms
                </Badge>
              </>
            ) : null}
          </div>
        </div>

        <div className="grid min-h-[12rem] gap-1.5 rounded-lg border border-border bg-muted/40 p-3">
          <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
            <span>Response Payload</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={cn('h-6 px-2 text-xs gap-1', TACTILE)}
              onClick={() => {
                void handleCopy()
              }}
              disabled={!response || response.data === undefined}
              aria-label={hasCopied ? 'Response copied' : 'Copy response'}
            >
              {hasCopied ? (
                <CheckIcon className="size-3 text-success" />
              ) : (
                <CopyIcon className="size-3" />
              )}
              <span>{hasCopied ? 'Copied!' : 'Copy response'}</span>
            </Button>
          </div>
          {response ? (
            <pre className="max-h-60 overflow-auto font-mono text-xs leading-snug">
              {response.error !== undefined && response.data === undefined ? (
                <code className="text-destructive">{response.error}</code>
              ) : (
                <code>{JSON.stringify(response.data, null, 2)}</code>
              )}
            </pre>
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
              Response will appear here after you send a test invocation.
            </div>
          )}
        </div>
      </div>
    </AeSection>
  )
}

export function mapHttpStatus(status: number): string {
  switch (status) {
    case 400:
      return '400 Bad Request'
    case 401:
      return '401 Unauthorized'
    case 403:
      return '403 Forbidden'
    case 404:
      return '404 Not Found'
    case 408:
      return '408 Request Timeout'
    case 429:
      return '429 Too Many Requests'
    case 500:
      return '500 Error'
    case 502:
      return '502 Bad Gateway'
    case 503:
      return '503 Service Unavailable'
    case 504:
      return '504 Gateway Timeout'
    default:
      return `${status} Error`
  }
}

type JsonSchemaProperty = Readonly<{
  default?: unknown
  example?: unknown
  examples?: readonly unknown[]
  enum?: readonly unknown[]
  type?: string
  format?: string
  minimum?: number
  properties?: Record<string, JsonSchemaProperty>
}>

export function extractExamplePayload(schema?: Record<string, unknown>): Record<string, unknown> {
  if (!schema || typeof schema !== 'object') return {}
  const properties = (schema.properties ?? {}) as Record<string, JsonSchemaProperty>
  const payload: Record<string, unknown> = {}

  for (const [key, prop] of Object.entries(properties)) {
    if (!prop || typeof prop !== 'object') {
      payload[key] = null
      continue
    }
    payload[key] = exampleValueForProperty(key, prop)
  }

  return payload
}

function exampleValueForProperty(key: string, prop: JsonSchemaProperty): unknown {
  if (prop.default !== undefined) return prop.default
  if (Array.isArray(prop.examples) && prop.examples.length > 0) return prop.examples[0]
  if (prop.example !== undefined) return prop.example
  if (Array.isArray(prop.enum) && prop.enum.length > 0) return prop.enum[0]
  return typeBasedExample(key, prop)
}

function typeBasedExample(key: string, prop: JsonSchemaProperty): unknown {
  const type = prop.type
  switch (type) {
    case 'string':
      return stringFormatExample(key, prop.format)
    case 'number':
    case 'integer':
      return typeof prop.minimum === 'number' ? prop.minimum : 1
    case 'boolean':
      return true
    case 'array':
      return []
    case 'object':
      if (prop.properties && typeof prop.properties === 'object') {
        const nested: Record<string, unknown> = {}
        for (const [nestedKey, nestedProp] of Object.entries(prop.properties)) {
          nested[nestedKey] = exampleValueForProperty(nestedKey, nestedProp)
        }
        return nested
      }
      return {}
    default:
      return null
  }
}

function stringFormatExample(key: string, format?: string): string {
  switch (format) {
    case 'email':
      return 'operator@example.com'
    case 'uri':
    case 'url':
      return 'https://example.com'
    case 'date':
      return '2026-09-19'
    case 'date-time':
      return '2026-09-19T00:00:00.000Z'
    default:
      return key
  }
}

function extractDefaultPayload(schema?: Record<string, unknown>): Record<string, unknown> {
  if (!schema || typeof schema !== 'object') return {}
  const properties = (schema.properties ?? {}) as Record<string, { default?: unknown; type?: string }>
  const defaults: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(properties)) {
    if (value && typeof value === 'object') {
      if (value.default !== undefined) {
        defaults[key] = value.default
      } else if (value.type === 'string') {
        defaults[key] = ''
      } else if (value.type === 'number' || value.type === 'integer') {
        defaults[key] = 0
      } else if (value.type === 'boolean') {
        defaults[key] = false
      }
    }
  }

  return defaults
}
