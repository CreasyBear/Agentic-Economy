import { describe, expect, it } from 'vitest'

import {
  createInMemoryPreparationDisclosureStore,
  createPreparationAuthorityVerifier,
  createProtectedProjectionCommitter,
  preparationAuthorityDigest,
  releasePreparationDisclosure,
  type PreparationAuthorityVerifier,
  type PreparationDisclosureCommand,
  type VerifiedPreparationAuthority,
} from '@/modules/customer-request/preparation-authority'

describe('preparation disclosure authority', () => {
  it('refuses forged evidence before protected values reach a provider', async () => {
    let providerCalls = 0
    const verifier: PreparationAuthorityVerifier = {
      verify: async () => ({ kind: 'refused', reason: 'authority_evidence_invalid' }),
    }

    const result = await releasePreparationDisclosure(disclosureCommand(), {
      verifier,
      store: createInMemoryPreparationDisclosureStore([authority()]),
      now: () => 1_000,
      release: async () => {
        providerCalls += 1
        return { kind: 'released', providerEvidenceRef: 'provider:evidence:unexpected' }
      },
    })

    expect(result).toEqual({
      kind: 'refused',
      reason: 'authority_evidence_invalid',
      nextAction: 'Ask the customer to authorize this data sharing request again.',
    })
    expect(providerCalls).toBe(0)
  })

  it('uses a secret-keyed commitment instead of a reversible or low-entropy value hash', () => {
    const first = createProtectedProjectionCommitter('a'.repeat(32))({ destinationPostcode: '3000' })
    const second = createProtectedProjectionCommitter('b'.repeat(32))({ destinationPostcode: '3000' })

    expect(first).toMatch(/^hmac-sha256:[a-f0-9]{64}$/)
    expect(first).not.toBe(second)
    expect(first).not.toContain('3000')
  })

  it('rejects evidence signed by an untrusted authority signer', async () => {
    const verifier = createPreparationAuthorityVerifier({
      evidenceReader: {
        get: async () => ({
          evidenceRef: 'authority:evidence:1', issuerId: 'issuer:ae', signerId: 'signer:attacker', keyId: 'key:attacker:1',
          authority: authority(), signature: 'signature:forged',
        }),
      },
      trustedIssuers: { isTrusted: () => false },
      signatures: { verify: async () => true },
    })

    const result = await verifier.verify({
      authorityEvidenceRef: 'authority:evidence:1', requestId: 'request:shipping:1', requestRevision: 1,
    })

    expect(result).toEqual({ kind: 'refused', reason: 'authority_signer_mismatch' })
  })

  it('rejects a forged signature even when the claimed signer is trusted', async () => {
    const verifier = createPreparationAuthorityVerifier({
      evidenceReader: {
        get: async () => ({
          evidenceRef: 'authority:evidence:1', issuerId: 'issuer:ae', signerId: 'signer:trusted', keyId: 'key:trusted:1',
          authority: authority(), signature: 'signature:forged',
        }),
      },
      trustedIssuers: { isTrusted: () => true },
      signatures: { verify: async () => false },
    })

    const result = await verifier.verify({
      authorityEvidenceRef: 'authority:evidence:1', requestId: 'request:shipping:1', requestRevision: 1,
    })

    expect(result).toEqual({ kind: 'refused', reason: 'authority_evidence_invalid' })
  })

  it('accepts an immutable authority whose digest and trusted signature are independently verified', async () => {
    const unsigned = authority()
    const { authorityDigest: _ignored, status: _status, verification: _verification, ...material } = unsigned
    const signed = { ...unsigned, authorityDigest: preparationAuthorityDigest(material) }
    const verifier = createPreparationAuthorityVerifier({
      evidenceReader: {
        get: async () => ({
          evidenceRef: 'authority:evidence:1', issuerId: 'issuer:ae', signerId: 'signer:trusted', keyId: 'key:trusted:1',
          authority: signed, signature: 'signature:valid',
        }),
      },
      trustedIssuers: { isTrusted: () => true },
      signatures: { verify: async (input) => input.material.authorityDigest === signed.authorityDigest },
    })

    const result = await verifier.verify({
      authorityEvidenceRef: 'authority:evidence:1', requestId: 'request:shipping:1', requestRevision: 1,
    })

    expect(result).toEqual({ kind: 'verified', authority: signed })
  })

  it('rejects a false key identifier before authority provenance is recorded', async () => {
    const verifier = createPreparationAuthorityVerifier({
      evidenceReader: {
        get: async () => ({
          evidenceRef: 'authority:evidence:1', issuerId: 'issuer:ae', signerId: 'signer:trusted', keyId: 'key:forged',
          authority: authority(), signature: 'signature:valid',
        }),
      },
      trustedIssuers: { isTrusted: (input) => input.keyId === 'key:trusted:1' },
      signatures: { verify: async () => true },
    })

    const result = await verifier.verify({
      authorityEvidenceRef: 'authority:evidence:1', requestId: 'request:shipping:1', requestRevision: 1,
    })

    expect(result).toEqual({ kind: 'refused', reason: 'authority_signer_mismatch' })
  })

  it('rechecks revocation immediately before protected values are serialized for release', async () => {
    let providerCalls = 0
    const baseStore = createInMemoryPreparationDisclosureStore([authority()])
    const store = {
      ...baseStore,
      authorizeRelease: async () => ({ kind: 'refused' as const, reason: 'authority_revoked' as const }),
    }

    const result = await releasePreparationDisclosure(disclosureCommand(), {
      verifier: verifiedAuthority(), store, now: () => 1_000,
      release: async () => {
        providerCalls += 1
        return { kind: 'released', providerEvidenceRef: 'provider:evidence:unexpected' }
      },
    })

    expect(result).toMatchObject({ kind: 'refused', reason: 'authority_revoked' })
    expect(providerCalls).toBe(0)
  })

  it('refuses a projection containing values outside the allocated field set', async () => {
    let providerCalls = 0
    const result = await releasePreparationDisclosure(disclosureCommand({
      protectedValues: { destinationPostcode: '3000', customerEmail: 'customer@example.com' },
    }), {
      verifier: verifiedAuthority(),
      store: createInMemoryPreparationDisclosureStore([authority()]),
      now: () => 1_000,
      release: async () => {
        providerCalls += 1
        return { kind: 'released', providerEvidenceRef: 'provider:evidence:unexpected' }
      },
    })

    expect(result).toMatchObject({ kind: 'refused', reason: 'authority_field_denied' })
    expect(providerCalls).toBe(0)
  })

  it('releases protected values only with a durable allocation for the concrete recipient', async () => {
    const released: unknown[] = []

    const result = await releasePreparationDisclosure(disclosureCommand(), {
      verifier: verifiedAuthority(),
      store: createInMemoryPreparationDisclosureStore([authority()]),
      now: () => 1_000,
      release: async (input) => {
        released.push(input)
        return { kind: 'released', providerEvidenceRef: 'provider:evidence:quote-1' }
      },
    })

    expect(result).toEqual({
      kind: 'released',
      providerEvidenceRef: 'provider:evidence:quote-1',
      allocationId: expect.stringMatching(/^preparation-allocation:/),
      disposition: 'released',
      releasedAt: 1_000,
    })
    expect(released).toEqual([expect.objectContaining({
      allocationId: expect.stringMatching(/^preparation-allocation:/),
      recipient: expect.objectContaining({ bindingId: 'binding:courier-a' }),
      purpose: 'shipping_rate_quote',
      protectedValues: { destinationPostcode: '3000' },
    })])
  })

  it('refuses verified authority bound to another customer before provider release', async () => {
    let providerCalls = 0
    const verifier = verifiedAuthority({ principalId: 'principal:attacker' })

    const result = await releasePreparationDisclosure(disclosureCommand(), {
      verifier,
      store: createInMemoryPreparationDisclosureStore([authority({ principalId: 'principal:attacker' })]),
      now: () => 1_000,
      release: async () => {
        providerCalls += 1
        return { kind: 'released', providerEvidenceRef: 'provider:evidence:unexpected' }
      },
    })

    expect(result).toEqual({
      kind: 'refused',
      reason: 'authority_principal_mismatch',
      nextAction: 'Use permission granted by the customer who owns this request.',
    })
    expect(providerCalls).toBe(0)
  })

  it.each([
    ['delegated agent', { delegatedAgentId: 'agent:other' }, {}, 'authority_agent_mismatch'],
    ['request', { requestId: 'request:other' }, {}, 'authority_request_mismatch'],
    ['request revision', { requestRevision: 2 }, {}, 'authority_request_revision_mismatch'],
    ['field', { permittedFields: ['parcelWeight'] }, {}, 'authority_field_denied'],
    ['recipient kind', { permittedRecipientKinds: ['selected_provider'] }, {}, 'authority_recipient_denied'],
    ['recipient binding', { permittedRecipientBindingIds: ['binding:courier-b'] }, {}, 'authority_recipient_denied'],
    ['purpose', { permittedPurposes: ['purchase_shipping_label'] }, {}, 'authority_purpose_denied'],
    ['expiry', { expiresAt: 1_000 }, {}, 'authority_expired'],
    ['revocation', { status: 'revoked' }, {}, 'authority_revoked'],
    ['future grant', { grantedAt: 1_001 }, {}, 'authority_not_yet_valid'],
  ] as const)('refuses %s scope widening before provider release', async (_label, authorityOverrides, commandOverrides, reason) => {
    let providerCalls = 0
    const verified = authority(authorityOverrides)

    const result = await releasePreparationDisclosure(disclosureCommand(commandOverrides), {
      verifier: verifiedAuthority(authorityOverrides),
      store: createInMemoryPreparationDisclosureStore([verified]),
      now: () => 1_000,
      release: async () => {
        providerCalls += 1
        return { kind: 'released', providerEvidenceRef: 'provider:evidence:unexpected' }
      },
    })

    expect(result).toMatchObject({ kind: 'refused', reason })
    expect(providerCalls).toBe(0)
  })

  it('replays the first release outcome without consuming or calling the provider twice', async () => {
    let providerCalls = 0
    const store = createInMemoryPreparationDisclosureStore([authority()])
    const dependencies = {
      verifier: verifiedAuthority(), store, now: () => 1_000,
      release: async () => {
        providerCalls += 1
        return { kind: 'released' as const, providerEvidenceRef: 'provider:evidence:quote-1' }
      },
    }

    const first = await releasePreparationDisclosure(disclosureCommand(), dependencies)
    const replay = await releasePreparationDisclosure(disclosureCommand(), dependencies)

    expect(replay).toEqual(first)
    expect(providerCalls).toBe(1)
  })

  it('refuses changed parameters under the same operation key', async () => {
    let providerCalls = 0
    const store = createInMemoryPreparationDisclosureStore([authority({ mode: 'standing', maximumOperations: 2 })])
    const dependencies = {
      verifier: verifiedAuthority({ mode: 'standing', maximumOperations: 2 }), store, now: () => 1_000,
      release: async () => {
        providerCalls += 1
        return { kind: 'released' as const, providerEvidenceRef: `provider:evidence:${providerCalls}` }
      },
    }
    await releasePreparationDisclosure(disclosureCommand(), dependencies)

    const changed = await releasePreparationDisclosure(disclosureCommand({
      protectedProjectionCommitment: 'hmac-sha256:' + '3'.repeat(64),
    }), dependencies)

    expect(changed).toEqual({
      kind: 'refused', reason: 'authority_allocation_conflict',
      nextAction: 'Start a new authorized preparation instead of changing an existing retry.',
    })
    expect(providerCalls).toBe(1)
  })

  it('binds the full concrete recipient identity to an existing operation', async () => {
    let providerCalls = 0
    const store = createInMemoryPreparationDisclosureStore([authority()])
    const dependencies = {
      verifier: verifiedAuthority(), store, now: () => 1_000,
      release: async () => {
        providerCalls += 1
        return { kind: 'released' as const, providerEvidenceRef: 'provider:evidence:quote-1' }
      },
    }
    await releasePreparationDisclosure(disclosureCommand(), dependencies)

    const changedRecipient = await releasePreparationDisclosure(disclosureCommand({
      recipient: {
        nodeId: 'node:attacker', bindingId: 'binding:courier-a', name: 'Imposter Courier', kind: 'candidate_provider',
      },
    }), dependencies)

    expect(changedRecipient).toMatchObject({ kind: 'refused', reason: 'authority_allocation_conflict' })
    expect(providerCalls).toBe(1)
  })

  it('reuses the allocation as provider idempotency after a crash before resolution', async () => {
    let providerEffects = 0
    let failResolution = true
    const providerOutcomes = new Map<string, string>()
    const baseStore = createInMemoryPreparationDisclosureStore([authority()])
    const store = {
      ...baseStore,
      resolve: async (input: Parameters<typeof baseStore.resolve>[0]) => {
        if (failResolution) {
          failResolution = false
          throw new Error('simulated_process_crash_before_resolution')
        }
        return await baseStore.resolve(input)
      },
    }
    const dependencies = {
      verifier: verifiedAuthority(), store, now: () => 1_000,
      release: async (input: { allocationId: string }) => {
        const existing = providerOutcomes.get(input.allocationId)
        if (existing !== undefined) return { kind: 'released' as const, providerEvidenceRef: existing }
        providerEffects += 1
        const evidence = 'provider:evidence:quote-1'
        providerOutcomes.set(input.allocationId, evidence)
        return { kind: 'released' as const, providerEvidenceRef: evidence }
      },
    }

    await expect(releasePreparationDisclosure(disclosureCommand(), dependencies)).rejects.toThrow('simulated_process_crash_before_resolution')
    const recovered = await releasePreparationDisclosure(disclosureCommand(), dependencies)

    expect(recovered).toMatchObject({ kind: 'released', providerEvidenceRef: 'provider:evidence:quote-1' })
    expect(providerEffects).toBe(1)
  })

  it('enforces one cumulative recipient ceiling across preparation generations', async () => {
    let providerCalls = 0
    const standing = authority({
      mode: 'standing', maximumRecipients: 1, maximumExposures: 2, maximumOperations: 2,
      permittedRecipientBindingIds: ['binding:courier-a', 'binding:courier-b'],
    })
    const store = createInMemoryPreparationDisclosureStore([standing])
    const dependencies = {
      verifier: verifiedAuthority(standing), store, now: () => 1_000,
      release: async () => {
        providerCalls += 1
        return { kind: 'released' as const, providerEvidenceRef: `provider:evidence:${providerCalls}` }
      },
    }
    await releasePreparationDisclosure(disclosureCommand(), dependencies)

    const secondGeneration = await releasePreparationDisclosure(disclosureCommand({
      operationKey: 'prepare:shipping:2:recipient:courier-b',
      planRevisionId: 'plan:shipping:2',
      recipient: {
        nodeId: 'node:courier-b', bindingId: 'binding:courier-b', name: 'Courier B', kind: 'candidate_provider',
      },
    }), dependencies)

    expect(secondGeneration).toMatchObject({ kind: 'refused', reason: 'authority_recipient_capacity_exceeded' })
    expect(providerCalls).toBe(1)
  })

  it('keeps an ambiguous provider release consumed and does not retry it blindly', async () => {
    let providerCalls = 0
    const store = createInMemoryPreparationDisclosureStore([authority()])
    const dependencies = {
      verifier: verifiedAuthority(), store, now: () => 1_000,
      release: async (): Promise<never> => {
        providerCalls += 1
        throw new Error('provider_timeout_after_send')
      },
    }

    const first = await releasePreparationDisclosure(disclosureCommand(), dependencies)
    const retry = await releasePreparationDisclosure(disclosureCommand(), dependencies)

    expect(first).toEqual({
      kind: 'uncertain', allocationId: expect.stringMatching(/^preparation-allocation:/),
      disposition: 'uncertain', nextAction: 'Wait while AE checks whether Courier A received the data.',
    })
    expect(retry).toEqual(first)
    expect(providerCalls).toBe(1)

    if (first.kind !== 'uncertain') throw new Error('expected_uncertain')
    const reconciled = await store.reconcileReleased({
      allocationId: first.allocationId, providerEvidenceRef: 'provider:quote:1', reconciledAt: 1_100,
    })
    expect(reconciled).toMatchObject({
      disposition: 'released', providerEvidenceRef: 'provider:quote:1', uncertainAt: 1_000, reconciledAt: 1_100,
    })
    expect(() => store.reconcileReleased({
      allocationId: first.allocationId, providerEvidenceRef: 'provider:quote:other', reconciledAt: 1_200,
    })).toThrow('preparation_allocation_reconciliation_conflict')
  })
})

function verifiedAuthority(overrides: Partial<VerifiedPreparationAuthority> = {}): PreparationAuthorityVerifier {
  return {
    verify: async () => ({
      kind: 'verified',
      authority: authority(overrides),
    }),
  }
}

function authority(overrides: Partial<VerifiedPreparationAuthority> = {}): VerifiedPreparationAuthority {
  const base: Omit<VerifiedPreparationAuthority, 'authorityDigest' | 'status' | 'verification'> = {
    authorityId: 'preparation-authority:1', authorityVersion: 1,
    principalId: 'principal:customer:1', delegatedAgentId: 'agent:customer:1',
    requestId: 'request:shipping:1', requestRevision: 1, mode: 'single_use',
    permittedFields: ['destinationPostcode'], permittedRecipientKinds: ['candidate_provider'],
    permittedRecipientBindingIds: ['binding:courier-a'], permittedPurposes: ['shipping_rate_quote'],
    maximumRecipients: 1, maximumExposures: 1, maximumOperations: 1,
    grantedAt: 900, expiresAt: 2_000,
  }
  const {
    authorityDigest: suppliedDigest, status: suppliedStatus,
    verification: suppliedVerification, ...materialOverrides
  } = overrides
  const material = { ...base, ...materialOverrides }
  return {
    ...material,
    status: suppliedStatus ?? 'active',
    verification: suppliedVerification ?? {
      evidenceRef: 'authority:evidence:1', issuerId: 'issuer:ae', signerId: 'signer:trusted', keyId: 'key:trusted:1',
    },
    authorityDigest: suppliedDigest ?? preparationAuthorityDigest(material),
  }
}

function disclosureCommand(overrides: Partial<PreparationDisclosureCommand> = {}): PreparationDisclosureCommand {
  return {
    operationKey: 'prepare:shipping:1:recipient:courier-a',
    authorityUseKey: 'prepare:shipping:1',
    authorityEvidenceRef: 'authority:forged',
    principalId: 'principal:customer:1',
    delegatedAgentId: 'agent:customer:1',
    requestId: 'request:shipping:1',
    requestRevision: 1,
    planRevisionId: 'plan:shipping:1',
    actionId: 'action:quote',
    capabilityContractId: 'shipping.rate.query:v1',
    resolvedInputDigest: 'sha256:' + '1'.repeat(64),
    protectedProjectionCommitment: 'hmac-sha256:' + '2'.repeat(64),
    recipient: {
      nodeId: 'node:courier-a', bindingId: 'binding:courier-a', name: 'Courier A',
      kind: 'candidate_provider' as const,
    },
    purpose: 'shipping_rate_quote',
    purposeLabel: 'Compare shipping prices',
    fields: ['destinationPostcode'],
    fieldCategories: [{ field: 'destinationPostcode', label: 'Destination postcode' }],
    protectedValues: { destinationPostcode: '3000' },
    ...overrides,
  }
}
