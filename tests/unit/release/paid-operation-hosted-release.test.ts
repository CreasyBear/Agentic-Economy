import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import {
  admitLivePaidOperationHostedEvidence,
  canonicalProofDigest,
  collectPaidOperationHostedProofPacket,
  compareAuthoritativeLiveEvidence,
  verifyPacketIntegrity,
} from '../../../tools/release/verify-paid-operation-hosted-release'

const SOURCE_REVISION = '5d5c76db4b3470949ffb2db9b606692bb7217e9d'
const SOURCE_TREE = 'bf3769890c9940ae259fab9777fdca8b25f686d7'
const DIGEST = (character: string) => `sha256:${character.repeat(64)}`

describe('paid-operation hosted proof integrity and live admission', () => {
  it('validates a complete synthetic packet only as local packet integrity', () => {
    const packet = completePacket()
    const result = verifyPacketIntegrity(packet)

    expect(result).toMatchObject({
      kind: 'packet_integrity_verified',
      evidenceClass: 'local_packet_integrity_only',
      packetDigest: packet.checksum.digest,
    })
    expect(JSON.stringify(result)).not.toContain('authenticated_exact_revision_hosted_sandbox')
    expect(JSON.stringify(packet)).not.toContain('authenticated_exact_revision_hosted_sandbox')
  })

  it('refuses checksum-only forgery, packet tampering, and a self-asserted hosted label', () => {
    const tampered = mutateContent((content) => {
      const operation = content.scenarios[0]!.projections.humanWarm.semantics.operation
      ;(operation as { providerId: string }).providerId = 'provider:forged'
    })
    expect(verifyPacketIntegrity(tampered)).toEqual({
      kind: 'refused',
      code: 'projection_semantics_mismatch',
    })

    const staleChecksum = structuredClone(completePacket())
    staleChecksum.source.observedTree = DIGEST('f')
    expect(verifyPacketIntegrity(staleChecksum)).toEqual({
      kind: 'refused',
      code: 'packet_checksum_mismatch',
    })

    const preclaimed = structuredClone(completePacket()) as unknown as Record<string, unknown>
    preclaimed.evidenceClass = 'authenticated_exact_revision_hosted_sandbox'
    expect(verifyPacketIntegrity(rechecksum(preclaimed))).toEqual({
      kind: 'refused',
      code: 'final_evidence_class_preclaimed',
    })
  })

  it('refuses source, deployment, repository, Convex, and actor identity mismatch', () => {
    const cases = [
      mutateContent((content) => { content.source.observedRevision = 'f'.repeat(40) }),
      mutateContent((content) => { content.deployment.gitSha = 'f'.repeat(40) }),
      mutateContent((content) => { content.deployment.gitRef = 'codex/forged' }),
      mutateContent((content) => { content.deployment.repository = 'other/repository' }),
      mutateContent((content) => { content.convex.sourceRevision = 'f'.repeat(40) }),
      mutateContent((content) => {
        content.actors.agent.callerDigest = content.actors.human.callerDigest
      }),
    ]
    const codes = [
      'source_assertion_mismatch',
      'deployment_assertion_mismatch',
      'deployment_assertion_mismatch',
      'deployment_assertion_mismatch',
      'convex_identity_mismatch',
      'actor_identity_mismatch',
    ]

    cases.forEach((packet, index) => {
      expect(verifyPacketIntegrity(packet)).toEqual({
        kind: 'refused',
        code: codes[index],
      })
    })
  })

  it('refuses divergent projections even when all four projection digests are recomputed', () => {
    const packet = mutateContent((content) => {
      const scenario = content.scenarios[1]!
      scenario.projections.agentCold.semantics.resultDelivery = { state: 'not_delivered' }
      scenario.projections.agentCold.semanticDigest = canonicalProofDigest(
        scenario.projections.agentCold.semantics,
      )
    })
    expect(verifyPacketIntegrity(packet)).toEqual({
      kind: 'refused',
      code: 'projection_semantics_mismatch',
    })
  })

  it('refuses self-consistent human and agent projections contradicted by the raw observation', () => {
    const packet = mutateContent((content) => {
      const scenario = content.scenarios[0]!
      for (const projection of Object.values(scenario.projections)) {
        projection.semantics.paymentSubmission = { state: 'not_submitted' }
        projection.semantics.settlement = { state: 'no_evidence' }
        projection.semanticDigest = canonicalProofDigest(projection.semantics)
      }
    })
    expect(verifyPacketIntegrity(packet)).toEqual({
      kind: 'refused',
      code: 'internal_observation_mismatch',
    })
  })

  it('refuses unsafe goblin retry or provider switch and caller-supplied reconciliation truth', () => {
    const unsafe = mutateContent((content) => {
      content.scenarios[2]!.transitions[3]!.continuations = ['retry', 'switch_provider']
    })
    expect(verifyPacketIntegrity(unsafe)).toEqual({
      kind: 'refused',
      code: 'unsafe_uncertainty_continuation',
    })

    const unsafeProjection = mutateContent((content) => {
      for (const projection of Object.values(content.scenarios[2]!.projections)) {
        projection.semantics.continuations = [{ kind: 'retry' }]
        projection.semanticDigest = canonicalProofDigest(projection.semantics)
      }
    })
    expect(verifyPacketIntegrity(unsafeProjection)).toEqual({
      kind: 'refused',
      code: 'unsafe_uncertainty_continuation',
    })

    const callerTruth = contentFixture() as unknown as {
      scenarios: Array<{ transitions: Array<Record<string, unknown>> }>
    }
    callerTruth.scenarios[2]!.transitions[4]!.reconciliationEvidence = {
      effect: 'released',
      payment: 'settled',
    }
    expect(verifyPacketIntegrity(collectPaidOperationHostedProofPacket(callerTruth))).toEqual({
      kind: 'refused',
      code: 'caller_reconciliation_truth_forbidden',
    })
  })

  it('refuses duplicate, hidden, or extra generations/effects/invocations and active reservations', () => {
    const hiddenEffect = mutateContent((content) => {
      const invocation = content.sourceObservation.invocations[0]!
      invocation.counts.effects = 2
      invocation.counts.effectGenerations = 2
      invocation.effects.push({
        ...invocation.effects[0]!,
        effectGeneration: 0,
        observationDigest: DIGEST('9'),
      })
      refreshObservationDigests(content)
    })
    expect(verifyPacketIntegrity(hiddenEffect)).toEqual({
      kind: 'refused',
      code: 'effect_count_mismatch',
    })

    const hiddenAttempt = mutateContent((content) => {
      const invocation = content.sourceObservation.invocations[1]!
      invocation.counts.attempts = 2
      invocation.attempts.push({
        ...invocation.attempts[0]!,
        attemptNumber: 0,
        effectGeneration: 0,
      })
      refreshObservationDigests(content)
    })
    expect(verifyPacketIntegrity(hiddenAttempt)).toEqual({
      kind: 'refused',
      code: 'effect_count_mismatch',
    })

    const active = mutateContent((content) => {
      content.sourceObservation.counters.activeReservations = 1
      content.sourceObservation.invocations[0]!.reservation.state = 'active'
      refreshObservationDigests(content)
    })
    expect(verifyPacketIntegrity(active)).toEqual({
      kind: 'refused',
      code: 'active_reservation_mismatch',
    })

    const extraScenario = contentFixture() as unknown as {
      scenarioOrder: string[]
      scenarios: unknown[]
    }
    extraScenario.scenarioOrder.push('extra')
    extraScenario.scenarios.push(structuredClone(extraScenario.scenarios[0]))
    expect(verifyPacketIntegrity(collectPaidOperationHostedProofPacket(extraScenario))).toEqual({
      kind: 'refused',
      code: 'scenario_order_mismatch',
    })
  })

  it('refuses version/command collapse and non-three total effects', () => {
    const collapsed = mutateContent((content) => {
      content.scenarios[0]!.transitions[2]!.invocationVersion = 2
    })
    expect(verifyPacketIntegrity(collapsed)).toEqual({
      kind: 'refused',
      code: 'transition_invariant_mismatch',
    })

    const nonThree = mutateContent((content) => {
      content.sourceObservation.invocations[2]!.counts.effects = 0
      content.sourceObservation.invocations[2]!.effects = []
      refreshObservationDigests(content)
    })
    expect(verifyPacketIntegrity(nonThree)).toEqual({
      kind: 'refused',
      code: 'effect_count_mismatch',
    })
  })

  it('does not admit a checksum-valid packet without live collection context', async () => {
    await expect(admitLivePaidOperationHostedEvidence(
      completePacket(),
      undefined,
    )).resolves.toEqual({
      kind: 'refused',
      code: 'live_admission_context_required',
    })
  })

  it('refuses forged control-plane fields with a valid checksum against authoritative evidence', () => {
    const original = completePacket()
    const forged = mutateContent((content) => {
      content.deployment.id = 'dpl_forged'
      content.deployment.url = 'forged.example.test'
      content.deployment.productionUrl = 'forged.example.test'
    })
    expect(verifyPacketIntegrity(forged).kind).toBe('packet_integrity_verified')

    const authoritative = authoritativeEvidenceFrom(original)
    expect(compareAuthoritativeLiveEvidence(forged, authoritative)).toEqual({
      kind: 'refused',
      code: 'live_vercel_control_plane_mismatch',
    })
  })

  it('refuses an authoritative raw Convex observation that contradicts equal public projections', () => {
    const packet = completePacket()
    const authoritative = authoritativeEvidenceFrom(packet)
    authoritative.convex.observation.invocations[0]!.currentTruth.payment = 'prepared'
    refreshRawObservation(authoritative.convex.observation)

    expect(compareAuthoritativeLiveEvidence(packet, authoritative)).toEqual({
      kind: 'refused',
      code: 'live_convex_observation_mismatch',
    })
  })

  it('refuses checksum-valid metadata, attempt, residue, instrument, and command-id forgery', () => {
    const forgedProviderRevision = mutateContent((content) => {
      content.providers[0]!.operationRevision = 'forged'
    })
    expect(verifyPacketIntegrity(forgedProviderRevision)).toEqual({
      kind: 'refused',
      code: 'internal_observation_mismatch',
    })

    const forgedAttempt = mutateContent((content) => {
      content.sourceObservation.invocations[0]!.attempts[0]!.outcome = 'forged'
      refreshObservationDigests(content)
    })
    expect(verifyPacketIntegrity(forgedAttempt)).toEqual({
      kind: 'refused',
      code: 'effect_count_mismatch',
    })

    const forgedResidue = mutateContent((content) => {
      content.residualRecords.expectedRecordClasses.pop()
    })
    expect(verifyPacketIntegrity(forgedResidue)).toEqual({
      kind: 'refused',
      code: 'packet_schema_invalid',
    })

    const forgedInstrument = mutateContent((content) => {
      content.comprehension.automated.instrumentDigest = DIGEST('f')
    })
    expect(verifyPacketIntegrity(forgedInstrument)).toEqual({
      kind: 'refused',
      code: 'packet_schema_invalid',
    })

    const forgedReconciliationCommand = mutateContent((content) => {
      const transition = content.scenarios[2]!.transitions[4]!
      if (!('reconciliationInput' in transition)) {
        throw new Error('test_reconciliation_input_missing')
      }
      transition.reconciliationInput.commandId = 'command:goblin:forged'
    })
    expect(verifyPacketIntegrity(forgedReconciliationCommand)).toEqual({
      kind: 'refused',
      code: 'transition_invariant_mismatch',
    })
  })

  it('refuses secret-shaped material hidden under an otherwise schema-valid semantic key', () => {
    const packet = mutateContent((content) => {
      for (const projection of Object.values(content.scenarios[0]!.projections)) {
        ;(projection.semantics as unknown as Record<string, unknown>).diagnostics = {
          vercelApiToken: 'opaque-control-plane-token',
        }
        projection.semanticDigest = canonicalProofDigest(projection.semantics)
      }
    })
    expect(verifyPacketIntegrity(packet)).toEqual({
      kind: 'refused',
      code: 'raw_material_forbidden',
    })
  })

  it('keeps the hosted smoke inert, exact-bound, three-operation-only, and ambiguity-safe', () => {
    const path = 'tests/deploy-smoke/paid-operation-hosted-sandbox-smoke.spec.ts'
    expect(existsSync(path)).toBe(true)
    const source = readFileSync(path, 'utf8')
    const binding = source.indexOf('await assertServedRevisionBeforeFirstLifecyclePost')
    const firstCreate = source.indexOf('await createPaidOperation')

    expect(source).toContain("test.skip(liveConfig === undefined")
    expect(source).toContain("'/actions/paid/new'")
    expect(source).toContain('`/actions/paid/${encodeURIComponent(invocationRef)}`')
    expect(binding).toBeGreaterThan(-1)
    expect(binding).toBeLessThan(firstCreate)
    expect(source).toContain('base_url_alias_mismatch')
    expect(source.match(/await createPaidOperation\(/gu)).toHaveLength(3)
    expect(source).toContain('assertVersionTwoPaymentPrepared')
    expect(source).toContain('assertSeparatePaymentSettlementAndResultTruth')
    expect(source).toContain('await restoreInNewAuthenticatedContext')
    expect(source).toContain('command: \'reconcile\'')
    expect(source).toContain('collectAndAdmitLivePaidOperationHostedEvidence')
    expect(source).not.toMatch(/retry|switch_provider|reconciliationEvidence/iu)
    expect(source).not.toContain('authenticated_exact_revision_hosted_sandbox')
  })

  it('keeps source, packet-integrity, and live-smoke commands distinct and fail closed', () => {
    const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as {
      scripts: Record<string, string>
    }
    expect(packageJson.scripts).toMatchObject({
      'verify:paid-operation:hosted-source-local':
        'vitest run tests/unit/action-invocation/convex-handler-contract.test.ts tests/unit/release/customer-request-production-credential.test.ts tests/unit/release/paid-operation-hosted-release.test.ts tests/imports/paid-operation-trial-residue.test.ts',
      'verify:paid-operation:hosted-packet-integrity':
        'tsx tools/release/verify-paid-operation-hosted-release.ts --verify-packet-integrity',
      'smoke:paid-operation:hosted-sandbox':
        'AE_PAID_OPERATION_REQUIRE_LIVE=1 playwright test --config=playwright.deploy-smoke.config.ts tests/deploy-smoke/paid-operation-hosted-sandbox-smoke.spec.ts',
    })

    const verifier = readFileSync(
      'tools/release/verify-paid-operation-hosted-release.ts',
      'utf8',
    )
    expect(verifier).toContain('AE_PAID_OPERATION_HOSTED_PACKET_JSON is required')
    expect(readFileSync(
      'tests/deploy-smoke/paid-operation-hosted-sandbox-smoke.spec.ts',
      'utf8',
    )).toContain("process.env.AE_PAID_OPERATION_REQUIRE_LIVE !== '1'")
  })
})

function completePacket() {
  return collectPaidOperationHostedProofPacket(contentFixture())
}

function mutateContent(change: (content: ReturnType<typeof contentFixture>) => void) {
  const content = contentFixture()
  change(content)
  return collectPaidOperationHostedProofPacket(content)
}

function contentFixture() {
  const humanPrincipalDigest = DIGEST('1')
  const humanCallerDigest = DIGEST('2')
  const agentPrincipalDigest = humanPrincipalDigest
  const agentCallerDigest = DIGEST('4')
  const scenarios = [
    scenarioFixture('shared_human_agent_provider_a_golden', 'invocation:shared-a', 'provider:a', 5),
    scenarioFixture('agent_provider_a_golden', 'invocation:agent-a', 'provider:a', 5),
    scenarioFixture('provider_b_response_lost_uncertainty_goblin', 'invocation:goblin-b', 'provider:b', 6),
  ]
  const sourceObservation = rawObservationFixture(scenarios)
  return {
    schema: 'agentic-paid-operation-hosted-proof:v1',
    collectedAs: 'hosted_candidate',
    source: {
      expectedRevision: SOURCE_REVISION,
      expectedTree: SOURCE_TREE,
      observedRevision: SOURCE_REVISION,
      observedTree: SOURCE_TREE,
      clean: true,
    },
    deployment: {
      provider: 'vercel',
      id: 'dpl_exact',
      url: 'ae-exact.vercel.app',
      productionUrl: 'agentic-economy.ai',
      gitSha: SOURCE_REVISION,
      gitRef: 'codex/phase3c-execution',
      repository: 'renoz/agentic-economy',
      readyState: 'READY',
      target: 'production',
    },
    convex: {
      deploymentIdentity: 'https://exact.convex.cloud',
      sourceRevision: SOURCE_REVISION,
    },
    actors: {
      human: {
        callerClass: 'authenticated_human_session',
        principalDigest: humanPrincipalDigest,
        callerDigest: humanCallerDigest,
      },
      agent: {
        callerClass: 'authenticated_agent_api_key',
        principalDigest: agentPrincipalDigest,
        callerDigest: agentCallerDigest,
        requiredScopes: ['paid_operation:invoke'],
      },
    },
    providers: [
      {
        providerKey: 'A',
        providerId: 'provider:a',
        operationKey: 'btc-usd-a',
        operationRevision: '1',
        evidenceClass: 'labelled_mock',
      },
      {
        providerKey: 'B',
        providerId: 'provider:b',
        operationKey: 'btc-usd-b',
        operationRevision: '1',
        evidenceClass: 'labelled_mock',
      },
    ],
    scenarioOrder: scenarios.map((scenario) => scenario.scenario),
    scenarios,
    sourceObservation,
    comprehension: {
      human: {
        status: 'NOT_RUN',
        evidenceClass: 'declared_human_comprehension_session',
      },
      automated: {
        status: 'PASS',
        evidenceClass: 'automated_model_comprehension_adjunct',
        instrumentDigest:
          'sha256:526b009ddbf476758a06abf5768fe8459a1a5c29411c98ebfd5d131084452719',
      },
    },
    residualRecords: {
      posture: 'retain_until_review_then_retire',
      reviewDate: '2026-08-21',
      killSwitchOwnerDigest: DIGEST('6'),
      expectedRecordClasses: [
        'policy',
        'counter',
        'reservation',
        'aggregate',
        'command',
        'attempt',
        'mock_effect',
      ],
    },
    claimCeiling: 'pending_live_evidence_admission',
  }
}

function scenarioFixture(
  scenario: string,
  invocationRef: string,
  providerId: 'provider:a' | 'provider:b',
  finalVersion: 5 | 6,
) {
  const semantics = semanticsFixture(invocationRef, providerId, finalVersion)
  const projection = () => ({
    schema: 'agentic-paid-operation:v1',
    semantics: structuredClone(semantics),
    semanticDigest: canonicalProofDigest(semantics),
    observedVersion: finalVersion,
    evidenceClass: 'hosted_labelled_mock_candidate',
  })
  const command = (character: string) => DIGEST(character)
  const transitions = providerId === 'provider:a'
    ? [
        transition('created', 1, command('a'), 0, 0, 0, 'active', ['authorize']),
        transition('authorized', 2, command('b'), 0, 0, 0, 'active', ['execute']),
        transition('release_started', 4, command('c'), 1, 0, 1, 'active', []),
        transition('completed', 5, command('d'), 1, 1, 1, 'released', ['inspect']),
      ]
    : [
        transition('created', 1, command('e'), 0, 0, 0, 'active', ['authorize']),
        transition('authorized', 2, command('f'), 0, 0, 0, 'active', ['execute']),
        transition('release_started', 4, command('7'), 1, 0, 1, 'active', []),
        transition('response_lost', 5, command('8'), 1, 1, 1, 'active', ['reconcile']),
        {
          ...transition('reconciled', 6, command('9'), 1, 1, 1, 'released', ['inspect']),
          reconciliationInput: {
            command: 'reconcile',
            commandId: 'command:goblin:reconcile',
            expectedInvocationVersion: 5,
          },
        },
      ]
  return {
    scenario,
    actorClass: scenario === 'shared_human_agent_provider_a_golden'
      ? 'shared_human_agent'
      : scenario === 'agent_provider_a_golden'
        ? 'agent'
        : 'agent_goblin',
    invocationRef,
    providerId,
    operationKey: providerId === 'provider:a' ? 'btc-usd-a' : 'btc-usd-b',
    operationRevision: '1',
    transitions,
    projections: {
      humanWarm: projection(),
      humanCold: projection(),
      agentWarm: projection(),
      agentCold: projection(),
    },
  }
}

function semanticsFixture(
  invocationRef: string,
  providerId: 'provider:a' | 'provider:b',
  expectedInvocationVersion: 5 | 6,
) {
  const golden = providerId === 'provider:a'
  return {
    schema: 'agentic-paid-operation:v1',
    identity: { invocationRef, expectedInvocationVersion },
    operation: {
      providerId,
      operationKey: golden ? 'btc-usd-a' : 'btc-usd-b',
      operationRevision: '1',
    },
    environment: {
      name: 'hosted-labelled-mock-sandbox-candidate',
      evidenceClass: 'hosted_labelled_mock_candidate',
      claimCeiling: 'pending_authenticated_exact_revision_readback',
    },
    queryRelease: { state: 'released' },
    paymentAuthorization: { state: 'created' },
    paymentSubmission: { state: 'observed' },
    settlement: { state: 'settled' },
    resultDelivery: { state: golden ? 'valid' : 'not_delivered' },
    continuations: [{ kind: 'inspect' }],
  }
}

function transition(
  stage: string,
  invocationVersion: number,
  commandIdentityDigest: string,
  attemptCount: number,
  effectCount: number,
  effectGenerationCount: number,
  reservationState: 'active' | 'released',
  continuations: string[],
) {
  return {
    stage,
    invocationVersion,
    commandIdentityDigest,
    attemptCount,
    effectCount,
    effectGenerationCount,
    reservationState,
    continuations,
  }
}

function rawObservationFixture(
  scenarios: ReturnType<typeof scenarioFixture>[],
) {
  const invocations = scenarios.map((scenario, index) => {
    const final = scenario.transitions.at(-1)!
    const effect = {
      observationDigest: DIGEST(String(index + 7)),
      attemptIdentityDigest: DIGEST(String(index + 1)),
      effectGeneration: 1,
      providerId: scenario.providerId,
      operationKey: scenario.operationKey,
      operationRevision: scenario.operationRevision,
      effect: 'released',
      payment: 'settled',
      delivery: scenario.providerId === 'provider:a' ? 'returned' : 'response_lost',
    }
    const invocation = {
      invocationRef: scenario.invocationRef,
      ownerPrincipalDigest: DIGEST('1'),
      ownerCallerDigest: index === 0 ? DIGEST('2') : DIGEST('4'),
      invocationVersion: final.invocationVersion,
      providerId: scenario.providerId,
      operationKey: scenario.operationKey,
      operationRevision: scenario.operationRevision,
      environment: {
        name: 'hosted-labelled-mock-sandbox-candidate',
        evidenceClass: 'hosted_labelled_mock_candidate',
        claimCeiling: 'pending_authenticated_exact_revision_readback',
      },
      currentTruth: {
        control: 'terminal',
        payment: 'settled',
        delivery: scenario.providerId === 'provider:a' ? 'valid' : 'not_delivered',
        observedResolution: scenario.providerId === 'provider:a' ? 'returned' : 'pending',
      },
      reservation: { state: 'released', reservationDigest: DIGEST(String(index + 4)) },
      counts: {
        commands: scenario.providerId === 'provider:a' ? 4 : 5,
        attempts: 1,
        effects: 1,
        evidenceReferences: scenario.providerId === 'provider:a' ? 1 : 2,
        effectGenerations: 1,
      },
      commands: scenario.transitions.map((item) => ({
        commandIdentityDigest: item.commandIdentityDigest,
        commandIdDigest: canonicalProofDigest({
          kind: 'command-id',
          value: ('reconciliationInput' in item
            ? item.reconciliationInput.commandId
            : undefined)
            ?? `command:${scenario.invocationRef}:${item.stage}`,
        }),
        invocationVersion: item.invocationVersion,
        ...(item.effectGenerationCount === 0 ? {} : { effectGeneration: 1 }),
        principalDigest: DIGEST('1'),
        callerDigest: index === 0 ? DIGEST('2') : DIGEST('4'),
      })),
      attempts: [{
        attemptIdentityDigest: DIGEST(String(index + 1)),
        attemptNumber: 1,
        effectGeneration: 1,
        actorPrincipalDigest: DIGEST('1'),
        actorCallerDigest: index === 0 ? DIGEST('2') : DIGEST('4'),
        release: 'released',
        outcome: scenario.providerId === 'provider:a' ? 'returned' : 'reconciled_released',
      }],
      effects: [effect],
    }
    return {
      ...invocation,
      observationDigest: canonicalProofDigest(invocation),
    }
  })
  const observation = {
    schema: 'phase3c-paid-operation-proof-observation:v1',
    policy: {
      policyRef: 'phase-3c-hosted-paid-operation-trial',
      enabled: true,
      policyDigest: DIGEST('a'),
      sourceRevision: SOURCE_REVISION,
      principalDigest: DIGEST('1'),
      bounds: { total: 3, concurrency: 1, rate: 3 },
      admissionEndsAt: '2026-07-22T00:00:00.000Z',
      retainThrough: '2026-08-21T00:00:00.000Z',
      killSwitchOwnerDigest: DIGEST('6'),
    },
    counters: { admittedTotal: 3, activeReservations: 0, admittedInWindow: 3 },
    invocations,
  }
  return {
    kind: 'observed',
    ...observation,
    observationDigest: canonicalProofDigest(observation),
  }
}

function refreshObservationDigests(content: ReturnType<typeof contentFixture>) {
  refreshRawObservation(content.sourceObservation)
}

function refreshRawObservation(
  observation: ReturnType<typeof rawObservationFixture>,
) {
  for (const invocation of observation.invocations) {
    const { observationDigest: _oldDigest, ...unsigned } = invocation
    invocation.observationDigest = canonicalProofDigest(unsigned)
  }
  const { kind: _kind, observationDigest: _oldDigest, ...unsigned } = observation
  observation.observationDigest = canonicalProofDigest(unsigned)
}

function authoritativeEvidenceFrom(packet: ReturnType<typeof completePacket>) {
  return {
    source: structuredClone(packet.source),
    vercel: structuredClone(packet.deployment),
    convex: {
      deploymentIdentity: packet.convex.deploymentIdentity,
      sourceRevision: packet.convex.sourceRevision,
      observation: structuredClone(packet.sourceObservation),
    },
    human: {
      actor: structuredClone(packet.actors.human),
      projections: packet.scenarios.map((scenario) => ({
        invocationRef: scenario.invocationRef,
        warm: structuredClone(scenario.projections.humanWarm),
        cold: structuredClone(scenario.projections.humanCold),
      })),
    },
    agent: {
      actor: structuredClone(packet.actors.agent),
      projections: packet.scenarios.map((scenario) => ({
        invocationRef: scenario.invocationRef,
        warm: structuredClone(scenario.projections.agentWarm),
        cold: structuredClone(scenario.projections.agentCold),
      })),
    },
  }
}

function rechecksum(packet: Record<string, unknown>) {
  const copy = structuredClone(packet)
  delete copy.checksum
  return {
    ...copy,
    checksum: { algorithm: 'sha256', digest: canonicalProofDigest(copy) },
  }
}
