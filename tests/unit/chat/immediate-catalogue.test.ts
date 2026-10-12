import { describe, expect, it } from 'vitest'
import { formatRunRequest, parseRunRequest } from '@/modules/chat/run-request'
import type { JsonValue } from '@/modules/common/bounded-json'

describe('chat exact Run request', () => {
  it.each(['operation:v1:', 'registry:'])('accepts only canonical, bounded %s Run sentences and preserves their JSON bytes', prefix => {
    const toolRef = `${prefix}${'c'.repeat(64)}`
    const input = { city: 'Sydney', negativeZero: -0, large: 1e100, unicode: '\u2028\u2029😀' }
    const request = formatRunRequest(toolRef, input)
    const parsed = parseRunRequest(request)
    expect(parsed).toEqual({ toolRef, input })
    expect(parsed === null ? undefined : Object.is(parsed.input.negativeZero, -0)).toBe(true)
    expect(parsed === null ? null : formatRunRequest(parsed.toolRef, parsed.input as Readonly<Record<string, JsonValue>>)).toBe(request)
    expect(parseRunRequest(`${request}\n  `)).toEqual(parsed)
    expect(parseRunRequest(`Run Tool ${prefix}${'C'.repeat(64)} with this exact JSON input: {"city":"Sydney"}.`)).toBeNull()
    expect(parseRunRequest(`Run Tool ${toolRef} with this exact JSON input: ["Sydney"].`)).toBeNull()
    expect(parseRunRequest(`${request} Extra text.`)).toBeNull()
    expect(parseRunRequest(`Header\n${request}`)).toBeNull()
    expect(parseRunRequest(`Run Tool ${toolRef} with this exact JSON input: {"x":1,"x":2}.`)).toBeNull()
    expect(parseRunRequest(`Run Tool ${toolRef} with this exact JSON input: { "x" : 1 }.`)).toBeNull()
    expect(parseRunRequest(`Run Tool ${toolRef} with this exact JSON input: {"x":"${'a'.repeat(1493)}"}.`)).toBeNull()
    const nested = `${'{"x":'.repeat(65)}0${'}'.repeat(65)}`
    expect(parseRunRequest(`Run Tool ${toolRef} with this exact JSON input: ${nested}.`)).toBeNull()
  })
})
