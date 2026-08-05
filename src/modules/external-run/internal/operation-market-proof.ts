import { z } from 'zod'

import { canonicalDigest } from '@/modules/common/canonical-digest'
import { deepFreeze } from '@/modules/common/deep-freeze'
import type { StableHashValue } from '@/modules/common/stable-hash'

const nonEmpty = z.string().trim().min(1).max(500)
const digest = z.string().regex(/^sha256:[0-9a-f]{64}$/)
const operationRef = z.string().regex(/^operation:v1:[0-9a-f]{64}$/)
const mappingRef = z.string().regex(/^mapping:v1:[0-9a-f]{64}$/)
const httpsUrl = z.url().refine((value) => value.startsWith('https://'), 'HTTPS required')
const role = z.enum(['exa_search', 'exa_contents', 'frankfurter_rate'])
const participantKind = z.enum(['cold_human', 'cold_external_agent'])

const operation = z.strictObject({
  role,
  operationRef,
  capabilityId: z.enum(['exa.search', 'exa.contents', 'frankfurter.single-rate']),
  contractDigest: digest,
  publicationRef: nonEmpty,
  publicationRevision: z.number().int().positive(),
  bindingId: nonEmpty,
  providerRef: nonEmpty,
  providerOrigin: httpsUrl,
  credentialClass: z.enum(['platform_api_key', 'keyless']),
  maximumProviderCostMinor: z.number().int().nonnegative(),
})

export const operationMarketProofManifestInputSchema = z.strictObject({
  proofRef: nonEmpty,
  release: z.strictObject({
    origin: httpsUrl,
    deploymentId: nonEmpty,
    runtime: z.literal('nodejs22.x'),
    registrySnapshotDigest: digest,
  }),
  operations: z.array(operation).length(3),
  mapping: z.strictObject({
    mappingRef,
    sourceOperationRef: operationRef,
    targetOperationRef: operationRef,
  }),
  spend: z.strictObject({
    currency: z.literal('USD'),
    maximumAttemptCostMinor: z.number().int().nonnegative(),
    maximumProgramCostMinor: z.number().int().nonnegative(),
    repeatedRunsApproved: z.literal(false),
  }),
  evidencePolicy: z.strictObject({
    manifestVersion: z.literal('ae.operation-market-proof-manifest:v1'),
    attemptVersion: z.literal('ae.operation-market-proof-attempt:v1'),
    reportVersion: z.literal('ae.operation-market-proof-report:v1'),
    participantKinds: z.tuple([z.literal('cold_human'), z.literal('cold_external_agent')]),
  }),
})
export type OperationMarketProofManifestInput = z.infer<typeof operationMarketProofManifestInputSchema>

export const operationMarketProofManifestSchema = operationMarketProofManifestInputSchema.extend({
  format: z.literal('ae.operation-market-proof-manifest:v1'),
  state: z.literal('frozen'),
  createdAt: z.number().finite().nonnegative(),
  frozenAt: z.number().finite().nonnegative(),
  digest,
})
export type OperationMarketProofManifest = z.infer<typeof operationMarketProofManifestSchema>

const attemptStepBase = z.strictObject({
  role,
  operationRef,
  providerRef: nonEmpty,
  bindingId: nonEmpty,
  startedAt: z.number().finite().nonnegative(),
  terminalAt: z.number().finite().nonnegative(),
  paymentSubmitted: z.literal(false),
})
const attemptStep = z.discriminatedUnion('outcome', [
  attemptStepBase.extend({
    outcome: z.literal('selected'),
    selectionEvidenceDigest: digest,
    providerCostMinor: z.literal(0),
  }),
  attemptStepBase.extend({
    outcome: z.literal('succeeded'),
    kernelAttemptRef: nonEmpty,
    validatedOutputDigest: digest,
    providerReceiptDigest: digest,
    providerCostMinor: z.number().int().nonnegative(),
  }),
])

const citation = z.strictObject({
  providerRef: nonEmpty,
  url: httpsUrl,
  evidenceDigest: digest,
})

export const operationMarketProofAttemptInputSchema = z.strictObject({
  attemptRef: nonEmpty,
  manifestDigest: digest,
  participant: z.strictObject({
    kind: participantKind,
    participantRef: nonEmpty,
    coldStartAttested: z.literal(true),
    repositoryContextProvided: z.literal(false),
    authentication: z.enum(['human_session', 'external_agent_oauth']),
  }),
  startedAt: z.number().finite().nonnegative(),
  terminalAt: z.number().finite().nonnegative(),
  request: z.strictObject({
    requestRef: nonEmpty,
    intent: nonEmpty,
    revision: z.number().int().positive(),
    routeRef: nonEmpty,
    planDigest: digest,
    confirmationReceiptRef: nonEmpty,
  }),
  steps: z.array(attemptStep).length(3),
  recovery: z.strictObject({
    interruptionExercised: z.literal(true),
    resumedFromDurableState: z.literal(true),
    duplicateEffects: z.literal(0),
    unauthorizedEffects: z.literal(0),
    unknownOutcomes: z.literal(0),
  }),
  durableReadback: z.strictObject({
    requestRef: nonEmpty,
    state: z.literal('complete'),
    readbackDigest: digest,
    readAt: z.number().finite().nonnegative(),
  }),
  result: z.strictObject({
    answerDigest: digest,
    citations: z.array(citation).min(2).max(20),
    exchangeRate: z.number().finite().positive(),
  }),
  participantAcceptance: z.literal('accepted'),
})
export type OperationMarketProofAttemptInput = z.infer<typeof operationMarketProofAttemptInputSchema>

export const operationMarketProofAttemptSchema = operationMarketProofAttemptInputSchema.extend({
  format: z.literal('ae.operation-market-proof-attempt:v1'),
  digest,
})
export type OperationMarketProofAttempt = z.infer<typeof operationMarketProofAttemptSchema>

export type OperationMarketProofGateDecision = 'PASS' | 'FAIL'
export type OperationMarketProofGateResult = Readonly<{
  decision: OperationMarketProofGateDecision
  failures: readonly string[]
}>

export const operationMarketProofObservationSchema = z.strictObject({
  format: z.literal('ae.operation-market-proof-observation:v1'),
  manifestDigest: digest,
  attemptCount: z.literal(2),
  participantKinds: z.tuple([z.literal('cold_external_agent'), z.literal('cold_human')]),
  completedSteps: z.literal(6),
  selectedSteps: z.literal(4),
  providerSuccesses: z.literal(2),
  duplicateEffects: z.literal(0),
  unauthorizedEffects: z.literal(0),
  unknownOutcomes: z.literal(0),
  paymentSubmissions: z.literal(0),
  totalProviderCostMinor: z.number().int().nonnegative(),
  maximumAttemptDurationMs: z.number().int().nonnegative(),
  acceptedAttempts: z.literal(2),
})
export type OperationMarketProofObservation = z.infer<typeof operationMarketProofObservationSchema>

export const operationMarketProofReportSchema = z.strictObject({
  format: z.literal('ae.operation-market-proof-report:v1'),
  manifest: operationMarketProofManifestSchema,
  attempts: z.array(operationMarketProofAttemptSchema).length(2),
  observation: operationMarketProofObservationSchema,
  gate: z.strictObject({
    decision: z.enum(['PASS', 'FAIL']),
    failures: z.array(nonEmpty),
  }),
  generatedAt: z.number().finite().nonnegative(),
  digest,
})
export type OperationMarketProofReport = z.infer<typeof operationMarketProofReportSchema>

export function createOperationMarketProofManifest(
  input: OperationMarketProofManifestInput,
  now: number,
): OperationMarketProofManifest {
  const parsed = operationMarketProofManifestInputSchema.parse(input)
  assertManifestTopology(parsed)
  const material = {
    format: 'ae.operation-market-proof-manifest:v1' as const,
    ...parsed,
    state: 'frozen' as const,
    createdAt: now,
    frozenAt: now,
  }
  return deepFreeze(operationMarketProofManifestSchema.parse({
    ...material,
    digest: canonicalDigest(material as StableHashValue),
  }))
}

export function createOperationMarketProofAttempt(
  manifest: OperationMarketProofManifest,
  input: OperationMarketProofAttemptInput,
): OperationMarketProofAttempt {
  if (!operationMarketProofManifestIntegrityValid(manifest) || input.manifestDigest !== manifest.digest) {
    throw new Error('operation_market_manifest_mismatch')
  }
  const parsed = operationMarketProofAttemptInputSchema.parse(input)
  const material = { format: 'ae.operation-market-proof-attempt:v1' as const, ...parsed }
  return deepFreeze(operationMarketProofAttemptSchema.parse({
    ...material,
    digest: canonicalDigest(material as StableHashValue),
  }))
}

export function operationMarketProofManifestIntegrityValid(manifest: OperationMarketProofManifest): boolean {
  const { digest: storedDigest, ...material } = manifest
  return storedDigest === canonicalDigest(material as StableHashValue)
}

export function operationMarketProofAttemptIntegrityValid(attempt: OperationMarketProofAttempt): boolean {
  const { digest: storedDigest, ...material } = attempt
  return storedDigest === canonicalDigest(material as StableHashValue)
}

export function computeOperationMarketProofGate(
  manifest: OperationMarketProofManifest,
  attempts: readonly OperationMarketProofAttempt[],
): OperationMarketProofGateResult {
  const failures: string[] = []
  if (!operationMarketProofManifestIntegrityValid(manifest)) failures.push('manifest_integrity_invalid')
  if (attempts.length !== 2) failures.push('attempt_count_invalid')
  const kinds = [...new Set(attempts.map(({ participant }) => participant.kind))].sort()
  if (kinds.join(',') !== 'cold_external_agent,cold_human') failures.push('participant_kinds_incomplete')
  if (new Set(attempts.map(({ participant }) => participant.participantRef)).size !== attempts.length) failures.push('participants_not_independent')

  for (const attempt of attempts) {
    if (!operationMarketProofAttemptIntegrityValid(attempt)) failures.push(`${attempt.attemptRef}:integrity_invalid`)
    if (attempt.manifestDigest !== manifest.digest) failures.push(`${attempt.attemptRef}:manifest_mismatch`)
    if (attempt.terminalAt < attempt.startedAt) failures.push(`${attempt.attemptRef}:time_invalid`)
    if (attempt.participant.kind === 'cold_human' && attempt.participant.authentication !== 'human_session') failures.push(`${attempt.attemptRef}:human_auth_invalid`)
    if (attempt.participant.kind === 'cold_external_agent' && attempt.participant.authentication !== 'external_agent_oauth') failures.push(`${attempt.attemptRef}:agent_auth_invalid`)
    if (attempt.durableReadback.requestRef !== attempt.request.requestRef || attempt.durableReadback.readAt < attempt.terminalAt) failures.push(`${attempt.attemptRef}:durable_readback_invalid`)
    if (attempt.recovery.duplicateEffects !== 0 || attempt.recovery.unauthorizedEffects !== 0 || attempt.recovery.unknownOutcomes !== 0) failures.push(`${attempt.attemptRef}:recovery_invariant_failed`)
    const attemptCost = attempt.steps.reduce((total, step) => total + step.providerCostMinor, 0)
    if (attemptCost > manifest.spend.maximumAttemptCostMinor) failures.push(`${attempt.attemptRef}:attempt_cost_exceeded`)
    const roles = [...new Set(attempt.steps.map((step) => step.role))]
    if (roles.length !== 3) failures.push(`${attempt.attemptRef}:step_roles_incomplete`)
    const selectedRoles = attempt.steps.reduce<string[]>((rolesByStep, { role, outcome }) => { if (outcome === 'selected') rolesByStep.push(role); return rolesByStep }, []).sort()
    if (selectedRoles.join(',') !== 'exa_contents,exa_search') failures.push(`${attempt.attemptRef}:exa_selection_incomplete`)
    const executedRoles = attempt.steps.reduce<string[]>((rolesByStep, { role, outcome }) => { if (outcome === 'succeeded') rolesByStep.push(role); return rolesByStep }, [])
    if (executedRoles.length !== 1 || executedRoles[0] !== 'frankfurter_rate') failures.push(`${attempt.attemptRef}:provider_execution_invalid`)
    for (const step of attempt.steps) {
      const expected = manifest.operations.find(({ role: expectedRole }) => expectedRole === step.role)
      if (expected === undefined || expected.operationRef !== step.operationRef || expected.providerRef !== step.providerRef || expected.bindingId !== step.bindingId) failures.push(`${attempt.attemptRef}:${step.role}:operation_drift`)
      if (expected !== undefined && step.providerCostMinor > expected.maximumProviderCostMinor) failures.push(`${attempt.attemptRef}:${step.role}:provider_cost_exceeded`)
      if (step.terminalAt < step.startedAt) failures.push(`${attempt.attemptRef}:${step.role}:time_invalid`)
      if (step.paymentSubmitted) failures.push(`${attempt.attemptRef}:${step.role}:payment_submitted`)
    }
    for (const providerRef of new Set(manifest.operations.map(({ providerRef }) => providerRef))) {
      if (!attempt.result.citations.some((citation) => citation.providerRef === providerRef)) failures.push(`${attempt.attemptRef}:${providerRef}:citation_missing`)
    }
  }
  const programCost = attempts.flatMap(({ steps }) => steps).reduce((total, step) => total + step.providerCostMinor, 0)
  if (programCost > manifest.spend.maximumProgramCostMinor) failures.push('program_cost_exceeded')
  return deepFreeze({ decision: failures.length === 0 ? 'PASS' : 'FAIL', failures })
}

export function buildOperationMarketProofReport(
  manifest: OperationMarketProofManifest,
  attempts: readonly OperationMarketProofAttempt[],
  generatedAt: number,
): OperationMarketProofReport {
  const gate = computeOperationMarketProofGate(manifest, attempts)
  const ordered = [...attempts].sort((left, right) => left.participant.kind.localeCompare(right.participant.kind))
  const durations = ordered.map((attempt) => Math.max(0, attempt.terminalAt - attempt.startedAt))
  const observation: OperationMarketProofObservation = {
    format: 'ae.operation-market-proof-observation:v1',
    manifestDigest: manifest.digest,
    attemptCount: 2,
    participantKinds: ['cold_external_agent', 'cold_human'],
    completedSteps: 6,
    selectedSteps: 4,
    providerSuccesses: 2,
    duplicateEffects: 0,
    unauthorizedEffects: 0,
    unknownOutcomes: 0,
    paymentSubmissions: 0,
    totalProviderCostMinor: ordered.flatMap(({ steps }) => steps).reduce((total, step) => total + step.providerCostMinor, 0),
    maximumAttemptDurationMs: Math.max(0, ...durations),
    acceptedAttempts: 2,
  }
  const material = {
    format: 'ae.operation-market-proof-report:v1' as const,
    manifest,
    attempts: ordered,
    observation,
    gate,
    generatedAt,
  }
  return deepFreeze(operationMarketProofReportSchema.parse({
    ...material,
    digest: canonicalDigest(material as StableHashValue),
  }))
}

function assertManifestTopology(manifest: OperationMarketProofManifestInput): void {
  const byRole = new Map(manifest.operations.map((entry) => [entry.role, entry]))
  if (byRole.size !== 3
    || byRole.get('exa_search')?.capabilityId !== 'exa.search'
    || byRole.get('exa_contents')?.capabilityId !== 'exa.contents'
    || byRole.get('frankfurter_rate')?.capabilityId !== 'frankfurter.single-rate') {
    throw new Error('operation_market_manifest_operations_invalid')
  }
  const exaSearch = byRole.get('exa_search')
  const exaContents = byRole.get('exa_contents')
  const frankfurter = byRole.get('frankfurter_rate')
  if (exaSearch === undefined || exaContents === undefined || frankfurter === undefined
    || exaSearch.providerRef !== exaContents.providerRef
    || exaSearch.providerOrigin !== exaContents.providerOrigin
    || exaSearch.credentialClass !== 'platform_api_key'
    || exaContents.credentialClass !== 'platform_api_key'
    || frankfurter.credentialClass !== 'keyless'
    || frankfurter.providerRef === exaSearch.providerRef
    || frankfurter.providerOrigin === exaSearch.providerOrigin) {
    throw new Error('operation_market_manifest_provider_heterogeneity_invalid')
  }
  if (manifest.mapping.sourceOperationRef !== exaSearch.operationRef
    || manifest.mapping.targetOperationRef !== exaContents.operationRef) {
    throw new Error('operation_market_manifest_mapping_invalid')
  }
  const maximumAttemptCost = manifest.operations.reduce((total, entry) => total + entry.maximumProviderCostMinor, 0)
  if (manifest.spend.maximumAttemptCostMinor !== maximumAttemptCost
    || manifest.spend.maximumProgramCostMinor !== maximumAttemptCost * 2) {
    throw new Error('operation_market_manifest_spend_invalid')
  }
}
