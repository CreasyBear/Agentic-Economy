import { z } from 'zod'

import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'
import {
  resolveEd25519Keyring,
  signEd25519Attestation,
  verifyEd25519Attestation,
  type Ed25519SigningKey,
  type Ed25519VerificationKey,
} from '@/modules/common/ed25519-attestation'

import {
  runHostedCustomerRequestJourney,
  hostedCustomerRequestJourneyProofSchema,
  type HostedCustomerRequestJourneyInput,
  type HostedCustomerRequestJourneyProof,
} from './hosted-agent-journey'

const attestationSchema = z.strictObject({
  format: z.literal('ae.customer-request-journey-attestation:v1'),
  proofDigest: z.string().startsWith('sha256:'),
  signingKeyId: z.string().min(1),
  signingPublicKey: z.string().regex(/^[0-9a-f]{64}$/),
  signature: z.string().regex(/^ed25519:[0-9a-f]{128}$/),
})

export const signedCustomerRequestJourneyProofSchema = z.strictObject({
  kind: z.literal('signed_customer_request_journey'),
  proof: hostedCustomerRequestJourneyProofSchema,
  attestation: attestationSchema,
})

export type SignedCustomerRequestJourneyProof = Readonly<
  z.infer<typeof signedCustomerRequestJourneyProofSchema>
>

export function resolveCustomerRequestJourneyKeyring(
  env: Readonly<Record<string, string | undefined>>,
) {
  return resolveEd25519Keyring({
    activeValue: env.AE_CUSTOMER_REQUEST_JOURNEY_SIGNING_KEY,
    previousValues: env.AE_CUSTOMER_REQUEST_JOURNEY_PREVIOUS_PUBLIC_KEYS,
    activeError: 'customer_request_journey_signing_key_invalid',
    previousError: 'customer_request_journey_previous_key_invalid',
    conflictError: 'customer_request_journey_key_id_conflict',
  })
}

export function signCustomerRequestJourneyProof(
  proofInput: HostedCustomerRequestJourneyProof,
  key: Ed25519SigningKey,
): SignedCustomerRequestJourneyProof {
  const proof = hostedCustomerRequestJourneyProofSchema.parse(proofInput)
  const proofDigest = canonicalDigest(asStableHashValue(proof))
  const signed = signEd25519Attestation(
    proofDigest,
    key,
    'customer_request_journey_signing_key_invalid',
  )
  return signedCustomerRequestJourneyProofSchema.parse({
    kind: 'signed_customer_request_journey',
    proof,
    attestation: {
      format: 'ae.customer-request-journey-attestation:v1',
      proofDigest,
      ...signed,
    },
  })
}

export async function runSignedHostedCustomerRequestJourney(
  input: HostedCustomerRequestJourneyInput,
  key: Ed25519SigningKey,
): Promise<SignedCustomerRequestJourneyProof> {
  return signCustomerRequestJourneyProof(await runHostedCustomerRequestJourney(input), key)
}

export function verifyCustomerRequestJourneyProof(
  input: unknown,
  trusted: readonly Ed25519VerificationKey[],
): Readonly<
  | { kind: 'verified'; proof: HostedCustomerRequestJourneyProof }
  | { kind: 'rejected'; reason: 'malformed_attestation' | 'proof_digest_mismatch' | 'signature_invalid_or_untrusted' }
> {
  const parsed = signedCustomerRequestJourneyProofSchema.safeParse(input)
  if (!parsed.success) return Object.freeze({ kind: 'rejected', reason: 'malformed_attestation' })
  const proofDigest = canonicalDigest(asStableHashValue(parsed.data.proof))
  if (proofDigest !== parsed.data.attestation.proofDigest) {
    return Object.freeze({ kind: 'rejected', reason: 'proof_digest_mismatch' })
  }
  const valid = verifyEd25519Attestation(proofDigest, parsed.data.attestation, trusted)
  return valid
    ? Object.freeze({ kind: 'verified', proof: parsed.data.proof })
    : Object.freeze({ kind: 'rejected', reason: 'signature_invalid_or_untrusted' })
}

function asStableHashValue(value: unknown): StableHashValue {
  return JSON.parse(JSON.stringify(value)) as StableHashValue
}
