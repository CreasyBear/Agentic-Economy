import { describe, expect, it, vi } from 'vitest'
import { validatePaymentRequired } from '@x402/core/schemas'

import {
  publishPreparedCapabilityCommand,
  type PreparedPublicationMaterial,
} from '@/modules/capability-supply/internal/publication'
import { publicationSourceDigest } from '@/modules/capability-supply/internal/publication/source'
import type { OperationKeyRecord } from '@/modules/capability-supply/internal/operation-ledger'
import { stableStringify, type StableHashValue } from '@/modules/common/stable-hash'
import {
  capabilityOperationId,
  capabilityPublicationProvenanceDigest,
  createPublicOperationRef,
} from '@/modules/capability-supply/public'
import * as publicationImporters from '@/modules/capability-supply/internal/publication-importers'

import {
  actor,
  context,
  emptyPorts,
  encodedFor,
  preparedPublication,
  preparedWithSourceAdapter,
} from './publication-commands-harness'

describe('capability-supply publication commands publish', () => {
  it('refuses externally supplied prepared publish on invalid source revision', async () => {
    const prepared = await preparedPublication()
    for (const sourceRevision of ['', 'source revision']) {
      const result = await publishPreparedCapabilityCommand({
        businessId: 'business-1',
        prepared: { ...prepared, sourceRevision },
        ...context,
        actor,
        now: 10,
      }, emptyPorts())
      expect(result).toEqual({ kind: 'refused', reason: 'source_revision_invalid' })
    }

    const valid = await publishPreparedCapabilityCommand({
      businessId: 'business-1',
      prepared,
      ...context,
      actor,
      now: 10,
    }, emptyPorts())
    expect(valid).toMatchObject({
      kind: 'published',
      sourceRevision: prepared.sourceRevision,
    })
  })

  it('preserves source_invalid from prepared admission mapping', async () => {
    const prepared = await preparedPublication()
    const sourceDescriptorJson = '{'
    const result = await publishPreparedCapabilityCommand({
      businessId: 'business-1',
      prepared: {
        ...prepared,
        sourceDescriptorJson,
        sourceDigest: publicationSourceDigest({
          sourceKind: prepared.sourceKind,
          selector: prepared.sourceSelector,
          descriptorJson: sourceDescriptorJson,
        }),
      },
      ...context,
      actor,
      now: 10,
    }, emptyPorts())
    expect(result).toEqual({ kind: 'refused', reason: 'source_invalid' })
  })

  it('requires source-specific transport adapters for prepared publications', async () => {
    const prepared = await preparedPublication()
    const x402Adapter = {
      adapterId: 'x402-fetch:v2',
      config: {
        method: 'POST' as const,
        requestTimeoutMs: 5_000,
        scheme: 'exact' as const,
        network: 'eip155:84532',
        currency: 'USD',
        routeAmountExponent: 2,
        assetAmountExponent: 6,
        asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
        payTo: '0x209693Bc6afc0C5328bA36FaF03C514EF312287C',
        paymentRequiredJson: stableStringify(validatePaymentRequired({
          x402Version: 2,
          resource: { url: prepared.binding.endpointUrl },
          accepts: [{
            scheme: 'exact',
            network: 'eip155:84532',
            amount: '10000',
            asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
            payTo: '0x209693Bc6afc0C5328bA36FaF03C514EF312287C',
            maxTimeoutSeconds: 60,
            extra: { name: 'USDC', version: '2' },
          }],
        }) as StableHashValue),
      },
    }
    const publish = (material: PreparedPublicationMaterial) => publishPreparedCapabilityCommand({
      businessId: 'business-1',
      prepared: material,
      ...context,
      actor,
      now: 10,
    }, emptyPorts())
    const x402Http = preparedWithSourceAdapter(
      prepared,
      'x402',
      { resourceUrl: prepared.binding.endpointUrl },
      prepared.binding.adapter,
    )
    const openapiX402 = preparedWithSourceAdapter(
      prepared,
      'openapi_http',
      { path: '/lookup', method: 'post' },
      x402Adapter,
    )
    expect(await publish(x402Http)).toEqual({ kind: 'refused', reason: 'binding_invalid' })
    expect(await publish(openapiX402)).toEqual({ kind: 'refused', reason: 'binding_invalid' })

    const x402X402 = preparedWithSourceAdapter(
      prepared,
      'x402',
      { resourceUrl: prepared.binding.endpointUrl },
      x402Adapter,
    )
    const openapiHttp = preparedWithSourceAdapter(
      prepared,
      'openapi_http',
      { path: '/lookup', method: 'post' },
      prepared.binding.adapter,
    )
    expect((await publish(x402X402)).kind).toBe('published')
    expect((await publish(openapiHttp)).kind).toBe('published')
  })

  it('refuses an ae envelope paired with MCP transport before publication', async () => {
    const prepared = await preparedPublication()
    const mcp = preparedWithSourceAdapter(
      prepared,
      'ae_envelope',
      {},
      {
        adapterId: 'mcp-jsonrpc:v1',
        config: {
          protocolVersion: '2025-06-18',
          toolName: 'lookup',
          requestTimeoutMs: 5_000,
        },
      },
    )
    const ports = emptyPorts()
    const registerContractDocument = vi.spyOn(ports, 'registerContractDocument')
    const scheduleReadinessProbe = vi.spyOn(ports, 'scheduleReadinessProbe')
    const result = await publishPreparedCapabilityCommand({
      businessId: 'business-1',
      prepared: mcp,
      ...context,
      actor,
      now: 10,
    }, ports)
    expect(result).toEqual({ kind: 'refused', reason: 'binding_invalid' })
    expect(registerContractDocument).not.toHaveBeenCalled()
    expect(scheduleReadinessProbe).not.toHaveBeenCalled()
  })

  it('refuses an ae envelope paired with x402 transport before publication', async () => {
    const prepared = await preparedPublication()
    const x402 = preparedWithSourceAdapter(
      prepared,
      'ae_envelope',
      {},
      {
        adapterId: 'x402-fetch:v2',
        config: {
          method: 'POST' as const,
          requestTimeoutMs: 5_000,
          scheme: 'exact' as const,
          network: 'eip155:84532',
          currency: 'USD',
          routeAmountExponent: 2,
          assetAmountExponent: 6,
          asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
          payTo: '0x209693Bc6afc0C5328bA36FaF03C514EF312287C',
          paymentRequiredJson: stableStringify(validatePaymentRequired({
            x402Version: 2,
            resource: { url: prepared.binding.endpointUrl },
            accepts: [{
              scheme: 'exact',
              network: 'eip155:84532',
              amount: '10000',
              asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
              payTo: '0x209693Bc6afc0C5328bA36FaF03C514EF312287C',
              maxTimeoutSeconds: 60,
              extra: { name: 'USDC', version: '2' },
            }],
          }) as StableHashValue),
        },
      },
    )
    const ports = emptyPorts()
    const registerContractDocument = vi.spyOn(ports, 'registerContractDocument')
    const scheduleReadinessProbe = vi.spyOn(ports, 'scheduleReadinessProbe')
    const result = await publishPreparedCapabilityCommand({
      businessId: 'business-1',
      prepared: x402,
      ...context,
      actor,
      now: 10,
    }, ports)
    expect(result).toEqual({ kind: 'refused', reason: 'binding_invalid' })
    expect(registerContractDocument).not.toHaveBeenCalled()
    expect(scheduleReadinessProbe).not.toHaveBeenCalled()
  })

  it('refuses publish on contract identity conflict', async () => {
    const prepared = await preparedPublication()
    const result = await publishPreparedCapabilityCommand({
      businessId: 'business-1',
      prepared,
      ...context,
      actor,
      now: 10,
    }, emptyPorts({
      findContractDigest: async () => `sha256:${'b'.repeat(64)}`,
    }))
    expect(result).toEqual({ kind: 'refused', reason: 'contract_identity_conflict' })
  })

  it('replays prepared publish through the operation ledger', async () => {
    const prepared = await preparedPublication()
    const encoded = encodedFor()
    const operationRef = createPublicOperationRef({
      operationId: capabilityOperationId(encoded.contract.ref.capabilityId),
      publicationRef: 'offering:demo:lookup',
      publicationRevision: 1,
      contractRef: encoded.contract.ref,
    })
    const expected = {
      publicationRef: 'offering:demo:lookup',
      publicationRevision: 1,
      operationRef,
      contractRef: encoded.contract.ref,
      offeringId: 'offering:demo:lookup',
      bindingId: 'binding:demo:http',
      runtimeEnvironment: 'sandbox' as const,
      sourceKind: prepared.sourceKind,
      sourceSelector: prepared.sourceSelector,
      sourceRevision: prepared.sourceRevision,
      sourceDigest: prepared.sourceDigest,
      priceDigest: prepared.priceDigest,
      authorityMode: 'provider_owned' as const,
      publisherRef: actor.ref,
      provenanceDigest: capabilityPublicationProvenanceDigest({
        publisherRef: actor.ref,
        authorityMode: 'provider_owned',
        sourceRevision: prepared.sourceRevision,
        sourceDigest: prepared.sourceDigest,
      }),
      lifecycle: {
        state: 'inactive' as const,
        reasons: [
          'admission_unproven' as const,
          'conformance_unproven' as const,
          'credential_readiness_unobserved' as const,
          'health_unobserved' as const,
        ],
      },
    }
    let operation: OperationKeyRecord | null = null
    const first = await publishPreparedCapabilityCommand({
      businessId: 'business-1',
      prepared,
      ...context,
      actor,
      now: 10,
    }, emptyPorts({
      insertOperationKey: async ({ requestHash }) => {
        operation = {
          operationId: 'op-row-1',
          requestHash,
          status: 'in_progress',
          effectRefs: [],
        }
        return 'op-row-1'
      },
      markOperationSucceeded: async (_operationId, resultHash, effectRefs) => {
        if (operation === null) throw new Error('missing_operation_fixture')
        operation = { ...operation, resultHash, effectRefs, status: 'succeeded' }
      },
    }))
    expect(first.kind).toBe('published')
    if (operation === null) throw new Error('missing_operation_fixture')
    const registerContract = vi.fn(async () => {
      throw new Error('should_not_register_on_replay')
    })
    const result = await publishPreparedCapabilityCommand({
      businessId: 'business-1',
      prepared,
      ...context,
      actor,
      now: 10,
    }, emptyPorts({
      findOperationKey: async () => operation,
      registerContractDocument: registerContract,
    }))
    expect(result).toEqual({ ...expected, kind: 'replayed' })
    expect(registerContract).not.toHaveBeenCalled()
  })

  it('publishes successfully and schedules readiness probe', async () => {
    const insertPublication = vi.fn(async () => {})
    const schedule = vi.fn(async () => {})
    const result = await publishPreparedCapabilityCommand({
      businessId: 'business-1',
      prepared: await preparedPublication(),
      ...context,
      actor,
      now: 10,
    }, emptyPorts({
      insertPublication,
      scheduleReadinessProbe: schedule,
    }))
    expect(result).toMatchObject({
      kind: 'published',
      publicationRef: 'offering:demo:lookup',
      offeringId: 'offering:demo:lookup',
      bindingId: 'binding:demo:http',
    })
    expect(insertPublication).toHaveBeenCalledOnce()
    expect(schedule).toHaveBeenCalledWith('offering:demo:lookup', 1)
  })

  it('commits prepared material without invoking the raw normalizer', async () => {
    const prepared = await preparedPublication()
    const normalizer = vi.spyOn(publicationImporters, 'normalizeCapabilityPublication')
    normalizer.mockImplementation(async () => {
      throw new Error('raw_normalizer_must_not_run')
    })
    try {
      const result = await publishPreparedCapabilityCommand({
        businessId: 'business-1',
        prepared,
        ...context,
        actor,
        now: 10,
      }, emptyPorts())
      expect(result.kind).toBe('published')
      expect(normalizer).not.toHaveBeenCalled()
    } finally {
      normalizer.mockRestore()
    }
  })
})
