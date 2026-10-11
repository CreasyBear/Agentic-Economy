import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

describe('nitro dependency', () => {
  it('is a published release, not a nightly snapshot', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
    const spec: string = pkg.dependencies?.nitro ?? pkg.devDependencies?.nitro
    expect(spec).toBeDefined()
    expect(spec).not.toMatch(/nightly|npm:/)
    expect(spec).toMatch(/^\d+\.\d+\.\d+(-beta)?$/)
  })
})
