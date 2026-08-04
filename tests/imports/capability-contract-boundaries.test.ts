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
      '@cfworker/json-schema',
      'zod',
      '@/modules/common/canonical-digest',
      '@/modules/common/is-record',
      '@/modules/common/deep-freeze',
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

  it('keeps capability schema traversal and commitment materialization out of downstream decision modules', () => {
    const forbiddenReimplementation = /(?:from\s+['"](?:ajv|@cfworker\/json-schema)|CapabilityContractDocument|resolvePointedSchema|materializeInputFacts|setJsonPointer|semantic\.dataUse)/

    for (const root of ['src/modules/customer-request', 'src/modules/routing-kernel']) {
      for (const source of sourcesUnder(root)) expect(source).not.toMatch(forbiddenReimplementation)
    }
    expect(readFileSync('src/modules/customer-request/evaluation.ts', 'utf8')).toMatch(/\.projectPreparation\(/)
  })
})

function contractSources(): string[] {
  return sourcesUnder(contractRoot)
}

function sourcesUnder(root: string): string[] {
  return readdirSync(root, { recursive: true })
    .filter((path): path is string => typeof path === 'string' && /\.(?:ts|tsx)$/.test(path))
    .sort()
    .map((path) => readFileSync(join(root, path), 'utf8'))
}
