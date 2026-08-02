import { globSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('paid operation development surface inventory exclusion', () => {
  it('is absent from the generated production route inventory', () => {
    const inventory = readFileSync('src/routeTree.gen.ts', 'utf8')

    expect(inventory).not.toContain('paid-operation-surface-host')
    expect(inventory).not.toContain('paid-operation-browser')
    expect(inventory).not.toContain('Local development paid operation')
  })

  it('is not imported by production source or route files', () => {
    const productionFiles = sourceFiles('src')
    const importers = productionFiles.filter((path) => {
      const source = readFileSync(path, 'utf8')
      return source.includes('paid-operation-surface-host')
        || source.includes('paid-operation-browser')
    })

    expect(importers).toEqual([])
  })
})

function sourceFiles(root: string): string[] {
  return globSync(join(root, '**/*.{ts,tsx,js,jsx}')).sort()
}
