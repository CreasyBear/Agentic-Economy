import { useState } from 'react'
import { AeSection } from '@/components/ae/layout/AeSection'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { validateJsonSchema } from '@/modules/capability-contract/public'

export type ToolTestResponse = Readonly<{
  status: number
  latencyMs: number
  data?: unknown
  error?: string
}>

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
  const [jsonError, setJsonError] = useState<string>()
  const [isRunning, setIsRunning] = useState(false)
  const [response, setResponse] = useState<ToolTestResponse>()

  async function handleSend() {
    setJsonError(undefined)
    let parsed: unknown
    try {
      parsed = JSON.parse(inputJson)
    } catch (cause) {
      void cause;
      setJsonError('Invalid JSON format. Check syntax before sending.')
      return
    }

    if (inputSchema !== undefined && !validateJsonSchema(inputSchema, parsed)) {
      setJsonError('Input does not match the Tool schema. Fix the payload before sending.')
      return
    }

    if (!onSendTestRequest) return
    setIsRunning(true)
    try {
      const res = await onSendTestRequest(parsed)
      setResponse(res)
    } catch (err) {
      setResponse({
        status: 500,
        latencyMs: 0,
        error: err instanceof Error ? err.message : 'Unknown error during test execution',
      })
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
        <p className="text-xs text-muted-foreground">
          Sandbox only: this playground exercises connectivity and response shape. It does not open a commercial Call or debit prepaid credit.
        </p>
        <div className="grid gap-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="test-input-json" className="text-sm font-semibold">
              Input Parameters (JSON)
            </Label>
            <span className="text-xs text-muted-foreground">Pre-populated from schema defaults</span>
          </div>
          <Textarea
            id="test-input-json"
            value={inputJson}
            onChange={(e) => setInputJson(e.target.value)}
            rows={5}
            className="font-mono text-xs leading-relaxed"
            placeholder="{}"
          />
          {jsonError ? <p className="text-xs text-destructive">{jsonError}</p> : null}
        </div>

        <div className="flex items-center gap-3">
          <Button
            type="button"
            onClick={handleSend}
            disabled={isRunning}
            className="min-h-touch"
          >
            {isRunning ? 'Sending probe…' : 'Send Test Request'}
          </Button>
          {response ? (
            <div className="flex items-center gap-2 text-xs">
              <Badge variant={response.status >= 200 && response.status < 300 ? 'default' : 'destructive'}>
                {response.status >= 200 && response.status < 300 ? `${response.status} OK` : `${response.status} Error`}
              </Badge>
              <span className="font-mono text-muted-foreground">{response.latencyMs}ms</span>
            </div>
          ) : null}
        </div>

        {response ? (
          <div className="grid gap-1.5 rounded-lg border border-border bg-muted/40 p-3">
            <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
              <span>Response Payload</span>
              <span className="font-mono text-[11px]">{response.latencyMs}ms latency</span>
            </div>
            <pre className="max-h-60 overflow-auto font-mono text-xs leading-snug">
              {response.error ? (
                <span className="text-destructive">{response.error}</span>
              ) : (
                <code>{JSON.stringify(response.data, null, 2)}</code>
              )}
            </pre>
          </div>
        ) : null}
      </div>
    </AeSection>
  )
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
