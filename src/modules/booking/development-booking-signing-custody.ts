import {
  ed25519PublicKey,
  type Ed25519SigningKey,
  type Ed25519VerificationKey,
} from '@/modules/common/ed25519-attestation'

export type DevelopmentBookingSigningCustody = Readonly<{
  signingKey: () => Ed25519SigningKey
}>

export function createDevelopmentBookingSigningCustody(input: Readonly<{
  keyId: string
  privateKey: string
}>): DevelopmentBookingSigningCustody {
  const key = Object.freeze({ keyId: input.keyId, privateKey: input.privateKey })
  ed25519PublicKey(key.privateKey, 'development_booking_custody_key_invalid')
  return Object.freeze({ signingKey: () => key })
}

export function developmentBookingVerificationKey(
  custody: DevelopmentBookingSigningCustody,
): Ed25519VerificationKey {
  const key = custody.signingKey()
  return Object.freeze({
    keyId: key.keyId,
    publicKey: ed25519PublicKey(key.privateKey, 'development_booking_custody_key_invalid'),
  })
}
