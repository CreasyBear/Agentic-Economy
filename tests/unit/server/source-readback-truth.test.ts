import { describe, expect, it, vi } from 'vitest'

import { createPublicSourceTransport, setPublicSourceTransportForTests } from '@/lib/server/convex-source'
import { isRecord } from '@/modules/common/is-record'
import { brandNonEmpty } from '@/modules/common/ids'
import { matchingCsrf } from '@/modules/common/matching-csrf'
import { readOwnerStatusThroughSource } from '@/modules/catalog/owner-status.functions'
import {
  SOURCE_WRITE_NO_BODY_DIGEST,
  sourceWriteCommandDigest,
} from '@/modules/security/source-write-admission'
import {
  createEmptyDisputeSourceState,
  openRemovalDispute,
  RemovalDisputeReasonCodeValues,
  type DisputeEvidenceInput,
  type DisputeOpenCommand,
  type DisputeSourceState,
} from '@/modules/security/public'
import { openRemovalDisputeThroughSource } from '@/modules/security/removal-dispute.functions'
import { setPublicRegistrySourcePortForTests } from '@/modules/registry/registry.functions'
import { createLocalE2eRegistrySourcePort } from '../../helpers/registry-local-e2e'

describe('source readback truth seams', () => {
  it('distinguishes configured-source not_found from an available owner readback', async () => {
    await withLocalSource(async () => withLocalBypass(async () => {
      const missing = await readOwnerStatusThroughSource('missing-local-slug')
      expect(missing).toEqual({ kind: 'not_found', reason: 'not_public' })
      expect(JSON.stringify(missing)).not.toContain('Fremantle listed provider')

      const configured = await readOwnerStatusThroughSource('fremantle-listed-provider')
      expect(configured).toMatchObject({
        kind: 'available',
        readback: { catalog: { name: 'Fremantle listed provider' } },
      })

      expect(configured.kind === 'available' ? configured.readback.projectionMode : undefined).toBe('public_source')
      expect(configured.kind === 'available' ? configured.readback.nextAction : '').toContain('Share the public page')
    }))
  })

  it('reports source unavailability instead of default owner readback when Convex config is missing', async () => {
    await withoutSourceConfig(async () => {
      const result = await readOwnerStatusThroughSource('fremantle-listed-provider')
      expect(result).toEqual({ kind: 'unavailable', reason: 'source_unavailable', retryable: true })
      expect(JSON.stringify(result)).not.toContain('Fremantle listed provider')
    })
  })

  it('rejects privacy removal for unknown local slugs without targeting the default business', async () => {
    await withLocalSource(async (removalMutationTargets) => withLocalBypass(async () => {
      vi.stubEnv('AE_SOURCE_WRITE_SECRET', 'local-source-write-secret-that-is-long-enough')

      const missing = await openRemovalDisputeThroughSource(removalInput({ slug: 'missing-local-slug' }), removalSourceWriteContext())
      expect(missing).toMatchObject({ kind: 'error', code: 'dispute_invalid_target', retryable: false })
      expect(JSON.stringify(missing)).not.toContain('business:fremantle-listed-provider')
      expect(removalMutationTargets).toEqual([])

      const recorded = await openRemovalDisputeThroughSource(
        removalInput({ slug: 'fremantle-listed-provider' }),
        removalSourceWriteContext(),
      )
      expect(recorded).toMatchObject({ kind: 'ok', receipt: { targetRef: 'business:fremantle-listed-provider' } })
      expect(removalMutationTargets).toEqual(['business:fremantle-listed-provider'])
    }))
  })
})

function removalInput(
  overrides: Partial<Parameters<typeof openRemovalDisputeThroughSource>[0]> = {},
): Parameters<typeof openRemovalDisputeThroughSource>[0] {
  return {
    slug: 'fremantle-listed-provider',
    contactEmail: 'owner@example.test',
    reasonCode: 'privacy_removal_requested',
    evidenceSummary: 'The public facts are inaccurate and should be reviewed.',
    ...overrides,
  }
}

async function withLocalBypass(run: () => Promise<void>) {
  vi.stubEnv('VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E', 'true')

  try {
    await run()
  } finally {
    vi.unstubAllEnvs()
  }
}

async function withoutSourceConfig(run: () => Promise<void>) {
  vi.stubEnv('VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E', undefined)
  vi.stubEnv('CONVEX_URL', undefined)
  vi.stubEnv('VITE_CONVEX_URL', undefined)

  try {
    await run()
  } finally {
    vi.unstubAllEnvs()
  }
}

async function withLocalSource(run: (removalMutationTargets: string[]) => Promise<void>) {
  const registry = createLocalE2eRegistrySourcePort()
  const disputeState = createEmptyDisputeSourceState()
  const removalMutationTargets: string[] = []
  const restoreRegistry = setPublicRegistrySourcePortForTests(registry)
  const restoreSource = setPublicSourceTransportForTests(createPublicSourceTransport({
    env: { CONVEX_URL: 'http://local-source.test' },
    fetch: async (_input, init) => {
      const payload: unknown = JSON.parse(String(init?.body ?? '{}'))
      if (!isRecord(payload) || typeof payload.path !== 'string') {
        throw new Error('local_source_request_invalid')
      }

      const args = Array.isArray(payload.args) && isRecord(payload.args[0]) ? payload.args[0] : {}
      if (payload.path === 'catalog:getPublicBusinessCatalogBySlug') {
        const detail = await registry.detail({ slug: typeof args.slug === 'string' ? args.slug : '' })
        if (detail.kind === 'found') {
          return Response.json({ status: 'success', value: { kind: 'available', catalog: detail.business } })
        }
        return Response.json({ status: 'success', value: { kind: 'not_found', reason: 'not_public' } })
      }

      if (payload.path === 'security:openRemovalDispute') {
        removalMutationTargets.push(typeof args.targetRef === 'string' ? args.targetRef : '<missing-target>')
        return Response.json({
          status: 'success',
          value: openLocalRemovalDispute(disputeState, args),
        })
      }

      throw new Error(`local_source_function_unconfigured:${payload.path}`)
    },
  }))

  try {
    await run(removalMutationTargets)
  } finally {
    restoreSource()
    restoreRegistry()
  }
}


function openLocalRemovalDispute(state: DisputeSourceState, args: Record<string, unknown>) {
  const sourceWrite = args.sourceWrite
  const sourceWriteRequest = args.sourceWriteRequest
  if (!isRecord(sourceWrite)) {
    throw new Error('local_source_write_admission_missing')
  }
  if (!isRecord(sourceWriteRequest)) {
    throw new Error('local_source_write_request_missing')
  }
  const sourceWriteRequestKeys = [
    'method',
    'initiatorOrigin',
    'targetOrigin',
    'targetPath',
    'targetQuery',
    'bodyDigest',
  ]
  if (
    Object.keys(sourceWriteRequest).length !== sourceWriteRequestKeys.length
    || sourceWriteRequestKeys.some((key) => sourceWriteRequest[key] !== sourceWrite[key])
  ) {
    throw new Error('local_source_write_request_mismatch')
  }
  if (
    typeof sourceWrite.commandDigest !== 'string'
    || sourceWrite.commandDigest !== sourceWriteCommandDigest(args)
  ) {
    throw new Error('local_source_write_command_mismatch')
  }

  const reasonCode = RemovalDisputeReasonCodeValues.find((candidate) => candidate === args.reasonCode)
  if (reasonCode === undefined) {
    throw new Error('local_source_reason_code_invalid')
  }

  if (!Array.isArray(args.evidence)) {
    throw new Error('local_source_evidence_missing')
  }

  const evidence: DisputeEvidenceInput[] = []
  for (const value of args.evidence) {
    if (
      !isRecord(value)
      || typeof value.label !== 'string'
      || value.mediaType !== 'text/plain'
      || typeof value.byteLength !== 'number'
      || typeof value.privateRef !== 'string'
    ) {
      throw new Error('local_source_evidence_invalid')
    }
    evidence.push({
      label: value.label,
      mediaType: 'text/plain',
      byteLength: value.byteLength,
      privateRef: value.privateRef,
    })
  }

  const command: DisputeOpenCommand = {
    businessId: brandNonEmpty(readRequiredString(args, 'businessId'), 'BusinessId'),
    targetType: 'business',
    targetRef: readRequiredString(args, 'targetRef'),
    reasonCode,
    contact: typeof args.contactEmail === 'string' ? { email: args.contactEmail } : {},
    evidence,
    ...(typeof args.publicMessage === 'string' ? { publicMessage: args.publicMessage } : {}),
    security: { csrf: matchingCsrf('source-readback') },
    operationKey: brandNonEmpty(readRequiredString(args, 'operationKey'), 'OperationKey'),
    correlationId: brandNonEmpty(readRequiredString(args, 'correlationId'), 'CorrelationId'),
    now: 1_000,
  }
  return openRemovalDispute(state, command)
}

function readRequiredString(record: Record<string, unknown>, field: string): string {
  const value = record[field]
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`local_source_string_required:${field}`)
  }
  return value
}

function removalSourceWriteContext() {
  return {
    sourceWriteRequest: {
      method: 'POST',
      initiatorOrigin: 'https://ae.example',
      targetOrigin: 'https://ae.example',
      targetPath: '/privacy/remove-business',
      targetQuery: '',
      bodyDigest: SOURCE_WRITE_NO_BODY_DIGEST,
    },
  }
}
