import { describe, expect, it } from 'vitest'

import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { SupplyCommandActor } from '@/modules/capability-supply/internal/shared/command-envelope'
import {
  CAPABILITY_PUBLICATION_AUTHORITY_MODES,
  defineCapabilityPublicationProvenance,
  validCapabilityPublicationAuthority,
} from '@/modules/capability-supply/internal/publication/provenance'

const sourceDigest = canonicalDigest({ seed: 'observable-provenance-test' })

const actor = (kind: SupplyCommandActor['kind']): SupplyCommandActor => ({ kind, ref: 'actor:1' })

describe('capability publication provenance tri-state (agentic.market 1P/3P/observed, design §8.1)', () => {
  it('exposes all four authority modes', () => {
    expect(CAPABILITY_PUBLICATION_AUTHORITY_MODES).toEqual([
      'provider_owned',
      'ae_curated_external',
      'third_party_gateway',
      'observed_external',
    ])
  })

  it('maps each mode to its allowed actor kinds', () => {
    // provider_owned -> owner only (1P direct)
    expect(validCapabilityPublicationAuthority(actor('owner'), 'provider_owned')).toBe(true)
    expect(validCapabilityPublicationAuthority(actor('admin'), 'provider_owned')).toBe(false)
    expect(validCapabilityPublicationAuthority(actor('system'), 'provider_owned')).toBe(false)

    // ae_curated_external and third_party_gateway -> admin|system (curated; 3P via gateway)
    for (const mode of ['ae_curated_external', 'third_party_gateway'] as const) {
      expect(validCapabilityPublicationAuthority(actor('admin'), mode)).toBe(true)
      expect(validCapabilityPublicationAuthority(actor('system'), mode)).toBe(true)
      expect(validCapabilityPublicationAuthority(actor('owner'), mode)).toBe(false)
    }

    // observed_external -> system only (not yet verified; never admit-by-owner)
    expect(validCapabilityPublicationAuthority(actor('system'), 'observed_external')).toBe(true)
    expect(validCapabilityPublicationAuthority(actor('admin'), 'observed_external')).toBe(false)
    expect(validCapabilityPublicationAuthority(actor('owner'), 'observed_external')).toBe(false)
  })

  it('empty actor ref is never authorized', () => {
    expect(validCapabilityPublicationAuthority({ kind: 'system', ref: ' ' }, 'observed_external')).toBe(false)
    expect(validCapabilityPublicationAuthority({ kind: 'owner', ref: '' }, 'provider_owned')).toBe(false)
  })

  it('defines provenance for all four modes with the right actor kind', () => {
    const p1 = defineCapabilityPublicationProvenance({ actor: actor('owner'), authorityMode: 'provider_owned', sourceRevision: 'rev:1', sourceDigest })
    const p2 = defineCapabilityPublicationProvenance({ actor: actor('admin'), authorityMode: 'ae_curated_external', sourceRevision: 'rev:1', sourceDigest })
    const p3 = defineCapabilityPublicationProvenance({ actor: actor('admin'), authorityMode: 'third_party_gateway', sourceRevision: 'rev:1', sourceDigest })
    const p4 = defineCapabilityPublicationProvenance({ actor: actor('system'), authorityMode: 'observed_external', sourceRevision: 'rev:1', sourceDigest })

    expect(p1.authorityMode).toBe('provider_owned')
    expect(p2.authorityMode).toBe('ae_curated_external')
    expect(p3.authorityMode).toBe('third_party_gateway')
    expect(p4.authorityMode).toBe('observed_external')
    for (const p of [p1, p2, p3, p4]) {
      expect(p.provenanceDigest).toMatch(/^sha256:[0-9a-f]{64}$/)
    }
  })

  it('rejects defining provenance with a disallowed actor kind for each mode', () => {
    expect(() => defineCapabilityPublicationProvenance({ actor: actor('admin'), authorityMode: 'provider_owned', sourceRevision: 'rev:1', sourceDigest })).toThrow()
    expect(() => defineCapabilityPublicationProvenance({ actor: actor('owner'), authorityMode: 'third_party_gateway', sourceRevision: 'rev:1', sourceDigest })).toThrow()
    expect(() => defineCapabilityPublicationProvenance({ actor: actor('admin'), authorityMode: 'observed_external', sourceRevision: 'rev:1', sourceDigest })).toThrow()
  })

  it('includes the authority mode in the provenance digest (unforgeable)', () => {
    const base = { actor: actor('system'), sourceRevision: 'rev:1', sourceDigest } as const
    const dAdmin = defineCapabilityPublicationProvenance({ ...base, authorityMode: 'ae_curated_external' })
    const dGateway = defineCapabilityPublicationProvenance({ ...base, authorityMode: 'third_party_gateway' })
    const dObserved = defineCapabilityPublicationProvenance({ ...base, authorityMode: 'observed_external' })
    // identical input except the mode -> distinct digest
    expect(dAdmin.provenanceDigest).not.toBe(dGateway.provenanceDigest)
    expect(dGateway.provenanceDigest).not.toBe(dObserved.provenanceDigest)
  })

  it('keeps provider_owned/ae_curated_external provenance byte-identical (unchanged algorithm)', () => {
    // provider_owned + owner: pin exact digest = canonicalDigest over the unchanged 4-field shape
    const owned = defineCapabilityPublicationProvenance({ actor: actor('owner'), authorityMode: 'provider_owned', sourceRevision: 'rev:1', sourceDigest })
    const ownedExpected = canonicalDigest({
      publisherRef: 'actor:1',
      authorityMode: 'provider_owned',
      sourceRevision: 'rev:1',
      sourceDigest,
    })
    expect(owned.provenanceDigest).toBe(ownedExpected)

    // deterministic: repeated calls produce identical digest (legacy modes unchanged)
    const again = defineCapabilityPublicationProvenance({ actor: actor('owner'), authorityMode: 'provider_owned', sourceRevision: 'rev:1', sourceDigest })
    expect(again.provenanceDigest).toBe(owned.provenanceDigest)

    const curated = defineCapabilityPublicationProvenance({ actor: actor('admin'), authorityMode: 'ae_curated_external', sourceRevision: 'rev:1', sourceDigest })
    expect(curated.provenanceDigest).toBe(canonicalDigest({
      publisherRef: 'actor:1',
      authorityMode: 'ae_curated_external',
      sourceRevision: 'rev:1',
      sourceDigest,
    }))
  })
})
