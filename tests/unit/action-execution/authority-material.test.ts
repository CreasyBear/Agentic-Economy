import { describe, expect, it } from 'vitest'

import {
  buildCanonicalClaimCommand,
  canonicalAuthorityBasisMaterial,
} from '@/modules/action-execution/runtime'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { stableStringify } from '@/modules/common/stable-hash'

const vectors = [
  {
    name: 'approval_required',
    basis: {
      kind: 'approval_required' as const,
      authorityRef: 'authority:explicit:7',
    },
    canonical: {
      kind: 'approve_each' as const,
      authorityRef: 'authority:explicit:7',
    },
    json: '{"authorityRef":"authority:explicit:7","kind":"approve_each"}',
    digest: 'sha256:09739fb4cd2a90edeb5904b032e26f21207d1404eed91302bce68c30185282eb',
  },
  {
    name: 'spending_policy_use',
    basis: {
      kind: 'spending_policy_use' as const,
      spendingPolicyRef: 'mandate:bounded:7',
      spendingPolicyVersion: 2,
      spendingPolicyGeneration: 7,
      authorityUseRef: 'authority-use:bounded:7',
      grantEvidenceRef: 'grant-evidence:bounded:7',
    },
    canonical: {
      kind: 'standing_mandate_use' as const,
      mandateRef: 'mandate:bounded:7',
      mandateVersion: 2,
      mandateGeneration: 7,
      authorityUseRef: 'authority-use:bounded:7',
      grantEvidenceRef: 'grant-evidence:bounded:7',
    },
    json: '{"authorityUseRef":"authority-use:bounded:7","grantEvidenceRef":"grant-evidence:bounded:7","kind":"standing_mandate_use","mandateGeneration":7,"mandateRef":"mandate:bounded:7","mandateVersion":2}',
    digest: 'sha256:41936e95851c29751cfa7c862d5341f7862e8dccab4c6d2fef9a3f8dfbf233f9',
  },
  {
    name: 'customer_request_authorization_use with explicit authorization',
    basis: {
      kind: 'customer_request_authorization_use' as const,
      requestAuthorizationRef: 'mandate:request:7',
      requestAuthorizationDigest: 'sha256:mandate',
      requestRevision: 3,
      routeGeneration: 4,
      authorization: {
        kind: 'explicit' as const,
        authorizationEvidenceRef: 'approval:evidence:7',
        authorizationEvidenceDigest: 'sha256:approval',
      },
      grantRef: 'grant:7',
      grantDigest: 'sha256:grant',
    },
    canonical: {
      kind: 'customer_request_mandate_use' as const,
      mandateRef: 'mandate:request:7',
      mandateDigest: 'sha256:mandate',
      requestRevision: 3,
      routeGeneration: 4,
      authorization: {
        kind: 'explicit' as const,
        authorizationEvidenceRef: 'approval:evidence:7',
        authorizationEvidenceDigest: 'sha256:approval',
      },
      grantRef: 'grant:7',
      grantDigest: 'sha256:grant',
    },
    json: '{"authorization":{"authorizationEvidenceDigest":"sha256:approval","authorizationEvidenceRef":"approval:evidence:7","kind":"explicit"},"grantDigest":"sha256:grant","grantRef":"grant:7","kind":"customer_request_mandate_use","mandateDigest":"sha256:mandate","mandateRef":"mandate:request:7","requestRevision":3,"routeGeneration":4}',
    digest: 'sha256:d6cdbc5fdb7c02b18a607b45f31f8d781594a975f8f4f7405e6da6207568d364',
  },
  {
    name: 'customer_request_authorization_use with standing low-risk authorization',
    basis: {
      kind: 'customer_request_authorization_use' as const,
      requestAuthorizationRef: 'mandate:request:8',
      requestAuthorizationDigest: 'sha256:mandate8',
      requestRevision: 5,
      routeGeneration: 6,
      authorization: {
        kind: 'spending_policy_low_risk' as const,
        spendingPolicyRef: 'standing-policy:8',
        spendingPolicyDigest: 'sha256:policy8',
        authorityUseRef: 'authority-use:8',
      },
      grantRef: 'grant:8',
      grantDigest: 'sha256:grant8',
    },
    canonical: {
      kind: 'customer_request_mandate_use' as const,
      mandateRef: 'mandate:request:8',
      mandateDigest: 'sha256:mandate8',
      requestRevision: 5,
      routeGeneration: 6,
      authorization: {
        kind: 'standing_low_risk' as const,
        standingPolicyRef: 'standing-policy:8',
        standingPolicyDigest: 'sha256:policy8',
        authorityUseRef: 'authority-use:8',
      },
      grantRef: 'grant:8',
      grantDigest: 'sha256:grant8',
    },
    json: '{"authorization":{"authorityUseRef":"authority-use:8","kind":"standing_low_risk","standingPolicyDigest":"sha256:policy8","standingPolicyRef":"standing-policy:8"},"grantDigest":"sha256:grant8","grantRef":"grant:8","kind":"customer_request_mandate_use","mandateDigest":"sha256:mandate8","mandateRef":"mandate:request:8","requestRevision":5,"routeGeneration":6}',
    digest: 'sha256:8f2cc0422262e11a5984c446b464b358170bb910fd8cf06d7179899e9bdcca32',
  },
  {
    name: 'public_capability_use',
    basis: {
      kind: 'public_capability_use' as const,
      publicationRef: 'publication:7',
      publicationRevision: 2,
      toolRef: 'operation:7',
      bindingId: 'binding:7',
      bindingRegistrationHash: 'sha256:binding',
    },
    canonical: {
      kind: 'public_capability_use' as const,
      publicationRef: 'publication:7',
      publicationRevision: 2,
      operationRef: 'operation:7',
      bindingId: 'binding:7',
      bindingRegistrationHash: 'sha256:binding',
    },
    json: '{"bindingId":"binding:7","bindingRegistrationHash":"sha256:binding","kind":"public_capability_use","operationRef":"operation:7","publicationRef":"publication:7","publicationRevision":2}',
    digest: 'sha256:c9543827fc5e9741ea85984c45301f793a7a47fafa2c88b9aa0cb5f5f3ce6543',
  },
] as const

describe('canonical authority basis material', () => {
  it('preserves the pre-policy-cutover hash vectors for every accepted basis', () => {
    for (const vector of vectors) {
      const material = canonicalAuthorityBasisMaterial(vector.basis)

      expect(material, vector.name).toEqual(vector.canonical)
      expect(stableStringify(material), vector.name).toBe(vector.json)
      expect(canonicalDigest(material), vector.name).toBe(vector.digest)
    }
  })

  it('keeps canonical claim runtime authority separate from hash material', () => {
    const basis = vectors[0].basis
    const command = buildCanonicalClaimCommand({
      executionRef: 'execution:authority-material',
      sourceRef: 'source:authority-material',
      executionVersion: 1,
      expectedExecutionVersion: null,
      actor: {
        callerRef: 'caller:authority-material',
        principalRef: 'principal:authority-material',
      },
      origin: {
        kind: 'standalone',
        callerRef: 'caller:authority-material',
        principalRef: 'principal:authority-material',
      },
      action: { id: 'action:authority-material', contractVersion: 'v1' },
      materialInputDigest: 'sha256:material-authority-material',
      authority: {
        reference: basis.authorityRef,
        decisionDigest: 'sha256:decision-authority-material',
        targetDigest: 'sha256:target-authority-material',
        consequence: 'invoke',
        limits: { attempts: 1 },
        expiresAt: '2026-01-01T00:01:00.000Z',
        acceptedBasis: basis,
      },
      attempt: {
        attemptRef: 'attempt:authority-material',
        attemptNumber: 1,
        effectGeneration: 1,
        operationKey: 'operation:authority-material',
        leaseOwner: 'lease:authority-material',
        leaseExpiresAt: '2026-01-01T00:01:00.000Z',
      },
      recordedAt: '2026-01-01T00:00:00.000Z',
    })

    expect(command.row.authorityBinding).toBeDefined()
    if (command.row.authorityBinding === undefined) return
    expect(command.row.authorityBinding.acceptedBasis).toEqual(basis)
    expect((command.canonicalCommandMaterial as { authority: { acceptedBasis: unknown } }).authority.acceptedBasis)
      .toEqual(canonicalAuthorityBasisMaterial(basis))
    expect(command.commandDigest).toBe('sha256:fd71f1cb4e8a50accb2d655f4d112ccb80935ee895a8ba4039801a6ce9120862')
  })
})
