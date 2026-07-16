import {
  ed25519PublicKey,
  resolveEd25519Keyring,
  signEd25519Attestation,
  verifyEd25519Attestation,
} from '@/modules/common/ed25519-attestation'

export type IncidentFactSigningKey = Readonly<{ keyId: string; privateKey: string }>
export type IncidentFactVerificationKey = Readonly<{ keyId: string; publicKey: string }>
export type IncidentFactSignature = Readonly<{
  signingKeyId: string
  signingPublicKey: string
  factSignature: string
}>

export function incidentFactPublicKey(privateKey: string): string {
  return ed25519PublicKey(privateKey, 'incident_fact_private_key_invalid')
}

export function signIncidentFact(factDigest: string, key: IncidentFactSigningKey): IncidentFactSignature {
  const signed = signEd25519Attestation(factDigest, key, 'incident_fact_signing_key_invalid')
  return Object.freeze({
    signingKeyId: signed.signingKeyId,
    signingPublicKey: signed.signingPublicKey,
    factSignature: signed.signature,
  })
}

export function verifyIncidentFact(
  factDigest: string,
  signature: IncidentFactSignature,
  trusted: readonly IncidentFactVerificationKey[],
): boolean {
  return verifyEd25519Attestation(factDigest, {
    signingKeyId: signature.signingKeyId,
    signingPublicKey: signature.signingPublicKey,
    signature: signature.factSignature,
  }, trusted)
}

export function resolveIncidentFactKeyring(env: Readonly<Record<string, string | undefined>>): Readonly<{
  active: IncidentFactSigningKey
  trusted: readonly IncidentFactVerificationKey[]
}> {
  return resolveEd25519Keyring({
    activeValue: env.ROUTING_KERNEL_FACT_SIGNING_KEY,
    previousValues: env.ROUTING_KERNEL_FACT_PREVIOUS_PUBLIC_KEYS,
    activeError: 'incident_fact_signing_key_invalid',
    previousError: 'incident_fact_previous_key_invalid',
    conflictError: 'incident_fact_key_id_conflict',
  })
}
