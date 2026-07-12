import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const retiredAuthorityFiles = [
  'convex/clearance.ts',
  'convex/spikeHandshakeRuntime.ts',
  'src/modules/harness/agent-door.ts',
  'src/modules/harness/agent-tool-write-scope.ts',
  'src/modules/harness/query-authority-receipt.ts',
] as const

describe('routing authority retirement', () => {
  it('removes the duplicate Handshake and clearance execution authorities', () => {
    for (const path of retiredAuthorityFiles) {
      expect(existsSync(join(root, path)), path).toBe(false)
    }
    expect(sourceFiles(root, ['src/modules/clearance'])).toEqual([])
  })

  it('keeps executable source free of retired authority imports', () => {
    const matches = sourceFiles(root, ['src', 'convex'])
      .filter((path) => !path.endsWith('routing-authority-retirement.test.ts'))
      .flatMap((path) => {
        const source = readFileSync(path, 'utf8')
        return /(?:from\s+|import\s*\(|require\s*\()['"][^'"]*(?:handshake-protocol-kernel|modules\/clearance|query-authority-receipt|spikeHandshakeRuntime)/.test(source)
          ? [path.slice(root.length + 1)]
          : []
      })

    expect(matches).toEqual([])
  })
})

function sourceFiles(base: string, directories: readonly string[]): string[] {
  return directories.flatMap((directory) => walk(join(base, directory)))
}

function walk(directory: string): string[] {
  if (!existsSync(directory)) return []
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry)
    if (statSync(path).isDirectory()) return walk(path)
    return /\.(?:ts|tsx|mts|cts|js|mjs|cjs)$/.test(path) ? [path] : []
  })
}
