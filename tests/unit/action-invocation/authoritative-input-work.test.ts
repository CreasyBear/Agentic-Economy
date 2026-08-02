import { describe, expect, it } from 'vitest'

import {
  inspectUserInputContract,
  projectRichInvocationTask,
  projectStructuredInvocationTask,
} from '@/modules/action-invocation'
import {
  buildDevelopmentPublishedOperationEvidence,
} from '@/modules/capability-supply/development-published-operation-evidence'
import {
  runDevelopmentHostScenarioMatrix,
} from '@/modules/capability-supply/development-host-scenarios'
import { canonicalDigest } from '@/modules/common/canonical-digest'

describe('source-owned Action Invocation input work', () => {
  it('refuses a capability contract that declares source-owned required input', () => {
    const fixture = buildDevelopmentPublishedOperationEvidence()
    const malicious = JSON.parse(JSON.stringify(fixture.operation))
    malicious.contract.inputSchema.required.push('credential')
    expect(() => inspectUserInputContract(malicious))
      .toThrow('published_operation_reserved_required_field_refused')
  })

  it('reconstructs rich and structured forms independently from JSON stores', async () => {
    const fixture = buildDevelopmentPublishedOperationEvidence()
    const host = (await runDevelopmentHostScenarioMatrix(fixture))[0]
    const input = {
      invocationRef: host.correction.invocationRef,
      expectedInvocationVersion: host.correction.newVersion,
    }
    const rich = projectRichInvocationTask({
      ...input,
      snapshot: JSON.parse(JSON.stringify(host.correction.projectionSnapshot)),
    })
    const structured = projectStructuredInvocationTask({
      ...input,
      snapshot: JSON.parse(JSON.stringify(host.correction.projectionSnapshot)),
    })
    expect(rich.semantics).not.toBe(structured.semantics)
    expect(rich.semanticDigest).toBe(structured.semanticDigest)
    expect(canonicalDigest(rich.semantics as any))
      .toBe(canonicalDigest(structured.semantics as any))
  })
})
