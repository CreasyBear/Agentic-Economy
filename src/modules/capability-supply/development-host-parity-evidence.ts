import {
  readDevelopmentHostSnapshot,
  verifyDevelopmentHostReadReceipt,
  type DevelopmentHostReadReceipt,
} from '@/modules/action-invocation'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'

import {
  buildDevelopmentDynamicInvocationEvidence,
  verifyDevelopmentDynamicInvocationEvidence,
  type DevelopmentDynamicInvocationEvidence,
} from './development-dynamic-invocation-evidence'

const claimCeiling =
  'Labelled local development evidence over mock transport, payment, and provider effects only; no hosted reachability, independent signing or root provenance, settlement, provider fulfilment, production safety, human parity, or customer value.'

export type DevelopmentHostParityEvidence = Readonly<{
  format: 'action-invocation-host-parity:development:v1'
  environment: 'MOCK/DEVELOPMENT ONLY'
  revision: '920989b4451d183d95748b5eaee3cd1da2bdbecb'
  dynamicEvidence: DevelopmentDynamicInvocationEvidence
  hostReads: readonly [DevelopmentHostReadReceipt, DevelopmentHostReadReceipt]
  sharedSemanticDigest: string
  effects: Readonly<{ payment: 2; provider: 2 }>
  evals: Readonly<{
    successParity: true
    preflightAndSourceRefusal: true
    uncertaintyAndReconcileBeforeRetry: true
    duplicateAndStaleGenerationSuppression: true
    unsupportedCancellation: true
    coldResumeWithoutTranscriptOrCache: true
    completedResultReferenceOnlyReuse: true
    tamperFamilies: readonly string[]
  }>
  verdict: 'PASS_FOR_DECLARED_CLASS'
  claimCeiling: string
  packetDigest: string
}>

export async function buildDevelopmentHostParityEvidence(): Promise<DevelopmentHostParityEvidence> {
  const dynamicEvidence = await buildDevelopmentDynamicInvocationEvidence()
  const requestCase = dynamicEvidence.cases.find((entry) => entry.origin.kind === 'request_owned')
  const standaloneCase = dynamicEvidence.cases.find((entry) => entry.origin.kind === 'standalone')
  if (requestCase === undefined || standaloneCase === undefined) {
    throw new Error('host_parity_origins_missing')
  }
  const readAt = new Date(dynamicEvidence.fixture.operation.readiness.observedAt + 2_000).toISOString()
  const hostReads = [
    readDevelopmentHostSnapshot({
      host: 'request_owned_human',
      readRef: 'host-read:request-owned:1',
      readAt,
      snapshot: JSON.parse(JSON.stringify(requestCase.snapshot)),
    }),
    readDevelopmentHostSnapshot({
      host: 'standalone_external_agent',
      readRef: 'host-read:standalone:1',
      readAt,
      snapshot: JSON.parse(JSON.stringify(standaloneCase.snapshot)),
    }),
  ] as const
  assertHostParity(hostReads)
  const material = {
    format: 'action-invocation-host-parity:development:v1' as const,
    environment: 'MOCK/DEVELOPMENT ONLY' as const,
    revision: '920989b4451d183d95748b5eaee3cd1da2bdbecb' as const,
    dynamicEvidence,
    hostReads,
    sharedSemanticDigest: sharedDigest(hostReads[0]),
    effects: { payment: 2 as const, provider: 2 as const },
    evals: {
      successParity: true as const,
      preflightAndSourceRefusal: true as const,
      uncertaintyAndReconcileBeforeRetry: true as const,
      duplicateAndStaleGenerationSuppression: true as const,
      unsupportedCancellation: true as const,
      coldResumeWithoutTranscriptOrCache: true as const,
      completedResultReferenceOnlyReuse: true as const,
      tamperFamilies: [
        'operation_material_method_path_query_payment_credential_provider',
        'caller_principal_origin_authority_mandate_generation',
        'attempt_effect_generation_idempotency_release_outcome_result',
        'source_state_bypass_stale_receipt_transcript_cache_deletion',
        'cross_principal_result_use_packet_redigest_and_host_swap',
      ],
    },
    verdict: 'PASS_FOR_DECLARED_CLASS' as const,
    claimCeiling,
  }
  return Object.freeze({
    ...material,
    packetDigest: canonicalDigest(material as unknown as StableHashValue),
  })
}

export function verifyDevelopmentHostParityEvidence(packet: DevelopmentHostParityEvidence): void {
  const { packetDigest, ...material } = packet
  if (canonicalDigest(material as unknown as StableHashValue) !== packetDigest) {
    throw new Error('host_parity_packet_digest_invalid')
  }
  verifyDevelopmentDynamicInvocationEvidence(packet.dynamicEvidence)
  if (packet.environment !== 'MOCK/DEVELOPMENT ONLY'
    || packet.revision !== '920989b4451d183d95748b5eaee3cd1da2bdbecb'
    || packet.verdict !== 'PASS_FOR_DECLARED_CLASS'
    || packet.claimCeiling !== claimCeiling
    || packet.effects.payment !== 2
    || packet.effects.provider !== 2) {
    throw new Error('host_parity_contract_invalid')
  }
  for (const receipt of packet.hostReads) verifyDevelopmentHostReadReceipt(receipt)
  const requestCase = packet.dynamicEvidence.cases.find((entry) => entry.origin.kind === 'request_owned')!
  const standaloneCase = packet.dynamicEvidence.cases.find((entry) => entry.origin.kind === 'standalone')!
  const expectedReadAt = new Date(
    packet.dynamicEvidence.fixture.operation.readiness.observedAt + 2_000,
  ).toISOString()
  if (packet.hostReads.some((receipt) => receipt.readAt !== expectedReadAt)) {
    throw new Error('host_read_receipt_stale')
  }
  const rebuilt = [
    readDevelopmentHostSnapshot({
      host: 'request_owned_human',
      readRef: packet.hostReads[0].readRef,
      readAt: packet.hostReads[0].readAt,
      snapshot: requestCase.snapshot,
    }),
    readDevelopmentHostSnapshot({
      host: 'standalone_external_agent',
      readRef: packet.hostReads[1].readRef,
      readAt: packet.hostReads[1].readAt,
      snapshot: standaloneCase.snapshot,
    }),
  ] as const
  if (canonicalDigest(rebuilt as unknown as StableHashValue)
    !== canonicalDigest(packet.hostReads as unknown as StableHashValue)) {
    throw new Error('host_read_not_reconstructed_from_durable_source')
  }
  assertHostParity(packet.hostReads)
  if (packet.sharedSemanticDigest !== sharedDigest(packet.hostReads[0])) {
    throw new Error('host_parity_shared_digest_invalid')
  }
}

function assertHostParity(
  reads: readonly [DevelopmentHostReadReceipt, DevelopmentHostReadReceipt],
): void {
  if (reads[0].host !== 'request_owned_human'
    || reads[1].host !== 'standalone_external_agent'
    || reads[0].semanticRead.identity.callerRef === reads[1].semanticRead.identity.callerRef
    || reads[0].semanticRead.identity.originDigest === reads[1].semanticRead.identity.originDigest
    || reads[0].semanticRead.invocation.ref === reads[1].semanticRead.invocation.ref
    || sharedDigest(reads[0]) !== sharedDigest(reads[1])) {
    throw new Error('host_shared_semantics_not_equal')
  }
}

function sharedDigest(receipt: DevelopmentHostReadReceipt): string {
  const value = receipt.semanticRead
  return canonicalDigest({
    action: value.action,
    publication: value.publication,
    payment: value.payment,
    prepared: value.prepared,
    principalRef: value.identity.principalRef,
    mandateKind: value.authority.mandateKind,
    acceptedDigest: value.authority.acceptedDigest,
    generation: value.authority.generation,
    effectGeneration: value.control.effectGeneration,
    state: value.control.state,
    semanticStatus: value.source.semanticStatus,
  })
}
