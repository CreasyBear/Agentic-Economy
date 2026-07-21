import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import {
  canonicalProofDigest,
  collectGitHubDeployment,
  collectAndAdmitLivePaidOperationHostedEvidence,
  collectPaidOperationHostedProofPacket,
  collectRawConvexObservation,
  compareAuthoritativeLiveEvidence,
  observeStableCleanGit,
  proofReferenceDigest,
  verifyPacketIntegrity,
  type PaidOperationHostedJourneyObservation,
} from '../../../tools/release/verify-paid-operation-hosted-release'

const SOURCE_REVISION = '5d5c76db4b3470949ffb2db9b606692bb7217e9d'
const SOURCE_TREE = 'bf3769890c9940ae259fab9777fdca8b25f686d7'
const DIGEST = (character: string) => `sha256:${character.repeat(64)}`
const INVOCATION_REFS = [
  'invocation:shared-a',
  'invocation:agent-a',
  'invocation:goblin-b',
] as const
const COHORT_DIGEST = canonicalProofDigest({
  schema: 'phase3c-paid-operation-proof-cohort:v1',
  invocationRefs: INVOCATION_REFS,
})

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

  it('accepts a complete proof when the three admissions cross an hourly window', () => {
    for (const admittedInWindow of [1, 2, 3]) {
      const packet = mutateContent((content) => {
        content.sourceObservation.counters.admittedInWindow = admittedInWindow
        refreshObservationDigests(content)
      })

      expect(verifyPacketIntegrity(packet)).toEqual({
        kind: 'packet_integrity_verified',
        evidenceClass: 'local_packet_integrity_only',
        packetDigest: packet.checksum.digest,
      })
    }
  })

  it('refuses a current hourly window outside the configured positive rate bound', () => {
    const packets = [
      mutateContent((content) => {
        content.sourceObservation.counters.admittedInWindow = 0
        refreshObservationDigests(content)
      }),
      mutateContent((content) => {
        content.sourceObservation.counters.admittedInWindow
          = content.sourceObservation.policy.bounds.rate + 1
        refreshObservationDigests(content)
      }),
    ]

    for (const packet of packets) {
      expect(verifyPacketIntegrity(packet)).toEqual({
        kind: 'refused',
        code: 'internal_observation_mismatch',
      })
    }
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

  it('does not admit a checksum-valid packet without live collection context', () => {
    expect(compareAuthoritativeLiveEvidence(
      completePacket(),
      undefined,
    )).toEqual({
      kind: 'refused',
      code: 'live_collection_failed',
    })
  })

  it('refuses missing or divergent trusted v1/v2 journey checkpoints', () => {
    const missing = contentFixture() as unknown as {
      scenarios: Array<{ checkpoints: unknown[] }>
    }
    missing.scenarios[0]!.checkpoints.pop()
    expect(verifyPacketIntegrity(
      collectPaidOperationHostedProofPacket(missing),
    )).toEqual({ kind: 'refused', code: 'packet_schema_invalid' })

    const divergent = mutateContent((content) => {
      content.scenarios[1]!.checkpoints[0]!.human.decisionLabel = 'Payment prepared'
    })
    expect(verifyPacketIntegrity(divergent)).toEqual({
      kind: 'refused',
      code: 'journey_checkpoint_mismatch',
    })

    const paymentNotCreated = mutateContent((content) => {
      const prepared = content.scenarios[2]!.checkpoints[1]!.agent
      prepared.semantics.paymentAuthorization = { state: 'not_created' }
      prepared.semanticDigest = canonicalProofDigest(prepared.semantics)
      content.scenarios[2]!.checkpoints[1]!.human.semanticDigest =
        prepared.semanticDigest
    })
    expect(verifyPacketIntegrity(paymentNotCreated)).toEqual({
      kind: 'refused',
      code: 'journey_checkpoint_mismatch',
    })
  })

  it('refuses missing or wrong exact-SHA GitHub deployment receipts', () => {
    const wrongRun = mutateContent((content) => {
      content.githubDeployment.runId = '654321'
    })
    expect(verifyPacketIntegrity(wrongRun)).toEqual({
      kind: 'refused',
      code: 'convex_identity_mismatch',
    })

    const wrongDeployment = mutateContent((content) => {
      content.sourceObservation.deployment.current.name = 'other-prod'
      refreshObservationDigests(content)
    })
    expect(verifyPacketIntegrity(wrongDeployment)).toEqual({
      kind: 'refused',
      code: 'convex_identity_mismatch',
    })

    const failedRun = contentFixture() as unknown as {
      githubDeployment: { conclusion: string }
    }
    failedRun.githubDeployment.conclusion = 'failure'
    expect(verifyPacketIntegrity(
      collectPaidOperationHostedProofPacket(failedRun),
    )).toEqual({ kind: 'refused', code: 'packet_schema_invalid' })
  })

  it('captures Git HEAD/tree/status atomically and refuses torn observation', async () => {
    const outputs = [SOURCE_REVISION, SOURCE_TREE, '', SOURCE_REVISION, '']
    const exec = async () => outputs.shift() ?? ''
    await expect(observeStableCleanGit(
      { expectedRevision: SOURCE_REVISION, expectedTree: SOURCE_TREE },
      process.cwd(),
      exec,
    )).resolves.toMatchObject({
      observedRevision: SOURCE_REVISION,
      observedTree: SOURCE_TREE,
      clean: true,
    })

    const tornOutputs = [SOURCE_REVISION, SOURCE_TREE, '', 'f'.repeat(40), '']
    await expect(observeStableCleanGit(
      { expectedRevision: SOURCE_REVISION, expectedTree: SOURCE_TREE },
      process.cwd(),
      async () => tornOutputs.shift() ?? '',
    )).rejects.toThrow('live_source_torn')
  })

  it('uses configured authenticated Convex CLI binding without an admin key', async () => {
    let captured: Readonly<{
      file: string
      args: readonly string[]
      env?: NodeJS.ProcessEnv
    }> | undefined
    const observation = await collectRawConvexObservation(
      INVOCATION_REFS,
      {
        repositoryRoot: process.cwd(),
        convex: { configuredDeployment: 'prod:exact' },
      },
      async (file, args, options) => {
        captured = {
          file,
          args,
          ...(options.env === undefined ? {} : { env: options.env }),
        }
        return JSON.stringify(contentFixture().sourceObservation)
      },
    )

    expect(observation.cohort.cohortDigest).toBe(COHORT_DIGEST)
    expect(captured?.file).toBe('npx')
    expect(captured?.args.slice(0, 2)).toEqual(['convex', 'run'])
    expect(captured?.args).toContain(
      'hostedPaidOperation:phase3CHostedProofObservation',
    )
    expect(captured?.args).toContain('--prod')
    expect(captured?.args.join(' ')).not.toMatch(/--url|--admin-key/iu)
    expect(captured?.env?.CONVEX_DEPLOYMENT).toBe('prod:exact')
    expect(captured?.env).not.toHaveProperty('CONVEX_DEPLOY_KEY')
    expect(captured?.env).not.toHaveProperty('CONVEX_DEPLOYMENT_TOKEN')
  })

  it('cross-checks public GitHub run, job, and receipt-step metadata', async () => {
    const values = githubApiValues()
    const result = await collectGitHubDeployment(
      liveTargetFixture(),
      (async () => Response.json(values.shift())) as typeof fetch,
    )
    expect(result).toMatchObject({
      repository: 'CreasyBear/Agentic-Economy',
      ref: 'main',
      headSha: SOURCE_REVISION,
      job: { name: 'Phase 3C exact-revision Convex deployment' },
      step: { name: 'Record Phase 3C Convex deployment receipt' },
    })

    const failedValues = githubApiValues()
    const jobs = failedValues[1] as { jobs: Array<{ conclusion: string }> }
    jobs.jobs[0]!.conclusion = 'failure'
    await expect(collectGitHubDeployment(
      liveTargetFixture(),
      (async () => Response.json(failedValues.shift())) as typeof fetch,
    )).rejects.toThrow('live_github_deployment_mismatch')
  })

  it('has one live final-class emitter and no terminal-packet admission bypass', () => {
    const facade = readFileSync(
      'tools/release/verify-paid-operation-hosted-release.ts',
      'utf8',
    )
    const collector = readFileSync(
      'tools/release/paid-operation-hosted-live-collector.ts',
      'utf8',
    )
    expect(facade).not.toContain('admitLivePaidOperationHostedEvidence')
    expect(facade).not.toContain('PAID_OPERATION_HOSTED_EVIDENCE_CLASS')
    expect(collector).not.toContain('admitLivePaidOperationHostedEvidence')
    expect(collector.match(
      /evidenceClass: PAID_OPERATION_HOSTED_EVIDENCE_CLASS/gu,
    )).toHaveLength(1)
    expect(collector).toContain('runJourney: runPaidOperationHostedJourney')
    expect(collector).toContain('credentialResult.revocation.sessionId')
  })

  it('keeps an injected full live path local and queries raw state only after revocation', async () => {
    const events: string[] = []
    const fetch = fakeLiveCollectionFetch(events)
    const exec = async (file: string, args: readonly string[]) => {
      if (file === 'git') {
        if (args[0] === 'rev-parse' && args[1] === 'HEAD') return SOURCE_REVISION
        if (args[0] === 'rev-parse') return SOURCE_TREE
        if (args[0] === 'status') return ''
      }
      if (file === 'npx') {
        events.push('convex_observation')
        return JSON.stringify(contentFixture().sourceObservation)
      }
      throw new Error(`unexpected_exec:${file}:${args.join(':')}`)
    }
    const result = await collectAndAdmitLivePaidOperationHostedEvidence(
      liveTargetFixture(),
      {
        repositoryRoot: process.cwd(),
        baseUrl: 'https://agentic-economy.ai',
        browser: { newContext: async () => undefined } as never,
        vercel: {
          apiToken: 'vercel-test-token',
          deploymentId: 'dpl_exact',
        },
        clerk: {
          secretKey: 'clerk-test-secret',
          instanceId: 'ins_exact',
          subject: 'user_phase3c',
          primaryEmail: 'joel@agentic-economy.ai',
        },
        convex: { configuredDeployment: 'prod:exact' },
      },
      {
        fetch,
        exec,
        runJourney: async () => journeyObservationFixture(),
      },
    )

    expect(result, JSON.stringify({ result, events })).toMatchObject({
      kind: 'local_live_path_verified',
      evidenceClass: 'local_live_collector_fixture_only',
    })
    expect(JSON.stringify(result)).not.toContain(
      'authenticated_exact_revision_hosted_sandbox',
    )
    expect(events.indexOf('key_revoked')).toBeLessThan(
      events.indexOf('convex_observation'),
    )
    expect(events.indexOf('session_revoked')).toBeLessThan(
      events.indexOf('convex_observation'),
    )
    expect(events).toContain('key_revocation_readback')
    expect(events).toContain('session_revocation_readback')
  })

  it.each([
    {
      drift: 'clean-to-dirty checkout drift',
      finalHead: SOURCE_REVISION,
      finalTree: SOURCE_TREE,
      finalStatus: ' M tools/release/paid-operation-hosted-live-collector.ts',
    },
    {
      drift: 'HEAD and tree drift',
      finalHead: 'f'.repeat(40),
      finalTree: 'e'.repeat(40),
      finalStatus: '',
    },
  ])('refuses $drift after raw observation without emitting a success class', async ({
    finalHead,
    finalTree,
    finalStatus,
  }) => {
    const events: string[] = []
    let gitCalls = 0
    const result = await collectAndAdmitLivePaidOperationHostedEvidence(
      liveTargetFixture(),
      liveContextFixture(),
      {
        fetch: fakeLiveCollectionFetch(events),
        exec: async (file, args) => {
          if (file === 'git') {
            gitCalls += 1
            const finalObservation = gitCalls > 5
            if (gitCalls === 6) events.push('admission_git_observation')
            if (args[0] === 'rev-parse' && args[1] === 'HEAD') {
              return finalObservation ? finalHead : SOURCE_REVISION
            }
            if (args[0] === 'rev-parse') {
              return finalObservation ? finalTree : SOURCE_TREE
            }
            if (args[0] === 'status') {
              return finalObservation ? finalStatus : ''
            }
          }
          if (file === 'npx') {
            events.push('convex_observation')
            return JSON.stringify(contentFixture().sourceObservation)
          }
          throw new Error(`unexpected_exec:${file}:${args.join(':')}`)
        },
        runJourney: async () => journeyObservationFixture(),
      },
    )

    expect(result).toEqual({ kind: 'refused', code: 'live_source_mismatch' })
    expect(JSON.stringify(result)).not.toContain('local_live_path_verified')
    expect(JSON.stringify(result)).not.toContain(
      'authenticated_exact_revision_hosted_sandbox',
    )
    expect(gitCalls).toBe(10)
    expect(events.indexOf('convex_observation')).toBeLessThan(
      events.indexOf('admission_git_observation'),
    )
  })

  it('revokes both temporary credentials and skips raw observation when the journey fails', async () => {
    const events: string[] = []
    const result = await collectAndAdmitLivePaidOperationHostedEvidence(
      liveTargetFixture(),
      liveContextFixture(),
      {
        fetch: fakeLiveCollectionFetch(events),
        exec: async (file, args) => {
          if (file === 'git') {
            if (args[0] === 'rev-parse' && args[1] === 'HEAD') {
              return SOURCE_REVISION
            }
            if (args[0] === 'rev-parse') return SOURCE_TREE
            if (args[0] === 'status') return ''
          }
          events.push('unexpected_raw_observation')
          throw new Error('raw_observation_must_not_run')
        },
        runJourney: async () => {
          throw new Error('journey_failed')
        },
      },
    )

    expect(result).toEqual({ kind: 'refused', code: 'live_collection_failed' })
    expect(events).toContain('key_revoked')
    expect(events).toContain('key_revocation_readback')
    expect(events).toContain('session_revoked')
    expect(events).toContain('session_revocation_readback')
    expect(events).not.toContain('unexpected_raw_observation')
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

    const forgedGithub = mutateContent((content) => {
      content.githubDeployment.runId = '999999'
      const receipt = content.sourceObservation.deployment.receipt
      receipt.githubRunId = '999999'
      const { receiptDigest: _oldDigest, ...unsignedReceipt } = receipt
      receipt.receiptDigest = canonicalProofDigest(unsignedReceipt)
      content.convex.deploymentReceiptDigest = receipt.receiptDigest
      refreshObservationDigests(content)
    })
    expect(verifyPacketIntegrity(forgedGithub).kind)
      .toBe('packet_integrity_verified')
    expect(compareAuthoritativeLiveEvidence(forgedGithub, authoritative)).toEqual({
      kind: 'refused',
      code: 'live_github_deployment_mismatch',
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
    const journey = readFileSync(
      'tools/release/paid-operation-hosted-journey.ts',
      'utf8',
    )
    const binding = journey.indexOf(
      'assertServedDeploymentBindingBeforeFirstLifecyclePost',
    )
    const firstPost = journey.indexOf('Create sandbox operation')
    const golden = journey.slice(
      journey.indexOf('async function runGoldenScenario'),
      journey.indexOf('async function runGoblinScenario'),
    )
    const goblin = journey.slice(
      journey.indexOf('async function runGoblinScenario'),
      journey.indexOf('async function captureCheckpoint'),
    )

    expect(source).toContain("test.skip(liveConfig === undefined")
    expect(source).toContain("trace: 'off'")
    expect(source).toContain("video: 'off'")
    expect(source).toContain("screenshot: 'off'")
    expect(source).not.toMatch(/API_KEY|SESSION_TOKEN|CONVEX_ADMIN_KEY/gu)
    expect(journey).toContain("'/actions/paid/new'")
    expect(journey).toContain('`/actions/paid/${encodeURIComponent(invocationRef)}`')
    expect(binding).toBeGreaterThan(-1)
    expect(binding).toBeLessThan(firstPost)
    expect(golden.indexOf('captureCheckpoint')).toBeLessThan(
      golden.indexOf('await input.authorize()'),
    )
    expect(golden.lastIndexOf('captureCheckpoint')).toBeLessThan(
      golden.indexOf('await input.execute()'),
    )
    expect(goblin.indexOf('captureCheckpoint')).toBeLessThan(
      goblin.indexOf("command: 'authorize'"),
    )
    expect(goblin.lastIndexOf('captureCheckpoint')).toBeLessThan(
      goblin.indexOf("command: 'execute'"),
    )
    expect(journey).toContain("paymentAuthorization: 'created'")
    expect(journey).toContain("paymentSubmission: 'not_submitted'")
    expect(journey).toContain("settlement: 'no_evidence'")
    expect(journey).toContain('await restoreInNewAuthenticatedContext')
    expect(journey).toContain("command: 'reconcile'")
    expect(journey).not.toMatch(/retry|switch_provider|reconciliationEvidence/iu)
    expect(source).toContain('collectAndAdmitLivePaidOperationHostedEvidence')
    expect(source).not.toContain('authenticated_exact_revision_hosted_sandbox')
  })

  it('routes a Phase 3C marker push through one observed Vercel deployment and one Convex deploy', () => {
    const workflow = readFileSync('.github/workflows/kernel-release-gate.yml', 'utf8')
    const marker = '[phase3c-hosted-trial]'

    expect(workflow, '[P3C_RED:phase3c_marker_absent]').toContain(marker)
    for (const job of [
      '\n  source-proof:',
      '\n  hosted-proof:',
      '\n  phase3c-source-proof:',
      '\n  phase3c-production:',
    ]) {
      expect(workflow, `[P3C_RED:phase3c_job_absent] ${job.trim()}`).toContain(job)
    }

    const sourceStart = workflow.indexOf('\n  source-proof:')
    const legacyStart = workflow.indexOf('\n  hosted-proof:')
    const phase3CSourceStart = workflow.indexOf('\n  phase3c-source-proof:')
    const phase3CProductionStart = workflow.indexOf('\n  phase3c-production:')
    const sourceProof = workflow.slice(sourceStart, legacyStart)
    const legacyHosted = workflow.slice(legacyStart, phase3CSourceStart)
    const phase3CSource = workflow.slice(phase3CSourceStart, phase3CProductionStart)
    const phase3CProduction = workflow.slice(phase3CProductionStart)

    expect(sourceProof).toContain(
      "if: github.event_name != 'push' || !contains(github.event.head_commit.message, '[phase3c-hosted-trial]')",
    )
    expect(legacyHosted).toContain(
      "if: github.event_name == 'push' && github.ref == 'refs/heads/main' && !contains(github.event.head_commit.message, '[phase3c-hosted-trial]')",
    )
    expect(phase3CSource).toContain(
      "if: github.event_name == 'push' && github.ref == 'refs/heads/main' && contains(github.event.head_commit.message, '[phase3c-hosted-trial]')",
    )
    expect(
      phase3CSource,
      '[P3C_RED:phase3c_full_history_checkout_absent]',
    ).toMatch(
      /- uses: actions\/checkout@v6\n\s+with:\n\s+fetch-depth: 0/u,
    )
    expect(phase3CProduction).toContain(
      "if: github.event_name == 'push' && github.ref == 'refs/heads/main' && contains(github.event.head_commit.message, '[phase3c-hosted-trial]')",
    )
    expect(
      phase3CProduction,
      '[P3C_RED:phase3c_customer_request_evaluator_secret_absent]',
    ).toContain(
      'AE_CUSTOMER_REQUEST_CLERK_SUBJECT: ${{ secrets.AE_CUSTOMER_REQUEST_CLERK_SUBJECT }}',
    )
    expect(
      phase3CProduction,
      '[P3C_RED:phase3c_nonexistent_evaluator_secret_present]',
    ).not.toContain('secrets.AE_PAID_OPERATION_CLERK_SUBJECT')
    expect(phase3CProduction).not.toContain('AE_PAID_OPERATION_CLERK_SUBJECT')
    expect(phase3CProduction).toContain(
      '--arg evaluatorPrincipalRef "${AE_CUSTOMER_REQUEST_CLERK_SUBJECT}"',
    )

    expect(legacyHosted).toContain('needs: source-proof')
    expect(legacyHosted).toContain(
      'npm exec -- tsx tools/release/deploy-customer-request-git-source.ts',
    )
    expect(phase3CSource).toContain('npm run verify:phase3c:release-source')
    expect(phase3CSource).toContain('npm run build')
    expect(phase3CSource, '[P3C_RED:phase3c_build_isolation_absent]')
      .toContain('git archive "${AE_RELEASE_SOURCE_REVISION}"')
    expect(phase3CSource).toContain(
      'mktemp -d "${RUNNER_TEMP}/phase3c-build.XXXXXX"',
    )
    expect(phase3CSource).toContain(
      'ln -s "${GITHUB_WORKSPACE}/node_modules" "${build_scratch}/node_modules"',
    )
    expect(phase3CSource.indexOf('npm run build')).toBeLessThan(
      phase3CSource.indexOf('Refuse Phase 3C source or generated-file drift'),
    )
    expect(phase3CProduction).toContain('needs: phase3c-source-proof')
    expect(phase3CProduction).toContain(
      'name: Phase 3C exact-revision Convex deployment',
    )
    expect(phase3CProduction).toContain(
      'npm exec -- tsx tools/release/observe-vercel-git-source-deployment.ts',
    )
    expect(phase3CProduction.match(/npx convex deploy/gu)).toHaveLength(1)
    expect(
      phase3CProduction,
      '[P3C_RED:phase3c_convex_deploy_typecheck_boundary_absent]',
    ).toContain(
      'npx convex deploy --typecheck=disable --message "GitHub ${AE_RELEASE_SOURCE_REVISION}"',
    )
    expect(legacyHosted).not.toContain('convex deploy --typecheck=disable')
    expect(phase3CProduction.match(
      /npx convex run hostedPaidOperation:configurePhase3CAdmission/gu,
    )).toHaveLength(1)
    expect(phase3CProduction.match(
      /name: Record Phase 3C Convex deployment receipt/gu,
    )).toHaveLength(1)
    expect(phase3CProduction).toContain('--argjson totalLimit 3')
    expect(phase3CProduction).toContain('--argjson concurrencyLimit 1')
    expect(phase3CProduction).toContain('--argjson rateLimit 3')
    expect(phase3CProduction).toContain('4 * 60 * 60 * 1000')
    expect(phase3CProduction).toContain('2026-08-21T00:00:00.000Z')
    expect(phase3CProduction).toContain('Phase 3C release owner')
    expect(phase3CProduction).toContain(".kind == \"configured\"")
    expect(phase3CProduction).toContain(".policyDigest // \"\"")
    expect(phase3CProduction).toContain(".kind == \"recorded\"")
    expect(phase3CProduction).toContain(".deploymentName // \"\"")
    expect(phase3CProduction).not.toMatch(
      /deploy-customer-request-git-source|forceNew|vercel deploy|method:\s*['"]POST|curl/iu,
    )
    expect(phase3CProduction).not.toMatch(
      /CLERK_SECRET_KEY|temporary|test:release:hosted|hosted.*journey|smoke:/iu,
    )

    const observe = phase3CProduction.indexOf('Observe the exact Vercel Git deployment')
    const convexDeploy = phase3CProduction.indexOf('Deploy the exact Phase 3C Convex source')
    const configure = phase3CProduction.indexOf('Configure exact Phase 3C admission')
    const receipt = phase3CProduction.indexOf('Record Phase 3C Convex deployment receipt')
    expect(observe).toBeLessThan(convexDeploy)
    expect(convexDeploy).toBeLessThan(configure)
    expect(configure).toBeLessThan(receipt)
    expect(phase3CProduction.slice(receipt).match(/\n\s+- name:/gu) ?? [])
      .toHaveLength(0)
  })

  it('keeps source, packet-integrity, and live-smoke commands distinct and fail closed', () => {
    const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as {
      scripts: Record<string, string>
    }
    const phase3CReleaseSource =
      packageJson.scripts['verify:phase3c:release-source']
    for (const ownerTest of [
      'tests/unit/action-invocation/paid-operation-application-service.test.ts',
      'tests/unit/release/customer-request-production-credential.test.ts',
    ]) {
      expect(
        phase3CReleaseSource,
        `[P3C_RED:phase3c_release_owner_test_absent] ${ownerTest}`,
      ).toContain(ownerTest)
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
  const humanPrincipalDigest = proofReferenceDigest(
    COHORT_DIGEST,
    'principal',
    'user_phase3c',
  )
  const humanCallerDigest = proofReferenceDigest(
    COHORT_DIGEST,
    'caller',
    'session:human',
  )
  const agentPrincipalDigest = humanPrincipalDigest
  const agentCallerDigest = proofReferenceDigest(
    COHORT_DIGEST,
    'caller',
    'clerk_api_key:key:agent',
  )
  const scenarios = [
    scenarioFixture('shared_human_agent_provider_a_golden', INVOCATION_REFS[0], 'provider:a', 5),
    scenarioFixture('agent_provider_a_golden', INVOCATION_REFS[1], 'provider:a', 5),
    scenarioFixture('provider_b_response_lost_uncertainty_goblin', INVOCATION_REFS[2], 'provider:b', 6),
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
      gitRef: 'main',
      repository: 'CreasyBear/Agentic-Economy',
      readyState: 'READY',
      target: 'production',
    },
    githubDeployment: {
      repository: 'CreasyBear/Agentic-Economy',
      ref: 'main',
      workflowPath: '.github/workflows/kernel-release-gate.yml',
      runId: '123456',
      runAttempt: 1,
      headSha: SOURCE_REVISION,
      status: 'completed',
      conclusion: 'success',
      job: {
        name: 'Phase 3C exact-revision Convex deployment',
        status: 'completed',
        conclusion: 'success',
      },
      step: {
        name: 'Record Phase 3C Convex deployment receipt',
        status: 'completed',
        conclusion: 'success',
      },
    },
    convex: {
      queryMode: 'authenticated_cli_configured_project_prod',
      configuredDeployment: 'prod:exact',
      queryUrl: 'https://exact-prod.convex.cloud',
      deploymentName: 'exact-prod',
      sourceRevision: SOURCE_REVISION,
      sourceTree: SOURCE_TREE,
      deploymentReceiptDigest:
        sourceObservation.deployment.receipt.receiptDigest,
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
    credentials: {
      subjectPrincipalDigest: humanPrincipalDigest,
      humanSession: {
        callerDigest: humanCallerDigest,
        status: 'revoked',
      },
      agentKey: {
        callerDigest: agentCallerDigest,
        status: 'revoked',
        requiredScopes: ['paid_operation:invoke'],
        secondsUntilExpiration: 3_600,
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
      killSwitchOwnerDigest: sourceObservation.policy.killSwitchOwnerDigest,
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
  const command = (stage: string) => proofReferenceDigest(
    COHORT_DIGEST,
    'command',
    { invocationRef, stage },
  )
  const attemptIdentityDigest = proofReferenceDigest(
    COHORT_DIGEST,
    'attempt',
    `attempt:${invocationRef}`,
  )
  const effectObservationDigest = canonicalProofDigest({
    cohortDigest: COHORT_DIGEST,
    invocationRef,
    effectGeneration: 1,
  })
  const transitions = providerId === 'provider:a'
    ? [
        transition('created', 1, command('created'), null, null, null, ['authorize']),
        transition('authorized', 2, command('authorized'), null, null, null, ['execute']),
        transition('release_started', 4, command('release_started'), attemptIdentityDigest, null, 1, []),
        transition('completed', 5, command('completed'), attemptIdentityDigest, effectObservationDigest, 1, ['inspect']),
      ]
    : [
        transition('created', 1, command('created'), null, null, null, ['authorize']),
        transition('authorized', 2, command('authorized'), null, null, null, ['execute']),
        transition('release_started', 4, command('release_started'), attemptIdentityDigest, null, 1, []),
        transition('response_lost', 5, command('response_lost'), attemptIdentityDigest, effectObservationDigest, 1, ['reconcile']),
        {
          ...transition('reconciled', 6, command('reconciled'), attemptIdentityDigest, effectObservationDigest, 1, ['inspect']),
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
    checkpoints: [
      checkpointFixture(invocationRef, providerId, 1),
      checkpointFixture(invocationRef, providerId, 2),
    ],
    transitions,
    projections: {
      humanWarm: projection(),
      humanCold: projection(),
      agentWarm: projection(),
      agentCold: projection(),
    },
  }
}

function checkpointFixture(
  invocationRef: string,
  providerId: 'provider:a' | 'provider:b',
  observedVersion: 1 | 2,
) {
  const prepared = observedVersion === 2
  const semantics = {
    schema: 'agentic-paid-operation:v1',
    identity: { invocationRef, expectedInvocationVersion: observedVersion },
    operation: {
      providerId,
      operationKey: providerId === 'provider:a' ? 'btc-usd-a' : 'btc-usd-b',
      operationRevision: '1',
    },
    paymentAuthorization: { state: prepared ? 'created' : 'not_created' },
    paymentSubmission: { state: 'not_submitted' },
    settlement: { state: 'no_evidence' },
    resultDelivery: { state: 'not_delivered' },
    continuations: [{ kind: prepared ? 'execute' : 'authorize' }],
  }
  const semanticDigest = canonicalProofDigest(semantics)
  return {
    stage: prepared ? 'payment_prepared' : 'ready_for_permission',
    observedVersion,
    human: {
      semanticDigest,
      observedVersion,
      evidenceClass: 'hosted_labelled_mock_candidate',
      decisionLabel: prepared ? 'Payment prepared' : 'Ready for permission',
      paymentSubmissionLabel: 'Not submitted',
      settlementLabel: 'No settlement evidence',
      resultLabel: 'Not received',
      nextCommand: prepared ? 'execute' : 'authorize',
    },
    agent: {
      schema: 'agentic-paid-operation:v1',
      semantics,
      semanticDigest,
      observedVersion,
      evidenceClass: 'hosted_labelled_mock_candidate',
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
  attemptIdentityDigest: string | null,
  effectObservationDigest: string | null,
  effectGeneration: 1 | null,
  continuations: string[],
) {
  return {
    stage,
    invocationVersion,
    commandIdentityDigest,
    attemptIdentityDigest,
    effectObservationDigest,
    effectGeneration,
    continuations,
  }
}

function rawObservationFixture(
  scenarios: ReturnType<typeof scenarioFixture>[],
) {
  const principalDigest = proofReferenceDigest(
    COHORT_DIGEST,
    'principal',
    'user_phase3c',
  )
  const humanCallerDigest = proofReferenceDigest(
    COHORT_DIGEST,
    'caller',
    'session:human',
  )
  const agentCallerDigest = proofReferenceDigest(
    COHORT_DIGEST,
    'caller',
    'clerk_api_key:key:agent',
  )
  const invocations = scenarios.map((scenario, index) => {
    const final = scenario.transitions.at(-1)!
    const callerDigest = index === 0 ? humanCallerDigest : agentCallerDigest
    const paymentIdentifierDigest = proofReferenceDigest(
      COHORT_DIGEST,
      'payment-identifier',
      `payment:${scenario.invocationRef}`,
    )
    const effect = {
      observationDigest: final.effectObservationDigest!,
      attemptIdentityDigest: final.attemptIdentityDigest!,
      paymentIdentifierDigest,
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
      ownerPrincipalDigest: principalDigest,
      ownerCallerDigest: callerDigest,
      controlOwnerPrincipalDigest: principalDigest,
      controlOwnerCallerDigest: callerDigest,
      paymentIdentifierDigest,
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
      reservation: {
        state: 'released',
        reservationDigest: proofReferenceDigest(
          COHORT_DIGEST,
          'reservation',
          `reservation:${scenario.invocationRef}`,
        ),
      },
      counts: {
        headers: 1,
        sources: 1,
        payments: 1,
        reservations: 1,
        commands: scenario.providerId === 'provider:a' ? 4 : 5,
        attempts: 1,
        effects: 1,
        evidenceReferences: scenario.providerId === 'provider:a' ? 1 : 2,
        effectGenerations: 1,
      },
      commands: scenario.transitions.map((item) => {
        const commandId = ('reconciliationInput' in item
          ? item.reconciliationInput.commandId
          : undefined) ?? `command:${scenario.invocationRef}:${item.stage}`
        return {
          commandIdentityDigest: item.commandIdentityDigest,
          commandIdDigest: proofReferenceDigest(
            COHORT_DIGEST,
            'command-id',
            commandId,
          ),
          invocationVersion: item.invocationVersion,
          ...(item.effectGeneration === null ? {} : { effectGeneration: 1 }),
          principalDigest,
          callerDigest,
        }
      }),
      attempts: [{
        attemptIdentityDigest: final.attemptIdentityDigest!,
        attemptNumber: 1,
        effectGeneration: 1,
        actorPrincipalDigest: principalDigest,
        actorCallerDigest: callerDigest,
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
  const receiptWithoutDigest = {
    receiptRef: 'phase3c-paid-operation-exact-revision-deployment',
    sourceRevision: SOURCE_REVISION,
    sourceTree: SOURCE_TREE,
    githubRunId: '123456',
    githubRunAttempt: 1,
    githubRepository: 'CreasyBear/Agentic-Economy',
    githubRef: 'main',
    githubWorkflow: '.github/workflows/kernel-release-gate.yml',
    githubJob: 'Phase 3C exact-revision Convex deployment',
    githubStep: 'Record Phase 3C Convex deployment receipt',
    sourceClockTimestamp: '2026-07-21T00:00:00.000Z',
    deploymentName: 'exact-prod',
  }
  const observation = {
    schema: 'phase3c-paid-operation-proof-observation:v1',
    cohort: {
      cohortDigest: COHORT_DIGEST,
      headers: 3,
      reservations: 3,
    },
    deployment: {
      current: {
        name: 'exact-prod',
        region: 'aws-ap-southeast-2',
        class: 's16',
      },
      receipt: {
        ...receiptWithoutDigest,
        receiptDigest: canonicalProofDigest(receiptWithoutDigest),
      },
    },
    policy: {
      policyRef: 'phase-3c-hosted-paid-operation-trial',
      enabled: true,
      policyDigest: DIGEST('a'),
      sourceRevision: SOURCE_REVISION,
      principalDigest,
      bounds: { total: 3, concurrency: 1, rate: 3 },
      admissionEndsAt: '2026-07-22T00:00:00.000Z',
      retainThrough: '2026-08-21T00:00:00.000Z',
      killSwitchOwnerDigest: proofReferenceDigest(
        COHORT_DIGEST,
        'kill-switch-owner',
        'owner:phase3c',
      ),
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
    githubDeployment: structuredClone(packet.githubDeployment),
    convex: {
      ...structuredClone(packet.convex),
      observation: structuredClone(packet.sourceObservation),
    },
    actors: structuredClone(packet.actors),
    credentials: structuredClone(packet.credentials),
    scenarios: structuredClone(packet.scenarios),
  }
}

function journeyObservationFixture(): PaidOperationHostedJourneyObservation {
  const human = scenarioFixture(
    'shared_human_agent_provider_a_golden',
    INVOCATION_REFS[0],
    'provider:a',
    5,
  )
  const agent = scenarioFixture(
    'agent_provider_a_golden',
    INVOCATION_REFS[1],
    'provider:a',
    5,
  )
  const goblin = scenarioFixture(
    'provider_b_response_lost_uncertainty_goblin',
    INVOCATION_REFS[2],
    'provider:b',
    6,
  )
  return {
    scenarios: [
      {
        ...human,
        scenario: 'shared_human_agent_provider_a_golden',
        actorClass: 'shared_human_agent',
        observedStages: [
          { stage: 'created', invocationVersion: 1, continuations: ['authorize'] },
          { stage: 'authorized', invocationVersion: 2, continuations: ['execute'] },
          { stage: 'completed', invocationVersion: 5, continuations: ['inspect'] },
        ],
        commandIds: {
          authorize: 'command:human:authorize',
          execute: 'command:human:execute',
        },
      },
      {
        ...agent,
        scenario: 'agent_provider_a_golden',
        actorClass: 'agent',
        observedStages: [
          { stage: 'created', invocationVersion: 1, continuations: ['authorize'] },
          { stage: 'authorized', invocationVersion: 2, continuations: ['execute'] },
          { stage: 'completed', invocationVersion: 5, continuations: ['inspect'] },
        ],
        commandIds: {
          authorize: 'command:agent:authorize',
          execute: 'command:agent:execute',
        },
      },
      {
        ...goblin,
        scenario: 'provider_b_response_lost_uncertainty_goblin',
        actorClass: 'agent_goblin',
        observedStages: [
          { stage: 'created', invocationVersion: 1, continuations: ['authorize'] },
          { stage: 'authorized', invocationVersion: 2, continuations: ['execute'] },
          { stage: 'response_lost', invocationVersion: 5, continuations: ['reconcile'] },
          { stage: 'reconciled', invocationVersion: 6, continuations: ['inspect'] },
        ],
        commandIds: {
          authorize: 'command:goblin:authorize',
          execute: 'command:goblin:execute',
          reconcile: 'command:goblin:reconcile',
        },
      },
    ],
  } as unknown as PaidOperationHostedJourneyObservation
}

function fakeLiveCollectionFetch(events: string[]): typeof fetch {
  const jwt = [
    Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url'),
    Buffer.from(JSON.stringify({
      sub: 'user_phase3c',
      sid: 'session:human',
    })).toString('base64url'),
    'fixture',
  ].join('.')
  return (async (input, init) => {
    const url = new URL(
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url,
    )
    const method = init?.method ?? 'GET'
    events.push(`${method}:${url.hostname}${url.pathname}`)
    if (url.hostname === 'api.vercel.com') {
      return Response.json({
        id: 'dpl_exact',
        readyState: 'READY',
        target: 'production',
        alias: ['agentic-economy.ai'],
        url: 'ae-exact.vercel.app',
        meta: {
          githubCommitSha: SOURCE_REVISION,
          githubCommitRef: 'main',
          githubCommitOrg: 'CreasyBear',
          githubCommitRepo: 'Agentic-Economy',
        },
      })
    }
    if (url.hostname === 'api.github.com') {
      return Response.json(
        url.pathname.endsWith('/jobs')
          ? githubApiValues()[1]
          : githubApiValues()[0],
      )
    }
    if (url.pathname === '/v1/instance') {
      return Response.json({ id: 'ins_exact', environment_type: 'production' })
    }
    if (url.pathname === '/v1/users/user_phase3c') {
      return Response.json({
        id: 'user_phase3c',
        banned: false,
        locked: false,
        primary_email_address_id: 'email_primary',
        email_addresses: [{
          id: 'email_primary',
          email_address: 'joel@agentic-economy.ai',
          verification: { status: 'verified' },
        }],
      })
    }
    if (url.pathname === '/v1/sessions' && method === 'POST') {
      return Response.json({ id: 'session:human', status: 'active' })
    }
    if (url.pathname === '/v1/sessions/session%3Ahuman/tokens') {
      return Response.json({ jwt })
    }
    if (url.pathname === '/v1/sessions/session%3Ahuman/revoke') {
      events.push('session_revoked')
      return Response.json({})
    }
    if (url.pathname === '/v1/sessions/session%3Ahuman') {
      events.push('session_revocation_readback')
      return Response.json({
        id: 'session:human',
        user_id: 'user_phase3c',
        status: 'revoked',
      })
    }
    if (url.pathname === '/v1/api_keys' && method === 'POST') {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>
      if (JSON.stringify(body.scopes) !== JSON.stringify(['paid_operation:invoke'])
        || body.seconds_until_expiration !== 3_600) {
        return Response.json({ error: 'scope_mismatch' }, { status: 400 })
      }
      return Response.json({ id: 'key:agent', secret: 'fixture-agent-secret' })
    }
    if (url.pathname === '/v1/api_keys/key%3Aagent/revoke') {
      events.push('key_revoked')
      return Response.json({})
    }
    if (url.pathname === '/v1/api_keys/key%3Aagent') {
      events.push('key_revocation_readback')
      return Response.json({
        id: 'key:agent',
        subject: 'user_phase3c',
        scopes: ['paid_operation:invoke'],
        revoked: true,
      })
    }
    return Response.json({ error: `unexpected_fetch:${method}:${url.href}` }, {
      status: 500,
    })
  }) as typeof fetch
}

function liveTargetFixture() {
  return {
    source: {
      expectedRevision: SOURCE_REVISION,
      expectedTree: SOURCE_TREE,
    },
    deployment: {
      id: 'dpl_exact',
      productionUrl: 'agentic-economy.ai',
    },
    github: { runId: '123456', runAttempt: 1 },
    automatedInstrumentDigest:
      'sha256:526b009ddbf476758a06abf5768fe8459a1a5c29411c98ebfd5d131084452719',
    residualReviewDate: '2026-08-21',
  } as const
}

function liveContextFixture() {
  return {
    repositoryRoot: process.cwd(),
    baseUrl: 'https://agentic-economy.ai',
    browser: { newContext: async () => undefined } as never,
    vercel: {
      apiToken: 'vercel-test-token',
      deploymentId: 'dpl_exact',
    },
    clerk: {
      secretKey: 'clerk-test-secret',
      instanceId: 'ins_exact',
      subject: 'user_phase3c',
      primaryEmail: 'joel@agentic-economy.ai',
    },
    convex: { configuredDeployment: 'prod:exact' },
  } as const
}

function githubApiValues(): unknown[] {
  return [
    {
      id: 123456,
      run_attempt: 1,
      head_sha: SOURCE_REVISION,
      head_branch: 'main',
      path: '.github/workflows/kernel-release-gate.yml',
      status: 'completed',
      conclusion: 'success',
      repository: { full_name: 'CreasyBear/Agentic-Economy' },
    },
    {
      jobs: [{
        name: 'Phase 3C exact-revision Convex deployment',
        status: 'completed',
        conclusion: 'success',
        steps: [{
          name: 'Record Phase 3C Convex deployment receipt',
          status: 'completed',
          conclusion: 'success',
        }],
      }],
    },
  ]
}

function rechecksum(packet: Record<string, unknown>) {
  const copy = structuredClone(packet)
  delete copy.checksum
  return {
    ...copy,
    checksum: { algorithm: 'sha256', digest: canonicalProofDigest(copy) },
  }
}
