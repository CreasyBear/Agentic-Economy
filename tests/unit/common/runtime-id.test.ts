import { describe, expect, it } from 'vitest'

import { createRuntimeId, createRuntimeIdPrefix } from '@/modules/common/runtime-id'

describe('runtime ID helpers', () => {
  it('uses cryptographic UUID entropy while preserving the readable prefix', () => {
    const id = createRuntimeId('answer')

    expect(id).toMatch(/^answer-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
  })

  it('normalizes dynamic prefix parts without falling back to positional randomness', () => {
    const prefix = createRuntimeIdPrefix('ht', 'tool/id with spaces')
    const id = createRuntimeId(prefix)

    expect(prefix).toBe('ht-tool-id-with-spaces')
    expect(id).toMatch(/^ht-tool-id-with-spaces-[0-9a-f-]{36}$/i)
  })
})
