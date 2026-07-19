import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'

import {
  createDevelopmentStandingMandateGrantVerifier,
  issueStandingMandate,
  StandingMandateStore,
  verifiedGrantMatchesMandate,
  type StandingMandateSnapshot,
  type VerifiedStandingMandateGrant,
} from '../../src/modules/action-invocation'
import { executeDevelopmentProviderOperationAction } from '../../src/modules/provider-operation-fixture/development-provider-operation.actions'
import {
  providerOperationActor,
  providerOperationInput,
  developmentProviderOperationNow,
} from '../../src/modules/provider-operation-fixture/development-provider-operation-fixture'
import {
  createDevelopmentProviderOperationMandateService,
} from '../../src/modules/provider-operation-fixture/development-provider-operation-mandate'
import { projectDurableRun } from '../../src/modules/provider-operation-fixture/development-provider-operation-packet'
import { createDevelopmentProviderOperationProvider } from '../../src/modules/provider-operation-fixture/development-provider-operation-provider'
import { runProviderOperationReconciliation } from '../../src/modules/provider-operation-fixture/development-provider-operation-recovery'
import { runProviderOperationInvocation } from '../../src/modules/provider-operation-fixture/development-provider-operation-runner'
import { canonicalDigest } from '../../src/modules/common/canonical-digest'

type ProviderOperationRecord = Readonly<{
  invocationRef: string
  origin: 'request_owned' | 'standalone'
  events: readonly Readonly<{ kind: string; invocationRef?: string; actionId?: string }>[]
  durable: ReturnType<typeof projectDurableRun>
}>

export type BoundedMandatePacketEvidence = Readonly<{
  environment: 'MOCK/DEVELOPMENT ONLY'
  gitRevision: string
  action: Readonly<{ id: string; version: string }>
  mandateSnapshot: StandingMandateSnapshot
  grantEvidence: VerifiedStandingMandateGrant
  operations: readonly ProviderOperationRecord[]
  observations: Readonly<{
    principalGrantDecisions: number
    standingMandateAuthorizations: number
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
      invocationRef: string
      attemptRef: string
      evidenceRef: string
      resolution: string
      useState: string
    }>[]
  }>
  comparison: Readonly<{
    approveEachPrincipalDecisionsForTwoInvocations: 2
    boundedMandatePrincipalGrantDecisions: number
    boundedMandateRepeatPrincipalDecisions: number
    exactAuthorityUses: number
  }>
  claimCeiling: string
}>

export type BoundedMandatePacket = Readonly<{
  schema: 'ae.bounded-mandate-development-evidence:v2'
  checksum: string
  evidence: BoundedMandatePacketEvidence
}>

const now = developmentProviderOperationNow()
const requestOrigin = { kind: 'request_owned', requestRef: 'mock:request:packet', revision: 1 } as const
const principalRef = providerOperationActor(requestOrigin).principalRef
const callerRef = providerOperationActor(requestOrigin).callerRef
const standaloneOrigin = { kind: 'standalone', principalRef, callerRef } as const

function createIssuedStore(maximumConcurrentReservations = 2) {
  const mandate = issueStandingMandate({
    mandateRef: 'mock:packet:standing-mandate',
    version: 1,
    generation: 1,
    grantorRef: 'mock:grantor:customer',
    principalRef,
    delegateRef: 'mock:delegate:agent',
    callerRef,
    issuedAt: now,
    scope: {
      objective: 'Complete suitable scheduled provider effects.',
      action: { id: executeDevelopmentProviderOperationAction.id, version: 'v1' },
      providerRefs: ['mock:provider:calendar'],
      recipientRefs: ['mock:provider:calendar'],
      purposes: ['create_development_effect'],
      allowedDataFields: ['customer.name', 'customer.email'],
      maximumSpend: { amountMinor: 0, currency: 'AUD' },
      maximumActionCount: 8,
      maximumConcurrentReservations,
      startsAt: now,
      expiresAt: '2026-07-19T05:00:00.000Z',
      permittedFallbacks: ['none'],
      riskCeiling: 'development_provider_operation_zero_charge',
    },
  })
  const verifier = createDevelopmentStandingMandateGrantVerifier({
    admittedMandateDigest: mandate.digest,
    evidenceRef: 'mock:packet:grant-evidence',
    verifierRef: 'mock:packet:grant-verifier',
    source: 'mock:authenticated-principal-grant:v1',
    freshUntil: '2026-07-19T04:30:00.000Z',
  })
  const grant = verifier(mandate, now)
  if (!grant.authenticated) throw new Error(grant.reason)
  const store = new StandingMandateStore()
  const issued = store.issue(mandate, grant, now)
  if (issued.kind === 'refused') throw new Error(issued.code)
  const service = createDevelopmentProviderOperationMandateService({
    store,
    authenticatedDelegate: { delegateRef: mandate.delegateRef, principalRef, callerRef },
    now: developmentProviderOperationNow,
  })
  return { store, service, mandate, grant }
}

export async function runBoundedMandateDevelopmentEvidence(): Promise<BoundedMandatePacketEvidence> {
  const provider = createDevelopmentProviderOperationProvider()
  const slot = await provider.availability()
  const issued = createIssuedStore()
  let activeStore = issued.store
  let activeService = issued.service
  const operations = []
  for (const [index, origin] of [requestOrigin, standaloneOrigin].entries()) {
    const run = await runProviderOperationInvocation({
      provider,
      operation: providerOperationInput(slot, principalRef, `mock:packet:success:${index}`),
      origin,
      ref: `packet-success-${index}`,
      boundedMandate: {
        service: activeService,
        mandateRef: issued.mandate.mandateRef,
        authorityUseRef: `mock:packet:use:success:${index}`,
        ...(index === 0 ? {
          reconstructBeforeRelease: () => {
            activeStore = new StandingMandateStore(structuredClone(activeStore.exportSnapshot()))
            activeService = createDevelopmentProviderOperationMandateService({
              store: activeStore,
              authenticatedDelegate: {
                delegateRef: issued.mandate.delegateRef,
                principalRef,
                callerRef,
              },
              now: developmentProviderOperationNow,
            })
            return activeService
          },
        } : {}),
      },
    })
    operations.push({
      invocationRef: run.view.invocationRef,
      origin: origin.kind,
      events: run.events,
      durable: projectDurableRun(run),
    })
  }

  const unknownReleased = await runProviderOperationReconciliation({
    provider,
    operation: providerOperationInput(slot, principalRef, 'mock:packet:unknown-released'),
    origin: standaloneOrigin,
    resolution: 'released',
    boundedMandate: {
      service: activeService,
      mandateRef: issued.mandate.mandateRef,
      authorityUseRef: 'mock:packet:use:unknown-released',
    },
    ref: 'packet-unknown-released',
    evidenceRef: 'mock:packet:evidence:unknown-released',
  })
  const unknownNotReleased = await runProviderOperationReconciliation({
    provider,
    operation: providerOperationInput(slot, principalRef, 'mock:packet:unknown-not-released'),
    origin: standaloneOrigin,
    resolution: 'not_released',
    boundedMandate: {
      service: activeService,
      mandateRef: issued.mandate.mandateRef,
      authorityUseRef: 'mock:packet:use:unknown-not-released',
    },
    ref: 'packet-unknown-not-released',
    evidenceRef: 'mock:packet:evidence:unknown-not-released',
  })
  for (const recovery of [unknownReleased, unknownNotReleased]) {
    operations.push({
      invocationRef: recovery.reconciled.invocationRef,
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
    authorityUseRef: 'mock:packet:concurrency:1', mandateRef: concurrency.mandate.mandateRef,
    mandateVersion: 1, mandateGeneration: 1, callerRef, principalRef,
    delegateRef: concurrency.mandate.delegateRef, invocationRef: 'mock:packet:concurrency-invocation:1',
    action: concurrency.mandate.scope.action, preparedMaterialDigest: 'sha256:prepared:1',
    providerRef: slot.providerRef, recipientRef: slot.providerRef,
    purpose: 'create_development_effect', dataFields: ['customer.name', 'customer.email'],
    reservedSpend: { amountMinor: 0, currency: 'AUD' }, fallbackRef: null,
    risk: 'development_provider_operation_zero_charge', effectGeneration: 1,
  } as const
  if (concurrency.store.reserve(firstUse, now).kind === 'refused') throw new Error('packet_concurrency_setup_refused')
  const concurrent = concurrency.store.reserve({
    ...firstUse,
    authorityUseRef: 'mock:packet:concurrency:2',
    invocationRef: 'mock:packet:concurrency-invocation:2',
  }, now)

  const scope = activeStore.reserve({
    ...firstUse,
    authorityUseRef: 'mock:packet:scope-refusal',
    mandateRef: issued.mandate.mandateRef,
    providerRef: 'mock:provider:wrong',
  }, now)

  const compensationCases = []
  for (const [stage, override] of [
    ['standing_authorization', { developmentAuthorizationVersionOverride: 99 }],
    ['acquisition', { developmentAcquisitionVersionOverride: 99 }],
  ] as const) {
    const compensation = createIssuedStore()
    const compensationProvider = createDevelopmentProviderOperationProvider()
    const compensationSlot = await compensationProvider.availability()
    const authorityUseRef = `mock:packet:use:compensation:${stage}`
    let refusal = 'none'
    try {
      await runProviderOperationInvocation({
        provider: compensationProvider,
        operation: providerOperationInput(compensationSlot, principalRef, `mock:packet:operation:compensation:${stage}`),
        origin: standaloneOrigin,
        ref: `packet-compensation-${stage}`,
        boundedMandate: {
          service: compensation.service,
          mandateRef: compensation.mandate.mandateRef,
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
      heldCount: compensation.store.capacity(compensation.mandate.mandateRef).reservedCount,
      useState: compensation.store.inspectUse(authorityUseRef)?.state ?? 'missing',
    })
  }

  const exceptionCases = []
  for (const stage of ['reconstruction', 'pre_release_execution', 'post_release_execution'] as const) {
    const exception = createIssuedStore(1)
    const exceptionProvider = createDevelopmentProviderOperationProvider()
    const exceptionSlot = await exceptionProvider.availability()
    const authorityUseRef = `mock:packet:use:exception:${stage}`
    let refusal = 'none'
    try {
      await runProviderOperationInvocation({
        provider: exceptionProvider,
        operation: providerOperationInput(exceptionSlot, principalRef, `mock:packet:operation:exception:${stage}`),
        origin: standaloneOrigin,
        ref: `packet-exception-${stage}`,
        ...(stage === 'post_release_execution' ? { corruptSourceResultAfterRelease: true } : {}),
        boundedMandate: {
          service: exception.service,
          mandateRef: exception.mandate.mandateRef,
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
        await runProviderOperationInvocation({
          provider: exceptionProvider,
          operation: providerOperationInput(exceptionSlot, principalRef, 'mock:packet:operation:exception:second'),
          origin: standaloneOrigin,
          ref: 'packet-exception-second',
          boundedMandate: {
            service: exception.service,
            mandateRef: exception.mandate.mandateRef,
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
      heldCount: exception.store.capacity(exception.mandate.mandateRef).reservedCount,
      useState: exception.store.inspectUse(authorityUseRef)?.state ?? 'missing',
      ...(secondEffectRefusal === undefined ? {} : { secondEffectRefusal }),
    })
  }

  const revoke = createIssuedStore()
  let revokeRefusal = 'none'
  const effectsBeforeRevoke = provider.effectCount()
  try {
    await runProviderOperationInvocation({
      provider,
      operation: providerOperationInput(slot, principalRef, 'mock:packet:revoke-race'),
      origin: standaloneOrigin,
      ref: 'packet-revoke-race',
      boundedMandate: {
        service: revoke.service,
        mandateRef: revoke.mandate.mandateRef,
        authorityUseRef: 'mock:packet:use:revoke-race',
        afterEffect: () => {
          const result = revoke.store.revoke({
            mandateRef: revoke.mandate.mandateRef,
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
  new StandingMandateStore(structuredClone(snapshot))
  return {
    environment: 'MOCK/DEVELOPMENT ONLY',
    gitRevision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    action: { id: executeDevelopmentProviderOperationAction.id, version: 'v1' },
    mandateSnapshot: snapshot,
    grantEvidence: issued.grant,
    operations,
    observations: {
      principalGrantDecisions: snapshot.grants.length,
      standingMandateAuthorizations: operations.filter(({ events }) =>
        events.some(({ kind }) => kind === 'standing_mandate_authorization')).length,
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
          invocationRef: unknownReleased.reconciled.invocationRef,
          attemptRef: unknownReleased.attempt.attemptRef,
          evidenceRef: unknownReleased.evidence.evidenceRef,
          resolution: unknownReleased.evidence.resolution,
          useState: activeStore.inspectUse('mock:packet:use:unknown-released')?.state ?? 'missing',
        },
        {
          authorityUseRef: 'mock:packet:use:unknown-not-released',
          invocationRef: unknownNotReleased.reconciled.invocationRef,
          attemptRef: unknownNotReleased.attempt.attemptRef,
          evidenceRef: unknownNotReleased.evidence.evidenceRef,
          resolution: unknownNotReleased.evidence.resolution,
          useState: activeStore.inspectUse('mock:packet:use:unknown-not-released')?.state ?? 'missing',
        },
      ],
    },
    comparison: {
      approveEachPrincipalDecisionsForTwoInvocations: 2,
      boundedMandatePrincipalGrantDecisions: snapshot.grants.length,
      boundedMandateRepeatPrincipalDecisions: 0,
      exactAuthorityUses: snapshot.uses.length,
    },
    claimCeiling: 'Labelled local in-process development semantics only; no durable multi-worker CAS, deployment, provider fulfilment, production safety, or customer value.',
  }
}

export function verifyBoundedMandateEvidence(evidence: BoundedMandatePacketEvidence) {
  const reconstructed = new StandingMandateStore(structuredClone(evidence.mandateSnapshot))
  const unique = (values: readonly string[]) => new Set(values).size === values.length
  const invocationRefs = evidence.operations.map(({ invocationRef }) => invocationRef)
  const useRefs = evidence.mandateSnapshot.uses.map(({ authorityUseRef }) => authorityUseRef)
  const attemptRefs = evidence.operations.flatMap(({ durable }) =>
    durable.attempts.map((attempt) => String((attempt as { attemptRef?: string }).attemptRef)))
  const evidenceRefs = evidence.observations.reconciliations.map(({ evidenceRef }) => evidenceRef)
  if (
    evidence.environment !== 'MOCK/DEVELOPMENT ONLY'
    || evidence.action.id !== executeDevelopmentProviderOperationAction.id
    || evidence.grantEvidence.digest !== evidence.mandateSnapshot.grants[0]?.digest
    || evidence.mandateSnapshot.mandates[0] === undefined
    || !verifiedGrantMatchesMandate(
      evidence.grantEvidence,
      evidence.mandateSnapshot.mandates[0],
      evidence.grantEvidence.verifiedAt,
    )
    || evidence.observations.principalGrantDecisions !== 1
    || evidence.observations.principalGrantDecisions !== evidence.mandateSnapshot.grants.length
    || evidence.comparison.boundedMandatePrincipalGrantDecisions !== evidence.mandateSnapshot.grants.length
    || evidence.comparison.boundedMandateRepeatPrincipalDecisions !== 0
    || evidence.observations.standingMandateAuthorizations !== evidence.operations.length
    || evidence.observations.concurrentRefusal !== 'mandate_concurrency_exhausted'
    || evidence.observations.scopeRefusal !== 'mandate_provider_mismatch'
    || evidence.observations.compensationCases.length !== 2
    || evidence.observations.compensationCases.some(({ refusal, providerEffects, heldCount, useState }) =>
      refusal !== 'stale_invocation_version'
      || providerEffects !== 0
      || heldCount !== 0
      || useState !== 'not_released')
    || evidence.observations.exceptionCases.length !== 3
    || evidence.observations.exceptionCases.some((exception) => {
      if (exception.stage === 'post_release_execution') {
        return exception.providerEffects !== 1
          || exception.heldCount !== 1
          || exception.useState !== 'uncertain'
          || exception.secondEffectRefusal !== 'mandate_concurrency_exhausted'
      }
      return exception.providerEffects !== 0
        || exception.heldCount !== 0
        || exception.useState !== 'not_released'
    })
    || evidence.observations.revokeRace.providerEffects !== 0
    || evidence.observations.revokeRace.useState !== 'not_released'
    || evidence.observations.reconciliations.some(({ resolution, useState }) => resolution !== useState)
    || !unique(invocationRefs)
    || !unique(useRefs)
    || !unique(attemptRefs)
    || !unique(evidenceRefs)
  ) throw new Error('bounded_mandate_semantic_verification_refused')
  for (const operation of evidence.operations) {
    const standingAuthorizationIndex = operation.events.findIndex(({ kind }) =>
      kind === 'standing_mandate_authorization')
    const providerReleaseIndex = operation.events.findIndex(({ kind }) => kind === 'provider_release')
    if (
      standingAuthorizationIndex < 0
      || (providerReleaseIndex >= 0 && standingAuthorizationIndex >= providerReleaseIndex)
    ) throw new Error('bounded_mandate_event_order_refused')
    const control = operation.durable.controls[0] as {
      invocationRef: string
      preparedMaterialDigest: string
      control: {
        acceptedAuthority?: { kind: string; authorityUseRef?: string }
        action: { id: string; contractVersion: string }
        owner: { callerRef: string; principalRef: string }
      }
    }
    const attempt = operation.durable.attempts[0] as {
      invocationRef: string
      effectGeneration: number
      idempotency: { materialInputDigest: string }
      release: { state: string }
      outcome: { state: string }
    }
    const useRef = control.control.acceptedAuthority?.authorityUseRef
    const use = useRef === undefined ? undefined : reconstructed.inspectUse(useRef)
    if (
      control.invocationRef !== operation.invocationRef
      || control.control.acceptedAuthority?.kind !== 'standing_mandate_use'
      || use === undefined
      || use.invocationRef !== operation.invocationRef
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
    const operation = evidence.operations.find(({ invocationRef }) =>
      invocationRef === reconciliation.invocationRef)
    if (
      operation === undefined
      || !operation.durable.attempts.some((attempt) =>
        (attempt as { attemptRef?: string }).attemptRef === reconciliation.attemptRef)
      || reconstructed.inspectUse(reconciliation.authorityUseRef)?.invocationRef
        !== reconciliation.invocationRef
    ) throw new Error('bounded_mandate_reconciliation_identity_refused')
  }
  const capacity = reconstructed.capacity(evidence.mandateSnapshot.mandates[0]?.mandateRef ?? '')
  const releasedUses = evidence.mandateSnapshot.uses.filter(({ state }) => state === 'released')
  const heldUses = evidence.mandateSnapshot.uses.filter(({ state }) =>
    state === 'reserved' || state === 'uncertain')
  if (
    capacity.consumedCount !== releasedUses.length
    || capacity.reservedCount !== heldUses.length
    || capacity.consumedSpendMinor
      !== releasedUses.reduce((sum, use) => sum + use.reservedSpend.amountMinor, 0)
  ) throw new Error('bounded_mandate_capacity_verification_refused')
  return {
    verdict: 'PASS_FOR_DECLARED_CLASS' as const,
    gitRevision: evidence.gitRevision,
    mandateRef: evidence.mandateSnapshot.mandates[0]?.mandateRef,
    authorityUseCount: evidence.mandateSnapshot.uses.length,
  }
}

function checksum(evidence: BoundedMandatePacketEvidence) {
  return `sha256:${createHash('sha256').update(JSON.stringify(evidence)).digest('hex')}`
}

export async function runCli(command: string, path: string) {
  if (command === 'run') {
    const evidence = await runBoundedMandateDevelopmentEvidence()
    verifyBoundedMandateEvidence(evidence)
    const packet: BoundedMandatePacket = {
      schema: 'ae.bounded-mandate-development-evidence:v2',
      checksum: checksum(evidence),
      evidence,
    }
    await writeFile(path, `${JSON.stringify(packet, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' })
    return packet
  }
  if (command === 'verify') {
    const packet = JSON.parse(await readFile(path, 'utf8')) as BoundedMandatePacket
    if (
      packet.schema !== 'ae.bounded-mandate-development-evidence:v2'
      || packet.checksum !== checksum(packet.evidence)
    ) throw new Error('bounded_mandate_packet_checksum_refused')
    verifyBoundedMandateEvidence(packet.evidence)
    return packet
  }
  throw new Error('usage: evidence:bounded-mandate:development -- <run|verify> <path>')
}

if (process.argv[1]?.endsWith('bounded-mandate-evidence-packet.ts')) {
  const command = process.argv[2]
  const path = process.argv[3]
  if (command === undefined || path === undefined) throw new Error('command_and_path_required')
  const packet = await runCli(command, path)
  process.stdout.write(`${packet.checksum}\n${packet.evidence.gitRevision}\n`)
}
