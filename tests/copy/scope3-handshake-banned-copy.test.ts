import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { scanPublicLanguage, type ScanViolation } from '@/lib/ui/contract-scans'

const handshakeRule = 'handshake-internal-vocabulary'

const bannedHandshakeVocabulary = [
  'Handshake',
  'HSK',
  'kernel',
  'greenlight',
  'clearance',
  'mandate',
  'protocol',
  'gateway',
  'ActionContract',
] as const

const safeIdentityBoundary =
  'Signed request identity is attribution/quota/audit only; a signature never authorizes a verb.'

describe('Scope 3 D9 public and agent descriptor copy boundary', () => {
  it('rejects every Handshake vocabulary token on public human surfaces', () => {
    const fixture = bannedHandshakeVocabulary
      .map((term) => `export const publicCopyFor${identifierFor(term)} = '${term} is public-facing product copy.'`)
      .join('\n')

    const violations = scanFixture('src/routes/scope3-public-copy.fixture', fixture)

    expectHandshakeViolationsForTerms(violations, bannedHandshakeVocabulary)
  })

  it('rejects every Handshake vocabulary token in quiet agent tool payload descriptors', () => {
    const fixture = bannedHandshakeVocabulary
      .map(
        (term) =>
          JSON.stringify({
            id: `scope3.${identifierFor(term)}`,
            name: 'Quiet agent descriptor fixture',
            summary: `${term} is exposed in an assistant-visible descriptor.`,
            boundaries: [`${term} appears in the quiet agent door boundary copy.`],
          }),
      )
      .join('\n')

    const violations = scanFixture('src/routes/api.agent.tools.fixture', fixture)

    expectHandshakeViolationsForTerms(violations, bannedHandshakeVocabulary)
  })

  it('rejects every Handshake vocabulary token in action summaries and boundaries', () => {
    const fixture = bannedHandshakeVocabulary
      .map(
        (term) => `defineAction({
  id: 'scope3.${identifierFor(term)}',
  name: 'Descriptor fixture',
  summary: '${term} leaked through an action summary.',
  boundaries: ['${term} leaked through action boundary copy.'],
  surfaces: ['agentTools'],
})`,
      )
      .join('\n')

    const violations = scanFixture('src/modules/registry/registry.actions.fixture', fixture)

    expectHandshakeViolationsForTerms(violations, bannedHandshakeVocabulary)
  })

  it('allows internal module paths and code identifiers to name the implementation boundary', () => {
    const internalFixture = `
import { verifyAgentIdentity } from '@/modules/clearance/public'
const internalSpike = 'src/modules/clearance/internal/handshake-protocol-kernel.ts'
const internalTerms = 'Handshake HSK kernel greenlight clearance mandate protocol gateway ActionContract'
`.trim()

    expect(scanFixture('src/modules/clearance/internal/web-bot-auth.fixture', internalFixture)).toEqual([])
  })

  it('allows planning and copy-test contexts to document the banned vocabulary contract', () => {
    const planningFixture = `D9 bans Handshake HSK kernel greenlight clearance mandate protocol gateway ActionContract outside planning and tests.`
    const testFixture = `Fixture asserts Handshake HSK kernel greenlight clearance mandate protocol gateway ActionContract are rejected on public surfaces.`

    expect(scanFixture('.planning/scopes/scope-03-handshake-identity-clearance/d9.fixture', planningFixture)).toEqual([])
    expect(scanFixture('tests/copy/scope3-handshake-banned-copy.fixture', testFixture)).toEqual([])
  })

  it('allows boundary-honest identity wording that does not name implementation vocabulary', () => {
    const publicFixture = `export const publicCopy = '${safeIdentityBoundary} It helps AE attribute usage and audit traffic only.'`
    const agentDescriptorFixture = JSON.stringify({
      id: 'registry.search',
      summary: 'Read-only public catalog search.',
      boundaries: [
        safeIdentityBoundary,
        'Does not book, charge, dispatch, send inquiries, or invent missing provider details.',
      ],
    })

    expect(scanFixture('src/routes/scope3-safe-identity-copy.fixture', publicFixture)).toEqual([])
    expect(scanFixture('src/routes/api.agent.tools.safe-identity.fixture', agentDescriptorFixture)).toEqual([])
  })
})

function expectHandshakeViolationsForTerms(
  violations: readonly ScanViolation[],
  terms: readonly (typeof bannedHandshakeVocabulary)[number][],
) {
  for (const term of terms) {
    expect(violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rule: handshakeRule,
          excerpt: expect.stringContaining(term),
        }),
      ]),
    )
  }
}

function scanFixture(relativeFile: string, copy: string): readonly ScanViolation[] {
  const root = mkdtempSync(join(tmpdir(), 'ae-scope3-copy-'))
  const fixture = join(root, relativeFile)

  mkdirSync(dirname(fixture), { recursive: true })
  writeFileSync(fixture, `${copy}\n`, 'utf8')

  try {
    return scanPublicLanguage([{ root: fixture, includeExtensions: ['.fixture'] }])
  } finally {
    rmSync(root, { force: true, recursive: true })
  }
}

function identifierFor(term: string): string {
  return term.replace(/[^A-Za-z0-9]/g, '')
}
