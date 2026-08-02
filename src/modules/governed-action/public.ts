import { base64Codec } from '@/modules/common/base64-codec'
import { sha256 } from '@noble/hashes/sha2'
import { bytesToHex } from '@noble/hashes/utils'

import {
  canonicalizeRestrictedJson,
  type CanonicalJson,
  type CanonicalizationRefusalCode,
} from './internal/jcs'
import { parseRestrictedJson } from './internal/strict-json'

export const GOVERNED_ACTION_WIRE_FORMAT = 'ae-governed-action:v1' as const
export const GOVERNED_ACTION_DIGEST_ALGORITHM = 'sha256' as const

export type GovernedActionPayload = CanonicalJson

export type GenericGovernedActionIntent<Payload extends GovernedActionPayload = GovernedActionPayload> = Readonly<{
  commitmentKind: 'generic'
  schemaVersion: number
  actionClass: string
  payload: Payload
}>


type GovernedActionEnvelope<Payload extends GovernedActionPayload = GovernedActionPayload> = Readonly<{
  wireFormat: typeof GOVERNED_ACTION_WIRE_FORMAT
  schemaVersion: number
  actionClass: string
  payload: Payload
}>

export type GovernedActionEncoding = Readonly<{
  kind: 'encoded'
  canonicalBytes: Uint8Array
  canonicalBytesBase64: string
  digest: `sha256:${string}`
}>

type GovernedActionRefusal = Readonly<{
  kind: 'refused'
  code: CanonicalizationRefusalCode | 'invalid_action_class' | 'invalid_schema_version'
  path: string
}>

export type GovernedActionReceiptStorage = Readonly<{
  canonicalBytesBase64: string
  digest: `sha256:${string}`
  algorithm: typeof GOVERNED_ACTION_DIGEST_ALGORITHM
  schemaVersion: number
  createdAt: number
}>

const encoder = new TextEncoder()
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/

export function encodeGovernedAction(
  intent: GenericGovernedActionIntent,
): GovernedActionEncoding | GovernedActionRefusal {
  if (!Number.isSafeInteger(intent.schemaVersion) || intent.schemaVersion <= 0) {
    return { kind: 'refused', code: 'invalid_schema_version', path: '$.schemaVersion' }
  }
  if (intent.actionClass.length === 0) {
    return { kind: 'refused', code: 'invalid_action_class', path: '$.actionClass' }
  }
  const envelope: GovernedActionEnvelope = {
    wireFormat: GOVERNED_ACTION_WIRE_FORMAT,
    schemaVersion: intent.schemaVersion,
    actionClass: intent.actionClass,
    payload: intent.payload,
  }
  const canonical = canonicalizeRestrictedJson(envelope)
  if (canonical.kind === 'refused') return canonical
  const canonicalBytes = encoder.encode(canonical.json)
  return {
    kind: 'encoded',
    canonicalBytes,
    canonicalBytesBase64: base64Codec.toBase64(canonicalBytes),
    digest: `sha256:${bytesToHex(sha256(canonicalBytes))}`,
  }
}

export function encodeGovernedActionJson(input: Readonly<{
  schemaVersion: number
  actionClass: string
  payloadJson: string
}>): GovernedActionEncoding | GovernedActionRefusal {
  const parsed = parseRestrictedJson(input.payloadJson)
  if (parsed.kind === 'refused') return parsed
  return encodeGovernedAction({
    commitmentKind: 'generic',
    schemaVersion: input.schemaVersion,
    actionClass: input.actionClass,
    payload: parsed.value,
  })
}

/** Verifies an externally supplied digest using only the exact canonical bytes. */
export function verifyGovernedActionBytes(canonicalBytes: Uint8Array, expectedDigest: string): boolean {
  if (!DIGEST_PATTERN.test(expectedDigest)) return false
  const actualDigest = `sha256:${bytesToHex(sha256(canonicalBytes))}`
  let difference = actualDigest.length ^ expectedDigest.length
  for (let index = 0; index < actualDigest.length; index += 1) {
    difference |= actualDigest.charCodeAt(index) ^ (expectedDigest.charCodeAt(index) || 0)
  }
  return difference === 0
}


