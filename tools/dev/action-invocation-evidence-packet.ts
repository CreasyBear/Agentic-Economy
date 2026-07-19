import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'

import { canonicalDigest } from '../../src/modules/common/canonical-digest'

export type EvidenceEnvelope = Readonly<{
  schema: 'ae.action-invocation-development-evidence:v1'
  checksum: string
  packet: Record<string, unknown>
}>

function checksum(packet: Record<string, unknown>) {
  return createHash('sha256').update(JSON.stringify(packet)).digest('hex')
}

export async function writeEvidencePacket(path: string, packet: Record<string, unknown>) {
  const envelope: EvidenceEnvelope = {
    schema: 'ae.action-invocation-development-evidence:v1',
    checksum: `sha256:${checksum(packet)}`,
    packet,
  }
  await writeFile(path, `${JSON.stringify(envelope, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' })
  return envelope
}

export async function readAndVerifyEvidencePacket(path: string, expectedRevision: string) {
  const envelope = JSON.parse(await readFile(path, 'utf8')) as EvidenceEnvelope
  if (envelope.schema !== 'ae.action-invocation-development-evidence:v1') throw new Error('packet_schema_refused')
  if (envelope.checksum !== `sha256:${checksum(envelope.packet)}`) throw new Error('packet_checksum_refused')
  if (envelope.packet.environment !== 'MOCK/DEVELOPMENT ONLY') throw new Error('packet_environment_refused')
  if (envelope.packet.gitRevision !== expectedRevision) throw new Error('packet_revision_refused')
  const action = envelope.packet.action as { id?: string; version?: string }
  if (action.id !== 'supply.collectDevelopmentQuote' || action.version !== 'supply.collectDevelopmentQuote:v1') {
    throw new Error('packet_action_identity_refused')
  }
  const durable = envelope.packet.durable as { controls?: unknown[]; attempts?: unknown[]; history?: unknown[] }
  const composition = envelope.packet.composition as { noEffect?: boolean; nodes?: unknown[] }
  if (!durable.controls?.length || !durable.attempts?.length || !durable.history?.length) {
    throw new Error('packet_durable_meaning_refused')
  }
  if (composition.noEffect !== true || !composition.nodes?.length) throw new Error('packet_composition_refused')
  return {
    environment: envelope.packet.environment,
    gitRevision: expectedRevision,
    checksum: envelope.checksum,
    sourceIdentityDigest: canonicalDigest({
      action: envelope.packet.action,
      completedReference: envelope.packet.completedReference,
    } as never),
    reconstructed: {
      durableControlRecords: durable.controls.length,
      attributableAttempts: durable.attempts.length,
      durableHistoryRecords: durable.history.length,
      compositionNodes: composition.nodes.length,
      resultReference: envelope.packet.completedReference,
      recovery: envelope.packet.recovery,
      transfer: envelope.packet.transfer,
    },
    claimCeiling: envelope.packet.claimCeiling,
  }
}
