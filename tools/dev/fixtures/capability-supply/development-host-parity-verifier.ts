import {
  readDevelopmentHostSnapshot,
  verifyDevelopmentHostReadReceipt,
} from '@/modules/action-invocation'
import { canonicalDigest } from '@/modules/common/canonical-digest'

import { verifyDevelopmentPublishedOperationEvidence } from './development-published-operation-evidence'
import {
  materializePublishedOperation,
  materializeRuntimePublishedOperation,
} from '@/modules/capability-supply/published-operation'
import {
  assertHostParityProvenance,
  compareHostSemantics,
  developmentHostParityClaimCeiling,
  developmentHostParitySourceBaseCommit,
  digestDevelopmentHostParityMaterial,
  evaluateHostMatrix,
  verifyHostSnapshots,
  type DevelopmentHostParityEvidence,
} from './development-host-parity-evidence'

export function verifyDevelopmentHostParityEvidence(
  packet: DevelopmentHostParityEvidence,
  expectedProvenance?: Readonly<{
    sourceBaseCommit: string
    evidenceCommit: string
    evidenceTreeDigest: string
  }>,
): void {
  const { packetDigest, ...material } = packet
  if (digestDevelopmentHostParityMaterial(material) !== packetDigest) {
    throw new Error('host_parity_packet_digest_invalid')
  }
  assertHostParityProvenance(packet.provenance)
  if (packet.provenance.sourceBaseCommit !== developmentHostParitySourceBaseCommit) {
    throw new Error('host_parity_source_base_invalid')
  }
  if (expectedProvenance !== undefined
    && (packet.provenance.sourceBaseCommit !== expectedProvenance.sourceBaseCommit
      || packet.provenance.evidenceCommit !== expectedProvenance.evidenceCommit
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
    || canonicalDigest(rebuiltReads) !== canonicalDigest(packet.hostReads)) {
    throw new Error('host_read_not_reconstructed_from_independent_records')
  }
  if (canonicalDigest(compareHostSemantics(packet.hostReads, packet.hosts))
    !== canonicalDigest(packet.parity)) {
    throw new Error('host_semantic_parity_invalid')
  }
  const evaluated = evaluateHostMatrix(packet.hosts)
  if (evaluated.some((entry) => !entry.passed)
    || canonicalDigest(evaluated) !== canonicalDigest(packet.evals)) {
    throw new Error('host_matrix_evidence_invalid')
  }
}
