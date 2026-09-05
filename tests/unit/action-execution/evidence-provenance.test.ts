import { describe, expect, it } from 'vitest'

import {
  captureOfficialEvidenceProvenance,
  verifyOfficialEvidenceProvenance,
} from '../../../tools/dev/evidence-provenance'

const revision = '1'.repeat(40)
const tree = '2'.repeat(40)

function gitFixture(overrides: Partial<Record<string, string>> = {}) {
  return (args: readonly string[]) => {
    const command = args.join(' ')
    return overrides[command] ?? ({
      'rev-parse HEAD': revision,
      'rev-parse HEAD^{tree}': tree,
      'status --porcelain=v1 --untracked-files=all': '',
    }[command] ?? '')
  }
}

describe('official evidence provenance', () => {
  it('binds a clean exact revision, tree, runtime, command and claim ceiling', () => {
    expect(captureOfficialEvidenceProvenance({
      expectedRevision: revision,
      command: 'evidence:test run packet.json 1111111111111111111111111111111111111111',
      claimCeiling: 'Local mock semantics only.',
      git: gitFixture(),
      nodeVersion: 'v24.0.0',
      packageManager: 'npm/11.0.0',
    })).toEqual({
      schema: 'ae.evidence-provenance:v1',
      sourceRevision: revision,
      sourceTree: tree,
      command: 'evidence:test run packet.json 1111111111111111111111111111111111111111',
      nodeVersion: 'v24.0.0',
      packageManager: 'npm/11.0.0',
      environment: 'MOCK/DEVELOPMENT ONLY',
      claimCeiling: 'Local mock semantics only.',
    })
  })

  it.each([
    ['short revision', 'evidence_revision_invalid', { expectedRevision: 'short' }],
    ['different HEAD', 'evidence_revision_mismatch', {
      git: gitFixture({ 'rev-parse HEAD': '3'.repeat(40) }),
    }],
    ['tracked dirt', 'evidence_checkout_dirty', {
      git: gitFixture({ 'status --porcelain=v1 --untracked-files=all': ' M tracked.ts' }),
    }],
    ['staged dirt', 'evidence_checkout_dirty', {
      git: gitFixture({ 'status --porcelain=v1 --untracked-files=all': 'M  staged.ts' }),
    }],
    ['untracked dirt', 'evidence_checkout_dirty', {
      git: gitFixture({ 'status --porcelain=v1 --untracked-files=all': '?? untracked.ts' }),
    }],
  ])('refuses %s', (_label, error, override) => {
    expect(() => captureOfficialEvidenceProvenance({
      expectedRevision: revision,
      command: 'evidence:test',
      claimCeiling: 'Local mock semantics only.',
      git: gitFixture(),
      nodeVersion: 'v24.0.0',
      packageManager: 'npm/11.0.0',
      ...override,
    })).toThrow(error)
  })

  it('refuses a packet tree that differs from the checkout tree', () => {
    const provenance = captureOfficialEvidenceProvenance({
      expectedRevision: revision,
      command: 'evidence:test',
      claimCeiling: 'Local mock semantics only.',
      git: gitFixture(),
      nodeVersion: 'v24.0.0',
      packageManager: 'npm/11.0.0',
    })
    expect(() => verifyOfficialEvidenceProvenance(
      { ...provenance, sourceTree: '4'.repeat(40) },
      {
        expectedRevision: revision,
        command: 'evidence:test',
        git: gitFixture(),
        nodeVersion: 'v24.0.0',
        packageManager: 'npm/11.0.0',
      },
    )).toThrow('evidence_provenance_mismatch')
  })
})
