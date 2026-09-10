import { describe, expect, it } from 'vitest'
import { projectPublicSchema, decodePublicSchema } from '@/modules/capability-supply/tool-schemas'

describe('public Tool schemas', () => {
  it('round-trips a bounded provider schema with more than 128 properties', () => {
    const schema = { type: 'object', properties: Object.fromEntries(Array.from({ length: 180 }, (_, index) => [`field_${index}`, { type: 'string' }])) }
    expect(decodePublicSchema(JSON.stringify(projectPublicSchema(schema)))).toEqual(schema)
  })
  it('preserves object-valued examples and defaults as data', () => {
    const schema = { type: 'object', default: { city: 'Perth' }, examples: [{ city: 'Sydney' }], properties: { city: { const: { value: 'Perth' }, enum: [{ value: 'Perth' }] } } }
    expect(decodePublicSchema(JSON.stringify(projectPublicSchema(schema)))).toEqual(schema)
  })
  it('retains payload and external-reference bounds', () => {
    expect(() => decodePublicSchema(JSON.stringify({ description: 'x'.repeat(131073) }))).toThrow('too_large')
    expect(() => projectPublicSchema({ $ref: 'https://external.example/schema' })).toThrow('ref_invalid')
  })
})
