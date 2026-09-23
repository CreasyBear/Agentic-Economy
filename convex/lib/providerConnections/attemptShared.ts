import { validPublicHttpsEndpoint } from '../../../src/modules/capability-supply/convex'
import { canonicalDigest } from '../../../src/modules/common/canonical-digest'
import { projectProviderConnectionOwner } from '../../../src/modules/capability-supply/provider-connection'
import { projectOwnerProjection } from './owner'

export const ATTEMPT_TTL_MS = 10 * 60_000
export const SOURCE_DRAFT_TTL_MS = 24 * 60 * 60_000

export function serializableOwnerProjection(
  connection: Parameters<typeof projectProviderConnectionOwner>[0],
  now: number,
) {
  return projectOwnerProjection(connection, now)
}

export function attemptRef(commandId: string, owningAccountRef: string): string {
  return `pca_${canonicalDigest({
    format: 'provider-connection-attempt-ref:v1',
    owningAccountRef,
    commandId,
  }).slice('sha256:'.length, 'sha256:'.length + 40)}`
}

export function sourceDraftRef(commandId: string, owningAccountRef: string): string {
  return `sds_${canonicalDigest({
    format: 'supply-source-draft-ref:v1',
    owningAccountRef,
    commandId,
  }).slice('sha256:'.length, 'sha256:'.length + 40)}`
}

export function canonicalSource(value: string): URL | undefined {
  const parsed = validPublicHttpsEndpoint(value)
  if (parsed === undefined || parsed.hash !== '' || parsed.search !== '') return undefined
  return parsed
}

export type ReserveAttemptArgs = Readonly<{
  businessId: import('../../_generated/dataModel').Id<'businesses'>
  sourceKind: 'http_credential' | 'mcp_oauth'
  sourceUrl: string
  sourceDescriptorJson?: string
  authentication:
    | { kind: 'api_key'; location: 'header' | 'query'; name: string }
    | { kind: 'http_bearer' }
    | { kind: 'mcp_oauth' }
  environment: 'sandbox' | 'production'
  inputDigest: string
  commandId: string
  operationKey: string
  correlationId: string
  candidateDraftRef?: string
  candidateSourceDigest?: string
}>

export function validAuthentication(args: ReserveAttemptArgs): boolean {
  if (args.sourceKind === 'mcp_oauth') return args.authentication.kind === 'mcp_oauth'
  if (args.authentication.kind === 'mcp_oauth') return false
  if (args.authentication.kind === 'http_bearer') return true
  return args.authentication.name.trim().length > 0
    && args.authentication.name.length <= 200
    && !/[\r\n]/u.test(args.authentication.name)
}

export function providerConnectionSecretRef(owningAccountRef: string, attemptRef: string): string {
  return `sec_${canonicalDigest({
    format: 'provider-connection-secret-ref:v1',
    owningAccountRef,
    attemptRef,
  }).slice('sha256:'.length, 'sha256:'.length + 32)}`
}
