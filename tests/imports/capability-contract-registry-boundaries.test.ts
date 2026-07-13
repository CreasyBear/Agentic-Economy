import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const registryRoot = 'src/modules/capability-contract-registry'

describe('capability contract registry boundaries', () => {
  it('depends only on the neutral contract, common canonicalization and Convex schema primitives', () => {
    const imports = sources().flatMap((source) => (
      [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)]
        .map((match) => match[1])
        .filter((value): value is string => value !== undefined)
    ))

    expect(imports.every((value) => [
      '@/modules/capability-contract/public',
      '@/modules/common/stable-hash',
      'convex/server',
      'convex/values',
    ].includes(value))).toBe(true)
  })

  it('does not own Request, business, routing, provider, transport or sandbox semantics', () => {
    const forbidden = /\b(?:customerRequest|business|operation|provider|route|sandbox|transport)\b/i
    for (const source of sources()) expect(source).not.toMatch(forbidden)
  })
})

function sources(): string[] {
  return readdirSync(registryRoot, { recursive: true })
    .filter((path): path is string => typeof path === 'string' && /\.(?:ts|tsx)$/.test(path))
    .sort()
    .map((path) => readFileSync(join(registryRoot, path), 'utf8'))
}
