import { describe, expect, it } from 'vitest'

import {
  applyClarificationAnswer,
  applyPreparedWorkCorrection,
  clarifyInvocationInput,
  createAuthoritativePreparedWork,
  projectInvocationTask,
} from '@/modules/action-invocation'
import {
  buildDevelopmentPublishedOperationEvidence,
} from '@/modules/capability-supply/development-published-operation-evidence'
import { canonicalDigest } from '@/modules/common/canonical-digest'

describe('ADR-010 Phase 2 source-owned semantics', () => {
  const fixture = buildDevelopmentPublishedOperationEvidence()

  it('asks each exact missing required input once and preserves known values', () => {
    const first = clarifyInvocationInput({
      descriptor: fixture.descriptor,
      known: { symbol: 'BTC' },
    })
    expect(first.missing).toEqual(['convert'])
    expect(first.questions).toEqual([{ field: 'convert', prompt: 'What convert should be used?' }])
    expect(JSON.stringify(first)).not.toMatch(/method|path|payment|credential|provider/iu)

    const answered = applyClarificationAnswer({
      descriptor: fixture.descriptor,
      current: first,
      answers: { convert: 'USD' },
    })
    expect(answered).toMatchObject({
      known: { symbol: 'BTC', convert: 'USD' },
      missing: [],
      questions: [],
      continuation: 'prepare_current_operation',
    })
    expect(() => applyClarificationAnswer({
      descriptor: fixture.descriptor,
      current: first,
      answers: { method: 'GET' },
    })).toThrow('clarification_unrequested_field_refused')
  })

  it('invalidates projection and authority only for material corrections', () => {
    const original = createAuthoritativePreparedWork({
      lineageRef: 'invocation:phase-two',
      value: { symbol: 'BTC', convert: 'USD' },
    })
    const presentation = applyPreparedWorkCorrection({
      current: original,
      value: { density: 'compact' },
      classification: 'presentation_only',
    })
    expect(presentation).toMatchObject({
      kind: 'presentation_only',
      work: original,
      invalidatedProjectionVersion: null,
    })

    const corrected = applyPreparedWorkCorrection({
      current: original,
      value: { symbol: 'ETH', convert: 'USD' },
      classification: 'material',
    })
    expect(corrected).toMatchObject({
      kind: 'material',
      invalidatedProjectionVersion: 1,
      invalidatedAuthority: true,
      work: {
        lineageRef: original.lineageRef,
        version: 2,
        projectionVersion: 2,
        authorityState: 'fresh_required',
      },
    })
  })

  it('projects rich and structured forms with one normalized semantic digest', () => {
    const view = {
      invocationRef: 'invocation:projection',
      invocationVersion: 3,
      environment: 'MOCK/DEVELOPMENT ONLY',
      persistence: 'durable_control',
      origin: { kind: 'standalone', callerRef: 'agent:a', principalRef: 'principal:p' },
      owner: { callerRef: 'agent:a', principalRef: 'principal:p' },
      action: { id: fixture.descriptor.id, contractVersion: fixture.descriptor.version },
      desired: { state: 'invoke' },
      prepared: {
        materialInputDigest: 'sha256:material',
        target: {},
        consequence: 'Releases the query and exact payment.',
        dataUse: { fields: ['/symbol', '/convert'], limits: { amountMinor: 1 } },
        preparedAt: '2026-07-20T00:00:00.000Z',
        freshUntil: '2026-07-20T00:05:00.000Z',
      },
      authority: { reference: 'authority:a', expiresAt: '2026-07-20T00:05:00.000Z' },
      attempts: [],
      observedResolution: { state: 'pending' },
      freshness: { state: 'not_observed' },
      control: { state: 'awaiting_authority' },
    } as const
    const pair = projectInvocationTask({
      view,
      descriptor: fixture.descriptor,
      suppliedInput: { symbol: 'BTC', convert: 'USD' },
    })
    expect(pair.rich.semanticDigest).toBe(pair.structured.semanticDigest)
    expect(canonicalDigest(pair.rich.semantics as any))
      .toBe(canonicalDigest(pair.structured.semantics as any))
    expect(pair.structured.semantics).toMatchObject({
      missingInformation: [],
      authorityBoundary: { accepted: false },
      disposition: { state: 'awaiting_authority' },
    })
  })
})
