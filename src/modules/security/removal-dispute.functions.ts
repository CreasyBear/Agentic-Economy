import {
  callPublicSourceMutation,
  callPublicSourceQuery,
  sourceMutation,
  sourceQuery,
} from '@/lib/server/convex-source'
import {
  getDefaultPublicOwnerStatusReadback,
  getPublicOwnerStatusReadbackBySlug,
} from '@/modules/catalog/public'
import type { PublicCatalogContract } from '@/modules/catalog/public'
import { brandNonEmpty } from '@/modules/common/ids'
import {
  createEmptyDisputeSourceState,
  openRemovalDispute as openRemovalDisputeModule,
} from '@/modules/security/public'
import type { DisputeOpenResult, RemovalDisputeReasonCode } from '@/modules/security/public'

type Env = Record<string, string | undefined>

export type RemovalDisputeInput = {
  slug: string
  contactEmail: string
  reasonCode: RemovalDisputeReasonCode
  evidenceSummary: string
}

type PublicCatalogReadResult =
  | { kind: 'available'; catalog: PublicCatalogContract }
  | { kind: 'not_found'; reason: 'not_public' }

type OpenRemovalDisputeArgs = {
  businessId: string
  targetType: 'business'
  targetRef: string
  reasonCode: RemovalDisputeInput['reasonCode']
  contactEmail?: string
  evidence: {
    label: string
    mediaType: 'text/plain'
    byteLength: number
    privateRef: string
  }[]
  publicMessage?: string
  csrfToken?: string
  csrfCookie?: string
  origin?: string
  operationKey: string
  correlationId: string
}

export type RemovalDisputeSourcePort = {
  readPublicCatalogBySlug: (args: { slug: string }) => Promise<PublicCatalogReadResult>
  openRemovalDispute: (args: OpenRemovalDisputeArgs) => Promise<DisputeOpenResult>
}

const publicCatalogBySlugQuery = sourceQuery<{ slug: string }, PublicCatalogReadResult>(
  'catalog:getPublicBusinessCatalogBySlug'
)
const openRemovalDisputeMutation = sourceMutation<OpenRemovalDisputeArgs, DisputeOpenResult>(
  'security:openRemovalDispute'
)

export async function openRemovalDisputeThroughSource(data: RemovalDisputeInput): Promise<DisputeOpenResult> {
  if (usesLocalE2eBypass()) {
    return openRemovalDisputeLocal(data)
  }

  try {
    const slug = data.slug.trim()
    if (slug.length === 0) {
      return invalidRemovalTarget(false)
    }

    const source = removalDisputeSourcePort()
    const result = await source.readPublicCatalogBySlug({ slug })
    if (result.kind !== 'available') {
      return invalidRemovalTarget(false)
    }

    const catalog = result.catalog
    const operationSuffix = `${normalizeOperationPart(slug)}:${crypto.randomUUID()}`
    return await source.openRemovalDispute({
      businessId: catalog.businessId,
      targetType: 'business',
      targetRef: catalog.businessId,
      reasonCode: data.reasonCode,
      contactEmail: data.contactEmail,
      evidence: [
        {
          label: data.evidenceSummary,
          mediaType: 'text/plain',
          byteLength: Math.max(data.evidenceSummary.length, 1),
          privateRef: `private:evidence:removal:${catalog.slug}`,
        },
      ],
      publicMessage: slug,
      csrfToken: 'csrf-removal',
      csrfCookie: 'csrf-removal',
      origin: requestOrigin(),
      operationKey: `op:removal:${operationSuffix}`,
      correlationId: `corr:removal:${operationSuffix}`,
    })
  } catch {
    return invalidRemovalTarget(true)
  }
}

function removalDisputeSourcePort(): RemovalDisputeSourcePort {
  return {
    readPublicCatalogBySlug: (args) => callPublicSourceQuery(publicCatalogBySlugQuery, args),
    openRemovalDispute: (args) => callPublicSourceMutation(openRemovalDisputeMutation, args),
  }
}

function openRemovalDisputeLocal(data: RemovalDisputeInput): DisputeOpenResult {
  const slug = data.slug.trim()
  const defaultReadback = getDefaultPublicOwnerStatusReadback()
  const readback = slug === defaultReadback.catalog.slug ? defaultReadback : getPublicOwnerStatusReadbackBySlug(slug)
  if (readback === undefined) {
    return invalidRemovalTarget(false)
  }

  const state = createEmptyDisputeSourceState()
  return openRemovalDisputeModule(state, {
    businessId: readback.catalog.businessId,
    targetType: 'business',
    targetRef: readback.catalog.businessId,
    reasonCode: data.reasonCode,
    contact: { email: data.contactEmail },
    evidence: [
      {
        label: data.evidenceSummary,
        mediaType: 'text/plain',
        byteLength: Math.max(data.evidenceSummary.length, 1),
        privateRef: `private:evidence:removal:${readback.catalog.slug}`,
      },
    ],
    publicMessage: slug,
    security: {
      csrf: {
        csrfToken: 'csrf-removal',
        csrfCookie: 'csrf-removal',
        allowedOrigins: ['https://ae.example'],
      },
      rateLimit: {
        scope: 'dispute_open',
        key: `removal:${normalizeOperationPart(slug)}`,
        now: 1_000,
        limit: 3,
        windowMs: 60_000,
      },
    },
    operationKey: brandNonEmpty(`op:removal:${normalizeOperationPart(slug)}`, 'OperationKey'),
    correlationId: brandNonEmpty(`corr:removal:${normalizeOperationPart(slug)}`, 'CorrelationId'),
    now: 1_000,
  })
}

function invalidRemovalTarget(retryable: boolean): DisputeOpenResult {
  return {
    kind: 'error',
    code: 'dispute_invalid_target',
    retryable,
    reason: retryable
      ? 'Removal request could not be recorded. Please try again.'
      : 'No public service page matched that slug.',
  }
}

function requestOrigin(): string {
  return readEnv(process.env, 'SITE_URL') ?? readEnv(process.env, 'VITE_SITE_URL') ?? 'https://ae.example'
}

function readEnv(env: Env, name: string): string | undefined {
  const value = env[name]
  if (value === undefined || value.trim().length === 0) {
    return undefined
  }

  return value.trim()
}

function normalizeOperationPart(value: string): string {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 72)
  return normalized.length === 0 ? 'removal' : normalized
}

function usesLocalE2eBypass(): boolean {
  return process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E === 'true'
}
