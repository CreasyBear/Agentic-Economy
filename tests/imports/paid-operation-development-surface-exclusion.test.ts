import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('paid operation development surface inventory exclusion', () => {
  it('is absent from the generated production route inventory', () => {
    const inventory = readFileSync('src/routeTree.gen.ts', 'utf8')

    expect(inventory).not.toContain('paid-operation-surface-host')
    expect(inventory).not.toContain('Local development paid operation')
  })
})
