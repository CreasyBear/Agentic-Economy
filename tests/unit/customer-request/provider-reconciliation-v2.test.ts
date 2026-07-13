import { describe, expect, it } from 'vitest'

import {
  defineCapabilityContract, openCapabilityDecisionModel, type CapabilityContract,
} from '@/modules/capability-contract/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  reconcileProviderOutcomeV2,
  recordProviderOutcomeV2,
  type ProviderInvocationEnvelopeV2,
  type ProviderOutcomeV2,
} from '@/modules/customer-request/public'
import { SANDBOX_V2_CAPABILITY_CONTRACT_DOCUMENT } from '@/modules/sandbox-supply/public'

describe('V2 provider reconciliation', () => {
  it('keeps pending and mismatched evidence unknown, then resolves exact registered evidence once', () => {
    const contract = defineCapabilityContract(SANDBOX_V2_CAPABILITY_CONTRACT_DOCUMENT)
    const envelope = exactEnvelope(contract)
    const unknownOutcome = unknownProviderOutcome(envelope, contract)
    const common = {
      format: 'ae.provider-reconciliation-report:v2' as const,
      providerEvidenceRef: 'provider-evidence:sandbox:one',
      provider: providerIdentity(envelope),
    }
    const pending = reconcileProviderOutcomeV2({
      unknownOutcome, envelope, contract,
      report: { ...common, disposition: 'pending', echo: exactEcho(envelope) },
      observedAt: 4_000,
    })
    const malformed = reconcileProviderOutcomeV2({
      unknownOutcome, envelope, contract,
      report: { format: 'ae.provider-reconciliation-report:v2', disposition: 'succeeded' },
      observedAt: 4_000,
    })
    const mismatched = reconcileProviderOutcomeV2({
      unknownOutcome, envelope, contract,
      report: {
        ...common,
        provider: { ...providerIdentity(envelope), bindingId: 'binding:other' },
        disposition: 'succeeded',
        result: {
          format: 'ae.provider-result:v2', echo: exactEcho(envelope),
          output: { optionSummary: 'Untrusted result' },
        },
      },
      observedAt: 4_001,
    })
    const succeeded = reconcileProviderOutcomeV2({
      unknownOutcome, envelope, contract,
      report: {
        ...common, providerEvidenceRef: 'provider-evidence:sandbox:two',
        disposition: 'succeeded',
        result: {
          format: 'ae.provider-result:v2', echo: exactEcho(envelope),
          output: { optionSummary: 'Reconciled provider result' },
        },
      },
      observedAt: 4_002,
    })

    expect(pending).toMatchObject({
      kind: 'observed',
      observation: {
        state: 'unknown_external_state', reason: 'provider_pending',
        recovery: { kind: 'reconcile_required', automaticRetry: false },
      },
      resolution: { state: 'unknown_external_state', automaticRetry: false },
    })
    expect(malformed).toMatchObject({
      kind: 'observed',
      observation: { state: 'unknown_external_state', reason: 'evidence_invalid' },
      resolution: { state: 'unknown_external_state', automaticRetry: false },
    })
    expect(mismatched).toMatchObject({
      kind: 'observed',
      observation: { state: 'unknown_external_state', reason: 'provider_identity_mismatch' },
      resolution: { state: 'unknown_external_state', automaticRetry: false },
    })
    expect(succeeded).toMatchObject({
      kind: 'observed',
      observation: {
        state: 'succeeded',
        terminal: {
          providerResult: {
            output: { optionSummary: 'Reconciled provider result' },
          },
          evidence: [{ evidenceId: 'option_summary', purpose: 'completion', value: 'Reconciled provider result' }],
        },
      },
      resolution: {
        state: 'succeeded', automaticRetry: false,
        terminal: { output: { optionSummary: 'Reconciled provider result' } },
      },
    })
    if (succeeded.kind !== 'observed') throw new Error('reconciliation result missing')
    expect(Object.isFrozen(succeeded)).toBe(true)
  })

  it('requires registered recovery evidence before recording a provider-confirmed failure', () => {
    const contract = defineCapabilityContract({
      ...SANDBOX_V2_CAPABILITY_CONTRACT_DOCUMENT,
      outputSchema: {
        ...SANDBOX_V2_CAPABILITY_CONTRACT_DOCUMENT.outputSchema,
        properties: {
          ...SANDBOX_V2_CAPABILITY_CONTRACT_DOCUMENT.outputSchema.properties,
          recoveryCode: { type: 'string' },
        },
      },
      customerAnnotations: [
        ...SANDBOX_V2_CAPABILITY_CONTRACT_DOCUMENT.customerAnnotations,
        {
          annotationId: 'recovery_code', document: 'output', pointer: '/recoveryCode',
          label: 'Recovery status', role: 'recovery',
        },
      ],
      evidence: [
        ...SANDBOX_V2_CAPABILITY_CONTRACT_DOCUMENT.evidence,
        { evidenceId: 'recovery_code', outputPointer: '/recoveryCode', purpose: 'recovery' },
      ],
    })
    const envelope = exactEnvelope(contract)
    const unknownOutcome = unknownProviderOutcome(envelope, contract)
    const common = {
      format: 'ae.provider-reconciliation-report:v2' as const,
      providerEvidenceRef: 'provider-evidence:sandbox:failure',
      provider: providerIdentity(envelope), disposition: 'failed' as const,
    }
    const withoutRecovery = reconcileProviderOutcomeV2({
      unknownOutcome, envelope, contract,
      report: {
        ...common,
        result: {
          format: 'ae.provider-result:v2', echo: exactEcho(envelope),
          output: { optionSummary: 'No result available' },
        },
      },
      observedAt: 4_000,
    })
    const failed = reconcileProviderOutcomeV2({
      unknownOutcome, envelope, contract,
      report: {
        ...common,
        result: {
          format: 'ae.provider-result:v2', echo: exactEcho(envelope),
          output: { optionSummary: 'No result available', recoveryCode: 'not_available' },
        },
      },
      observedAt: 4_001,
    })

    expect(withoutRecovery).toMatchObject({
      kind: 'observed', observation: {
        state: 'unknown_external_state', reason: 'terminal_evidence_missing',
      },
    })
    expect(failed).toMatchObject({
      kind: 'observed', observation: {
        state: 'failed',
        terminal: {
          evidence: [{
            evidenceId: 'recovery_code', purpose: 'recovery', value: 'not_available',
          }],
        },
      },
      resolution: {
        state: 'failed', automaticRetry: false,
        terminal: { output: { optionSummary: 'No result available', recoveryCode: 'not_available' } },
      },
    })
  })
})

function unknownProviderOutcome(
  envelope: ProviderInvocationEnvelopeV2, contract: CapabilityContract,
): Extract<ProviderOutcomeV2, { state: 'unknown_external_state' }> {
  const recorded = recordProviderOutcomeV2({
    envelope, contract,
    response: { format: 'ae.provider-result:v2', output: { optionSummary: 'Echo missing' } },
    observedAt: 3_000,
  })
  if (recorded.kind !== 'recorded' || recorded.bundle.outcome.state !== 'unknown_external_state') {
    throw new Error('unknown provider outcome missing')
  }
  return recorded.bundle.outcome
}

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
      schemaIdentity: canonicalDigest(contract.inputSchema), value: { requestContext: 'Find one sandbox result' },
      valueDigest: canonicalDigest({ requestContext: 'Find one sandbox result' }),
    },
    output: { schemaIdentity: canonicalDigest(contract.outputSchema) },
    spend: { currency: 'AUD', maximumAmountMinor: 900 }, dataScope: [], dataScopeDigest: canonicalDigest([]),
    effectScope: contract.effects.map((effect) => ({ ...effect })),
    evidenceScope: [{
      evidenceId: 'option_summary', outputPointer: '/optionSummary', purpose: 'completion',
      schemaIdentity: model.evidence[0]?.schemaIdentity ?? digest('evidence'), valueDigest: digest('prior'),
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

function providerIdentity(envelope: ProviderInvocationEnvelopeV2) {
  return {
    businessId: envelope.lineage.businessId,
    offeringId: envelope.lineage.offeringId,
    offeringRegistrationHash: envelope.lineage.offeringRegistrationHash,
    bindingId: envelope.lineage.bindingId,
    bindingRegistrationHash: envelope.lineage.bindingRegistrationHash,
  }
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

function digest(value: string): string { return canonicalDigest(value) }
