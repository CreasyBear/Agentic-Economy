import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const contractRoot = 'src/modules/capability-contract'

describe('capability contract boundaries', () => {
  it('keeps the contract independent from routing, persistence, provider, and transport source', () => {
    const imports = contractSources().flatMap((source) => (
      [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((match) => match[1])
    ))

    expect(imports).toEqual([
      'ajv/dist/2020.js',
      'zod',
      '@/modules/common/canonical-digest',
      '@/modules/common/stable-hash',
    ])
  })

  it('keeps business-function and provider choreography out of the neutral grammar', () => {
    const forbiddenVocabulary = /\b(?:booking|endpoint|operation|provider|purchase|quote|shipping|transport)\b/i

    for (const source of contractSources()) expect(source).not.toMatch(forbiddenVocabulary)
  })

  it('keeps registration, publication, activation, and binding functions outside the contract owner', () => {
    const forbiddenOwnership = /\b(?:register|publish|activate|bind)Capability[A-Z]/

    for (const source of contractSources()) expect(source).not.toMatch(forbiddenOwnership)
  })
})

function contractSources(): string[] {
  return readdirSync(contractRoot, { recursive: true })
    .filter((path): path is string => typeof path === 'string' && /\.(?:ts|tsx)$/.test(path))
    .sort()
    .map((path) => readFileSync(join(contractRoot, path), 'utf8'))
}
