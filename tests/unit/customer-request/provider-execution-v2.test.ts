import { describe, expect, it } from 'vitest'

import {
  defineCapabilityContract, openCapabilityDecisionModel, type CapabilityContract,
} from '@/modules/capability-contract/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  recordProviderOutcomeV2,
  type ProviderInvocationEnvelopeV2,
} from '@/modules/customer-request/public'
import { SANDBOX_V2_CAPABILITY_CONTRACT_DOCUMENT } from '@/modules/sandbox-supply/public'

describe('V2 provider outcome evidence', () => {
  it('records exact echo and contract-valid output as one immutable succeeded evidence bundle', () => {
    const contract = defineCapabilityContract(SANDBOX_V2_CAPABILITY_CONTRACT_DOCUMENT)
    const envelope = exactEnvelope(contract)
    const result = recordProviderOutcomeV2({
      envelope, contract,
      response: {
        format: 'ae.provider-result:v2', echo: exactEcho(envelope),
        output: { optionSummary: 'Provider-completed result' },
      },
      observedAt: 3_000,
    })

    expect(result).toMatchObject({
      kind: 'recorded',
      bundle: {
        outcome: {
          format: 'ae.provider-outcome:v2', state: 'succeeded',
          output: { optionSummary: 'Provider-completed result' },
          recovery: { unknownOutcome: 'reconcile_only', automaticRetry: false },
        },
        rootRun: { format: 'ae.provider-root-run:v2', state: 'succeeded' },
        leafRun: { format: 'ae.provider-leaf-run:v2', state: 'succeeded' },
        protocolEvidence: {
          format: 'ae.provider-protocol-evidence:v2', disposition: 'validated_result',
          providerResult: {
            format: 'ae.provider-result:v2', echo: exactEcho(envelope),
            output: { optionSummary: 'Provider-completed result' },
          },
        },
      },
    })
    if (result.kind !== 'recorded') throw new Error('expected outcome evidence')
    const { outcome, rootRun, leafRun, protocolEvidence } = result.bundle
    expect(new Set([
      outcome.lineageDigest, rootRun.lineageDigest, leafRun.lineageDigest, protocolEvidence.lineageDigest,
    ])).toEqual(new Set([envelope.lineageDigest]))
    expect(outcome.lineage).toEqual(envelope.lineage)
    expect(rootRun.lineage).toEqual(envelope.lineage)
    expect(leafRun.lineage).toEqual(envelope.lineage)
    expect(protocolEvidence.lineage).toEqual(envelope.lineage)
    expect(digestWithout(outcome, 'outcomeDigest')).toBe(outcome.outcomeDigest)
    expect(digestWithout(rootRun, 'rootRunDigest')).toBe(rootRun.rootRunDigest)
    expect(digestWithout(leafRun, 'leafRunDigest')).toBe(leafRun.leafRunDigest)
    expect(digestWithout(protocolEvidence, 'protocolEvidenceDigest')).toBe(protocolEvidence.protocolEvidenceDigest)
    expect(Object.isFrozen(result.bundle)).toBe(true)
  })

  it('records echo mismatch and invalid output as typed unknown external state without retry authority', () => {
    const contract = defineCapabilityContract(SANDBOX_V2_CAPABILITY_CONTRACT_DOCUMENT)
    const envelope = exactEnvelope(contract)
    const mismatched = recordProviderOutcomeV2({
      envelope, contract,
      response: {
        format: 'ae.provider-result:v2',
        echo: { ...exactEcho(envelope), actionAttemptRef: 'action-attempt:v2:other' },
        output: { optionSummary: 'Cannot be trusted' },
      },
      observedAt: 3_001,
    })
    const invalidOutput = recordProviderOutcomeV2({
      envelope, contract,
      response: {
        format: 'ae.provider-result:v2', echo: exactEcho(envelope), output: { unsupported: true },
      },
      observedAt: 3_002,
    })
    const missingEcho = recordProviderOutcomeV2({
      envelope, contract,
      response: { format: 'ae.provider-result:v2', output: { optionSummary: 'Echo missing' } },
      observedAt: 3_003,
    })
    const malformedResponse = recordProviderOutcomeV2({
      envelope, contract, response: { unexpected: true }, observedAt: 3_004,
    })
    const extraFieldResponse = recordProviderOutcomeV2({
      envelope, contract,
      response: {
        format: 'ae.provider-result:v2', echo: exactEcho(envelope),
        output: { optionSummary: 'Must not become terminal' }, unexpected: true,
      },
      observedAt: 3_005,
    })

    expect(mismatched).toMatchObject({
      kind: 'recorded',
      bundle: {
        outcome: {
          state: 'unknown_external_state', reason: 'provider_echo_mismatch',
          recovery: { kind: 'reconcile_required', automaticRetry: false },
        },
        rootRun: { state: 'unknown_external_state' },
        leafRun: { state: 'unknown_external_state' },
        protocolEvidence: { disposition: 'unknown_external_state' },
      },
    })
    expect(invalidOutput).toMatchObject({
      kind: 'recorded',
      bundle: {
        outcome: {
          state: 'unknown_external_state', reason: 'provider_output_invalid',
          recovery: { kind: 'reconcile_required', automaticRetry: false },
        },
      },
    })
    expect(missingEcho).toMatchObject({
      kind: 'recorded',
      bundle: { outcome: { state: 'unknown_external_state', reason: 'provider_echo_mismatch' } },
    })
    expect(malformedResponse).toMatchObject({
      kind: 'recorded',
      bundle: { outcome: { state: 'unknown_external_state', reason: 'provider_response_invalid' } },
    })
    expect(extraFieldResponse).toMatchObject({
      kind: 'recorded',
      bundle: { outcome: { state: 'unknown_external_state', reason: 'provider_response_invalid' } },
    })
    if (mismatched.kind !== 'recorded' || invalidOutput.kind !== 'recorded'
      || missingEcho.kind !== 'recorded' || malformedResponse.kind !== 'recorded'
      || extraFieldResponse.kind !== 'recorded') {
      throw new Error('expected unknown evidence')
    }
    expect(mismatched.bundle.outcome).not.toHaveProperty('output')
    expect(invalidOutput.bundle.outcome).not.toHaveProperty('output')
    expect(missingEcho.bundle.outcome).not.toHaveProperty('output')
    expect(malformedResponse.bundle.outcome).not.toHaveProperty('output')
    expect(extraFieldResponse.bundle.outcome).not.toHaveProperty('output')
    expect(mismatched.bundle.protocolEvidence).not.toHaveProperty('providerResult')
  })
})

function exactEnvelope(contract: CapabilityContract): ProviderInvocationEnvelopeV2 {
  const model = openCapabilityDecisionModel(contract)
  const lineage = {
    requestId: 'request:one', requestRevision: 1, principalId: 'principal:one', delegatedAgentId: 'agent:one',
    planRevisionId: 'plan:one', planDigest: digest('plan'), actionId: 'action:one',
    preparedActionRef: 'prepared-action:v2:one', preparedActionDigest: digest('prepared'),
    approvalGrantRef: 'approval-grant:v2:one', approvalGrantDigest: digest('approval'),
    actionAttemptRef: 'action-attempt:v2:one', actionAttemptDigest: digest('attempt'),
    authorityLineageDigest: digest('authority'), contractRef: contract.ref,
    selectionKey: model.selectionKey, semanticDigest: model.semanticDigest, businessId: 'business:one',
    offeringId: 'offering:one', offeringRegistrationHash: digest('offering'),
    bindingId: 'binding:one', bindingRegistrationHash: digest('binding'),
  }
  const material: Omit<ProviderInvocationEnvelopeV2, 'envelopeDigest'> = {
    format: 'ae.provider-invocation-envelope:v2', envelopeRef: 'provider-invocation:v2:one',
    state: 'ready_for_provider', providerIdempotencyKey: 'provider-idempotency:v2:one',
    lineage, lineageDigest: canonicalDigest(lineage),
    providerReleaseGrantRef: 'provider-release-grant:v2:one', providerReleaseGrantDigest: digest('release'),
    disclosureGrantRef: 'disclosure-grant:v2:one', disclosureGrantDigest: digest('disclosure'),
    input: {
      schemaIdentity: canonicalDigest(contract.inputSchema),
      value: { requestContext: 'Find one sandbox result' },
      valueDigest: canonicalDigest({ requestContext: 'Find one sandbox result' }),
    },
    output: { schemaIdentity: canonicalDigest(contract.outputSchema) },
    spend: { currency: 'AUD', maximumAmountMinor: 900 }, dataScope: [], dataScopeDigest: canonicalDigest([]),
    effectScope: contract.effects.map((effect) => ({ ...effect })),
    evidenceScope: [{
      evidenceId: 'option_summary', outputPointer: '/optionSummary', purpose: 'completion',
      schemaIdentity: model.evidence[0]?.schemaIdentity ?? digest('missing-evidence'), valueDigest: digest('prior-value'),
    }],
    authorityScopeDigest: digest('scope'),
    recovery: {
      unknownOutcome: 'reconcile_only', automaticRetry: false,
      registeredLifecycle: { idempotency: 'required', recovery: 'retry_safe' },
    },
    releasedAt: 2_000, expiresAt: 8_000,
  }
  return { ...material, envelopeDigest: canonicalDigest(material) }
}

function exactEcho(envelope: ProviderInvocationEnvelopeV2) {
  return {
    envelopeRef: envelope.envelopeRef, envelopeDigest: envelope.envelopeDigest,
    actionAttemptRef: envelope.lineage.actionAttemptRef,
    actionAttemptDigest: envelope.lineage.actionAttemptDigest,
    authorityLineageDigest: envelope.lineage.authorityLineageDigest,
    providerIdempotencyKey: envelope.providerIdempotencyKey,
  }
}

function digest(value: string): string {
  return canonicalDigest(value)
}

function digestWithout<T extends object, K extends keyof T>(value: T, key: K): string {
  return canonicalDigest(Object.fromEntries(Object.entries(value).filter(([candidate]) => candidate !== key)))
}
