import { describe, expect, it } from 'vitest'

import {
  extractDefaultPayload,
  extractExamplePayload,
  mapHttpStatus,
} from './tool-test-payload'

describe('extractDefaultPayload', () => {
  it('returns empty object for invalid schema inputs', () => {
    expect(extractDefaultPayload(undefined)).toEqual({})
    expect(extractDefaultPayload(null)).toEqual({})
    expect(extractDefaultPayload('not-object')).toEqual({})
    expect(extractDefaultPayload([])).toEqual({})
  })

  it('uses explicit default when present', () => {
    const schema = {
      properties: {
        flag: { type: 'boolean', default: false },
        count: { type: 'integer', default: 0 },
        label: { type: 'string', default: '' },
      },
    }
    expect(extractDefaultPayload(schema)).toEqual({
      flag: false,
      count: 0,
      label: '',
    })
  })

  it('applies type fallbacks for string, number, and boolean', () => {
    const schema = {
      properties: {
        name: { type: 'string' },
        amount: { type: 'number' },
        qty: { type: 'integer' },
        active: { type: 'boolean' },
      },
    }
    expect(extractDefaultPayload(schema)).toEqual({
      name: '',
      amount: 0,
      qty: 0,
      active: false,
    })
  })

  it('omits nested object, array, and missing type keys', () => {
    const schema = {
      properties: {
        nested: { type: 'object', properties: { a: { type: 'string' } } },
        list: { type: 'array', items: { type: 'string' } },
        untyped: { title: 'no type' },
      },
    }
    expect(extractDefaultPayload(schema)).toEqual({})
  })
})

describe('extractExamplePayload', () => {
  it('returns empty object for invalid schema inputs', () => {
    expect(extractExamplePayload(undefined)).toEqual({})
    expect(extractExamplePayload(null)).toEqual({})
    expect(extractExamplePayload('not-object')).toEqual({})
    expect(extractExamplePayload([])).toEqual({})
  })

  it('recurses into nested object properties', () => {
    const schema = {
      properties: {
        outer: {
          type: 'object',
          properties: {
            inner: { type: 'string', format: 'email' },
          },
        },
      },
    }
    expect(extractExamplePayload(schema)).toEqual({
      outer: { inner: 'operator@example.com' },
    })
  })

  it('returns empty array for array of objects without reading items', () => {
    const schema = {
      properties: {
        rows: {
          type: 'array',
          items: {
            type: 'object',
            properties: { id: { type: 'string' } },
          },
        },
      },
    }
    expect(extractExamplePayload(schema)).toEqual({ rows: [] })
  })

  it('returns null for missing type on a property', () => {
    const schema = {
      properties: {
        mystery: { title: 'no type' },
      },
    }
    expect(extractExamplePayload(schema)).toEqual({ mystery: null })
  })

  it('prefers default over enum and examples', () => {
    const schema = {
      properties: {
        mode: {
          type: 'string',
          default: 'custom',
          enum: ['fast', 'slow'],
          examples: ['from-examples'],
        },
      },
    }
    expect(extractExamplePayload(schema)).toEqual({ mode: 'custom' })
  })

  it('uses enum first value when default is absent', () => {
    const schema = {
      properties: {
        mode: { type: 'string', enum: ['fast', 'slow'] },
      },
    }
    expect(extractExamplePayload(schema)).toEqual({ mode: 'fast' })
  })

  it('uses deep nesting with format literal defaulting to property key', () => {
    const schema = {
      properties: {
        meta: {
          type: 'object',
          properties: {
            issued: { type: 'string', format: 'date-time' },
            note: { type: 'string' },
          },
        },
      },
    }
    expect(extractExamplePayload(schema)).toEqual({
      meta: {
        issued: '2026-09-19T00:00:00.000Z',
        note: 'note',
      },
    })
  })
})

describe('mapHttpStatus', () => {
  it('maps 500 to 500 Error', () => {
    expect(mapHttpStatus(500)).toBe('500 Error')
  })

  it('maps unknown errors with default suffix', () => {
    expect(mapHttpStatus(418)).toBe('418 Error')
  })
})
