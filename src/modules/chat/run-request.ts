// Run requests trust only validated refs and exact JSON; copied from the card quote parser contract.
import { isRecord } from '../common/is-record'
import type { JsonValue } from '../common/bounded-json'
import { parseCallableRef } from '../common/tool-ref'

export type RunIntent = Readonly<{ toolRef: string; title: string; input: Readonly<Record<string, JsonValue>> }>

export const MAX_RUN_INPUT_BYTES = 1_500
const MAX_RUN_REQUEST_LENGTH = 2_000
const RUN_PREFIX = 'Run Tool '
const INPUT_INTRO = ' with this exact JSON input: '

export function isDetailToolRef(value: unknown): value is string {
  const kind = parseCallableRef(value)?.kind
  return kind === 'operation' || kind === 'listing'
}

/** Exact selection carries an untrusted lookup hint; it never grants purchase authority. */
export function formatDetailRequest(toolRef: string, title: string): string {
  if (!isDetailToolRef(toolRef)) throw new RangeError('detail_request_tool_ref_invalid')
  const boundedTitle = title.trim()
  if (boundedTitle.length === 0 || boundedTitle.length > 200) throw new RangeError('detail_request_title_invalid')
  return `Inspect Tool ${toolRef} with this exact title: ${JSON.stringify(boundedTitle)}.`
}

/** Invalid/oversized selection text returns null; free-form questions remain model input. */
export function parseDetailRequest(text: string): { toolRef: string; title: string } | null {
  if (typeof text !== 'string' || text.length > 1_400) return null
  const match = /^Inspect Tool ((?:operation:v1:|registry:)[0-9a-f]{64}) with this exact title: ("(?:[^"\\]|\\.)*")\.$/u.exec(text)
  if (match?.[1] === undefined || match[2] === undefined || !isDetailToolRef(match[1])) return null
  try {
    const title: unknown = JSON.parse(match[2])
    if (typeof title !== 'string' || title.length === 0 || title.length > 200 || title.trim() !== title
      || formatDetailRequest(match[1], title) !== text) return null
    return { toolRef: match[1], title }
  } catch {
    return null
  }
}

type SerializationState = { parts: string[]; length: number; nodes: number; active: WeakSet<object> }

function append(state: SerializationState, part: string): boolean {
  if (state.length + part.length > MAX_RUN_INPUT_BYTES) return false
  state.parts.push(part)
  state.length += part.length
  return true
}


function serializeValue(value: unknown, depth: number, state: SerializationState): boolean {
  state.nodes += 1
  if (state.nodes > 10_000 || depth > 64) return false
  if (value === null) return append(state, 'null')
  if (typeof value === 'string') {
    const encoded = value.length > MAX_RUN_INPUT_BYTES ? undefined : JSON.stringify(value)
    return encoded !== undefined && append(state, encoded)
  }
  if (typeof value === 'boolean') return append(state, value ? 'true' : 'false')
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return false
    if (Object.is(value, -0)) return append(state, '-0')
    const encoded = JSON.stringify(value)
    return encoded !== undefined && append(state, encoded)
  }
  if (Array.isArray(value)) {
    if (value.length > MAX_RUN_INPUT_BYTES || state.active.has(value)) return false
    state.active.add(value)
    try {
      if (!append(state, '[')) return false
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index))
        if (descriptor === undefined || !('value' in descriptor)
          || (index > 0 && !append(state, ',')) || !serializeValue(descriptor.value, depth + 1, state)) return false
      }
      return append(state, ']')
    } finally {
      state.active.delete(value)
    }
  }
  if (!isRecord(value)) return false
  const prototype = Object.getPrototypeOf(value)
  if ((prototype !== Object.prototype && prototype !== null) || state.active.has(value)) return false
  state.active.add(value)
  try {
    if (!append(state, '{')) return false
    let first = true
    for (const key in value) {
      if (!Object.hasOwn(value, key)) continue
      const descriptor = Object.getOwnPropertyDescriptor(value, key)
      const encodedKey = key.length > MAX_RUN_INPUT_BYTES ? undefined : JSON.stringify(key)
      if (descriptor === undefined || !('value' in descriptor) || encodedKey === undefined
        || (!first && !append(state, ',')) || !append(state, encodedKey) || !append(state, ':')
        || !serializeValue(descriptor.value, depth + 1, state)) return false
      first = false
    }
    return append(state, '}')
  } finally {
    state.active.delete(value)
  }
}

function serializeInput(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined
  const state: SerializationState = { parts: [], length: 0, nodes: 0, active: new WeakSet() }
  try {
    if (!serializeValue(value, 0, state)) return undefined
    const serialized = state.parts.join('')
    return new TextEncoder().encode(serialized).byteLength <= MAX_RUN_INPUT_BYTES ? serialized : undefined
  } catch {
    return undefined
  }
}

export function formatRunRequest(toolRef: string, input: Readonly<Record<string, JsonValue>>): string {
  if (!isDetailToolRef(toolRef)) throw new RangeError('run_request_tool_ref_invalid')
  const serialized = serializeInput(input)
  if (serialized === undefined) throw new RangeError('run_request_input_invalid')
  return `${RUN_PREFIX}${toolRef}${INPUT_INTRO}${serialized}.`
}

export function parseRunRequest(text: string): { toolRef: string; input: Record<string, unknown> } | null {
  if (typeof text !== 'string' || text.length > MAX_RUN_REQUEST_LENGTH) return null
  const match = /^Run Tool ((?:operation:v1:|registry:)[0-9a-f]{64}) with this exact JSON input: (\{[\s\S]*\})\.$/u.exec(text.trim())
  if (match === null) return null
  const toolRef = match[1]
  const serializedInput = match[2]
  if (toolRef === undefined || serializedInput === undefined || !isDetailToolRef(toolRef)
    || new TextEncoder().encode(serializedInput).byteLength > MAX_RUN_INPUT_BYTES) return null
  try {
    const input: unknown = JSON.parse(serializedInput)
    if (!isRecord(input) || serializeInput(input) !== serializedInput) return null
    return { toolRef, input }
  } catch {
    return null
  }
}
