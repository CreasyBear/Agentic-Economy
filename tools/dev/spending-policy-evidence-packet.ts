import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { parseArgs } from '../ae/lib/args'

import {
  createDevelopmentSpendingPolicyGrantVerifier,
  issueSpendingPolicy,
  SpendingPolicyStore,
  verifiedGrantMatchesSpendingPolicy,
  type SpendingPolicySnapshot,
  type VerifiedSpendingPolicyGrant,
} from '../../src/modules/action-execution'
import { executeDevelopmentProviderToolAction } from './fixtures/provider-tool/development-provider-tool.actions'
import {
  providerToolActor,
  providerToolInput,
  developmentProviderToolNow,
} from './fixtures/provider-tool/development-provider-tool-fixture'
import {
  createDevelopmentProviderToolSpendingPolicyService,
} from './fixtures/provider-tool/development-provider-tool-spending-policy'
import { projectDurableRun } from './fixtures/provider-tool/development-provider-tool-packet'
import { createDevelopmentProviderToolProvider } from './fixtures/provider-tool/development-provider-tool-provider'
import { runProviderToolReconciliation } from './fixtures/provider-tool/development-provider-tool-recovery'
import { runProviderToolExecution } from './fixtures/provider-tool/development-provider-tool-runner'
import {
  addExactAmounts,
  compareExactAmounts,
  type ExactAmount,
} from '../../src/modules/money/public'
import {
  captureOfficialEvidenceProvenance,
  verifyOfficialEvidenceProvenance,
  type EvidenceProvenanceV1,
} from './evidence-provenance'

type ProviderToolExecutionRecord = Readonly<{
  executionRef: string
  origin: 'request_owned' | 'standalone'
  events: readonly Readonly<{ kind: string; executionRef?: string; actionId?: string }>[]
  durable: ReturnType<typeof projectDurableRun>
}>

export type SpendingPolicyPacketEvidence = Readonly<{
  environment: 'MOCK/DEVELOPMENT ONLY'
  gitRevision: string
  action: Readonly<{ id: string; version: string }>
  spendingPolicySnapshot: SpendingPolicySnapshot
  grantEvidence: VerifiedSpendingPolicyGrant
  operations: readonly ProviderToolExecutionRecord[]
  observations: Readonly<{
    principalGrantDecisions: number
    spendingPolicyAuthorizations: number
    providerReleases: number
    concurrentRefusal: string
    scopeRefusal: string
    compensationCases: readonly Readonly<{
      stage: string
      refusal: string
      providerEffects: number
      heldCount: number
      useState: string
    }>[]
    exceptionCases: readonly Readonly<{
      stage: 'reconstruction' | 'pre_release_execution' | 'post_release_execution'
      refusal: string
      providerEffects: number
      heldCount: number
      useState: string
      secondEffectRefusal?: string
    }>[]
    revokeRace: Readonly<{ refusal: string; providerEffects: number; useState: string }>
    reconciliations: readonly Readonly<{
      authorityUseRef: string
      executionRef: string
      attemptRef: string
      evidenceRef: string
      resolution: string
      useState: string
    }>[]
  }>
  comparison: Readonly<{
    approveEachPrincipalDecisionsForTwoInvocations: 2
    spendingPolicyPrincipalGrantDecisions: number
    spendingPolicyRepeatPrincipalDecisions: number
    exactAuthorityUses: number
  }>
  claimCeiling: string
}>

export type SpendingPolicyPacket = Readonly<{
  schema: 'ae.bounded-mandate-development-evidence:v3'
  checksum: string
  provenance: EvidenceProvenanceV1
  evidence: SpendingPolicyPacketEvidence
}>

const now = developmentProviderToolNow()
const requestOrigin = { kind: 'request_owned', requestRef: 'mock:request:packet', revision: 1 } as const
const principalRef = providerToolActor(requestOrigin).principalRef
const callerRef = providerToolActor(requestOrigin).callerRef
const standaloneOrigin = { kind: 'standalone', principalRef, callerRef } as const
const officialClaimCeiling =
  'Labelled local in-process development semantics only; no deployment, provider fulfilment, production safety, or customer value.'

function createIssuedStore(maximumConcurrentReservations = 2) {
  const spendingPolicyDecision = issueSpendingPolicy({
    spendingPolicyRef: 'mock:packet:standing-mandate',
    version: 1,
    generation: 1,
    grantorRef: 'mock:grantor:customer',
    principalRef,
    delegateRef: 'mock:delegate:agent',
    callerRef,
    issuedAt: now,
    scope: {
      objective: 'Complete suitable scheduled provider effects.',
      action: { id: executeDevelopmentProviderToolAction.id, version: 'v1' },
      providerRefs: ['mock:provider:calendar'],
      recipientRefs: ['mock:provider:calendar'],
      purposes: ['create_development_effect'],
      allowedDataFields: ['customer.name', 'customer.email'],
      maximumSpend: { currency: 'AUD', units: '0', exponent: 2 },
      maximumActionCount: 8,
      maximumConcurrentReservations,
      startsAt: now,
      expiresAt: '2026-07-19T05:00:00.000Z',
      permittedFallbacks: ['none'],
      riskCeiling: 'development_provider_operation_zero_charge',
    },
  })
  if (spendingPolicyDecision.kind === 'refused') {
    throw new Error(`bounded_mandate_evidence_construction_refused:${spendingPolicyDecision.code}`)
  }
  const spendingPolicy = spendingPolicyDecision.value
  const verifier = createDevelopmentSpendingPolicyGrantVerifier({
    admittedSpendingPolicyDigest: spendingPolicy.digest,
    evidenceRef: 'mock:packet:grant-evidence',
    verifierRef: 'mock:packet:grant-verifier',
    source: 'mock:authenticated-principal-grant:v1',
    freshUntil: '2026-07-19T04:30:00.000Z',
  })
  const grant = verifier(spendingPolicy, now)
  if (!grant.authenticated) throw new Error(grant.reason)
  const store = new SpendingPolicyStore()
  const issued = store.issue(spendingPolicy, grant, now)
  if (issued.kind === 'refused') throw new Error(issued.code)
  const service = createDevelopmentProviderToolSpendingPolicyService({
    store,
    authenticatedDelegate: { delegateRef: spendingPolicy.delegateRef, principalRef, callerRef },
    now: developmentProviderToolNow,
  })
  return { store, service, spendingPolicy, grant }
}

export async function runSpendingPolicyDevelopmentEvidence(): Promise<SpendingPolicyPacketEvidence> {
  const provider = createDevelopmentProviderToolProvider()
  const slot = await provider.availability()
  const issued = createIssuedStore()
  let activeStore = issued.store
  let activeService = issued.service
  const operations = []
  for (const [index, origin] of [requestOrigin, standaloneOrigin].entries()) {
    const run = await runProviderToolExecution({
      provider,
      operation: providerToolInput(slot, principalRef, `mock:packet:success:${index}`),
      origin,
      ref: `packet-success-${index}`,
      spendingPolicy: {
        service: activeService,
        spendingPolicyRef: issued.spendingPolicy.spendingPolicyRef,
        authorityUseRef: `mock:packet:use:success:${index}`,
        ...(index === 0 ? {
          reconstructBeforeRelease: () => {
            activeStore = new SpendingPolicyStore(structuredClone(activeStore.exportSnapshot()))
            activeService = createDevelopmentProviderToolSpendingPolicyService({
              store: activeStore,
              authenticatedDelegate: {
                delegateRef: issued.spendingPolicy.delegateRef,
                principalRef,
                callerRef,
              },
              now: developmentProviderToolNow,
            })
            return activeService
          },
        } : {}),
      },
    })
    operations.push({
      executionRef: run.view.executionRef,
      origin: origin.kind,
      events: run.events,
      durable: projectDurableRun(run),
    })
  }

  const unknownReleased = await runProviderToolReconciliation({
    provider,
    operation: providerToolInput(slot, principalRef, 'mock:packet:unknown-released'),
    origin: standaloneOrigin,
    resolution: 'released',
    spendingPolicy: {
      service: activeService,
      spendingPolicyRef: issued.spendingPolicy.spendingPolicyRef,
      authorityUseRef: 'mock:packet:use:unknown-released',
    },
    ref: 'packet-unknown-released',
    evidenceRef: 'mock:packet:evidence:unknown-released',
  })
  const unknownNotReleased = await runProviderToolReconciliation({
    provider,
    operation: providerToolInput(slot, principalRef, 'mock:packet:unknown-not-released'),
    origin: standaloneOrigin,
    resolution: 'not_released',
    spendingPolicy: {
      service: activeService,
      spendingPolicyRef: issued.spendingPolicy.spendingPolicyRef,
      authorityUseRef: 'mock:packet:use:unknown-not-released',
    },
    ref: 'packet-unknown-not-released',
    evidenceRef: 'mock:packet:evidence:unknown-not-released',
  })
  for (const recovery of [unknownReleased, unknownNotReleased]) {
    operations.push({
      executionRef: recovery.reconciled.executionRef,
      origin: recovery.uncertain.origin.kind,
      events: recovery.uncertain.events,
      durable: projectDurableRun({
        ...recovery.uncertain,
        view: recovery.reconciled,
      }),
    })
  }

  const concurrency = createIssuedStore(1)
  const firstUse = {
    authorityUseRef: 'mock:packet:concurrency:1', spendingPolicyRef: concurrency.spendingPolicy.spendingPolicyRef,
    spendingPolicyVersion: 1, spendingPolicyGeneration: 1, callerRef, principalRef,
    delegateRef: concurrency.spendingPolicy.delegateRef, executionRef: 'mock:packet:concurrency-invocation:1',
    action: concurrency.spendingPolicy.scope.action, preparedMaterialDigest: 'sha256:prepared:1',
    providerRef: slot.providerRef, recipientRef: slot.providerRef,
    purpose: 'create_development_effect', dataFields: ['customer.name', 'customer.email'],
    reservedSpend: { currency: 'AUD', units: '0', exponent: 2 }, fallbackRef: null,
    risk: 'development_provider_operation_zero_charge', effectGeneration: 1,
  } as const
  if (concurrency.store.reserve(firstUse, now).kind === 'refused') throw new Error('packet_concurrency_setup_refused')
  const concurrent = concurrency.store.reserve({
    ...firstUse,
    authorityUseRef: 'mock:packet:concurrency:2',
    executionRef: 'mock:packet:concurrency-invocation:2',
  }, now)

  const scope = activeStore.reserve({
    ...firstUse,
    authorityUseRef: 'mock:packet:scope-refusal',
    spendingPolicyRef: issued.spendingPolicy.spendingPolicyRef,
    providerRef: 'mock:provider:wrong',
  }, now)

  const compensationCases = []
  for (const [stage, override] of [
    ['standing_authorization', { developmentAuthorizationVersionOverride: 99 }],
    ['acquisition', { developmentAcquisitionVersionOverride: 99 }],
  ] as const) {
    const compensation = createIssuedStore()
    const compensationProvider = createDevelopmentProviderToolProvider()
    const compensationSlot = await compensationProvider.availability()
    const authorityUseRef = `mock:packet:use:compensation:${stage}`
    let refusal = 'none'
    try {
      await runProviderToolExecution({
        provider: compensationProvider,
        operation: providerToolInput(compensationSlot, principalRef, `mock:packet:operation:compensation:${stage}`),
        origin: standaloneOrigin,
        ref: `packet-compensation-${stage}`,
        spendingPolicy: {
          service: compensation.service,
          spendingPolicyRef: compensation.spendingPolicy.spendingPolicyRef,
          authorityUseRef,
          ...override,
        },
      })
    } catch (error) {
      refusal = error instanceof Error ? error.message : 'unknown'
    }
    compensationCases.push({
      stage,
      refusal,
      providerEffects: compensationProvider.effectCount(),
      heldCount: compensation.store.capacity(compensation.spendingPolicy.spendingPolicyRef).reservedCount,
      useState: compensation.store.inspectUse(authorityUseRef)?.state ?? 'missing',
    })
  }

  const exceptionCases = []
  for (const stage of ['reconstruction', 'pre_release_execution', 'post_release_execution'] as const) {
    const exception = createIssuedStore(1)
    const exceptionProvider = createDevelopmentProviderToolProvider()
    const exceptionSlot = await exceptionProvider.availability()
    const authorityUseRef = `mock:packet:use:exception:${stage}`
    let refusal = 'none'
    try {
      await runProviderToolExecution({
        provider: exceptionProvider,
        operation: providerToolInput(exceptionSlot, principalRef, `mock:packet:operation:exception:${stage}`),
        origin: standaloneOrigin,
        ref: `packet-exception-${stage}`,
        ...(stage === 'post_release_execution' ? { corruptSourceResultAfterRelease: true } : {}),
        spendingPolicy: {
          service: exception.service,
          spendingPolicyRef: exception.spendingPolicy.spendingPolicyRef,
          authorityUseRef,
          ...(stage === 'reconstruction' ? {
            reconstructBeforeRelease: () => exception.service,
            throwDuringReconstruction: true,
          } : {}),
          ...(stage === 'pre_release_execution' ? {
            throwFromReleaseFenceBeforeProvider: true,
          } : {}),
        },
      })
    } catch (error) {
      refusal = error instanceof Error ? error.message : 'unknown'
    }
    let secondEffectRefusal: string | undefined
    if (stage === 'post_release_execution') {
      try {
        await runProviderToolExecution({
          provider: exceptionProvider,
          operation: providerToolInput(exceptionSlot, principalRef, 'mock:packet:operation:exception:second'),
          origin: standaloneOrigin,
          ref: 'packet-exception-second',
          spendingPolicy: {
            service: exception.service,
            spendingPolicyRef: exception.spendingPolicy.spendingPolicyRef,
            authorityUseRef: 'mock:packet:use:exception:second',
          },
        })
      } catch (error) {
        secondEffectRefusal = error instanceof Error ? error.message : 'unknown'
      }
    }
    exceptionCases.push({
      stage,
      refusal,
      providerEffects: exceptionProvider.effectCount(),
      heldCount: exception.store.capacity(exception.spendingPolicy.spendingPolicyRef).reservedCount,
      useState: exception.store.inspectUse(authorityUseRef)?.state ?? 'missing',
      ...(secondEffectRefusal === undefined ? {} : { secondEffectRefusal }),
    })
  }

  const revoke = createIssuedStore()
  let revokeRefusal = 'none'
  const effectsBeforeRevoke = provider.effectCount()
  try {
    await runProviderToolExecution({
      provider,
      operation: providerToolInput(slot, principalRef, 'mock:packet:revoke-race'),
      origin: standaloneOrigin,
      ref: 'packet-revoke-race',
      spendingPolicy: {
        service: revoke.service,
        spendingPolicyRef: revoke.spendingPolicy.spendingPolicyRef,
        authorityUseRef: 'mock:packet:use:revoke-race',
        afterEffect: () => {
          const result = revoke.store.revoke({
            spendingPolicyRef: revoke.spendingPolicy.spendingPolicyRef,
            expectedGeneration: 1,
            reason: 'Development revoke race.',
            revokedAt: '2026-07-19T04:00:01.000Z',
          })
          if (result.kind === 'refused') throw new Error(result.code)
        },
      },
    })
  } catch (error) {
    revokeRefusal = error instanceof Error ? error.message : 'unknown'
  }

  const snapshot = activeStore.exportSnapshot()
  new SpendingPolicyStore(structuredClone(snapshot))
  return {
    environment: 'MOCK/DEVELOPMENT ONLY',
    gitRevision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    action: { id: executeDevelopmentProviderToolAction.id, version: 'v1' },
    spendingPolicySnapshot: snapshot,
    grantEvidence: issued.grant,
    operations,
    observations: {
      principalGrantDecisions: snapshot.grants.length,
      spendingPolicyAuthorizations: operations.filter(({ events }) =>
        events.some(({ kind }) => kind === 'spending_policy_authorization')).length,
      providerReleases: operations.flatMap(({ events }) => events).filter(({ kind }) => kind === 'provider_release').length,
      concurrentRefusal: concurrent.kind === 'refused' ? concurrent.code : 'not_refused',
      scopeRefusal: scope.kind === 'refused' ? scope.code : 'not_refused',
      compensationCases,
      exceptionCases,
      revokeRace: {
        refusal: revokeRefusal,
        providerEffects: provider.effectCount() - effectsBeforeRevoke,
        useState: revoke.store.inspectUse('mock:packet:use:revoke-race')?.state ?? 'missing',
      },
      reconciliations: [
        {
          authorityUseRef: 'mock:packet:use:unknown-released',
          executionRef: unknownReleased.reconciled.executionRef,
          attemptRef: unknownReleased.attempt.attemptRef,
          evidenceRef: unknownReleased.evidence.evidenceRef,
          resolution: unknownReleased.evidence.resolution,
          useState: activeStore.inspectUse('mock:packet:use:unknown-released')?.state ?? 'missing',
        },
        {
          authorityUseRef: 'mock:packet:use:unknown-not-released',
          executionRef: unknownNotReleased.reconciled.executionRef,
          attemptRef: unknownNotReleased.attempt.attemptRef,
          evidenceRef: unknownNotReleased.evidence.evidenceRef,
          resolution: unknownNotReleased.evidence.resolution,
          useState: activeStore.inspectUse('mock:packet:use:unknown-not-released')?.state ?? 'missing',
        },
      ],
    },
    comparison: {
      approveEachPrincipalDecisionsForTwoInvocations: 2,
      spendingPolicyPrincipalGrantDecisions: snapshot.grants.length,
      spendingPolicyRepeatPrincipalDecisions: 0,
      exactAuthorityUses: snapshot.uses.length,
    },
    claimCeiling: 'Labelled local in-process development semantics only; no durable multi-worker CAS, deployment, provider fulfilment, production safety, or customer value.',
  }
}

export function verifySpendingPolicyEvidence(evidence: SpendingPolicyPacketEvidence) {
  const reconstructed = new SpendingPolicyStore(structuredClone(evidence.spendingPolicySnapshot))
  const unique = (values: readonly string[]) => new Set(values).size === values.length
  const executionRefs = evidence.operations.map(({ executionRef }) => executionRef)
  const useRefs = evidence.spendingPolicySnapshot.uses.map(({ authorityUseRef }) => authorityUseRef)
  const attemptRefs = evidence.operations.flatMap(({ durable }) =>
    durable.attempts.map((attempt) => String((attempt as { attemptRef?: string }).attemptRef)))
  const evidenceRefs = evidence.observations.reconciliations.map(({ evidenceRef }) => evidenceRef)
  if (
    evidence.environment !== 'MOCK/DEVELOPMENT ONLY'
    || evidence.action.id !== executeDevelopmentProviderToolAction.id
    || evidence.grantEvidence.digest !== evidence.spendingPolicySnapshot.grants[0]?.digest
    || evidence.spendingPolicySnapshot.mandates[0] === undefined
    || !verifiedGrantMatchesSpendingPolicy(
      evidence.grantEvidence,
      evidence.spendingPolicySnapshot.mandates[0],
      evidence.grantEvidence.verifiedAt,
    )
    || evidence.observations.principalGrantDecisions !== 1
    || evidence.observations.principalGrantDecisions !== evidence.spendingPolicySnapshot.grants.length
    || evidence.comparison.spendingPolicyPrincipalGrantDecisions !== evidence.spendingPolicySnapshot.grants.length
    || evidence.comparison.spendingPolicyRepeatPrincipalDecisions !== 0
    || evidence.observations.spendingPolicyAuthorizations !== evidence.operations.length
    || evidence.observations.concurrentRefusal !== 'spending_policy_concurrency_exhausted'
    || evidence.observations.scopeRefusal !== 'spending_policy_provider_mismatch'
    || evidence.observations.compensationCases.length !== 2
    || evidence.observations.compensationCases.some(({ refusal, providerEffects, heldCount, useState }) =>
      refusal !== 'stale_execution_version'
      || providerEffects !== 0
      || heldCount !== 0
      || useState !== 'not_released')
    || evidence.observations.exceptionCases.length !== 3
    || evidence.observations.exceptionCases.some((exception) => {
      if (exception.stage === 'post_release_execution') {
        return exception.providerEffects !== 1
          || exception.heldCount !== 1
          || exception.useState !== 'uncertain'
          || exception.secondEffectRefusal !== 'spending_policy_concurrency_exhausted'
      }
      return exception.providerEffects !== 0
        || exception.heldCount !== 0
        || exception.useState !== 'not_released'
    })
    || evidence.observations.revokeRace.providerEffects !== 0
    || evidence.observations.revokeRace.useState !== 'not_released'
    || evidence.observations.reconciliations.some(({ resolution, useState }) => resolution !== useState)
    || !unique(executionRefs)
    || !unique(useRefs)
    || !unique(attemptRefs)
    || !unique(evidenceRefs)
  ) throw new Error('bounded_mandate_semantic_verification_refused')
  for (const operation of evidence.operations) {
    const standingAuthorizationIndex = operation.events.findIndex(({ kind }) =>
      kind === 'spending_policy_authorization')
    const providerReleaseIndex = operation.events.findIndex(({ kind }) => kind === 'provider_release')
    if (
      standingAuthorizationIndex < 0
      || (providerReleaseIndex >= 0 && standingAuthorizationIndex >= providerReleaseIndex)
    ) throw new Error('bounded_mandate_event_order_refused')
    const control = operation.durable.controls[0] as {
      executionRef: string
      preparedMaterialDigest: string
      control: {
        acceptedAuthority?: { kind: string; authorityUseRef?: string }
        action: { id: string; contractVersion: string }
        owner: { callerRef: string; principalRef: string }
      }
    }
    const attempt = operation.durable.attempts[0] as {
      executionRef: string
      effectGeneration: number
      idempotency: { materialInputDigest: string }
      release: { state: string }
      outcome: { state: string }
    }
    const useRef = control.control.acceptedAuthority?.authorityUseRef
    const use = useRef === undefined ? undefined : reconstructed.inspectUse(useRef)
    if (
      control.executionRef !== operation.executionRef
      || control.control.acceptedAuthority?.kind !== 'spending_policy_use'
      || use === undefined
      || use.executionRef !== operation.executionRef
      || use.action.id !== control.control.action.id
      || use.action.version !== control.control.action.contractVersion
      || use.preparedMaterialDigest !== control.preparedMaterialDigest
      || use.preparedMaterialDigest !== attempt.idempotency.materialInputDigest
      || use.effectGeneration !== attempt.effectGeneration
      || use.callerRef !== control.control.owner.callerRef
      || use.principalRef !== control.control.owner.principalRef
      || (
        attempt.outcome.state === 'reconciled_released'
        && use.state !== 'released'
      )
      || (
        attempt.outcome.state === 'reconciled_not_released'
        && use.state !== 'not_released'
      )
      || (
        attempt.release.state === 'released'
        && attempt.outcome.state !== 'reconciled_not_released'
        && use.state !== 'released'
      )
    ) throw new Error('bounded_mandate_provider_operation_linkage_refused')
  }
  for (const reconciliation of evidence.observations.reconciliations) {
    const operation = evidence.operations.find(({ executionRef }) =>
      executionRef === reconciliation.executionRef)
    if (
      operation === undefined
      || !operation.durable.attempts.some((attempt) =>
        (attempt as { attemptRef?: string }).attemptRef === reconciliation.attemptRef)
      || reconstructed.inspectUse(reconciliation.authorityUseRef)?.executionRef
        !== reconciliation.executionRef
    ) throw new Error('bounded_mandate_reconciliation_identity_refused')
  }
  const capacity = reconstructed.capacity(evidence.spendingPolicySnapshot.mandates[0]?.spendingPolicyRef ?? '')
  const releasedUses = evidence.spendingPolicySnapshot.uses.filter(({ state }) => state === 'released')
  const heldUses = evidence.spendingPolicySnapshot.uses.filter(({ state }) =>
    state === 'reserved' || state === 'uncertain')
  const expectedConsumedSpend = releasedUses.reduce<ExactAmount | undefined>(
    (sum, use) => sum === undefined ? undefined : addExactAmounts(sum, use.reservedSpend),
    { currency: 'AUD', units: '0', exponent: 2 },
  )
  if (
    capacity.consumedCount !== releasedUses.length
    || capacity.reservedCount !== heldUses.length
    || compareExactAmounts(capacity.consumedSpend, expectedConsumedSpend) !== 0
  ) throw new Error('bounded_mandate_capacity_verification_refused')
  return {
    verdict: 'PASS_FOR_DECLARED_CLASS' as const,
    gitRevision: evidence.gitRevision,
    spendingPolicyRef: evidence.spendingPolicySnapshot.mandates[0]?.spendingPolicyRef,
    authorityUseCount: evidence.spendingPolicySnapshot.uses.length,
  }
}

function checksum(evidence: SpendingPolicyPacketEvidence) {
  return `sha256:${createHash('sha256').update(JSON.stringify(evidence)).digest('hex')}`
}

function commandIdentity(command: 'run' | 'verify', path: string, revision: string) {
  return `bounded-mandate-evidence-packet ${command} ${path} ${revision}`
}

export async function runCli(command: string, path: string, expectedRevision: string) {
  if (command === 'run') {
    const provenance = captureOfficialEvidenceProvenance({
      expectedRevision,
      command: commandIdentity('run', path, expectedRevision),
      claimCeiling: officialClaimCeiling,
    })
    const evidence = {
      ...(await runSpendingPolicyDevelopmentEvidence()),
      gitRevision: provenance.sourceRevision,
    }
    verifySpendingPolicyEvidence(evidence)
    const packet: SpendingPolicyPacket = {
      schema: 'ae.bounded-mandate-development-evidence:v3',
      checksum: checksum(evidence),
      provenance,
      evidence,
    }
    await writeFile(path, `${JSON.stringify(packet, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' })
    return packet
  }
  if (command === 'verify') {
    const packet = JSON.parse(await readFile(path, 'utf8')) as SpendingPolicyPacket
    if (
      packet.schema !== 'ae.bounded-mandate-development-evidence:v3'
      || packet.checksum !== checksum(packet.evidence)
    ) throw new Error('bounded_mandate_packet_checksum_refused')
    verifyOfficialEvidenceProvenance(packet.provenance, {
      expectedRevision,
      command: commandIdentity('run', path, expectedRevision),
    })
    if (packet.evidence.gitRevision !== packet.provenance.sourceRevision) {
      throw new Error('bounded_mandate_packet_revision_refused')
    }
    if (packet.provenance.claimCeiling !== officialClaimCeiling) {
      throw new Error('bounded_mandate_packet_claim_ceiling_refused')
    }
    verifySpendingPolicyEvidence(packet.evidence)
    return packet
  }
  throw new Error('usage: evidence:spending-policy:development -- <run|verify> <path>')
}

if (process.argv[1]?.endsWith('spending-policy-evidence-packet.ts')) {
  const { command, positionals } = parseArgs(process.argv.slice(2))
  const [path, expectedRevision] = positionals
  if (command === undefined || path === undefined || expectedRevision === undefined) {
    throw new Error('command_path_and_revision_required')
  }
  const packet = await runCli(command, path, expectedRevision)
  process.stdout.write(`${packet.checksum}\n${packet.evidence.gitRevision}\n`)
}
