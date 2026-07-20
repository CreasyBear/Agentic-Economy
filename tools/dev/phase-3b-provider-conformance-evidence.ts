import { execFileSync } from 'node:child_process'
import { writeFile } from 'node:fs/promises'
import { basename, resolve } from 'node:path'

import { canonicalDigest } from '../../src/modules/common/canonical-digest'
import type { StableHashValue } from '../../src/modules/common/stable-hash'
import {
  buildDevelopmentAlternatePublishedOperationEvidence,
  verifyDevelopmentAlternatePublishedOperationEvidence,
} from '../../src/modules/capability-supply/development-alternate-published-operation-evidence'
import {
  buildDevelopmentPublishedOperationEvidence,
  verifyDevelopmentPublishedOperationEvidence,
} from '../../src/modules/capability-supply/development-published-operation-evidence'
import { runDevelopmentProviderConformanceScenario } from '../../src/modules/capability-supply/development-provider-conformance-scenario'

import { captureOfficialEvidenceProvenance } from './evidence-provenance'

const schema = 'ae.phase-3b-provider-conformance-evidence:v1' as const
const claimCeiling = 'development evidence-tool mechanics; no hosted behavior, real payment, independent settlement, provider fulfilment, production safety, or customer value'

function git(args: string[]) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim()
}

function npmVersion() {
  return `npm/${execFileSync('npm', ['--version'], { encoding: 'utf8' }).trim()}`
}

function digest(value: unknown) {
  return canonicalDigest(value as StableHashValue)
}

function command(path: string, revision: string) {
  return `node --import tsx tools/dev/phase-3b-provider-conformance-evidence.ts run ${resolve(path)} ${revision}`
}

function state(value: any) {
  return {
    A: { snapshotDigest: value.A.snapshotDigest, counters: value.A.counters },
    B: { snapshotDigest: value.B.snapshotDigest, counters: value.B.counters },
  }
}

function disposition(value: any) {
  return { kind: value.kind, ...('code' in value ? { code: value.code } : {}) }
}

function switchIdentity(value: any) {
  const attempt = value.view.attempts[0]
  return {
    invocationRef: value.prepared.invocationRef,
    authorityRef: value.prepared.authority?.reference,
    paymentIdentifier: value.paymentAttempt?.paymentIdentifier,
    attemptRef: attempt?.attemptRef,
    effectGeneration: attempt?.effectGeneration,
  }
}

function provider(value: any, rawPayload: unknown) {
  const payment = value.operation.identity.payment
  if (payment.kind !== 'x402') throw new Error('phase_3b_x402_identity_required')
  if (value.normalized.kind !== 'accepted') throw new Error('phase_3b_normalized_result_required')
  return {
    businessId: value.operation.identity.businessId,
    operationId: value.operation.operationId,
    revision: value.operation.identity.publicationRevision,
    endpoint: value.operation.identity.endpoint.url,
    method: value.operation.identity.endpoint.method,
    resource: value.operation.identity.endpoint.resource,
    fixedUsdMinorAmount: value.operation.identity.price.amountMinor,
    x402: {
      scheme: JSON.parse(value.operation.transport.configJson).scheme,
      network: payment.network,
      asset: payment.asset,
      payee: payment.payTo,
    },
    materialDigest: value.operation.materialDigest,
    rawPayload,
    rawDigest: digest(rawPayload),
    normalized: {
      fields: {
        base: value.normalized.result.base,
        quote: value.normalized.result.quote,
        price: value.normalized.result.price,
        observedAt: value.normalized.result.observedAt,
        receivedAt: value.normalized.result.receivedAt,
        freshness: value.normalized.result.freshness,
      },
      source: value.normalized.result.source,
      rawEvidenceRef: value.normalized.result.rawEvidenceRef,
    },
    effectCounters: value.counters,
  }
}

export async function buildPhase3bProviderConformanceEvidence(path: string, requestedRevision: string) {
  if (requestedRevision !== 'HEAD' && !/^[0-9a-f]{40}$/.test(requestedRevision)) {
    throw new Error('evidence_revision_invalid')
  }
  const resolvedRevision = git(['rev-parse', requestedRevision])
  const sourceTree = git(['rev-parse', `${resolvedRevision}^{tree}`])
  const commandIdentity = command(path, requestedRevision)
  const dirtyMaterial = git(['status', '--porcelain=v1', '--untracked-files=all'])
  const provenance = requestedRevision === 'HEAD'
    ? {
        requestedRevision,
        sourceRevision: resolvedRevision,
        sourceTree,
        command: commandIdentity,
        nodeVersion: process.version,
        packageManager: npmVersion(),
        environment: 'MOCK/DEVELOPMENT ONLY',
        evidenceClass: 'working_tree_demonstration',
        dirtyState: dirtyMaterial ? 'dirty' : 'clean',
        dirtyStateDigest: digest(dirtyMaterial),
        claimCeiling,
      }
    : {
        requestedRevision,
        ...(() => {
          const official = captureOfficialEvidenceProvenance({
            expectedRevision: requestedRevision,
            command: commandIdentity,
            claimCeiling,
          })
          return {
            sourceRevision: official.sourceRevision,
            sourceTree: official.sourceTree,
            command: official.command,
            nodeVersion: official.nodeVersion,
            packageManager: official.packageManager,
            environment: official.environment,
          }
        })(),
        evidenceClass: 'clean_revision_local_packet',
        dirtyState: 'clean',
        dirtyStateDigest: digest(''),
        claimCeiling,
      }

  const sourceA = buildDevelopmentPublishedOperationEvidence()
  const sourceB = buildDevelopmentAlternatePublishedOperationEvidence()
  verifyDevelopmentPublishedOperationEvidence(sourceA)
  verifyDevelopmentAlternatePublishedOperationEvidence(sourceB)
  const scenario = await runDevelopmentProviderConformanceScenario()
  const A = scenario.successes.A
  const B = scenario.successes.B
  if (A.executed.kind !== 'accepted' || B.executed.kind !== 'accepted') {
    throw new Error('phase_3b_semantics_missing')
  }
  const material = {
    schema,
    provenance,
    providers: {
      A: provider(A, scenario.rawPayloads.A),
      B: provider(B, scenario.rawPayloads.B),
    },
    shared: {
      schemaIdentity: A.executed.value.semantics.schema,
      semanticDigests: {
        A: {
          human: A.executed.value.human.semanticDigest,
          agent: A.executed.value.agent.semanticDigest,
        },
        B: {
          human: B.executed.value.human.semanticDigest,
          agent: B.executed.value.agent.semanticDigest,
        },
      },
    },
    switches: {
      A: switchIdentity(scenario.uncertainA),
      B: switchIdentity(scenario.explicitBAfterANotSettled),
    },
    dispositions: {
      commands: scenario.crossRefusals.map((item) => ({
        caseName: item.caseName,
        source: item.source,
        outcome: disposition(item.outcome),
        before: state(item.before),
        after: state(item.after),
      })),
      reconciliationReplay: {
        caseName: scenario.reconciliationReplay.caseName,
        source: scenario.reconciliationReplay.source,
        outcome: disposition(scenario.reconciliationReplay.outcome),
        before: state(scenario.reconciliationReplay.before),
        after: state(scenario.reconciliationReplay.after),
      },
      snapshotRefusals: scenario.restoreRefusals.map((item) => ({
        caseName: item.selected,
        source: item.source,
        outcome: disposition(item.outcome),
        before: {
          snapshotDigest: item.before.snapshotDigest,
          counters: item.before.counters,
        },
        after: {
          snapshotDigest: item.after.snapshotDigest,
          counters: item.after.counters,
        },
      })),
      crossedRawPayloads: {
        AIntoB: disposition(scenario.crossedPayloads.aIntoB),
        BIntoA: disposition(scenario.crossedPayloads.bIntoA),
      },
      aNotSettledBeforeBSelection: {
        source: scenario.aNotSettled.source,
        outcome: disposition(scenario.aNotSettled.outcome),
        paymentState: scenario.aNotSettled.after.snapshot.paymentAttempts[0]?.state,
        beforeSnapshotDigest: scenario.aNotSettled.before.snapshotDigest,
        afterSnapshotDigest: scenario.aNotSettled.after.snapshotDigest,
        beforeCounters: scenario.aNotSettled.before.counters,
        afterCounters: scenario.aNotSettled.after.counters,
      },
      invalidA: {
        normalized: disposition(scenario.invalidA.normalized),
        resultStatus: scenario.invalidA.executed.kind === 'accepted'
          ? scenario.invalidA.executed.value.semantics.resultDelivery.state
          : scenario.invalidA.executed.kind,
        automaticBActivity: scenario.countersBeforeExplicitB,
      },
    },
  }
  return { ...material, checksum: digest(material) }
}

export async function writePhase3bProviderConformanceEvidence(path: string, requestedRevision: string) {
  const packet = await buildPhase3bProviderConformanceEvidence(path, requestedRevision)
  await writeFile(path, `${JSON.stringify(packet, null, 2)}\n`, { flag: 'wx' })
  return packet
}

if (basename(process.argv[1] ?? '') === 'phase-3b-provider-conformance-evidence.ts') {
  const [subcommand, path, revision] = process.argv.slice(2)
  if (subcommand !== 'run' || !path || !revision) {
    throw new Error('usage: phase-3b-provider-conformance-evidence.ts run <path> <revision-or-HEAD>')
  }
  const packet = await writePhase3bProviderConformanceEvidence(path, revision)
  console.log(JSON.stringify({
    schema: packet.schema,
    evidenceClass: packet.provenance.evidenceClass,
    checksum: packet.checksum,
    path: resolve(path),
  }))
}
