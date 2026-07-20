import { execFile as execFileCallback } from 'node:child_process'

import type { Browser } from '@playwright/test'
import type { z } from 'zod'

import {
  withTemporaryClerkApiKey,
  withTemporaryClerkUserSession,
} from './customer-request-production-credential'
import {
  authoritativeEvidenceSchema,
  canonicalProofDigest,
  collectPaidOperationHostedProofPacket,
  compareAuthoritativeLiveEvidence,
  EXPECTED_SCENARIO_ORDER,
  githubDeploymentSchema,
  isRecord,
  liveCollectionTargetSchema,
  PAID_OPERATION_HOSTED_EVIDENCE_CLASS,
  packetContentSchema,
  parsePaidOperationHostedProofPacket,
  proofReferenceDigest,
  refused,
  sameJson,
  sourceObservationSchema,
  type PaidOperationHostedLiveCollectionTarget,
  type PaidOperationHostedProofFailureCode,
  type PaidOperationHostedProofPacket,
  verifyPacketIntegrity,
} from './paid-operation-hosted-proof-contract'
import {
  runPaidOperationHostedJourney,
  type PaidOperationHostedJourneyInput,
  type PaidOperationHostedJourneyObservation,
  type PaidOperationHostedJourneyScenario,
} from './paid-operation-hosted-journey'

const GITHUB_REPOSITORY = 'CreasyBear/Agentic-Economy'
const GITHUB_REF = 'main'
const GITHUB_WORKFLOW = '.github/workflows/kernel-release-gate.yml'
const GITHUB_JOB = 'Phase 3C exact-revision Convex deployment'
const GITHUB_STEP = 'Record Phase 3C Convex deployment receipt'

export type PaidOperationHostedLiveContext = Readonly<{
  repositoryRoot: string
  baseUrl: string
  browser: Browser
  deploymentProtectionBypass?: string
  vercel: Readonly<{
    apiToken: string
    teamId?: string
    deploymentId: string
  }>
  clerk: Readonly<{
    secretKey: string
    instanceId: string
    subject: string
    primaryEmail: string
  }>
  convex: Readonly<{
    configuredDeployment: string
  }>
}>

export type PaidOperationHostedExec = (
  file: string,
  args: readonly string[],
  options: Readonly<{ cwd: string; env?: NodeJS.ProcessEnv }>,
) => Promise<string>

export type PaidOperationHostedLiveDependencies = Readonly<{
  fetch: typeof globalThis.fetch
  exec: PaidOperationHostedExec
  runJourney: (
    input: PaidOperationHostedJourneyInput,
  ) => Promise<PaidOperationHostedJourneyObservation>
}>

type SourceObservation = z.infer<typeof sourceObservationSchema>

export async function collectAndAdmitLivePaidOperationHostedEvidence(
  targetInput: unknown,
  contextInput: PaidOperationHostedLiveContext,
  injectedDependencies?: PaidOperationHostedLiveDependencies,
): Promise<
  | Readonly<{
      kind: 'admitted'
      evidenceClass: typeof PAID_OPERATION_HOSTED_EVIDENCE_CLASS
      packet: PaidOperationHostedProofPacket
    }>
  | Readonly<{
      kind: 'local_live_path_verified'
      evidenceClass: 'local_live_collector_fixture_only'
      packet: PaidOperationHostedProofPacket
    }>
  | Readonly<{ kind: 'refused'; code: PaidOperationHostedProofFailureCode }>
> {
  const targetResult = liveCollectionTargetSchema.safeParse(targetInput)
  if (!targetResult.success || !liveContextValid(targetResult.data, contextInput)) {
    return refused('live_admission_context_required')
  }
  const target = targetResult.data
  const dependencies = injectedDependencies ?? {
    fetch: globalThis.fetch,
    exec: execFileUtf8,
    runJourney: runPaidOperationHostedJourney,
  }

  try {
    const source = await observeStableCleanGit(
      target.source,
      contextInput.repositoryRoot,
      dependencies.exec,
    )
    const vercel = await collectVercelDeployment(
      target,
      contextInput,
      dependencies.fetch,
    )
    const githubDeployment = await collectGitHubDeployment(
      target,
      dependencies.fetch,
    )

    const credentialResult = await withTemporaryClerkUserSession({
      clerkSecretKey: contextInput.clerk.secretKey,
      expectedInstanceId: contextInput.clerk.instanceId,
      subject: contextInput.clerk.subject,
      expectedPrimaryEmail: contextInput.clerk.primaryEmail,
      fetch: dependencies.fetch,
      requireRevocationReadback: true,
      returnEvidence: true,
      run: async (sessionToken) => {
        const sessionPayload = decodeJwtPayload(sessionToken)
        if (sessionPayload.sub !== contextInput.clerk.subject
          || typeof sessionPayload.sid !== 'string') {
          throw new Error('live_actor_identity_mismatch')
        }
        const keyResult = await withTemporaryClerkApiKey({
          clerkSecretKey: contextInput.clerk.secretKey,
          expectedInstanceId: contextInput.clerk.instanceId,
          subject: contextInput.clerk.subject,
          expectedPrimaryEmail: contextInput.clerk.primaryEmail,
          requiredScope: 'paid_operation:invoke',
          scopes: ['paid_operation:invoke'],
          fetch: dependencies.fetch,
          requireRevocationReadback: true,
          returnEvidence: true,
          run: async (apiKey, identity) => ({
            journey: await dependencies.runJourney({
              baseUrl: contextInput.baseUrl,
              servedBinding: {
                deploymentId: vercel.id,
                sourceRevision: vercel.gitSha,
                productionUrl: vercel.productionUrl,
              },
              browser: contextInput.browser,
              humanSessionToken: sessionToken,
              agentApiKey: apiKey,
              fetch: dependencies.fetch,
              ...(contextInput.deploymentProtectionBypass === undefined
                ? {}
                : {
                    deploymentProtectionBypass:
                      contextInput.deploymentProtectionBypass,
                  }),
            }),
            credentialId: identity.credentialId,
          }),
        })
        if (keyResult.value.credentialId !== keyResult.revocation.credentialId
          || keyResult.revocation.subject !== contextInput.clerk.subject) {
          throw new Error('credential_revocation_mismatch')
        }
        return {
          journey: keyResult.value.journey,
          humanCallerRef: sessionPayload.sid,
          agentCredentialId: keyResult.value.credentialId,
          keyRevocation: keyResult.revocation,
        }
      },
    })
    if (credentialResult.revocation.subject !== contextInput.clerk.subject
      || credentialResult.revocation.sessionId
        !== credentialResult.value.humanCallerRef) {
      throw new Error('credential_revocation_mismatch')
    }

    const journey = credentialResult.value.journey
    const invocationRefs = journey.scenarios.map((scenario) => scenario.invocationRef)
    const observation = await collectRawConvexObservation(
      invocationRefs,
      contextInput,
      dependencies.exec,
    )
    const cohortDigest = canonicalProofDigest({
      schema: 'phase3c-paid-operation-proof-cohort:v1',
      invocationRefs,
    })
    if (observation.cohort.cohortDigest !== cohortDigest) {
      throw new Error('live_convex_observation_mismatch')
    }
    assertDeploymentReceiptMatches(
      target,
      githubDeployment,
      observation,
    )

    const actorRefs = {
      humanPrincipalRef: contextInput.clerk.subject,
      humanCallerRef: credentialResult.value.humanCallerRef,
      agentPrincipalRef: contextInput.clerk.subject,
      agentCallerRef:
        `clerk_api_key:${credentialResult.value.agentCredentialId}`,
    }
    const packet = buildPacket({
      target,
      source,
      vercel,
      githubDeployment,
      configuredDeployment: contextInput.convex.configuredDeployment,
      journey,
      observation,
      actorRefs,
      credentialEvidence: {
        humanSessionId: credentialResult.revocation.sessionId,
        agentCredentialId: credentialResult.value.keyRevocation.credentialId,
      },
    })
    const integrity = verifyPacketIntegrity(packet)
    if (integrity.kind === 'refused') return integrity
    const evidence = authoritativeEvidenceSchema.parse({
      source,
      vercel,
      githubDeployment,
      convex: {
        ...packet.convex,
        observation,
      },
      actors: packet.actors,
      credentials: packet.credentials,
      scenarios: packet.scenarios,
    })
    const compared = compareAuthoritativeLiveEvidence(packet, evidence)
    if (compared.kind === 'refused') return compared

    const sourceAtAdmission = await observeStableCleanGit(
      target.source,
      contextInput.repositoryRoot,
      dependencies.exec,
    )
    if (!sameJson(sourceAtAdmission, source)) {
      return refused('live_source_mismatch')
    }

    if (injectedDependencies !== undefined) {
      return {
        kind: 'local_live_path_verified',
        evidenceClass: 'local_live_collector_fixture_only',
        packet,
      }
    }
    return {
      kind: 'admitted',
      evidenceClass: PAID_OPERATION_HOSTED_EVIDENCE_CLASS,
      packet,
    }
  } catch (error) {
    return refused(liveFailureCode(error))
  }
}

export async function observeStableCleanGit(
  expected: PaidOperationHostedLiveCollectionTarget['source'],
  repositoryRoot: string,
  exec: PaidOperationHostedExec,
) {
  const capturedHead = (await exec('git', ['rev-parse', 'HEAD'], {
    cwd: repositoryRoot,
  })).trim()
  const capturedTree = (await exec('git', [
    'rev-parse',
    `${capturedHead}^{tree}`,
  ], { cwd: repositoryRoot })).trim()
  const firstStatus = await exec('git', ['status', '--porcelain=v1'], {
    cwd: repositoryRoot,
  })
  const rereadHead = (await exec('git', ['rev-parse', 'HEAD'], {
    cwd: repositoryRoot,
  })).trim()
  const secondStatus = await exec('git', ['status', '--porcelain=v1'], {
    cwd: repositoryRoot,
  })
  if (capturedHead !== rereadHead || firstStatus !== secondStatus) {
    throw new Error('live_source_torn')
  }
  if (firstStatus.trim() !== ''
    || capturedHead !== expected.expectedRevision
    || capturedTree !== expected.expectedTree) {
    throw new Error('live_source_mismatch')
  }
  return {
    expectedRevision: expected.expectedRevision,
    expectedTree: expected.expectedTree,
    observedRevision: capturedHead,
    observedTree: capturedTree,
    clean: true as const,
  }
}

export async function collectRawConvexObservation(
  invocationRefs: readonly string[],
  context: Pick<PaidOperationHostedLiveContext, 'repositoryRoot' | 'convex'>,
  exec: PaidOperationHostedExec,
): Promise<SourceObservation> {
  if (!/^(?:dev|prod):[A-Za-z0-9-]+$/u.test(
    context.convex.configuredDeployment,
  )) {
    throw new Error('convex_cli_binding_mismatch')
  }
  const env: NodeJS.ProcessEnv = {
    CONVEX_DEPLOYMENT: context.convex.configuredDeployment,
  }
  for (const key of ['HOME', 'PATH', 'TMPDIR', 'NODE_OPTIONS', 'NO_COLOR']) {
    if (process.env[key] !== undefined) env[key] = process.env[key]
  }
  const stdout = await exec('npx', [
    'convex',
    'run',
    'hostedPaidOperation:phase3CHostedProofObservation',
    JSON.stringify({ invocationRefs }),
    '--prod',
  ], {
    cwd: context.repositoryRoot,
    env,
  })
  return sourceObservationSchema.parse(JSON.parse(stdout))
}

export async function collectGitHubDeployment(
  target: PaidOperationHostedLiveCollectionTarget,
  fetch: typeof globalThis.fetch,
): Promise<z.infer<typeof githubDeploymentSchema>> {
  const runEndpoint = new URL(
    `/repos/${GITHUB_REPOSITORY}/actions/runs/${target.github.runId}`,
    'https://api.github.com',
  )
  const runResponse = await fetch(runEndpoint, {
    headers: githubHeaders(),
    redirect: 'error',
    cache: 'no-store',
  })
  if (!runResponse.ok) throw new Error('live_github_deployment_mismatch')
  const run: unknown = await runResponse.json()
  if (!isRecord(run)
    || String(run.id) !== target.github.runId
    || run.run_attempt !== target.github.runAttempt
    || run.head_sha !== target.source.expectedRevision
    || run.head_branch !== GITHUB_REF
    || run.path !== GITHUB_WORKFLOW
    || run.status !== 'completed'
    || run.conclusion !== 'success'
    || !isRecord(run.repository)
    || run.repository.full_name !== GITHUB_REPOSITORY) {
    throw new Error('live_github_deployment_mismatch')
  }

  const jobsEndpoint = new URL(
    `/repos/${GITHUB_REPOSITORY}/actions/runs/${target.github.runId}/attempts/${target.github.runAttempt}/jobs`,
    'https://api.github.com',
  )
  jobsEndpoint.searchParams.set('per_page', '100')
  const jobsResponse = await fetch(jobsEndpoint, {
    headers: githubHeaders(),
    redirect: 'error',
    cache: 'no-store',
  })
  if (!jobsResponse.ok) throw new Error('live_github_deployment_mismatch')
  const jobsValue: unknown = await jobsResponse.json()
  if (!isRecord(jobsValue) || !Array.isArray(jobsValue.jobs)) {
    throw new Error('live_github_deployment_mismatch')
  }
  const jobs = jobsValue.jobs.filter((job) => isRecord(job) && job.name === GITHUB_JOB)
  if (jobs.length !== 1) throw new Error('live_github_deployment_mismatch')
  const job = jobs[0]!
  if (!isRecord(job)
    || job.status !== 'completed'
    || job.conclusion !== 'success'
    || !Array.isArray(job.steps)) {
    throw new Error('live_github_deployment_mismatch')
  }
  const steps = job.steps.filter((step) => isRecord(step) && step.name === GITHUB_STEP)
  if (steps.length !== 1
    || !isRecord(steps[0])
    || steps[0].status !== 'completed'
    || steps[0].conclusion !== 'success') {
    throw new Error('live_github_deployment_mismatch')
  }
  return githubDeploymentSchema.parse({
    repository: GITHUB_REPOSITORY,
    ref: GITHUB_REF,
    workflowPath: GITHUB_WORKFLOW,
    runId: target.github.runId,
    runAttempt: target.github.runAttempt,
    headSha: target.source.expectedRevision,
    status: 'completed',
    conclusion: 'success',
    job: { name: GITHUB_JOB, status: 'completed', conclusion: 'success' },
    step: { name: GITHUB_STEP, status: 'completed', conclusion: 'success' },
  })
}

async function collectVercelDeployment(
  target: PaidOperationHostedLiveCollectionTarget,
  context: PaidOperationHostedLiveContext,
  fetch: typeof globalThis.fetch,
) {
  const endpoint = new URL(
    `/v13/deployments/${encodeURIComponent(target.deployment.id)}`,
    'https://api.vercel.com',
  )
  if (context.vercel.teamId !== undefined) {
    endpoint.searchParams.set('teamId', context.vercel.teamId)
  }
  const response = await fetch(endpoint, {
    headers: { Authorization: `Bearer ${context.vercel.apiToken}` },
    redirect: 'error',
    cache: 'no-store',
  })
  if (!response.ok) throw new Error('live_vercel_control_plane_mismatch')
  const value: unknown = await response.json()
  if (!isRecord(value)
    || value.id !== target.deployment.id
    || value.readyState !== 'READY'
    || value.target !== 'production'
    || !Array.isArray(value.alias)
    || !value.alias.includes(target.deployment.productionUrl)
    || !isRecord(value.meta)
    || value.meta.githubCommitSha !== target.source.expectedRevision
    || value.meta.githubCommitRef !== GITHUB_REF
    || `${value.meta.githubCommitOrg}/${value.meta.githubCommitRepo}`
      !== GITHUB_REPOSITORY
    || typeof value.url !== 'string') {
    throw new Error('live_vercel_control_plane_mismatch')
  }
  return {
    provider: 'vercel' as const,
    id: target.deployment.id,
    url: value.url,
    productionUrl: target.deployment.productionUrl,
    gitSha: target.source.expectedRevision,
    gitRef: GITHUB_REF,
    repository: GITHUB_REPOSITORY,
    readyState: 'READY' as const,
    target: 'production' as const,
  }
}

function assertDeploymentReceiptMatches(
  target: PaidOperationHostedLiveCollectionTarget,
  githubDeployment: z.infer<typeof githubDeploymentSchema>,
  observation: SourceObservation,
): void {
  const receipt = observation.deployment.receipt
  if (receipt.sourceRevision !== target.source.expectedRevision
    || receipt.sourceTree !== target.source.expectedTree
    || receipt.githubRunId !== target.github.runId
    || receipt.githubRunAttempt !== target.github.runAttempt
    || receipt.githubRepository !== githubDeployment.repository
    || receipt.githubRef !== githubDeployment.ref
    || receipt.githubWorkflow !== githubDeployment.workflowPath
    || receipt.githubJob !== githubDeployment.job.name
    || receipt.githubStep !== githubDeployment.step.name
    || receipt.deploymentName !== observation.deployment.current.name) {
    throw new Error('live_convex_observation_mismatch')
  }
}

function buildPacket(input: Readonly<{
  target: PaidOperationHostedLiveCollectionTarget
  source: z.infer<typeof packetContentSchema.shape.source>
  vercel: z.infer<typeof packetContentSchema.shape.deployment>
  githubDeployment: z.infer<typeof githubDeploymentSchema>
  configuredDeployment: string
  journey: PaidOperationHostedJourneyObservation
  observation: SourceObservation
  actorRefs: Readonly<{
    humanPrincipalRef: string
    humanCallerRef: string
    agentPrincipalRef: string
    agentCallerRef: string
  }>
  credentialEvidence: Readonly<{
    humanSessionId: string
    agentCredentialId: string
  }>
}>): PaidOperationHostedProofPacket {
  const cohortDigest = input.observation.cohort.cohortDigest
  const principalDigest = proofReferenceDigest(
    cohortDigest,
    'principal',
    input.actorRefs.humanPrincipalRef,
  )
  const humanCallerDigest = proofReferenceDigest(
    cohortDigest,
    'caller',
    input.actorRefs.humanCallerRef,
  )
  const agentCallerDigest = proofReferenceDigest(
    cohortDigest,
    'caller',
    input.actorRefs.agentCallerRef,
  )
  if (input.actorRefs.humanPrincipalRef !== input.actorRefs.agentPrincipalRef
    || input.credentialEvidence.humanSessionId !== input.actorRefs.humanCallerRef
    || `clerk_api_key:${input.credentialEvidence.agentCredentialId}`
      !== input.actorRefs.agentCallerRef) {
    throw new Error('credential_revocation_mismatch')
  }

  const scenarios = input.journey.scenarios.map((scenario, index) => {
    const observed = input.observation.invocations[index]
    if (observed === undefined
      || observed.invocationRef !== scenario.invocationRef
      || observed.providerId !== scenario.providerId
      || observed.operationKey !== scenario.operationKey
      || observed.operationRevision !== scenario.operationRevision) {
      throw new Error('live_convex_observation_mismatch')
    }
    return {
      scenario: scenario.scenario,
      actorClass: scenario.actorClass,
      invocationRef: scenario.invocationRef,
      providerId: scenario.providerId,
      operationKey: scenario.operationKey,
      operationRevision: scenario.operationRevision,
      checkpoints: scenario.checkpoints,
      transitions: transitionsFromJourneyAndObservation(scenario, observed),
      projections: scenario.projections,
    }
  })
  const content = {
    schema: 'agentic-paid-operation-hosted-proof:v1' as const,
    collectedAs: 'hosted_candidate' as const,
    source: input.source,
    deployment: input.vercel,
    githubDeployment: input.githubDeployment,
    convex: {
      queryMode: 'authenticated_cli_configured_project_prod' as const,
      configuredDeployment: input.configuredDeployment,
      queryUrl:
        `https://${input.observation.deployment.current.name}.convex.cloud`,
      deploymentName: input.observation.deployment.current.name,
      sourceRevision: input.observation.deployment.receipt.sourceRevision,
      sourceTree: input.observation.deployment.receipt.sourceTree,
      deploymentReceiptDigest:
        input.observation.deployment.receipt.receiptDigest,
    },
    actors: {
      human: {
        callerClass: 'authenticated_human_session' as const,
        principalDigest,
        callerDigest: humanCallerDigest,
      },
      agent: {
        callerClass: 'authenticated_agent_api_key' as const,
        principalDigest,
        callerDigest: agentCallerDigest,
        requiredScopes: ['paid_operation:invoke'] as const,
      },
    },
    credentials: {
      subjectPrincipalDigest: principalDigest,
      humanSession: {
        callerDigest: humanCallerDigest,
        status: 'revoked' as const,
      },
      agentKey: {
        callerDigest: agentCallerDigest,
        status: 'revoked' as const,
        requiredScopes: ['paid_operation:invoke'] as const,
        secondsUntilExpiration: 3_600 as const,
      },
    },
    providers: [
      {
        providerKey: 'A' as const,
        providerId: 'provider:a' as const,
        operationKey: 'btc-usd-a' as const,
        operationRevision: input.journey.scenarios[0].operationRevision,
        evidenceClass: 'labelled_mock' as const,
      },
      {
        providerKey: 'B' as const,
        providerId: 'provider:b' as const,
        operationKey: 'btc-usd-b' as const,
        operationRevision: input.journey.scenarios[2].operationRevision,
        evidenceClass: 'labelled_mock' as const,
      },
    ] as const,
    scenarioOrder: [...EXPECTED_SCENARIO_ORDER] as [
      typeof EXPECTED_SCENARIO_ORDER[0],
      typeof EXPECTED_SCENARIO_ORDER[1],
      typeof EXPECTED_SCENARIO_ORDER[2],
    ],
    scenarios,
    sourceObservation: input.observation,
    comprehension: {
      human: {
        status: 'NOT_RUN' as const,
        evidenceClass: 'declared_human_comprehension_session' as const,
      },
      automated: {
        status: 'PASS' as const,
        evidenceClass: 'automated_model_comprehension_adjunct' as const,
        instrumentDigest: input.target.automatedInstrumentDigest,
      },
    },
    residualRecords: {
      posture: 'retain_until_review_then_retire' as const,
      reviewDate: input.target.residualReviewDate,
      killSwitchOwnerDigest:
        input.observation.policy.killSwitchOwnerDigest,
      expectedRecordClasses: [
        'policy',
        'counter',
        'reservation',
        'aggregate',
        'command',
        'attempt',
        'mock_effect',
      ] as const,
    },
    claimCeiling: 'pending_live_evidence_admission' as const,
  }
  return parsePaidOperationHostedProofPacket(
    collectPaidOperationHostedProofPacket(content),
  )
}

function transitionsFromJourneyAndObservation(
  journey: PaidOperationHostedJourneyScenario,
  observed: SourceObservation['invocations'][number],
) {
  const attempt = observed.attempts[0]
  const effect = observed.effects[0]
  if (attempt === undefined || effect === undefined) {
    throw new Error('live_convex_observation_mismatch')
  }
  const stages = journey.scenario === EXPECTED_SCENARIO_ORDER[2]
    ? [
        ['created', 1, false, false, null, ['authorize']],
        ['authorized', 2, false, false, null, ['execute']],
        ['release_started', 4, true, false, 1, []],
        ['response_lost', 5, true, true, 1, ['reconcile']],
        ['reconciled', 6, true, true, 1, ['inspect']],
      ] as const
    : [
        ['created', 1, false, false, null, ['authorize']],
        ['authorized', 2, false, false, null, ['execute']],
        ['release_started', 4, true, false, 1, []],
        ['completed', 5, true, true, 1, ['inspect']],
      ] as const
  return stages.map(([
    stage,
    invocationVersion,
    includeAttempt,
    includeEffect,
    effectGeneration,
    continuations,
  ]) => {
    const matches = observed.commands.filter(
      (command) => command.invocationVersion === invocationVersion,
    )
    if (matches.length !== 1) throw new Error('live_convex_observation_mismatch')
    const observedStage = journey.observedStages.find(
      (candidate) => candidate.invocationVersion === invocationVersion,
    )
    if (invocationVersion !== 4
      && (observedStage === undefined
        || observedStage.stage !== stage
        || !sameJson(observedStage.continuations, continuations))) {
      throw new Error('journey_checkpoint_mismatch')
    }
    return {
      stage,
      invocationVersion,
      commandIdentityDigest: matches[0]!.commandIdentityDigest,
      attemptIdentityDigest: includeAttempt ? attempt.attemptIdentityDigest : null,
      effectObservationDigest: includeEffect ? effect.observationDigest : null,
      effectGeneration,
      continuations: [...continuations],
      ...(stage === 'reconciled'
        ? {
            reconciliationInput: {
              command: 'reconcile' as const,
              commandId: journey.commandIds.reconcile!,
              expectedInvocationVersion: 5,
            },
          }
        : {}),
    }
  })
}

function liveContextValid(
  target: PaidOperationHostedLiveCollectionTarget,
  context: PaidOperationHostedLiveContext,
): boolean {
  try {
    const baseUrl = new URL(context.baseUrl)
    return baseUrl.protocol === 'https:'
      && normalizeUrl(context.baseUrl)
        === normalizeUrl(`https://${target.deployment.productionUrl}`)
      && context.repositoryRoot.trim() !== ''
      && context.vercel.deploymentId === target.deployment.id
      && context.vercel.apiToken.trim() !== ''
      && context.clerk.secretKey.trim() !== ''
      && context.clerk.instanceId.trim() !== ''
      && context.clerk.subject.trim() !== ''
      && context.clerk.primaryEmail.trim() !== ''
      && /^(?:dev|prod):[A-Za-z0-9-]+$/u.test(
        context.convex.configuredDeployment,
      )
      && typeof context.browser.newContext === 'function'
  } catch {
    return false
  }
}

function decodeJwtPayload(token: string): Record<string, unknown> {
  const payload = token.split('.')[1]
  if (payload === undefined) throw new Error('live_actor_identity_mismatch')
  const value: unknown = JSON.parse(
    Buffer.from(payload, 'base64url').toString('utf8'),
  )
  if (!isRecord(value)) throw new Error('live_actor_identity_mismatch')
  return value
}

function githubHeaders(): Record<string, string> {
  return {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'agentic-economy-phase3c-proof-collector',
  }
}

function liveFailureCode(error: unknown): PaidOperationHostedProofFailureCode {
  if (!(error instanceof Error)) return 'live_collection_failed'
  const code = error.message
  if (code === 'served_revision_deployment_binding_mismatch') {
    return 'live_vercel_control_plane_mismatch'
  }
  if (code.startsWith('journey_checkpoint_')
    || code.startsWith('journey_projection_v')) {
    return 'journey_checkpoint_mismatch'
  }
  if (code.includes('revocation_readback')
    || code === 'credential_revocation_mismatch') {
    return 'credential_revocation_mismatch'
  }
  if (code === 'live_source_torn'
    || code === 'live_source_mismatch'
    || code === 'live_vercel_control_plane_mismatch'
    || code === 'live_github_deployment_mismatch'
    || code === 'live_convex_observation_mismatch'
    || code === 'convex_cli_binding_mismatch'
    || code === 'journey_checkpoint_mismatch') {
    return code
  }
  return 'live_collection_failed'
}

function normalizeUrl(value: string): string {
  const url = new URL(value)
  url.hash = ''
  url.search = ''
  return url.href.replace(/\/$/u, '')
}

function execFileUtf8(
  file: string,
  args: readonly string[],
  options: Readonly<{ cwd: string; env?: NodeJS.ProcessEnv }>,
): Promise<string> {
  return new Promise((resolveOutput, rejectOutput) => {
    execFileCallback(file, [...args], {
      cwd: options.cwd,
      env: options.env,
      encoding: 'utf8',
      timeout: 45_000,
      maxBuffer: 2 * 1024 * 1024,
    }, (error, stdout) => {
      if (error !== null) rejectOutput(error)
      else resolveOutput(stdout)
    })
  })
}
