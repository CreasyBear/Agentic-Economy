import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'

import { api, internal } from '../../convex/_generated/api'
import schema from '../../convex/schema'
import {
  convexModules as modules,
  ownerAdmin,
  publishedBusinessOwner,
} from '../helpers/convex-fixtures'
import {
  bindingRegistration,
  offeringRegistration,
  operationContext,
  providerAuthority,
  publishAndObserveCapability,
  registerContract,
  registerProviderConnection,
  runBindingRegistration,
  runEligibility,
  runOfferingRegistration,
  runQuarantine,
} from './capability-supply-registration-harness'

describe('V2 capability supply registration — binding', () => {
  it('refuses adapter, exact-ref, identity and stored-integrity drift without a V1 fallback', async () => {
    const backend = convexTest(schema, modules)
    const admin = await ownerAdmin(backend, 'user_capability_supply_admin')
    const ref = await registerContract(admin)
    const { businessId, owner } = await publishedBusinessOwner(backend, 'supply-one')
    await registerProviderConnection(admin, businessId, bindingRegistration(ref))
    const offeringArgs = {
      registration: offeringRegistration(businessId, ref), ...operationContext('offering'),
    }
    await expect(runOfferingRegistration(backend, {
      ...offeringArgs,
      registration: { ...offeringArgs.registration, operation: 'quote' },
    })).resolves.toEqual({ kind: 'refused', reason: 'offering_invalid' })
    const offering = await runOfferingRegistration(backend, offeringArgs)
    if (offering.kind !== 'registered') throw new Error('offering registration failed')

    await expect(runOfferingRegistration(backend, {
      ...offeringArgs,
      registration: {
        ...offeringArgs.registration,
        presentation: { ...offeringArgs.registration.presentation, summary: 'Changed under the same key.' },
      },
    })).resolves.toEqual({ kind: 'refused', reason: 'operation_key_conflict' })

    await expect(runBindingRegistration(backend, {
      registration: {
        ...bindingRegistration(ref),
        adapter: {
          adapterId: 'not-registered:v1',
          config: {},
        },
      },
      ...operationContext('unknown-adapter'),
    })).resolves.toEqual({ kind: 'refused', reason: 'adapter_not_registered' })

    await expect(runBindingRegistration(backend, {
      registration: {
        ...bindingRegistration(ref),
        adapter: {
          adapterId: 'http-json:v1',
          config: { method: 'POST' as const, requestTimeoutMs: 5_000, vertical: 'shipping' },
        },
      },
      ...operationContext('invalid-config'),
    })).resolves.toEqual({ kind: 'refused', reason: 'adapter_config_invalid' })

    await expect(runBindingRegistration(backend, {
      registration: {
        ...bindingRegistration(ref),
        contractRef: { ...ref, contractDigest: `sha256:${'f'.repeat(64)}` },
      },
      ...operationContext('digest-mismatch'),
    })).resolves.toEqual({ kind: 'refused', reason: 'offering_binding_mismatch' })

    const binding = await runBindingRegistration(backend, {
      registration: bindingRegistration(ref), ...operationContext('binding'),
    })
    if (binding.kind !== 'registered') throw new Error('binding registration failed')
    await registerProviderConnection(admin, businessId, {
      ...bindingRegistration(ref),
      bindingId: 'binding:supply-one:http:healthy',
      endpointUrl: 'https://healthy.example.test/capability',
      authority: providerAuthority('healthy'),
    })
    const healthyBinding = await runBindingRegistration(backend, {
      registration: {
        ...bindingRegistration(ref), bindingId: 'binding:supply-one:http:healthy',
        endpointUrl: 'https://healthy.example.test/capability', authority: providerAuthority('healthy'),
      },
      ...operationContext('healthy-binding'),
    })
    if (healthyBinding.kind !== 'registered') throw new Error('healthy binding registration failed')
    await runEligibility(backend, {
      offeringId: offering.offeringId, bindingId: binding.bindingId, contractRef: ref,
      decision: 'admit',
      expectedOfferingRegistrationHash: offering.registrationHash,
      expectedBindingRegistrationHash: binding.registrationHash,
      admissionEvidenceRefs: ['review:business-and-contract'],
      conformanceEvidenceRefs: ['review:http-adapter-contract'],
      ...operationContext('eligibility'),
    })
    await runEligibility(backend, {
      offeringId: offering.offeringId, bindingId: healthyBinding.bindingId, contractRef: ref,
      decision: 'admit',
      expectedOfferingRegistrationHash: offering.registrationHash,
      expectedBindingRegistrationHash: healthyBinding.registrationHash,
      admissionEvidenceRefs: ['review:business-and-contract'],
      conformanceEvidenceRefs: ['review:http-adapter-contract'],
      ...operationContext('healthy-eligibility'),
    })
    await publishAndObserveCapability(backend, owner, businessId, offeringArgs.registration, {
      ...bindingRegistration(ref),
      bindingId: healthyBinding.bindingId,
      endpointUrl: 'https://healthy.example.test/capability',
      authority: providerAuthority('healthy'),
    }, 'healthy')
    await backend.run(async (ctx) => {
      const row = await ctx.db.query('capabilityTransportBindings')
        .withIndex('by_bindingId', (query) => query.eq('bindingId', binding.bindingId)).unique()
      if (row === null) throw new Error('binding missing')
      await ctx.db.patch(row._id, { registrationHash: 'corrupt' })
    })
    await expect(backend.query(internal.capabilitySupply.listIntegrated, { networkId: 'ae:public', limit: 32, now: Date.now() }))
      .resolves.toEqual({ kind: 'unavailable', reason: 'supply_integrity_failure' })
    const controlState = await admin.query(api.capabilitySupply.inspectBindingControlState, {
      bindingId: binding.bindingId,
    })
    if (controlState.kind !== 'available') throw new Error('binding control state unavailable')
    await expect(runQuarantine(backend, {
      bindingId: binding.bindingId, expectedObservedRowDigest: controlState.observedRowDigest,
      ...operationContext('quarantine-corrupt-binding'),
    })).resolves.toMatchObject({ kind: 'quarantined', bindingId: binding.bindingId })
    const recovered = await backend.query(internal.capabilitySupply.listIntegrated, { networkId: 'ae:public', limit: 32, now: Date.now() })
    expect(recovered).toMatchObject({
      kind: 'available', supplies: [{ binding: { bindingId: healthyBinding.bindingId } }],
    })
  })
})
