import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('paid operation development surface inventory exclusion', () => {
  it('is absent from the generated production route inventory', () => {
    const inventory = readFileSync('src/routeTree.gen.ts', 'utf8')

    expect(inventory).not.toContain('paid-operation-surface-host')
    expect(inventory).not.toContain('paid-operation-browser')
    expect(inventory).not.toContain('Local development paid operation')
  })

  it('keeps development hosts and browser fixtures out of production source', () => {
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
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name)
    return entry.isDirectory()
      ? sourceFiles(path)
      : /\.(?:ts|tsx|js|jsx)$/u.test(entry.name)
        ? [path]
        : []
  })
}
