import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseToolInputJson, supportsToolInputForm, toolInputCallCommand, toolInputSchema, toolInputValidator } from '@/components/ae/shared/tool-input-form/tool-input-form'
import type { RJSFSchema } from '@rjsf/utils'

const schema = { $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object', properties: { query: { type: 'string', minLength: 2, title: 'Search query' }, pathParams: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } }, required: ['query', 'pathParams'], additionalProperties: false }
const canonical = { inputSchemaJson: JSON.stringify(schema), inputExampleJson: JSON.stringify({ query: 'robots', pathParams: { id: '42' } }), toolRef: 'tool:v1:example' }
afterEach(() => { vi.restoreAllMocks() })

describe('tool input schema', () => {
  it('validates referenced schemas without runtime code compilation', () => {
    const referenceSchema = JSON.stringify({ ...schema, properties: { query: { $ref: '#/$defs/query' } }, required: ['query'], $defs: { query: { type: 'string', minLength: 3 } } })
    const originalFunction = globalThis.Function
    globalThis.Function = new Proxy(originalFunction, { construct() { throw new Error('unsafe-eval forbidden') }, apply() { throw new Error('unsafe-eval forbidden') } })
    try {
      const parsed = toolInputSchema(referenceSchema)!
      expect(toolInputValidator.isValid(parsed, { query: 'yes' }, parsed)).toBe(true)
      expect(toolInputValidator.isValid(parsed, { query: 'no' }, parsed)).toBe(false)
    } finally { globalThis.Function = originalFunction }
  })
  it('shell-quotes apostrophes and substitutions literally', () => {
    const input = { query: "O'Reilly $(touch nope)", pathParams: { id: '42' } }
    const command = toolInputCallCommand("tool:';$(bad)", toolInputSchema(canonical.inputSchemaJson), JSON.stringify(input))
    expect(command).toBe(`ae call 'tool:'"'"';$(bad)' --input '{"query":"O'"'"'Reilly $(touch nope)","pathParams":{"id":"42"}}' --json`)
  })
  it('keeps recursive references local and fails closed on cyclic or remote schemas', () => {
    const recursive = toolInputSchema(JSON.stringify({
      $defs: { node: { type: 'object', properties: { next: { $ref: '#/$defs/node' } } } },
      $ref: '#/$defs/node',
    }))
    expect(recursive).toBeDefined()
    if (recursive === undefined) return
    expect(supportsToolInputForm(recursive)).toBe(false)
    expect(toolInputValidator.isValid(recursive, { next: { next: {} } }, recursive)).toBe(true)

    const cyclic: Record<string, unknown> = { type: 'object', properties: {} }
    const properties = cyclic.properties as Record<string, unknown>
    properties.loop = cyclic
    expect(supportsToolInputForm(cyclic as RJSFSchema)).toBe(false)
    expect(toolInputValidator.isValid(cyclic as RJSFSchema, {}, cyclic as RJSFSchema)).toBe(false)

    const remote = toolInputSchema(JSON.stringify({ $ref: 'https://example.invalid/input.json' }))
    expect(remote).toBeDefined()
    if (remote === undefined) return
    expect(supportsToolInputForm(remote)).toBe(false)
    const fetchMock = vi.fn()
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(fetchMock)
    try {
      expect(toolInputValidator.isValid(remote, {}, remote)).toBe(false)
      expect(fetchMock).not.toHaveBeenCalled()
    } finally {
      fetchSpy.mockRestore()
    }
  })

  it('keeps invalid and unsafe schemas out of form rendering', () => {
    expect(parseToolInputJson('null')).toBeNull()
    expect(toolInputSchema('[]')).toBeUndefined()
    expect(parseToolInputJson(' '.repeat(131_073))).toBeUndefined()
    expect(parseToolInputJson(JSON.stringify({ value: '😀'.repeat(40_000) }))).toBeUndefined()
    const giantEnum = JSON.stringify({ type: 'object', properties: { value: { type: 'string', enum: Array.from({ length: 10_000 }, (_, index) => `v${index}`) } } })
    expect(toolInputSchema(giantEnum)).toBeUndefined()
    const unsafe = toolInputSchema('{"type":"object","properties":{"__proto__":{"type":"string"}}}')
    expect(unsafe !== undefined && supportsToolInputForm(unsafe)).toBe(false)
    const alternatives = { type: 'object', properties: { value: { oneOf: Array.from({ length: 1_000 }, () => ({ type: 'string' })) } } }
    const schema = toolInputSchema(JSON.stringify(alternatives))
    expect(schema !== undefined && supportsToolInputForm(schema)).toBe(true)
    if (schema !== undefined) expect(toolInputValidator.isValid(schema, { value: 'v1' }, schema)).toBe(false)
    const safePattern = toolInputSchema('{"type":"object","properties":{"value":{"type":"string","pattern":"^[A-Z]{3}$"}}}')
    expect(safePattern).toBeDefined()
    if (safePattern !== undefined) {
      expect(supportsToolInputForm(safePattern)).toBe(true)
      expect(toolInputValidator.isValid(safePattern, { value: 'USD' }, safePattern)).toBe(true)
      expect(toolInputValidator.isValid(safePattern, { value: 'usd' }, safePattern)).toBe(false)
    }
    const unsafePattern = toolInputSchema('{"type":"object","properties":{"value":{"type":"string","pattern":"^(a+)+$"}}}')
    expect(unsafePattern).toBeDefined()
    if (unsafePattern !== undefined) {
      expect(supportsToolInputForm(unsafePattern)).toBe(false)
      expect(toolInputValidator.isValid(unsafePattern, { value: `${'a'.repeat(1_000)}!` }, unsafePattern)).toBe(false)
    }
    const unsafeKeyPattern = toolInputSchema('{"type":"object","patternProperties":{"^(a+)+$":{"type":"string"}}}')
    expect(unsafeKeyPattern).toBeDefined()
    if (unsafeKeyPattern !== undefined) {
      const input = Object.fromEntries([[`${'a'.repeat(1_000)}!`, 'value']])
      expect(toolInputValidator.isValid(unsafeKeyPattern, input, unsafeKeyPattern)).toBe(false)
    }
    const reservedKeySchema = toolInputSchema('{"type":"object","patternProperties":{".*":{"type":"string"}}}')
    expect(reservedKeySchema !== undefined && toolInputValidator.isValid(reservedKeySchema, { ['__proto__']: 'value' }, reservedKeySchema)).toBe(false)
    const adjacentPattern = toolInputSchema('{"type":"object","properties":{"value":{"type":"string","pattern":"a*a*a*"}}}')
    expect(adjacentPattern !== undefined && toolInputValidator.isValid(adjacentPattern, { value: 'a'.repeat(1_000) }, adjacentPattern)).toBe(false)
  })
})
