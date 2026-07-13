import { afterEach, describe, expect, it } from 'vitest'

import {
  runAnswerToolCall,
  toolCallRecordsToGateInput,
} from '@/modules/answer-thread/internal/tool-runner'
import type { AnswerToolCallRecord } from '@/modules/answer-thread/tooling'

const TURN_ID = 'turn-1'
const BASE_SEQ = 0

afterEach(() => {
  delete process.env.OPENROUTER_API_KEY
})

describe('runAnswerToolCall', () => {
  it('runs registry.search and records a complete tool-call with slugs and a stable hash', async () => {
    const previousLocalRegistry = process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
    process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = 'true'

    try {
      const result = await runAnswerToolCall({
        toolId: 'registry.search',
        input: { query: 'parramatta' },
        turnId: TURN_ID,
        seq: BASE_SEQ,
      })

      expect(result.record.status).toBe('complete')
      expect(result.record.toolId).toBe('registry.search')
      expect(result.record.turnId).toBe(TURN_ID)
      expect(result.record.seq).toBe(BASE_SEQ)
      expect(result.record.resultHash).toMatch(/^hash:/)

      const summary = JSON.parse(result.record.resultSummaryJson)
      expect(summary.slugs).toContain('parramatta-emergency-plumbing')
      expect(summary.count).toBeGreaterThan(0)

      expect(result.providers.map((provider) => provider.slug)).toContain(
        'parramatta-emergency-plumbing',
      )
      expect(result.allowedSlugs.has('parramatta-emergency-plumbing')).toBe(true)
    } finally {
      if (previousLocalRegistry === undefined) {
        delete process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
      } else {
        process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = previousLocalRegistry
      }
    }
  })

  it.each([
    {
      query: 'hot water system burst in rental, need plumber today Joondalup',
      expectedSlug: 'joondalup-rapid-plumbing',
    },
    {
      query: 'electrician switchboard upgrade Fremantle',
      expectedSlug: 'fremantle-coastal-electrical',
    },
  ])('recalls $expectedSlug from the shared local-e2e source for a detailed trade query', async ({
    query,
    expectedSlug,
  }) => {
    const previousLocalRegistry = process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
    process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = 'true'

    try {
      const result = await runAnswerToolCall({
        toolId: 'registry.search',
        input: { query },
        turnId: TURN_ID,
        seq: BASE_SEQ,
      })

      expect(result.record.status).toBe('complete')
      expect(result.providers.map((provider) => provider.slug)).toEqual([expectedSlug])
    } finally {
      if (previousLocalRegistry === undefined) {
        delete process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
      } else {
        process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = previousLocalRegistry
      }
    }
  })

  it('returns no provider for a plumbing query naming an uncovered suburb', async () => {
    const previousLocalRegistry = process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
    process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = 'true'

    try {
      const result = await runAnswerToolCall({
        toolId: 'registry.search',
        input: { query: 'plumber Kalamunda WA' },
        turnId: TURN_ID,
        seq: BASE_SEQ,
      })

      expect(result.record.status).toBe('complete')
      expect(result.providers).toEqual([])
    } finally {
      if (previousLocalRegistry === undefined) {
        delete process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
      } else {
        process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = previousLocalRegistry
      }
    }
  })

  it('keeps the registry literal: a misspelled suburb yields an empty complete result', async () => {
    const previousLocalRegistry = process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
    process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = 'true'

    try {
      const result = await runAnswerToolCall({
        toolId: 'registry.search',
        input: { query: 'paramata' },
        turnId: TURN_ID,
        seq: BASE_SEQ,
      })

      expect(result.record.status).toBe('complete')
      const summary = JSON.parse(result.record.resultSummaryJson)
      expect(summary.slugs).toEqual([])
      expect(summary.count).toBe(0)
      expect(result.providers).toEqual([])
      expect(result.allowedSlugs.size).toBe(0)
    } finally {
      if (previousLocalRegistry === undefined) {
        delete process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
      } else {
        process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = previousLocalRegistry
      }
    }
  })

  it('records an error when the input does not match the action schema', async () => {
    const result = await runAnswerToolCall({
      toolId: 'registry.search',
      input: {},
      turnId: TURN_ID,
      seq: BASE_SEQ,
    })

    expect(result.record.status).toBe('error')
    const summary = JSON.parse(result.record.resultSummaryJson)
    expect(summary.errorCode).toBe('invalid_input')
    expect(result.providers).toEqual([])
  })

  it('refuses an unknown tool id without running anything', async () => {
    const result = await runAnswerToolCall({
      toolId: 'registry.nothing',
      input: {},
      turnId: TURN_ID,
      seq: BASE_SEQ,
    })

    expect(result.record.status).toBe('refused')
    const summary = JSON.parse(result.record.resultSummaryJson)
    expect(summary.errorCode).toBe('tool_not_known')
  })

  it('refuses a write action such as inquiry.submit — it is not part of the answer read toolset', async () => {
    const result = await runAnswerToolCall({
      toolId: 'inquiry.submit',
      input: { body: 'help' },
      turnId: TURN_ID,
      seq: BASE_SEQ,
    })

    expect(result.record.status).toBe('refused')
    const summary = JSON.parse(result.record.resultSummaryJson)
    // inquiry.submit is not a known answer tool id; the answer agent's toolset
    // is read-only by construction, so write actions never reach the runner.
    expect(summary.errorCode).toBe('tool_not_known')
  })

  it('runs registry.detail and records a found business, or an empty complete result for not_found', async () => {
    const previousLocalRegistry = process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
    process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = 'true'

    try {
      const found = await runAnswerToolCall({
        toolId: 'registry.detail',
        input: { slug: 'parramatta-emergency-plumbing' },
        turnId: TURN_ID,
        seq: BASE_SEQ,
      })
      expect(found.record.status).toBe('complete')
      const foundSummary = JSON.parse(found.record.resultSummaryJson)
      expect(foundSummary.slugs).toEqual(['parramatta-emergency-plumbing'])
      expect(foundSummary.count).toBe(1)

      const missing = await runAnswerToolCall({
        toolId: 'registry.detail',
        input: { slug: 'no-such-business' },
        turnId: TURN_ID,
        seq: BASE_SEQ + 1,
      })
      expect(missing.record.status).toBe('complete')
      const missingSummary = JSON.parse(missing.record.resultSummaryJson)
      expect(missingSummary.slugs).toEqual([])
      expect(missingSummary.count).toBe(0)
    } finally {
      if (previousLocalRegistry === undefined) {
        delete process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
      } else {
        process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = previousLocalRegistry
      }
    }
  })
})

describe('toolCallRecordsToGateInput', () => {
  it('maps each tool-call result summary into a batch of slug objects for the gate', () => {
    const records: AnswerToolCallRecord[] = [
      buildRecord('tc-1', 1, 'registry.search', {
        slugs: ['alpha-plumbing', 'beta-plumbing'],
        count: 2,
      }),
      buildRecord('tc-2', 2, 'registry.detail', {
        slugs: ['gamma-plumbing'],
        count: 1,
      }),
    ]

    const batches = toolCallRecordsToGateInput(records)
    expect(batches).toEqual([
      [{ slug: 'alpha-plumbing' }, { slug: 'beta-plumbing' }],
      [{ slug: 'gamma-plumbing' }],
    ])
  })

  it('tolerates a corrupted result summary by returning an empty batch', () => {
    const records: AnswerToolCallRecord[] = [
      buildRecord('tc-bad', 1, 'registry.search', { slugs: ['ok-plumbing'], count: 1 }),
      {
        ...buildRecord('tc-corrupt', 2, 'registry.search', { slugs: [], count: 0 }),
        resultSummaryJson: '{not valid json',
      },
    ]

    const batches = toolCallRecordsToGateInput(records)
    expect(batches[0]).toEqual([{ slug: 'ok-plumbing' }])
    expect(batches[1]).toEqual([])
  })
})

function buildRecord(
  toolCallId: string,
  seq: number,
  toolId: AnswerToolCallRecord['toolId'],
  summary: { slugs: readonly string[]; count: number },
): AnswerToolCallRecord {
  return {
    toolCallId,
    turnId: TURN_ID,
    seq,
    toolId,
    inputJson: '{}',
    resultSummaryJson: JSON.stringify(summary),
    resultJson: JSON.stringify({ kind: 'ok', items: summary.slugs.map((slug) => ({ slug })) }),
    resultHash: 'hash:test',
    status: 'complete',
    createdAt: 1_000,
  }
}
