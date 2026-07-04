/**
 * AE agent-surface client + trace recorder.
 *
 * Provider-agnostic. This module speaks ONLY the real, published AE HTTP
 * contract an assistant would hit cold:
 *   - GET  {base}/llms.txt                     the plain-text index
 *   - GET  {base}/api/agent/tools              the quiet door: tool list
 *   - POST {base}/api/agent/tools {tool,input} the quiet door: invoke
 *   - GET  {base}/api/businesses/search?q=..   read catalog
 *   - GET  {base}/api/businesses/{slug}        read one listing
 *
 * No mocks. Every method issues a real fetch and records it into a Trace so a
 * driver (probe or your Hermes agent) produces an auditable run. Nothing about
 * AE is hard-coded beyond the base origin — the door and tools are DISCOVERED
 * at runtime, which is the point of the agent-experience audit (ADR-006).
 */

export type HttpProvenance = 'seed' | 'from_llms_txt' | 'from_prev_response' | 'guessed'

export type TraceEvent =
  | { t: number; type: 'thought'; message: string }
  | {
      t: number
      type: 'http_request'
      method: string
      url: string
      provenance: HttpProvenance
      body?: unknown
    }
  | {
      t: number
      type: 'http_response'
      forUrl: string
      status: number
      ok: boolean
      ms: number
      bodyPreview: string
      isError: boolean
      headers?: Record<string, string>
    }
  | { t: number; type: 'tool_call'; tool: string; input: unknown }
  | { t: number; type: 'tool_result'; tool: string; status: number; ok: boolean; preview: string; headers?: Record<string, string> }
  | { t: number; type: 'error'; stage: string; message: string; recovered: boolean }
  | { t: number; type: 'result'; success: boolean; summary: string }

export interface HttpOutcome {
  status: number
  ok: boolean
  ms: number
  text: string
  headers: Record<string, string>
  isError: boolean
}

export interface QuietToolDescriptor {
  id: string
  name: string
  summary: string
  boundaries: string[]
  readOnly: boolean
  parameters?: unknown
  inputJsonSchema?: Record<string, unknown>
  outputJsonSchema?: Record<string, unknown>
  hasOutputSchema?: boolean
}

const PREVIEW_LIMIT = 600

function preview(text: string): string {
  const trimmed = text.replace(/\s+/g, ' ').trim()
  return trimmed.length > PREVIEW_LIMIT ? `${trimmed.slice(0, PREVIEW_LIMIT)}…` : trimmed
}

/** Extract origin-relative and absolute URLs mentioned in a text body. */
function extractUrls(text: string, origin: string): string[] {
  const out = new Set<string>()
  const absolute = text.match(/https?:\/\/[^\s"'<>)\]]+/g) ?? []
  for (const url of absolute) out.add(url.replace(/[.,);]+$/, ''))
  const relative = text.match(/(?<![\w./])\/[A-Za-z0-9._~\-/]+/g) ?? []
  for (const path of relative) {
    try {
      out.add(new URL(path, origin).toString())
    } catch {
      /* ignore unparseable */
    }
  }
  return [...out]
}

/** Treat localhost and 127.0.0.1 as the same origin for provenance matching. */
function aliasHost(url: string): string {
  return url.replace('://127.0.0.1', '://localhost')
}

export class Trace {
  readonly events: TraceEvent[] = []
  readonly startedAt = Date.now()
  private readonly mentionedFromLlms = new Set<string>()
  private readonly mentionedInResponses = new Set<string>()

  constructor(private readonly origin: string) {}

  now(): number {
    return Date.now() - this.startedAt
  }

  thought(message: string): void {
    this.events.push({ t: this.now(), type: 'thought', message })
  }

  error(stage: string, message: string, recovered: boolean): void {
    this.events.push({ t: this.now(), type: 'error', stage, message, recovered })
  }

  result(success: boolean, summary: string): void {
    this.events.push({ t: this.now(), type: 'result', success, summary })
  }

  toolCall(tool: string, input: unknown): void {
    this.events.push({ t: this.now(), type: 'tool_call', tool, input })
  }

  toolResult(tool: string, status: number, ok: boolean, previewText: string, headers?: Record<string, string>): void {
    this.events.push({
      t: this.now(),
      type: 'tool_result',
      tool,
      status,
      ok,
      preview: preview(previewText),
      ...(headers === undefined ? {} : { headers }),
    })
  }

  provenanceOf(url: string): HttpProvenance {
    const normalized = aliasHost(url.split('#')[0] ?? url)
    const origin = aliasHost(this.origin)
    if (normalized === origin || normalized === `${origin}/`) return 'seed'
    if (this.mentionedFromLlms.has(normalized)) return 'from_llms_txt'
    if (this.mentionedInResponses.has(normalized)) return 'from_prev_response'
    return 'guessed'
  }

  request(method: string, url: string, body?: unknown): void {
    this.events.push({
      t: this.now(),
      type: 'http_request',
      method,
      url,
      provenance: this.provenanceOf(url),
      ...(body === undefined ? {} : { body }),
    })
  }

  response(forUrl: string, outcome: HttpOutcome): void {
    this.events.push({
      t: this.now(),
      type: 'http_response',
      forUrl,
      status: outcome.status,
      ok: outcome.ok,
      ms: outcome.ms,
      bodyPreview: preview(outcome.text),
      isError: outcome.isError,
      headers: outcome.headers,
    })
    const fromLlms = /\/llms\.txt$/.test(forUrl.split('?')[0] ?? forUrl)
    for (const url of extractUrls(outcome.text, this.origin)) {
      const canonical = aliasHost(url)
      this.mentionedInResponses.add(canonical)
      if (fromLlms) this.mentionedFromLlms.add(canonical)
    }
  }
}

export class AeSurface {
  readonly origin: string

  constructor(
    baseUrl: string,
    readonly trace: Trace,
    private readonly defaultHeaders: Record<string, string> = {},
  ) {
    this.origin = new URL(baseUrl).origin
  }

  private async raw(method: string, url: string, body?: unknown, headers: Record<string, string> = {}): Promise<HttpOutcome> {
    this.trace.request(method, url, body)
    const started = Date.now()
    try {
      const init: RequestInit = { method, headers: { ...this.defaultHeaders, ...headers } }
      if (body !== undefined) {
        ;(init.headers as Record<string, string>)['Content-Type'] = 'application/json'
        init.body = JSON.stringify(body)
      }
      const res = await fetch(url, init)
      const text = await res.text()
      const responseHeaders: Record<string, string> = {}
      res.headers.forEach((value, key) => {
        responseHeaders[key] = value
      })
      const outcome: HttpOutcome = {
        status: res.status,
        ok: res.ok,
        ms: Date.now() - started,
        text,
        headers: responseHeaders,
        isError: !res.ok,
      }
      this.trace.response(url, outcome)
      return outcome
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause)
      const outcome: HttpOutcome = {
        status: 0,
        ok: false,
        ms: Date.now() - started,
        text: message,
        headers: {},
        isError: true,
      }
      this.trace.response(url, outcome)
      return outcome
    }
  }

  /** Absolute or origin-relative URL → absolute, refusing off-origin (skill: stay on task). */
  resolve(target: string): string | null {
    let url: URL
    try {
      url = new URL(target, `${this.origin}/`)
    } catch {
      return null
    }
    if (url.origin !== this.origin) return null
    return url.toString()
  }

  async fetchUrl(target: string, headers: Record<string, string> = {}): Promise<HttpOutcome> {
    const url = this.resolve(target)
    if (url === null) {
      this.trace.error('doc-fetch', `off-origin or invalid url refused: ${target}`, true)
      return { status: 0, ok: false, ms: 0, text: `refused off-origin url: ${target}`, headers: {}, isError: true }
    }
    return this.raw('GET', url, undefined, headers)
  }

  async postJson(target: string, json: unknown, headers: Record<string, string> = {}): Promise<HttpOutcome> {
    const url = this.resolve(target)
    if (url === null) {
      this.trace.error('execution', `off-origin or invalid url refused: ${target}`, true)
      return { status: 0, ok: false, ms: 0, text: `refused off-origin url: ${target}`, headers: {}, isError: true }
    }
    return this.raw('POST', url, json, headers)
  }

  // --- typed conveniences over the same real endpoints -----------------------

  async listTools(): Promise<{ outcome: HttpOutcome; tools: QuietToolDescriptor[] }> {
    const outcome = await this.fetchUrl('/api/agent/tools')
    let tools: QuietToolDescriptor[] = []
    if (outcome.ok) {
      try {
        const parsed = JSON.parse(outcome.text) as { tools?: QuietToolDescriptor[] }
        tools = Array.isArray(parsed.tools) ? parsed.tools : []
      } catch {
        this.trace.error('doc-fetch', 'agent tools list was not valid JSON', false)
      }
    }
    return { outcome, tools }
  }

  async invokeTool(tool: string, input: unknown, headers: Record<string, string> = {}): Promise<HttpOutcome> {
    this.trace.toolCall(tool, input)
    const outcome = await this.postJson('/api/agent/tools', { tool, input }, headers)
    this.trace.toolResult(tool, outcome.status, outcome.ok, toolResultPreview(outcome), outcome.headers)
    return outcome
  }
}

function toolResultPreview(outcome: HttpOutcome): string {
  const acceptSignature = outcome.headers['accept-signature']
  return acceptSignature === undefined
    ? outcome.text
    : `${outcome.text}\nAccept-Signature: ${acceptSignature}`
}
