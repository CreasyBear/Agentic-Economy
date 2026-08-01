import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  createInMemoryActionInvocationTracer,
  type ActionInvocationOrigin,
} from '@/modules/action-invocation'
import { defineAction } from '@/modules/common/action'
import { z } from 'zod'

const neutralRoot = 'src/modules/action-invocation'
const forbiddenDomainVocabulary = [
  /\binquiry\b/i,
  /\bnotificationStatus\b/,
  /\bqueued_communication\b/,
  /\bbody\b/i,
  /\bcontact\b/i,
]

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory()
      ? sourceFiles(path)
      : entry.isFile() && entry.name.endsWith('.ts')
        ? [path]
        : []
  })
}

describe('neutral Action Invocation contract boundary', () => {
  it('contains no registered-action domain vocabulary', () => {
    const violations = sourceFiles(neutralRoot).flatMap((path) => {
      const source = readFileSync(path, 'utf8')
      return forbiddenDomainVocabulary
        .filter((pattern) => pattern.test(source))
        .map((pattern) => `${path}: ${pattern.source}`)
    })

    expect(violations).toEqual([])
  })

  it('carries an action-declared opaque result classification', async () => {
    const action = defineAction({
      id: 'development.neutralBoundary',
      name: 'Neutral boundary fixture',
      summary: 'Proves that result meaning belongs to the registered action.',
      boundaries: ['Development fixture only.'],
      schema: z.strictObject({ value: z.string() }),
      outputSchema: z.strictObject({ kind: z.literal('domain_result') }),
      parameters: [],
      readOnly: true,
      effect: {
        class: 'observation', reversible: true, recipientKind: 'none',
        dataClasses: [], spendExposure: 'none', approval: 'none',
      },
      surfaces: [],
      invocationContract: {
        version: 'development.neutralBoundary:v1',
        consequenceClass: 'read_only',
        materialInputPaths: [],
        authorityRequirement: 'none',
        retryClass: 'replayable',
        expectedEvidence: [],
        safeContinuations: [],
        invalidationConditions: [],
      },
      classifyInvocationResult: () => ({
        outcome: 'action_owned_outcome',
        referenceable: false,
      }),
      run: async () => ({ kind: 'domain_result' as const }),
    })
    const origin: ActionInvocationOrigin = {
      kind: 'standalone',
      callerRef: 'dev:neutral-caller',
      principalRef: 'dev:neutral-principal',
    }
    const tracer = createInMemoryActionInvocationTracer({
      action,
      now: () => '2026-07-19T12:00:00.000Z',
      nextInvocationRef: () => 'dev:neutral-invocation',
    })

    const view = await tracer.invoke({ origin, input: { value: 'opaque' }, context: {} })

    expect(view.observedResolution).toMatchObject({
      state: 'returned',
      businessOutcome: 'action_owned_outcome',
      resultReferenceable: false,
    })
  })
})
