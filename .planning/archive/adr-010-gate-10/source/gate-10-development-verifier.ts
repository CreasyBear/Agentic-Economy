import { verifyDevelopmentHostParityEvidence } from './development-host-parity-verifier'
import { runFrozenDirectEndpointBaseline } from './direct-endpoint-baseline-executor'
import { deriveGate10GitProvenance } from './gate-10-git-provenance'
import {
  gate10MeasurementClaimCeiling,
  type Gate10DevelopmentEvidence,
} from './gate-10-development-evidence'
import { runRequestOwnedGate10HostTraces } from './gate-10-host-trace'
import { measureGate10Cases } from './gate-10-measurement'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'

export async function verifyGate10DevelopmentEvidence(
  packet: Gate10DevelopmentEvidence,
): Promise<void> {
  const { packetDigest, ...material } = packet
  if (canonicalDigest(material as unknown as StableHashValue) !== packetDigest) {
    throw new Error('gate10_packet_digest_invalid')
  }
  const actualProvenance = deriveGate10GitProvenance()
  if (canonicalDigest(actualProvenance as unknown as StableHashValue)
      !== canonicalDigest(packet.provenance as unknown as StableHashValue)) {
    throw new Error('gate10_git_provenance_invalid')
  }
  if (packet.format !== 'adr-010-gate-10-published-operation:development:v3'
    || packet.environment !== 'LABELLED LOCAL DEVELOPMENT / MOCK EFFECTS'
    || packet.claimCeiling !== gate10MeasurementClaimCeiling
    || packet.hostPacketDigest !== packet.hostPacket.packetDigest) {
    throw new Error('gate10_evidence_contract_invalid')
  }
  verifyDevelopmentHostParityEvidence(packet.hostPacket, {
    sourceBaseCommit: packet.hostPacket.provenance.sourceBaseCommit,
    evidenceCommit: actualProvenance.evidenceCommit,
    evidenceTreeDigest: actualProvenance.evidenceTree,
  })
  const rebuiltDirect = await runFrozenDirectEndpointBaseline()
  if (rebuiltDirect.executableDigest !== actualProvenance.baselineExecutableDigest
    || canonicalDigest(rebuiltDirect as unknown as StableHashValue)
      !== canonicalDigest(packet.directBaseline as unknown as StableHashValue)
    || packet.taskDigest !== canonicalDigest(rebuiltDirect.task as unknown as StableHashValue)) {
    throw new Error('gate10_direct_baseline_invalid')
  }
  const rebuiltHostCases = await runRequestOwnedGate10HostTraces()
  if (canonicalDigest(rebuiltHostCases as unknown as StableHashValue)
      !== canonicalDigest(packet.hostCases as unknown as StableHashValue)) {
    throw new Error('gate10_host_trace_invalid')
  }
  const rebuiltMeasurement = measureGate10Cases(rebuiltDirect, rebuiltHostCases)
  if (canonicalDigest(rebuiltMeasurement as unknown as StableHashValue)
      !== canonicalDigest(packet.measurement as unknown as StableHashValue)
    || packet.disposition !== rebuiltMeasurement.verdict) {
    throw new Error('gate10_measurement_or_verdict_invalid')
  }
}
