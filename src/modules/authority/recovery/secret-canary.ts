export const SECRET_CANARY_SINKS = [
  'convex_row',
  'log',
  'error',
  'audit',
  'environment',
  'snapshot',
] as const

export type SecretCanarySink = typeof SECRET_CANARY_SINKS[number]

export type SecretCanaryArtifact = Readonly<{
  sink: SecretCanarySink
  textFragments?: readonly string[]
  byteFragments?: readonly Uint8Array[]
}>

export type SecretCanaryProof = Readonly<{
  checkedSinks: readonly SecretCanarySink[]
  artifactCount: number
}>

export type SecretCanaryErrorCode =
  | 'secret_canary_detected'
  | 'secret_canary_invalid'
  | 'secret_canary_sink_inventory_invalid'

export class SecretCanaryError extends Error {
  readonly code: SecretCanaryErrorCode

  constructor(code: SecretCanaryErrorCode) {
    super(code)
    this.name = 'SecretCanaryError'
    this.code = code
  }
}

export function proveSecretCanaryIsolation(
  canary: Uint8Array,
  artifacts: readonly SecretCanaryArtifact[],
): SecretCanaryProof {
  if (canary.byteLength === 0) throw new SecretCanaryError('secret_canary_invalid')
  const sinks = artifacts.map((artifact) => artifact.sink)
  if (artifacts.length !== SECRET_CANARY_SINKS.length
    || new Set(sinks).size !== SECRET_CANARY_SINKS.length
    || SECRET_CANARY_SINKS.some((sink) => !sinks.includes(sink))
    || artifacts.some((artifact) => !(artifact.textFragments?.some((fragment) => fragment.length > 0) ?? false)
      && !(artifact.byteFragments?.some((fragment) => fragment.byteLength > 0) ?? false))) {
    throw new SecretCanaryError('secret_canary_sink_inventory_invalid')
  }
  let artifactCount = 0
  const encoder = new TextEncoder()
  for (const artifact of artifacts) {
    for (const fragment of artifact.textFragments ?? []) {
      artifactCount += 1
      if (containsBytes(encoder.encode(fragment), canary)) throw new SecretCanaryError('secret_canary_detected')
    }
    for (const fragment of artifact.byteFragments ?? []) {
      artifactCount += 1
      if (containsBytes(fragment, canary)) throw new SecretCanaryError('secret_canary_detected')
    }
  }
  return Object.freeze({
    checkedSinks: Object.freeze([...SECRET_CANARY_SINKS]),
    artifactCount,
  })
}

function containsBytes(haystack: Uint8Array, needle: Uint8Array): boolean {
  if (needle.byteLength > haystack.byteLength) return false
  const limit = haystack.byteLength - needle.byteLength
  for (let start = 0; start <= limit; start += 1) {
    let matches = true
    for (let offset = 0; offset < needle.byteLength; offset += 1) {
      if (haystack[start + offset] !== needle[offset]) {
        matches = false
        break
      }
    }
    if (matches) return true
  }
  return false
}
