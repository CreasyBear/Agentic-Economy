import { describe, expect, it } from 'vitest'

import {
  buildOperationMarketProofReport,
  computeOperationMarketProofGate,
  createOperationMarketProofAttempt,
  createOperationMarketProofManifest,
  operationMarketProofAttemptInputSchema,
  operationMarketProofManifestInputSchema,
  type OperationMarketProofAttempt,
  type OperationMarketProofAttemptInput,
  type OperationMarketProofManifest,
  type OperationMarketProofManifestInput,
} from '@/modules/external-run/public'

const sha = (character: string): `sha256:${string}` => `sha256:${character.repeat(64)}`
const operation = (character: string): `operation:v1:${string}` => `operation:v1:${character.repeat(64)}`
const mapping = (character: string): `mapping:v1:${string}` => `mapping:v1:${character.repeat(64)}`

function manifestInput(): OperationMarketProofManifestInput {
  const search = operation('a')
  const contents = operation('b')
  return {
    proofRef: 'proof:operation-market:release-one',
    release: {
      origin: 'https://agentic-economy.example',
      deploymentId: 'deployment:release-one',
      runtime: 'nodejs22.x',
      registrySnapshotDigest: sha('1'),
    },
    operations: [
      {
        role: 'exa_search', operationRef: search, capabilityId: 'exa.search', contractDigest: sha('2'),
        publicationRef: 'publication:exa-search', publicationRevision: 1,
        bindingId: 'binding:exa-search:api-key:v1', providerRef: 'provider:exa',
        providerOrigin: 'https://api.exa.ai', credentialClass: 'platform_api_key', maximumProviderCostMinor: 1,
      },
      {
        role: 'exa_contents', operationRef: contents, capabilityId: 'exa.contents', contractDigest: sha('3'),
        publicationRef: 'publication:exa-contents', publicationRevision: 1,
        bindingId: 'binding:exa-contents:api-key:v1', providerRef: 'provider:exa',
        providerOrigin: 'https://api.exa.ai', credentialClass: 'platform_api_key', maximumProviderCostMinor: 1,
      },
      {
        role: 'frankfurter_rate', operationRef: operation('c'), capabilityId: 'frankfurter.single-rate', contractDigest: sha('4'),
        publicationRef: 'publication:frankfurter-rate', publicationRevision: 1,
        bindingId: 'binding:frankfurter-rate:v1', providerRef: 'provider:frankfurter',
        providerOrigin: 'https://api.frankfurter.dev', credentialClass: 'keyless', maximumProviderCostMinor: 0,
      },
    ],
    mapping: { mappingRef: mapping('d'), sourceOperationRef: search, targetOperationRef: contents },
    spend: {
      currency: 'USD', maximumAttemptCostMinor: 2, maximumProgramCostMinor: 4, repeatedRunsApproved: false,
    },
    evidencePolicy: {
      manifestVersion: 'ae.operation-market-proof-manifest:v1',
      attemptVersion: 'ae.operation-market-proof-attempt:v1',
      reportVersion: 'ae.operation-market-proof-report:v1',
      participantKinds: ['cold_human', 'cold_external_agent'],
    },
  }
}

function attemptInput(
  manifest: OperationMarketProofManifest,
  kind: 'cold_human' | 'cold_external_agent',
  index: number,
): OperationMarketProofAttemptInput {
  const startedAt = 1_800_000_000_000 + index * 100_000
  const authentication = kind === 'cold_human' ? 'human_session' : 'external_agent_oauth'
  return {
    attemptRef: `attempt:${kind}:${index}`,
    manifestDigest: manifest.digest,
    participant: {
      kind,
      participantRef: `participant:${kind}:${index}`,
      coldStartAttested: true,
      repositoryContextProvided: false,
      authentication,
    },
    startedAt,
    terminalAt: startedAt + 30_000,
    request: {
      requestRef: `request:${kind}:${index}`,
      intent: 'Research official AI agent payment guidance and convert the cited EUR amount to USD.',
      revision: 3,
      routeRef: `route:${kind}:${index}`,
      planDigest: sha(index === 1 ? '5' : '6'),
      confirmationReceiptRef: `receipt:confirmation:${kind}:${index}`,
    },
    steps: manifest.operations.map((entry, stepIndex) => {
      const common = {
        role: entry.role,
        operationRef: entry.operationRef,
        providerRef: entry.providerRef,
        bindingId: entry.bindingId,
        startedAt: startedAt + stepIndex * 5_000,
        terminalAt: startedAt + (stepIndex + 1) * 5_000,
        paymentSubmitted: false as const,
      }
      return entry.role === 'frankfurter_rate'
        ? {
            ...common,
            outcome: 'succeeded' as const,
            kernelAttemptRef: `kernel-attempt:${kind}:${stepIndex}`,
            validatedOutputDigest: sha(String(stepIndex + 7)),
            providerReceiptDigest: sha(['a', 'b', 'c'][stepIndex] ?? 'd'),
            providerCostMinor: 0,
          }
        : {
            ...common,
            outcome: 'selected' as const,
            selectionEvidenceDigest: sha(String(stepIndex + 7)),
            providerCostMinor: 0 as const,
          }
    }),
    recovery: {
      interruptionExercised: true,
      resumedFromDurableState: true,
      duplicateEffects: 0,
      unauthorizedEffects: 0,
      unknownOutcomes: 0,
    },
    durableReadback: {
      requestRef: `request:${kind}:${index}`,
      state: 'complete',
      readbackDigest: sha(index === 1 ? 'e' : 'f'),
      readAt: startedAt + 31_000,
    },
    result: {
      answerDigest: sha(index === 1 ? 'a' : 'b'),
      citations: [
        { providerRef: 'provider:exa', url: 'https://example.com/exa-source', evidenceDigest: sha('c') },
        { providerRef: 'provider:frankfurter', url: 'https://api.frankfurter.dev/v2/rates', evidenceDigest: sha('d') },
      ],
      exchangeRate: 1.1,
    },
    participantAcceptance: 'accepted',
  }
}

function passingProof(): Readonly<{
  manifest: OperationMarketProofManifest
  attempts: readonly OperationMarketProofAttempt[]
}> {
  const manifest = createOperationMarketProofManifest(manifestInput(), 1_800_000_000_000)
  return {
    manifest,
    attempts: [
      createOperationMarketProofAttempt(manifest, attemptInput(manifest, 'cold_human', 1)),
      createOperationMarketProofAttempt(manifest, attemptInput(manifest, 'cold_external_agent', 2)),
    ],
  }
}

describe('operation market proof contract', () => {
  it('passes only the two cold, authenticated, durable, bounded, non-payment journeys', () => {
    const { manifest, attempts } = passingProof()
    const report = buildOperationMarketProofReport(manifest, attempts, 1_800_000_300_000)

    expect(report.gate).toEqual({ decision: 'PASS', failures: [] })
    expect(report.observation).toEqual(expect.objectContaining({
      attemptCount: 2,
      participantKinds: ['cold_external_agent', 'cold_human'],
      completedSteps: 6,
      selectedSteps: 4,
      providerSuccesses: 2,
      paymentSubmissions: 0,
      totalProviderCostMinor: 0,
      acceptedAttempts: 2,
    }))
  })

  it('fails closed on operation drift, tampering, and provider cost excess', () => {
    const { manifest, attempts } = passingProof()
    const first = attempts[0]
    if (first === undefined) throw new Error('proof_attempt_missing')
    const tampered: OperationMarketProofAttempt = {
      ...first,
      steps: first.steps.map((step) => step.role === 'frankfurter_rate' && step.outcome === 'succeeded'
        ? { ...step, operationRef: operation('f'), providerCostMinor: 5 }
        : step),
    }
    const gate = computeOperationMarketProofGate(manifest, [tampered, attempts[1]!])

    expect(gate.decision).toBe('FAIL')
    expect(gate.failures).toEqual(expect.arrayContaining([
      `${tampered.attemptRef}:integrity_invalid`,
      `${tampered.attemptRef}:frankfurter_rate:operation_drift`,
      `${tampered.attemptRef}:frankfurter_rate:provider_cost_exceeded`,
      `${tampered.attemptRef}:attempt_cost_exceeded`,
      'program_cost_exceeded',
    ]))
  })

  it('rejects a non-heterogeneous provider manifest and raw evidence fields', () => {
    const input = manifestInput()
    expect(() => createOperationMarketProofManifest({
      ...input,
      operations: input.operations.map((entry) => ({
        ...entry,
        credentialClass: 'platform_api_key',
      })),
    }, 1_800_000_000_000)).toThrow('operation_market_manifest_provider_heterogeneity_invalid')

    const manifest = createOperationMarketProofManifest(input, 1_800_000_000_000)
    expect(operationMarketProofAttemptInputSchema.safeParse({
      ...attemptInput(manifest, 'cold_human', 1),
      rawProviderOutput: { secret: 'must-not-be-recorded' },
    }).success).toBe(false)
  })

  it('rejects wrong authority, payment, and unresolved recovery evidence', () => {
    const manifest = createOperationMarketProofManifest(manifestInput(), 1_800_000_000_000)
    const attempt = attemptInput(manifest, 'cold_external_agent', 1)
    const wrongAuthority = createOperationMarketProofAttempt(manifest, {
      ...attempt,
      participant: { ...attempt.participant, authentication: 'human_session' },
    })
    const human = createOperationMarketProofAttempt(
      manifest,
      attemptInput(manifest, 'cold_human', 2),
    )
    expect(computeOperationMarketProofGate(manifest, [human, wrongAuthority]).failures)
      .toContain(`${wrongAuthority.attemptRef}:agent_auth_invalid`)
    expect(operationMarketProofAttemptInputSchema.safeParse({
      ...attempt,
      steps: attempt.steps.map((step, index) => (
        index === 0 ? { ...step, paymentSubmitted: true } : step
      )),
    }).success).toBe(false)
    expect(operationMarketProofAttemptInputSchema.safeParse({
      ...attempt,
      recovery: { ...attempt.recovery, unknownOutcomes: 1 },
    }).success).toBe(false)
  })
})
