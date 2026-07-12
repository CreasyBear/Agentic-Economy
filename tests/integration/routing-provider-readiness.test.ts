import { describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import {
  loadEasyPostConfiguration,
  loadShippoConfiguration,
  providerReadinessInventory,
} from '../../examples/routing-provider/lib/provider-configuration.mjs'
import { providerOperationObservation } from '../../examples/routing-provider/lib/live-capability-handler.mjs'

const signingKey = 'provider-quote-signing-key-with-at-least-32-bytes'
const shippoToken = 'shippo-secret-token-do-not-print'
const easyPostKey = 'easypost-secret-key-do-not-print'

describe('live provider secret-safe readiness', () => {
  it('validates both provider configurations without emitting credential or shipment values', () => {
    const env = configuredEnvironment()

    expect(loadShippoConfiguration(env)).toMatchObject({ provider: 'shippo', carrierAccountId: 'shippo-carrier', serviceLevelToken: 'au-express' })
    expect(loadEasyPostConfiguration(env)).toMatchObject({ provider: 'easypost', carrierAccountId: 'easypost-carrier', service: 'ExpressPost' })
    const inventory = providerReadinessInventory(env)
    expect(inventory).toMatchObject({
      schemaVersion: 'ae-provider-readiness:v1',
      shippo: { status: 'configured', checks: { SHIPPO_API_TOKEN: 'present', SHIPPO_TRACER_SHIPMENT_JSON: 'present' } },
      easypost: { status: 'configured', checks: { EASYPOST_API_KEY: 'present', EASYPOST_TRACER_SHIPMENT_JSON: 'present' } },
    })
    const serialized = JSON.stringify(inventory)
    expect(serialized).not.toContain(shippoToken)
    expect(serialized).not.toContain(easyPostKey)
    expect(serialized).not.toContain('1 Secret Street')
    expect(serialized).not.toContain('shippo-carrier')
    expect(serialized).not.toContain('easypost-carrier')
  })

  it('distinguishes missing from malformed configuration using bounded reason codes only', () => {
    const missing = providerReadinessInventory({})
    expect(missing.shippo).toMatchObject({ status: 'unconfigured', evidenceClass: 'local_configuration_only', liveReachability: 'unverified', reason: 'AE_PROVIDER_TOKEN_invalid' })
    expect(missing.easypost).toMatchObject({ status: 'unconfigured', evidenceClass: 'local_configuration_only', liveReachability: 'unverified', reason: 'AE_PROVIDER_TOKEN_invalid' })

    const malformed = configuredEnvironment()
    malformed.SHIPPO_TRACER_SHIPMENT_JSON = JSON.stringify({ address_from: {}, address_to: {}, parcels: [] })
    malformed.EASYPOST_TRACER_SHIPMENT_JSON = JSON.stringify({ from_address: {}, to_address: {}, parcel: [] })
    const inventory = providerReadinessInventory(malformed)
    expect(inventory.shippo).toMatchObject({ status: 'invalid', reason: 'SHIPPO_TRACER_SHIPMENT_JSON_invalid' })
    expect(inventory.easypost).toMatchObject({ status: 'invalid', reason: 'EASYPOST_TRACER_SHIPMENT_JSON_invalid' })
    expect(JSON.stringify(inventory)).not.toContain('1 Secret Street')
  })

  it('rejects malformed shipment shapes before any carrier request can be created', () => {
    const env = configuredEnvironment()
    env.SHIPPO_TRACER_SHIPMENT_JSON = JSON.stringify({ address_from: {}, address_to: {}, parcels: [{}, {}] })
    env.EASYPOST_CARRIER_ACCOUNT_ID = 'x'.repeat(201)

    expect(() => loadShippoConfiguration(env)).toThrow('SHIPPO_TRACER_SHIPMENT_JSON_invalid')
    expect(() => loadEasyPostConfiguration(env)).toThrow('EASYPOST_CARRIER_ACCOUNT_ID_invalid')
  })

  it('emits only hashed execution correlations and an explicit no-retry disposition', () => {
    const observation = providerOperationObservation('shippo', 'execute', {
      rootRunId: 'root-run-sensitive', leafRunId: 'leaf-run-sensitive', stepGrantId: 'step-grant-sensitive',
      providerQuoteRef: 'provider-quote-sensitive', data: { address: '1 Secret Street' },
    }, { kind: 'outcome_unknown', providerReference: 'transaction-sensitive' }, 'idempotency-sensitive', 'environment-specific-observability-key-32-bytes')
    expect(observation).toMatchObject({
      schemaVersion: 'ae-provider-observation:v1', provider: 'shippo', operation: 'execute',
      resultKind: 'outcome_unknown', retryDisposition: 'reconcile_only',
      rootRunRef: expect.stringMatching(/^hmac-sha256:[0-9a-f]{64}$/),
      idempotencyRef: expect.stringMatching(/^hmac-sha256:[0-9a-f]{64}$/),
    })
    const serialized = JSON.stringify(observation)
    for (const secret of ['root-run-sensitive', 'leaf-run-sensitive', 'step-grant-sensitive', 'provider-quote-sensitive', '1 Secret Street', 'transaction-sensitive', 'idempotency-sensitive']) {
      expect(serialized).not.toContain(secret)
    }
  })

  it('fails readiness gates when providers are not configured while allowing explicit inventory-only inspection', () => {
    const runner = fileURLToPath(new URL('../../examples/routing-provider/run-provider-readiness.mjs', import.meta.url))
    const environment = { PATH: process.env.PATH ?? '' }
    const gate = spawnSync(process.execPath, [runner], { env: environment, encoding: 'utf8' })
    const inventoryOnly = spawnSync(process.execPath, [runner, '--inventory-only'], { env: environment, encoding: 'utf8' })
    expect(gate.status).toBe(1)
    expect(inventoryOnly.status).toBe(0)
    expect(JSON.parse(gate.stdout)).toMatchObject({ shippo: { status: 'unconfigured' }, easypost: { status: 'unconfigured' } })
  })
})

function configuredEnvironment(): Record<string, string> {
  return {
    AE_PROVIDER_TOKEN: 'endpoint-bearer-token-with-at-least-32-bytes',
    AE_PROVIDER_OBSERVABILITY_KEY: 'environment-specific-observability-key-32-bytes',
    AE_PROVIDER_QUOTE_SIGNING_KEY: signingKey,
    SHIPPO_API_TOKEN: shippoToken,
    SHIPPO_CARRIER_ACCOUNT_ID: 'shippo-carrier',
    SHIPPO_SERVICE_LEVEL_TOKEN: 'au-express',
    SHIPPO_TRACER_SHIPMENT_JSON: JSON.stringify({
      address_from: address('Sender', '1 Secret Street'), address_to: address('Recipient', '2 Private Road'),
      parcels: [{ length: '10', width: '8', height: '4', distance_unit: 'cm', weight: '1.5', mass_unit: 'kg' }],
    }),
    EASYPOST_API_KEY: easyPostKey,
    EASYPOST_CARRIER_ACCOUNT_ID: 'easypost-carrier',
    EASYPOST_SERVICE: 'ExpressPost',
    EASYPOST_TRACER_SHIPMENT_JSON: JSON.stringify({
      from_address: address('Sender', '1 Secret Street'), to_address: address('Recipient', '2 Private Road'),
      parcel: { length: 10, width: 8, height: 4, distance_unit: 'cm', weight: 1.5, mass_unit: 'kg' },
    }),
  }
}

function address(name: string, street1: string) {
  return { name, street1, city: 'Perth', state: 'WA', zip: '6000', country: 'AU' }
}
