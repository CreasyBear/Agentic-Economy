import { describe, expect, it } from 'vitest'

import {
  ANSWER_OPERATION_INPUT_MAX_BYTES,
  parseAnswerOperationSelectionInput,
} from '@/modules/answer/operation-selection'

describe('parseAnswerOperationSelectionInput', () => {
  it('parses a complete operationRef + input + digest envelope', () => {
    const query = JSON.stringify({
      operationRef: `operation:v1:${'a'.repeat(64)}`,
      input: { city: 'Sydney' },
      candidateSetDigest: `sha256:${'b'.repeat(64)}`,
    })
    expect(parseAnswerOperationSelectionInput(query)).toEqual({
      operationRef: `operation:v1:${'a'.repeat(64)}`,
      input: { city: 'Sydney' },
      candidateSetDigest: `sha256:${'b'.repeat(64)}`,
    })
  })

  it('rejects natural language and malformed envelopes', () => {
    expect(parseAnswerOperationSelectionInput('option 2')).toBeUndefined()
    expect(parseAnswerOperationSelectionInput('{"operationRef":')).toBeUndefined()
    expect(parseAnswerOperationSelectionInput(JSON.stringify({
      operationRef: `operation:v1:${'a'.repeat(64)}`,
      input: { value: 'x'.repeat(ANSWER_OPERATION_INPUT_MAX_BYTES) },
      candidateSetDigest: `sha256:${'b'.repeat(64)}`,
    }))).toBeUndefined()
  })
})
