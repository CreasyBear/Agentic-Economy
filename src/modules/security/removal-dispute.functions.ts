import {
  callPublicSourceMutation,
  callPublicSourceQuery,
  sourceMutation,
  sourceQuery,
} from '@/lib/server/convex-source'
import { resolveCanonicalBaseUrl } from '@/lib/server/canonical-url'
import { sourceWriteAdmissionFromContext } from '@/lib/server/source-write-admission'
import { normalizeSlug } from '@/modules/common/normalize-slug'
import {
  SourceWriteAdmissionError,
  sourceWriteRequestFromAdmission,
  type SourceWriteAdmission,
  type SourceWriteAdmissionRequest,
} from '@/modules/security/source-write-admission'
import type { DisputeOpenResult, RemovalDisputeReasonCode } from '@/modules/security/public'


export type RemovalDisputeInput = {
  slug: string
  contactEmail: string
  reasonCode: RemovalDisputeReasonCode
  evidenceSummary: string
}

type PublicBusinessCatalogReadResult =
  | { kind: 'available'; catalog: Readonly<{ businessId: string; slug: string }> }
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
  origin?: string
  sourceWrite: SourceWriteAdmission
  sourceWriteRequest: SourceWriteAdmissionRequest
  operationKey: string
  correlationId: string
}

type OpenRemovalDisputeCommand = Omit<OpenRemovalDisputeArgs, 'sourceWrite' | 'sourceWriteRequest'>

const publicCatalogBySlugQuery = sourceQuery<{ slug: string }, PublicBusinessCatalogReadResult>(
  'catalog:getPublicBusinessCatalogBySlug'
)
const openRemovalDisputeMutation = sourceMutation<OpenRemovalDisputeArgs, DisputeOpenResult>(
  'security:openRemovalDispute'
)

export async function openRemovalDisputeThroughSource(data: RemovalDisputeInput, context?: unknown): Promise<DisputeOpenResult> {

  try {
    const slug = data.slug.trim()
    if (slug.length === 0) {
      return invalidRemovalTarget(false)
    }

    const result = await callPublicSourceQuery(publicCatalogBySlugQuery, { slug })
    if (result.kind !== 'available') {
      return invalidRemovalTarget(false)
    }

    const catalog = result.catalog
    const operationSuffix = `${normalizeOperationPart(slug)}:${crypto.randomUUID()}`
    const operationKey = `op:removal:${operationSuffix}`
    const correlationId = `corr:removal:${operationSuffix}`
    const command: OpenRemovalDisputeCommand = {
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
      origin: resolveCanonicalBaseUrl().baseUrl,
      operationKey,
      correlationId,
    }
    const sourceWrite = await sourceWriteAdmissionFromContext({
      context,
      command,
      scope: 'removal_dispute',
      operationKey,
      correlationId,
    })
    return await callPublicSourceMutation(openRemovalDisputeMutation, {
      ...command,
      sourceWriteRequest: sourceWriteRequestFromAdmission(sourceWrite),
      sourceWrite,
    })
  } catch (error) {
    if (error instanceof SourceWriteAdmissionError) {
      return {
        kind: 'error',
        code: 'dispute_csrf_rejected',
        retryable: false,
        reason: error.code,
      }
    }

    return invalidRemovalTarget(true)
  }
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



function normalizeOperationPart(value: string): string {
  return normalizeSlug(value) || 'removal'
}
