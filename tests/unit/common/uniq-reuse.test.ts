import { describe, expect, it } from 'vitest'

import { uniq } from 'es-toolkit/array'

describe('es-toolkit uniq reuse', () => {
  it('preserves first occurrence order, string subtypes, and mutable results', () => {
    const values = ['first', 'second', 'first'] as const
    const result: ('first' | 'second')[] = uniq(values)

    expect(result).toEqual(['first', 'second'])
    expect(result).not.toBe(values)
    result.push('first')
    expect(result).toEqual(['first', 'second', 'first'])
  })
})
