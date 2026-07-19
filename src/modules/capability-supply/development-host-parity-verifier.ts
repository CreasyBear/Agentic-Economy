import {
  readDevelopmentHostSnapshot,
  verifyDevelopmentHostReadReceipt,
} from '@/modules/action-invocation'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'

import { verifyDevelopmentPublishedOperationEvidence } from './development-published-operation-evidence'
import {
  materializePublishedOperation,
  materializeRuntimePublishedOperation,
} from './published-operation'
import {
  assertHostParityProvenance,
  compareHostSemantics,
  developmentHostParityClaimCeiling,
  evaluateHostMatrix,
  verifyHostSnapshots,
  type DevelopmentHostParityEvidence,
} from './development-host-parity-evidence'

export function verifyDevelopmentHostParityEvidence(
  packet: DevelopmentHostParityEvidence,
  expectedProvenance?: Readonly<{ evidenceCommit: string; evidenceTreeDigest: string }>,
): void {
  const { packetDigest, ...material } = packet
  if (canonicalDigest(material as unknown as StableHashValue) !== packetDigest) {
    throw new Error('host_parity_packet_digest_invalid')
  }
  assertHostParityProvenance(packet.provenance)
  if (expectedProvenance !== undefined
    && (packet.provenance.evidenceCommit !== expectedProvenance.evidenceCommit
      || packet.provenance.evidenceTreeDigest !== expectedProvenance.evidenceTreeDigest)) {
    throw new Error('host_parity_revision_provenance_invalid')
  }
  const rebuiltOperation = materializePublishedOperation(packet.fixture.sourceMaterial)
  const rebuiltDescriptor = materializeRuntimePublishedOperation(rebuiltOperation)
  verifyDevelopmentPublishedOperationEvidence({
    ...packet.fixture,
    operation: rebuiltOperation,
    descriptor: rebuiltDescriptor,
  })
  if (packet.format !== 'action-invocation-host-parity:development:v2'
    || packet.environment !== 'MOCK/DEVELOPMENT ONLY'
    || packet.verdict !== 'PASS_FOR_DECLARED_CLASS'
    || packet.claimCeiling !== developmentHostParityClaimCeiling
    || packet.hosts[0].host !== 'request_owned_human'
    || packet.hosts[1].host !== 'standalone_external_agent') {
    throw new Error('host_parity_contract_invalid')
  }
  const rebuiltReads = [
    readDevelopmentHostSnapshot({
      host: 'request_owned_human',
      snapshot: packet.hosts[0].success.snapshot,
    }),
    readDevelopmentHostSnapshot({
      host: 'standalone_external_agent',
      snapshot: packet.hosts[1].success.snapshot,
    }),
  ] as const
  verifyHostSnapshots({
    ...packet,
    fixture: {
      ...packet.fixture,
      operation: rebuiltOperation,
      descriptor: rebuiltDescriptor,
    },
  })
  packet.hostReads.forEach(verifyDevelopmentHostReadReceipt)
  if (packet.hostReads[0].readRef === packet.hostReads[1].readRef
    || canonicalDigest(rebuiltReads as unknown as StableHashValue)
      !== canonicalDigest(packet.hostReads as unknown as StableHashValue)) {
    throw new Error('host_read_not_reconstructed_from_independent_records')
  }
  if (canonicalDigest(compareHostSemantics(packet.hostReads) as unknown as StableHashValue)
    !== canonicalDigest(packet.parity as unknown as StableHashValue)) {
    throw new Error('host_semantic_parity_invalid')
  }
  const evaluated = evaluateHostMatrix(packet.hosts)
  if (evaluated.some((entry) => !entry.passed)
    || canonicalDigest(evaluated as unknown as StableHashValue)
      !== canonicalDigest(packet.evals as unknown as StableHashValue)) {
    throw new Error('host_matrix_evidence_invalid')
  }
}
