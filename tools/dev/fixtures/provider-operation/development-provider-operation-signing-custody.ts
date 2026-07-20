import {
  ed25519PublicKey,
  type Ed25519SigningKey,
  type Ed25519VerificationKey,
} from '../../../../src/modules/common/ed25519-attestation'

export type DevelopmentProviderOperationSigningCustody = Readonly<{
  signingKey: () => Ed25519SigningKey
}>

export function createDevelopmentProviderOperationSigningCustody(input: Readonly<{
  keyId: string
  privateKey: string
}>): DevelopmentProviderOperationSigningCustody {
  const key = Object.freeze({ keyId: input.keyId, privateKey: input.privateKey })
  ed25519PublicKey(key.privateKey, 'development_provider_operation_custody_key_invalid')
  return Object.freeze({ signingKey: () => key })
}

export function developmentProviderOperationVerificationKey(
  custody: DevelopmentProviderOperationSigningCustody,
): Ed25519VerificationKey {
  const key = custody.signingKey()
  return Object.freeze({
    keyId: key.keyId,
    publicKey: ed25519PublicKey(key.privateKey, 'development_provider_operation_custody_key_invalid'),
  })
}
