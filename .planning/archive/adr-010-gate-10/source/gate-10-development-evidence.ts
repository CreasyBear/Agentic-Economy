import {
  buildDevelopmentHostParityEvidence,
  developmentHostParitySourceBaseCommit,
  type DevelopmentHostParityEvidence,
} from './development-host-parity-evidence'
import { runFrozenDirectEndpointBaseline } from './direct-endpoint-baseline-executor'
import { deriveGate10GitProvenance, type Gate10GitProvenance } from './gate-10-git-provenance'
import { runRequestOwnedGate10HostTraces, type Gate10HostCaseTrace } from './gate-10-host-trace'
import { measureGate10Cases } from './gate-10-measurement'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'

export const gate10MeasurementClaimCeiling =
  'Labelled local development comparison over mock PublishedOperation transport, x402 payment, provider, authority, projection, and recovery records only; no hosted reachability, real-human effort, accessibility in use, independent provider operation, settlement, fulfilment, production safety, or customer value.'

export type Gate10DevelopmentEvidence = Readonly<{
  format: 'adr-010-gate-10-published-operation:development:v3'
  environment: 'LABELLED LOCAL DEVELOPMENT / MOCK EFFECTS'
  provenance: Gate10GitProvenance
  taskDigest: string
  directBaseline: Awaited<ReturnType<typeof runFrozenDirectEndpointBaseline>>
  hostPacket: DevelopmentHostParityEvidence
  hostPacketDigest: string
  hostCases: readonly Gate10HostCaseTrace[]
  measurement: ReturnType<typeof measureGate10Cases>
  disposition: 'PASS_FOR_DECLARED_CLASS' | 'NARROW_OR_REDESIGN'
  claimCeiling: string
  packetDigest: string
}>

export async function buildGate10DevelopmentEvidence(): Promise<Gate10DevelopmentEvidence> {
  const provenance = deriveGate10GitProvenance()
  const directBaseline = await runFrozenDirectEndpointBaseline()
  if (directBaseline.executableDigest !== provenance.baselineExecutableDigest) {
    throw new Error('gate10_baseline_executable_drift')
  }
  const hostPacket = await buildDevelopmentHostParityEvidence({
    sourceBaseCommit: developmentHostParitySourceBaseCommit,
    evidenceCommit: provenance.evidenceCommit,
    evidenceTreeDigest: provenance.evidenceTree,
  })
  const hostCases = await runRequestOwnedGate10HostTraces()
  const measurement = measureGate10Cases(directBaseline, hostCases)
  const taskDigest = canonicalDigest(directBaseline.task as unknown as StableHashValue)
  const material = {
    format: 'adr-010-gate-10-published-operation:development:v3' as const,
    environment: 'LABELLED LOCAL DEVELOPMENT / MOCK EFFECTS' as const,
    provenance,
    taskDigest,
    directBaseline,
    hostPacket,
    hostPacketDigest: hostPacket.packetDigest,
    hostCases,
    measurement,
    disposition: measurement.verdict,
    claimCeiling: gate10MeasurementClaimCeiling,
  }
  const serializable = JSON.parse(JSON.stringify(material)) as typeof material
  return {
    ...serializable,
    packetDigest: canonicalDigest(serializable as unknown as StableHashValue),
  }
}
