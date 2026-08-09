import { describe, expect, it } from 'vitest'

import {
  resolveCustomerRequestJourneyKeyring,
  signCustomerRequestJourneyProof,
  verifyCustomerRequestJourneyProof,
} from '@/modules/customer-request/journey-proof-attestation'
import { hostedCustomerRequestJourneyProofSchema } from '@/modules/customer-request/hosted-agent-journey'

const privateKey = '1f'.repeat(32)

const proof = hostedCustomerRequestJourneyProofSchema.parse({
  kind: 'cold_external_agent_journey',
  agent: { name: 'cold-agent', version: '1' },
  release: {
    revision: 'a'.repeat(40),
    deploymentId: 'convex:loyal-peacock-107',
    environment: 'development',
    baseUrl: 'http://127.0.0.1:3002',
    verification: 'local_checkout_and_named_dev_deployment',
  },
  observedAt: '2026-07-16T00:00:00.000Z',
  input: { request: 'Resolve and quote.', availableFacts: [], facts: [], messages: [] },
  observedStates: ['routes_ready', 'route_confirmed', 'completed'],
  authorityStops: ['route_confirmation'],
  final: {
    requestRef: 'acceptance:test',
    revision: 4,
    state: 'completed',
    selectedBusiness: 'Sandbox Route Resolver',
    selectedBusinesses: ['Sandbox Route Resolver', 'Sandbox Route Quoter'],
    stepCount: 2,
    runState: 'completed',
    evidenceState: 'completed',
    problemState: 'not_reported',
    resumedState: 'completed',
    resultDigest: 'sha256:result',
  },
  measurements: {
    integrationBurden: { requestCalls: 8, clarifications: 0 },
    turns: { total: 8 },
    elapsedMs: 1200,
    hardConstraintAccuracy: { state: 'satisfied' },
    totalCostAccuracy: { state: 'exact', total: { currency: 'AUD', units: '900', exponent: 2 } },
    recovery: { state: 'durable', resumed: true, postures: ['retry_safe'] },
    resultUsability: { state: 'usable' },
    replaySafety: { executionStart: 'same_request_monotonic_progress' },
    discovery: { state: 'not_proven', reason: 'verification_override' },
    disclosureIntegrity: {
      state: 'verified',
      recipients: ['Sandbox Route Resolver', 'Sandbox Route Quoter'],
      purposes: ['resolve_sandbox_service_reference', 'prepare_sandbox_service_quote'],
      effects: ['information_shared:irreversible'],
      providerFields: [
        { business: 'Sandbox Route Resolver', fields: ['field:request'] },
        { business: 'Sandbox Route Quoter', fields: ['field:service-reference'] },
      ],
    },
    evidenceIntegrity: {
      state: 'verified',
      resultDigest: 'sha256:result',
      steps: [
        {
          step: 1,
          business: 'Sandbox Route Resolver',
          providerOrigin: 'https://providers.example',
          outputDigest: 'sha256:' + 'a'.repeat(64),
          receiptRefs: ['receipt:resolver'],
        },
        {
          step: 2,
          business: 'Sandbox Route Quoter',
          providerOrigin: 'https://providers.example',
          outputDigest: 'sha256:' + 'b'.repeat(64),
          receiptRefs: ['receipt:quoter'],
        },
      ],
    },
    resultIntegrity: { state: 'verified', digest: 'sha256:result' },
    controlIntegrity: {
      state: 'verified',
      operatorInterventions: 0,
      mutations: [
        { path: '/api/v1/requests', source: 'declared_request' },
        { path: '/api/v1/requests/acceptance:test/actions/confirm', source: 'observed_navigation' },
      ],
    },
  },
  sandbox: true,
  claimBoundary: 'contract_and_hosted_journey_only_not_real_supply_or_customer_value',
})

describe('customer request journey proof attestation', () => {
  it('signs and verifies the exact canonical journey proof', () => {
    const keyring = resolveCustomerRequestJourneyKeyring({
      AE_CUSTOMER_REQUEST_JOURNEY_SIGNING_KEY: `journey:2026-07:${privateKey}`,
    })
    const signed = signCustomerRequestJourneyProof(proof, keyring.active)

    expect(verifyCustomerRequestJourneyProof(signed, keyring.trusted)).toEqual({
      kind: 'verified',
      proof,
    })
  })

  it('rejects proof, release, key identity, and signature tampering', () => {
    const keyring = resolveCustomerRequestJourneyKeyring({
      AE_CUSTOMER_REQUEST_JOURNEY_SIGNING_KEY: `journey:2026-07:${privateKey}`,
    })
    const signed = signCustomerRequestJourneyProof(proof, keyring.active)

    expect(verifyCustomerRequestJourneyProof({
      ...signed,
      proof: { ...signed.proof, observedAt: '2026-07-16T00:00:01.000Z' },
    }, keyring.trusted)).toEqual({ kind: 'rejected', reason: 'proof_digest_mismatch' })
    expect(verifyCustomerRequestJourneyProof({
      ...signed,
      attestation: { ...signed.attestation, signingKeyId: 'journey:unknown' },
    }, keyring.trusted)).toEqual({ kind: 'rejected', reason: 'signature_invalid_or_untrusted' })
    expect(verifyCustomerRequestJourneyProof({
      ...signed,
      attestation: { ...signed.attestation, signature: `ed25519:${'0'.repeat(128)}` },
    }, keyring.trusted)).toEqual({ kind: 'rejected', reason: 'signature_invalid_or_untrusted' })
  })

  it('fails closed without valid signing material and admits explicit retired verification keys', () => {
    expect(() => resolveCustomerRequestJourneyKeyring({})).toThrow('customer_request_journey_signing_key_invalid')
    const retiredPrivateKey = '2a'.repeat(32)
    const retired = resolveCustomerRequestJourneyKeyring({
      AE_CUSTOMER_REQUEST_JOURNEY_SIGNING_KEY: `journey:retired:${retiredPrivateKey}`,
    })
    const keyring = resolveCustomerRequestJourneyKeyring({
      AE_CUSTOMER_REQUEST_JOURNEY_SIGNING_KEY: `journey:current:${privateKey}`,
      AE_CUSTOMER_REQUEST_JOURNEY_PREVIOUS_PUBLIC_KEYS:
        `journey:retired:${retired.trusted[0]!.publicKey}`,
    })

    expect(verifyCustomerRequestJourneyProof(
      signCustomerRequestJourneyProof(proof, retired.active),
      keyring.trusted,
    ).kind).toBe('verified')
  })
})
