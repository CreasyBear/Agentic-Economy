import { describe, expect, it } from 'vitest'

import {
  MAX_BRAINTRUST_TURNS,
  buildBraintrustLearningPacket,
  parseLearningSelection,
  toBraintrustDatasetRecord,
  type LearningTurnRow,
} from '../../../tools/ae/lib/braintrust-learning'

const OPERATION_REF = 'operation:v1:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'

function learningTurn(overrides: Partial<LearningTurnRow> = {}): LearningTurnRow {
  const evidence = {
    harnessFinalization: {
      schemaVersion: 1,
      status: 'accepted',
      finalizationHash: 'sha256:finalization',
      journalEntryCount: 4,
      finalizedAt: 1_700_000_000_000,
    },
    harnessRunRef: 'turn:learning:1',
    harnessRun: {
      summary: {
        run: { runId: 'turn:learning:1', status: 'ok', durationMs: 42 },
        errors: { codes: [] },
      },
      coverage: {
        phases: ['intent', 'tool', 'result'],
        toolsInvoked: ['operation.execute'],
      },
    },
    toolCalls: [{
      toolCallId: 'call:1',
      turnId: 'turn:learning:1',
      seq: 1,
      toolId: 'operation.execute',
      inputJson: JSON.stringify({ operationRef: OPERATION_REF, input: { city: 'Paris' } }),
      resultSummaryJson: JSON.stringify({ slugs: [], count: 0 }),
      resultJson: JSON.stringify({
        kind: 'ok',
        operationRef: OPERATION_REF,
        contractRef: { capabilityId: 'weather.current', version: 3 },
        publicationRef: 'publication:weather-current',
        publicationRevision: 4,
        output: { apiKey: 'do-not-export', endpoint: 'https://provider.example/private' },
      }),
      resultHash: 'sha256:result',
      status: 'complete',
    }],
  }
  return {
    turnId: 'turn:learning:1',
    threadId: 'thread:private-customer',
    seq: 1,
    query: 'Weather for alice@example.com bearer super-secret-token',
    intent: 'data_answer',
    evidenceJson: JSON.stringify(evidence),
    snapshotHash: 'sha256:snapshot',
    proseJson: JSON.stringify({
      oneLine: 'Current weather for alice@example.com.',
      summary: 'Read from the admitted provider.',
      nextStep: 'Use https://user:password@provider.example/private only if needed.',
    }),
    status: 'complete',
    createdAt: 1_700_000_000_000,
    ...overrides,
  }
}

describe('Braintrust learning packet', () => {
  it('keeps only the positive allowlist and redacts identity/credential-shaped prose', () => {
    const result = buildBraintrustLearningPacket(learningTurn())
    expect(result.kind).toBe('ok')
    if (result.kind !== 'ok') return

    expect(result.packet.turnId).toBe('turn:learning:1')
    expect(result.packet.input.query).not.toContain('alice@example.com')
    expect(result.packet.input.query).not.toContain('super-secret-token')
    expect(result.packet.metadata.contractRefs).toEqual([{ capabilityId: 'weather.current', version: 3 }])
    expect(result.packet.metadata.publicationRefs).toEqual([{ publicationRef: 'publication:weather-current', revision: 4 }])
    expect(result.packet.metadata.observedAnswer.oneLine).not.toContain('alice@example.com')
    expect(result.packet.metadata.observedAnswer.nextStep).not.toContain('password')
    expect(result.packet.metadata.operationRefs).toEqual([OPERATION_REF])
    expect(result.packet.metadata.evidenceHashes).toEqual([
      'sha256:snapshot',
      'sha256:finalization',
      'sha256:result',
    ])

    const serialized = JSON.stringify(result.packet)
    expect(serialized).not.toContain('do-not-export')
    expect(serialized).not.toContain('provider.example')
    expect(serialized).not.toContain('private-customer')
    expect(serialized).not.toContain('raw provider')
  })

  it('refuses a turn without finalization or rehydrated harness evidence', () => {
    const noFinalization = learningTurn({
      evidenceJson: JSON.stringify({ harnessRunRef: 'turn:learning:1', harnessRun: {} }),
    })
    expect(buildBraintrustLearningPacket(noFinalization)).toEqual({ kind: 'refused', reason: 'turn_not_finalized' })

    const noHarness = learningTurn({
      evidenceJson: JSON.stringify({
        harnessFinalization: { status: 'accepted', finalizationHash: 'sha', finalizedAt: 1 },
        harnessRunRef: 'turn:learning:1',
      }),
    })
    expect(buildBraintrustLearningPacket(noHarness)).toEqual({ kind: 'refused', reason: 'harness_missing' })
  })

  it('refuses mismatched or malformed operation evidence before export', () => {
    const badInput = learningTurn({
      evidenceJson: JSON.stringify({
        harnessFinalization: { status: 'accepted', finalizationHash: 'sha', finalizedAt: 1 },
        harnessRunRef: 'turn:learning:1',
        harnessRun: {
          summary: { run: { runId: 'turn:learning:1', status: 'ok', durationMs: 1 }, errors: { codes: [] } },
          coverage: { phases: [], toolsInvoked: [] },
        },
        toolCalls: [{ toolId: 'operation.execute', inputJson: '{}', resultJson: '{}', resultHash: 'sha', status: 'complete' }],
      }),
    })
    expect(buildBraintrustLearningPacket(badInput)).toEqual({ kind: 'refused', reason: 'operation_ref_invalid' })
  })

  it('bounds explicit selection and preserves deterministic upsert ids', () => {
    const tooMany = parseLearningSelection({ turnIds: Array.from({ length: MAX_BRAINTRUST_TURNS + 1 }, (_, index) => `turn:${index}`) })
    expect(tooMany).toEqual({ kind: 'refused', reason: 'selection_too_large' })
    expect(parseLearningSelection({ turnIds: ['turn:1', 'turn:1'] })).toEqual({ kind: 'refused', reason: 'duplicate_turn_id' })
    expect(parseLearningSelection({ turnIds: ['turn:1'], expectedByTurnId: { 'turn:2': {} } })).toEqual({ kind: 'refused', reason: 'manifest_invalid' })
    expect(parseLearningSelection({
      turnIds: ['turn:1'],
      expectedByTurnId: { 'turn:1': { status: 'complete', slugs: ['ok'], unsafe: 'x'.repeat(70_000) } },
    })).toEqual({ kind: 'refused', reason: 'manifest_invalid' })
    expect(parseLearningSelection({
      turnIds: ['turn:1'],
      expectedByTurnId: { 'turn:1': { status: 'complete' } },
    })).toEqual({ kind: 'refused', reason: 'manifest_invalid' })
    expect(buildBraintrustLearningPacket(learningTurn(), { status: 'complete' })).toEqual({
      kind: 'refused',
      reason: 'reviewed_target_invalid',
    })

    const packet = buildBraintrustLearningPacket(learningTurn(), { status: 'complete', slugs: [] })
    expect(packet.kind).toBe('ok')
    if (packet.kind !== 'ok') return
    const record = toBraintrustDatasetRecord(packet.packet, { status: 'complete', slugs: [] })
    expect(record.id).toBe('turn:learning:1')
    expect(record.expected).toEqual({ status: 'complete', slugs: [] })
    expect(record.tags).toContain('reviewed-target')
  })
})
