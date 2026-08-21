import { describe, expect, it } from 'vitest'

import {
  buildPrivateEvidenceHash,
  classifyHarnessEvidenceSensitivity,
  createPrivateToolEvidence,
  createPublicProjectionMetadata,
  detectStalePublicProjection,
  isProtectedAeToolResult,
  isRegistryDetailToolResult,
  isRegistrySearchToolResult,
  projectPrivateToolEvidenceForCompaction,
  projectPrivateToolEvidenceForPublic,
  projectPrivateToolEvidenceForReplay,
  type HarnessToolResult,
} from '@/modules/harness/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'

describe('harness evidence envelope', () => {
  it('keeps raw tool evidence in private envelopes', () => {
    const result = toolResult({
      toolCallId: 'raw-call-search',
      toolId: 'registry.search',
      inputJson: '{"query":"LEAK_PRIVATE_INPUT"}',
      summaryJson: '{"count":2,"slugs":["LEAK_PRIVATE_SLUG"]}',
      resultHash: canonicalDigest('LEAK_PRIVATE_HASH'),
      outputJson: '{"rows":["LEAK_PRIVATE_OUTPUT"]}',
      output: { rows: ['LEAK_PRIVATE_OUTPUT'] },
    })

    const evidence = createPrivateToolEvidence(result)
    const serialized = JSON.stringify(evidence)

    expect(evidence.sensitivity).toBe('protectedPrivate')
    expect(evidence.protectedKinds).toEqual(['rawToolMessage'])
    expect(serialized).toContain('raw-call-search')
    expect(serialized).toContain('registry.search')
    expect(serialized).toContain('LEAK_PRIVATE_INPUT')
    expect(serialized).toContain('LEAK_PRIVATE_OUTPUT')
    expect(serialized).toContain(canonicalDigest('LEAK_PRIVATE_HASH'))
  })

  it('projects private evidence to public counts without raw ids, payloads, or hashes', () => {
    const evidence = createPrivateToolEvidence(toolResult({
      toolCallId: 'raw-call-search',
      toolId: 'registry.search',
      inputJson: '{"query":"LEAK_PUBLIC_INPUT"}',
      summaryJson: '{"count":3,"slugs":["LEAK_PUBLIC_SLUG"]}',
      resultHash: canonicalDigest('LEAK_PUBLIC_HASH'),
      outputJson: '{"rows":["LEAK_PUBLIC_OUTPUT"]}',
      output: { rows: ['LEAK_PUBLIC_OUTPUT'] },
      durationMs: 12.345,
    }))

    const projection = projectPrivateToolEvidenceForPublic(evidence)
    const serialized = JSON.stringify(projection)

    expect(projection).toEqual({
      schemaVersion: 1,
      kind: 'toolEvidencePublicProjection',
      toolRuns: 1,
      catalogSearches: 1,
      listingsRead: 0,
      listedBusinesses: 3,
      checksPassed: 1,
      checksFailed: 0,
      elapsedMs: 12.35,
    })
    expect(serialized).not.toContain('raw-call-search')
    expect(serialized).not.toContain('registry.search')
    expect(serialized).not.toContain('LEAK_PUBLIC_INPUT')
    expect(serialized).not.toContain('LEAK_PUBLIC_SLUG')
    expect(serialized).not.toContain('LEAK_PUBLIC_OUTPUT')
    expect(serialized).not.toContain(canonicalDigest('LEAK_PUBLIC_HASH'))
    expect(serialized).not.toMatch(/toolCallId|toolId|inputJson|outputJson|resultHash|summaryJson/)
  })

  it('remaps replay ids without exposing original tool call ids', () => {
    const evidence = [
      createPrivateToolEvidence(toolResult({
        toolCallId: 'raw-call-search',
        toolId: 'registry.search',
      })),
      createPrivateToolEvidence(toolResult({
        toolCallId: 'raw-call-detail',
        toolId: 'registry.detail',
      })),
    ]

    const replay = projectPrivateToolEvidenceForReplay(evidence)
    const serialized = JSON.stringify(replay)

    expect(replay.map((item) => item.toolCallId)).toEqual(['replay-tool-1', 'replay-tool-2'])
    expect(serialized).not.toContain('raw-call-search')
    expect(serialized).not.toContain('raw-call-detail')
    expect(serialized).toContain('registry.search')
    expect(serialized).toContain('registry.detail')
  })

  it('keeps protected evidence across compaction projection', () => {
    const evidence = createPrivateToolEvidence(toolResult({
      toolCallId: 'raw-call-detail',
      toolId: 'registry.detail',
      inputJson: '{"slug":"preston-plumbing"}',
      outputJson: '{"catalogDto":"LEAK_PROTECTED_CATALOG_DTO"}',
      output: { catalogDto: 'LEAK_PROTECTED_CATALOG_DTO' },
    }), {
      protectedKinds: ['catalogDto', 'rawToolMessage'],
    })

    const compacted = projectPrivateToolEvidenceForCompaction(evidence)
    const serialized = JSON.stringify(compacted)

    expect(compacted.kind).toBe('protectedToolEvidence')
    expect(serialized).toContain('LEAK_PROTECTED_CATALOG_DTO')
    expect(serialized).toContain('raw-call-detail')
    expect(serialized).toContain('registry.detail')
  })

  it('summarizes non-protected private evidence during compaction', () => {
    const evidence = createPrivateToolEvidence(toolResult({
      toolCallId: 'raw-call-internal',
      toolId: 'internal.telemetry',
      inputJson: '{"payload":"LEAK_NON_PROTECTED_INPUT"}',
      outputJson: '{"payload":"LEAK_NON_PROTECTED_OUTPUT"}',
      output: { payload: 'LEAK_NON_PROTECTED_OUTPUT' },
    }), {
      sensitivity: 'private',
    })

    const compacted = projectPrivateToolEvidenceForCompaction(evidence)
    const serialized = JSON.stringify(compacted)

    expect(compacted.kind).toBe('publicToolEvidenceSummary')
    expect(serialized).not.toContain('raw-call-internal')
    expect(serialized).not.toContain('internal.telemetry')
    expect(serialized).not.toContain('LEAK_NON_PROTECTED_INPUT')
    expect(serialized).not.toContain('LEAK_NON_PROTECTED_OUTPUT')
  })

  it('classifies protected AE tool and evidence kinds', () => {
    const search = toolResult({ toolId: 'registry.search' })
    const detail = toolResult({ toolId: 'registry.detail' })
    const internal = toolResult({ toolId: 'internal.telemetry' })

    expect(isRegistrySearchToolResult({ toolResult: search })).toBe(true)
    expect(isRegistryDetailToolResult({ toolResult: detail })).toBe(true)
    expect(isProtectedAeToolResult(search)).toBe(true)
    expect(isProtectedAeToolResult(detail)).toBe(true)
    expect(isProtectedAeToolResult(internal)).toBe(false)
    expect(classifyHarnessEvidenceSensitivity({ kind: 'sourceFact' })).toBe('protectedPrivate')
    expect(classifyHarnessEvidenceSensitivity({ kind: 'publicSummary' })).toBe('public')
  })

  it('detects stale public projection metadata against private evidence hash', () => {
    const evidence = createPrivateToolEvidence(toolResult({
      toolCallId: 'raw-call-search',
      toolId: 'registry.search',
      summaryJson: '{"count":1}',
      resultHash: canonicalDigest('old'),
    }))
    const projection = projectPrivateToolEvidenceForPublic(evidence)
    const metadata = createPublicProjectionMetadata({ evidence, publicProjection: projection })

    expect(detectStalePublicProjection({
      evidence,
      projectedFromEvidenceHash: metadata.sourceEvidenceHash,
    })).toMatchObject({
      stale: false,
      currentEvidenceHash: buildPrivateEvidenceHash(evidence),
      projectedFromEvidenceHash: metadata.sourceEvidenceHash,
    })
    expect(JSON.stringify(projection)).not.toContain(metadata.sourceEvidenceHash)

    const changedEvidence = createPrivateToolEvidence(toolResult({
      toolCallId: 'raw-call-search',
      toolId: 'registry.search',
      summaryJson: '{"count":2}',
      resultHash: canonicalDigest('new'),
    }))
    expect(detectStalePublicProjection({
      evidence: changedEvidence,
      projectedFromEvidenceHash: metadata.sourceEvidenceHash,
    })).toMatchObject({ stale: true })
  })
})

function toolResult(overrides: Partial<HarnessToolResult> = {}): HarnessToolResult {
  return {
    toolCallId: 'raw-call',
    toolId: 'registry.search',
    status: 'ok',
    inputJson: '{}',
    summaryJson: '{"count":0}',
    resultHash: canonicalDigest('raw'),
    durationMs: 1,
    createdAt: 1_000,
    ...overrides,
  }
}
