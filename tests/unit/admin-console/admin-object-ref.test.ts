import { describe, expect, it } from 'vitest'

import {
  parseAdminObjectRef,
} from '@/lib/operator/admin-console/ref-parsers'
import type {
  AdminObjectKind,
  AdminParseErrorCode,
} from '@/lib/operator/admin-console/contracts'

const malformedCases: ReadonlyArray<Readonly<{
  name: string
  kind: AdminObjectKind
  input: string
  code: AdminParseErrorCode
}>> = [
  { name: 'empty input', kind: 'call', input: ' \t\n ', code: 'empty' },
  { name: 'malformed Call reference', kind: 'call', input: 'call:wrong', code: 'malformed_call_ref' },
  { name: 'malformed Quote reference', kind: 'quote', input: 'quote:wrong', code: 'malformed_quote_ref' },
  { name: 'malformed Tool version reference', kind: 'tool_version', input: 'tool:wrong', code: 'malformed_tool_ref' },
  { name: 'malformed Workspace reference', kind: 'workspace', input: 'workspace:wrong', code: 'malformed_account_ref' },
  { name: 'malformed Agent reference', kind: 'agent', input: 'agent:wrong', code: 'malformed_principal_ref' },
  { name: 'malformed Provider slug', kind: 'provider', input: 'Not Canonical', code: 'malformed_slug' },
]

const objectKinds: readonly AdminObjectKind[] = [
  'call',
  'quote',
  'tool_version',
  'workspace',
  'agent',
  'provider',
]

function randomString(next: () => number): string {
  const characters = ['a', 'F', '0', '9', ':', '/', '-', '_', ' ', '\t', '\n', 'é', '雪']
  const length = next() % 96
  let value = ''
  for (let index = 0; index < length; index += 1) {
    value += characters[next() % characters.length]
  }
  return value
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0
    return state
  }
}

describe('parseAdminObjectRef', () => {
  for (const testCase of malformedCases) {
    it(`returns ${testCase.code} for ${testCase.name}`, () => {
      expect(parseAdminObjectRef(testCase.kind, testCase.input)).toEqual({
        kind: 'malformed',
        code: testCase.code,
      })
    })
  }

  it('parses the canonical Call reference into its branded value', () => {
    const input = `operation-invocation:v1:${'a'.repeat(64)}`

    expect(parseAdminObjectRef('call', input)).toEqual({
      kind: 'valid',
      ref: { kind: 'call', ref: input },
    })
  })

  it('is total for 500 deterministic arbitrary strings per object kind', () => {
    const next = seededRandom(0x5eedc0de)

    for (const kind of objectKinds) {
      for (let iteration = 0; iteration < 500; iteration += 1) {
        const result = parseAdminObjectRef(kind, randomString(next))
        expect(result.kind === 'valid' || result.kind === 'malformed').toBe(true)
      }
    }
  })
})
