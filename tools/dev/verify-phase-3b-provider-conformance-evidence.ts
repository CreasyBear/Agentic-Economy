import { readFile } from 'node:fs/promises'
import { basename } from 'node:path'
import { parseArgs } from '../ae/lib/args'

import { canonicalDigest } from '../../src/modules/common/canonical-digest'
import { isRecord } from '../../src/modules/common/is-record'
import type { StableHashValue } from '../../src/modules/common/stable-hash'
import {
  buildDevelopmentAlternatePublishedOperationEvidence,
  verifyDevelopmentAlternatePublishedOperationEvidence,
} from './fixtures/capability-supply/development-alternate-published-operation-evidence'
import { projectDevelopmentAlternateBtcUsdQuoteResult } from './fixtures/capability-supply/development-alternate-btc-usd-quote-result'
import {
  buildDevelopmentPublishedOperationEvidence,
  verifyDevelopmentPublishedOperationEvidence,
} from './fixtures/capability-supply/development-published-operation-evidence'
import { projectDevelopmentBtcUsdQuoteResult } from './fixtures/capability-supply/btc-usd-quote-result'

import { buildPhase3bProviderConformanceEvidence } from './phase-3b-provider-conformance-evidence'

function digest(value: unknown) {
  return canonicalDigest(value as StableHashValue)
}

function exactKeys(value: unknown, keys: string[], label: string) {
  if (!isRecord(value)) {
    throw new Error(`${label}_object_required`)
  }
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${label}_schema_invalid`)
}

export async function verifyPhase3bProviderConformanceEvidence(path: string, revision: string) {
  const packet = JSON.parse(await readFile(path, 'utf8'))
  exactKeys(packet, ['schema', 'provenance', 'providers', 'shared', 'switches', 'dispositions', 'checksum'], 'packet')
  if (packet.schema !== 'ae.phase-3b-provider-conformance-evidence:v1') {
    throw new Error('packet_schema_invalid')
  }
  exactKeys(packet.providers, ['A', 'B'], 'providers')
  exactKeys(packet.switches, ['A', 'B'], 'switches')
  exactKeys(packet.shared, ['schemaIdentity', 'semanticDigests'], 'shared')

  const packetMaterial = {
    schema: packet.schema,
    provenance: packet.provenance,
    providers: packet.providers,
    shared: packet.shared,
    switches: packet.switches,
    dispositions: packet.dispositions,
  }
  if (packet.checksum !== digest(packetMaterial)) throw new Error('packet_checksum_invalid')

  const sourceA = buildDevelopmentPublishedOperationEvidence()
  const sourceB = buildDevelopmentAlternatePublishedOperationEvidence()
  verifyDevelopmentPublishedOperationEvidence(sourceA)
  verifyDevelopmentAlternatePublishedOperationEvidence(sourceB)
  const receivedAt = '2026-07-20T08:05:00.000Z'
  const normalizedA = projectDevelopmentBtcUsdQuoteResult({
    payload: packet.providers.A.rawPayload,
    receivedAt,
  })
  const normalizedB = projectDevelopmentAlternateBtcUsdQuoteResult({
    payload: packet.providers.B.rawPayload,
    receivedAt,
  })
  if (normalizedA.kind !== 'accepted' || normalizedB.kind !== 'accepted') {
    throw new Error('packet_raw_evidence_invalid')
  }
  if (
    digest(packet.providers.A.rawPayload) !== packet.providers.A.rawDigest
    || digest(packet.providers.B.rawPayload) !== packet.providers.B.rawDigest
    || digest(normalizedA.result) !== digest({
      ...packet.providers.A.normalized.fields,
      source: packet.providers.A.normalized.source,
      rawEvidenceRef: packet.providers.A.normalized.rawEvidenceRef,
    })
    || digest(normalizedB.result) !== digest({
      ...packet.providers.B.normalized.fields,
      source: packet.providers.B.normalized.source,
      rawEvidenceRef: packet.providers.B.normalized.rawEvidenceRef,
    })
  ) throw new Error('packet_normalization_mismatch')

  const expected = await buildPhase3bProviderConformanceEvidence(path, revision)
  if (JSON.stringify(packet) !== JSON.stringify(expected)) {
    throw new Error('packet_recomputation_mismatch')
  }
}

if (basename(process.argv[1] ?? '') === 'verify-phase-3b-provider-conformance-evidence.ts') {
  const { positionals } = parseArgs(process.argv.slice(2))
  const [path, revision] = positionals
  if (!path || !revision) throw new Error('usage: verify <path> <revision-or-HEAD>')
  await verifyPhase3bProviderConformanceEvidence(path, revision)
  console.log(JSON.stringify({ verified: true, path, checksum: JSON.parse(await readFile(path, 'utf8')).checksum }))
}
