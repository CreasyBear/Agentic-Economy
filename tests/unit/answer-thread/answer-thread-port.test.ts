import { describe, expect, it } from 'vitest'

import { parseAnswerOperationSelectionRecognition } from '@/modules/answer-thread/internal/turn-digests'
import { answerTurnRequestSchema } from '@/modules/answer-thread/public'
import { handleAnswerTurnRequest } from '@/routes/api.answer.turn'
import { answerTurnRequestDigest } from '@/modules/answer-thread/server'

describe('POST /api/answer/turn', () => {
  it('rejects empty query bodies', async () => {
    const response = await handleAnswerTurnRequest(
      new Request('https://ae.example/api/answer/turn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-AE-Turn-Key': 'schema:empty-query' },
        body: JSON.stringify({ query: '   ' }),
      }),
    )

    expect(response.status).toBe(400)
  })

  it('validates turn request schema', () => {
    const parsed = answerTurnRequestSchema.safeParse({ query: 'plumber Preston' })
    expect(parsed.success).toBe(true)
  })
  it('recognizes only structured selection envelopes and fails malformed variants closed', () => {
    const operationRef = `operation:v1:${'a'.repeat(64)}`
    const candidateSetDigest = `sha256:${'b'.repeat(64)}`
    const reordered = JSON.stringify({
      candidateSetDigest,
      input: { value: 'Darwin' },
      operationRef,
    })
    const malformed = `{"candidateSetDigest":"${candidateSetDigest}","input":{},"operationRef":"${operationRef}"`
    const wrongSchema = JSON.stringify({
      operationRef,
      input: [],
      candidateSetDigest,
    })
    const oversized = JSON.stringify({
      operationRef,
      input: { value: 'x'.repeat(256 * 1024) },
      candidateSetDigest,
    })

    expect(parseAnswerOperationSelectionRecognition('what is the weather?')).toEqual({ kind: 'absent' })
    expect(parseAnswerOperationSelectionRecognition(reordered).kind).toBe('valid')
    expect(parseAnswerOperationSelectionRecognition(malformed)).toEqual({ kind: 'invalid' })
    expect(parseAnswerOperationSelectionRecognition(wrongSchema)).toEqual({ kind: 'invalid' })
    expect(parseAnswerOperationSelectionRecognition(oversized)).toEqual({ kind: 'invalid' })
    expect(answerTurnRequestSchema.safeParse({ query: reordered }).success).toBe(true)
    expect(answerTurnRequestSchema.safeParse({ query: malformed }).success).toBe(false)
    expect(answerTurnRequestSchema.safeParse({ query: wrongSchema }).success).toBe(false)
    expect(answerTurnRequestSchema.safeParse({ query: oversized }).success).toBe(false)
  })


  it('admits only bounded operation input envelopes above the normal query limit', () => {
    const operationRef = `operation:v1:${'a'.repeat(64)}`
    const candidateSetDigest = `sha256:${'b'.repeat(64)}`
    const exactInput = JSON.stringify({
      operationRef,
      input: { value: 'x'.repeat(300) },
      candidateSetDigest,
    })
    const prettyInput = JSON.stringify({
      candidateSetDigest,
      input: { value: 'x'.repeat(300) },
      operationRef,
    }, null, 2)

    expect(answerTurnRequestSchema.safeParse({ query: exactInput }).success).toBe(true)
    expect(answerTurnRequestSchema.safeParse({ query: prettyInput }).success).toBe(true)
    expect(answerTurnRequestSchema.safeParse({ query: 'x'.repeat(201) }).success).toBe(false)
    expect(answerTurnRequestSchema.safeParse({
      query: JSON.stringify({
        candidateSetDigest,
        operationRef,
        input: { value: 'x'.repeat(256 * 1024) },
      }),
    }).success).toBe(false)

    const firstQuery = JSON.stringify({
      operationRef,
      input: { value: `${'x'.repeat(300)}a` },
      candidateSetDigest,
    })
    const secondQuery = JSON.stringify({
      candidateSetDigest,
      input: { value: `${'x'.repeat(300)}b` },
      operationRef,
    })
    const firstDigest = answerTurnRequestDigest({ query: firstQuery })
    const secondDigest = answerTurnRequestDigest({ query: secondQuery })
    expect(answerTurnRequestDigest({ query: exactInput }))
      .toBe(answerTurnRequestDigest({ query: prettyInput }))
    expect(firstDigest).not.toBe(secondDigest)
    expect(firstDigest)
      .toBe(answerTurnRequestDigest({ query: JSON.stringify(JSON.parse(firstQuery), null, 2) }))
  })
})

