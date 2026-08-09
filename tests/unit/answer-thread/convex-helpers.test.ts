import { describe, expect, it } from 'vitest'

import {
  adminHarnessTurnMatchesFilters,
  normalizeAdminFilter,
  normalizeAdminRunViewerLimit,
  normalizeSessionThreadLimit,
  planAnswerThreadTurnDeletion,
  toToolCallRecord,
  toolCallsMatch,
} from '@/modules/answer-thread/convex'
import type { AnswerTurnRecord } from '@/modules/answer-thread/answer-thread.schema'

const turn: AnswerTurnRecord = {
  turnId: 'turn-1',
  threadId: 'thread-1',
  seq: 1,
  query: 'find a plumber',
  intent: 'refine_search',
  evidenceJson: JSON.stringify({ harnessRun: { summary: { run: { status: 'succeeded' } } } }),
  snapshotHash: 'snapshot-hash',
  proseJson: JSON.stringify({ answer: 'A plumber is available.' }),
  artifactKindsJson: '[]',
  status: 'complete',
  createdAt: Date.parse('2026-08-09T12:34:56.000Z'),
}

const toolCall = {
  toolCallId: 'call-1',
  turnId: 'turn-1',
  seq: 0,
  toolId: 'registry.search' as const,
  inputJson: '{"query":"plumber"}',
  resultSummaryJson: '{"count":1}',
  resultJson: '{"items":[]}',
  resultHash: 'result-hash',
  status: 'complete' as const,
}

describe('answer-thread Convex helpers', () => {
  describe('admin filtering and normalization', () => {
    it('clamps admin and session limits at their documented boundaries', () => {
      expect(normalizeAdminRunViewerLimit(undefined)).toBe(100)
      expect(normalizeAdminRunViewerLimit(Number.NaN)).toBe(100)
      expect(normalizeAdminRunViewerLimit(Number.POSITIVE_INFINITY)).toBe(100)
      expect(normalizeAdminRunViewerLimit(-10)).toBe(1)
      expect(normalizeAdminRunViewerLimit(1.9)).toBe(1)
      expect(normalizeAdminRunViewerLimit(250.9)).toBe(250)
      expect(normalizeAdminRunViewerLimit(999)).toBe(250)

      expect(normalizeSessionThreadLimit(undefined)).toBe(20)
      expect(normalizeSessionThreadLimit(Number.NaN)).toBe(20)
      expect(normalizeSessionThreadLimit(-10)).toBe(1)
      expect(normalizeSessionThreadLimit(1.9)).toBe(1)
      expect(normalizeSessionThreadLimit(50.9)).toBe(50)
      expect(normalizeSessionThreadLimit(999)).toBe(50)
    })

    it('turns blank admin filters into absent filters and trims values', () => {
      expect(normalizeAdminFilter(undefined)).toBeUndefined()
      expect(normalizeAdminFilter('   ')).toBeUndefined()
      expect(normalizeAdminFilter('\t\n')).toBeUndefined()
      expect(normalizeAdminFilter('  turn-1  ')).toBe('turn-1')

      expect(adminHarnessTurnMatchesFilters(turn, {
        status: '  ',
        turnId: '   ',
        threadId: '\t',
        date: ' ',
      })).toBe(true)
      expect(adminHarnessTurnMatchesFilters(turn, { date: '2026-08-09' })).toBe(true)
      expect(adminHarnessTurnMatchesFilters(turn, { turnId: ' turn-1 ' })).toBe(true)
      expect(adminHarnessTurnMatchesFilters(turn, { threadId: 'other' })).toBe(false)
    })

    it('fails closed for malformed evidence while preserving missing-evidence filters', () => {
      const malformed = { ...turn, evidenceJson: '{not-json' }
      expect(adminHarnessTurnMatchesFilters(malformed, { hasRunEvidence: 'yes' })).toBe(false)
      expect(adminHarnessTurnMatchesFilters(malformed, { hasRunEvidence: 'no' })).toBe(true)
      expect(adminHarnessTurnMatchesFilters(malformed, { status: 'missing' })).toBe(true)
      expect(adminHarnessTurnMatchesFilters(turn, { status: 'succeeded' })).toBe(true)
      expect(adminHarnessTurnMatchesFilters(turn, { status: 'missing' })).toBe(false)
      expect(adminHarnessTurnMatchesFilters(turn, { status: 'any' })).toBe(true)
    })
  })

  describe('tool-call conversion and equality', () => {
    it('rejects rows whose result is missing before conversion', () => {
      expect(() => toToolCallRecord({ ...toolCall, resultJson: undefined })).toThrow('answer_tool_result_missing')
    })

    it('converts persisted rows and compares every replay field', () => {
      expect(toToolCallRecord({ ...toolCall, createdAt: 123 })).toEqual({
        ...toolCall,
        createdAt: 123,
      })
      expect(toolCallsMatch([toolCall], [toolCall])).toBe(true)
      expect(toolCallsMatch([], [])).toBe(true)
      expect(toolCallsMatch([toolCall], [])).toBe(false)
      expect(toolCallsMatch([toolCall], [{ ...toolCall, resultHash: 'different' }])).toBe(false)
      expect(toolCallsMatch([toolCall], [{ ...toolCall, resultJson: undefined }])).toBe(false)
      expect(toolCallsMatch(
        [{ ...toolCall, resultJson: undefined }],
        [{ ...toolCall, resultJson: undefined }],
      )).toBe(true)
    })
  })

  describe('deletion budget decisions', () => {
    it('continues when no write budget remains', () => {
      expect(planAnswerThreadTurnDeletion({
        remainingWrites: 0,
        toolCallCount: 0,
        hasMoreChildren: false,
      })).toEqual({
        deleteToolCalls: 0,
        deleteTurn: false,
        remainingWrites: 0,
        hasMoreChildren: true,
      })
    })

    it('spends the whole budget on tool calls and keeps the turn for continuation', () => {
      expect(planAnswerThreadTurnDeletion({
        remainingWrites: 3,
        toolCallCount: 5,
        hasMoreChildren: false,
      })).toEqual({
        deleteToolCalls: 3,
        deleteTurn: false,
        remainingWrites: 0,
        hasMoreChildren: true,
      })
    })

    it('deletes a turn only when its tool calls and parent fit the budget', () => {
      expect(planAnswerThreadTurnDeletion({
        remainingWrites: 3,
        toolCallCount: 2,
        hasMoreChildren: false,
      })).toEqual({
        deleteToolCalls: 2,
        deleteTurn: true,
        remainingWrites: 0,
        hasMoreChildren: false,
      })
      expect(planAnswerThreadTurnDeletion({
        remainingWrites: 4,
        toolCallCount: 0,
        hasMoreChildren: true,
      })).toEqual({
        deleteToolCalls: 0,
        deleteTurn: true,
        remainingWrites: 3,
        hasMoreChildren: true,
      })
    })
  })
})
